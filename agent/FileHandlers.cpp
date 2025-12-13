#include "FileHandlers.h"
#include <filesystem>
#include <fstream>
#include <iostream>
#include <windows.h>
#include <vector>
#include "Utils.h"

namespace fs = std::filesystem;

static json makeStatus(bool success, const std::string &msg)
{
    return {{"type", "status"}, {"success", success}, {"message", msg}};
}

json FileHandlers::listDrives(const json &req)
{
    json drives = json::array();
    DWORD driveMask = GetLogicalDrives();

    for (int i = 0; i < 26; ++i)
    {
        if (driveMask & (1 << i))
        {
            char driveLetter = 'A' + i;
            std::string rootPath = std::string(1, driveLetter) + ":\\";
            drives.push_back({{"name", std::string(1, driveLetter) + ":"},
                              {"path", rootPath},
                              {"type", "drive"}});
        }
    }
    return {{"type", "drive_list"}, {"data", drives}};
}

json FileHandlers::listDirectory(const json &req)
{
    std::string path = req.value("path", "C:\\");
    std::string context = req.value("context", "view"); // 'tree' hoặc 'view'

    // Fix lỗi đường dẫn nếu thiếu dấu gạch chéo cuối cho ổ đĩa (vd "C:" -> "C:\")
    if (path.length() == 2 && path[1] == ':')
        path += "\\";

    try
    {
        std::error_code ec;
        if (!fs::exists(path, ec) || !fs::is_directory(path, ec))
        {
            return makeStatus(false, "Path invalid or access denied");
        }

        json items = json::array();

        // Duyệt thư mục (skip lỗi permission)
        for (const auto &entry : fs::directory_iterator(path, fs::directory_options::skip_permission_denied, ec))
        {
            if (ec)
                continue; // Nếu lỗi file này thì bỏ qua, đi tiếp file sau

            try
            {
                std::string type = entry.is_directory() ? "folder" : "file";
                if (context == "tree" && type == "file")
                    continue;

                // FIX QUAN TRỌNG: Chuyển tên file sang UTF-8 để không lỗi tiếng Việt
                std::string nameUtf8 = ToUtf8(entry.path().filename().wstring());

                items.push_back({{"name", nameUtf8},
                                 {"type", type},
                                 {"size", entry.is_directory() ? 0 : entry.file_size()}});
            }
            catch (...)
            {
                continue;
            }
        }

        return {
            {"type", "file_list"},
            {"path", path},
            {"data", items},
            {"context", context} // Trả lại context để Client biết vẽ vào đâu
        };
    }
    catch (const std::exception &e)
    {
        return makeStatus(false, std::string("Error: ") + e.what());
    }
}

json FileHandlers::createDirectory(const json &req)
{
    try
    {
        if (fs::create_directories(req.value("path", "")))
            return makeStatus(true, "Folder created");
        return makeStatus(false, "Failed (Exists?)");
    }
    catch (const std::exception &e)
    {
        return makeStatus(false, e.what());
    }
}

json FileHandlers::createFile(const json &req)
{
    try
    {
        std::ofstream(ToWide(req.value("path", "")).c_str());
        return makeStatus(true, "File created");
    }
    catch (const std::exception &e)
    {
        return makeStatus(false, e.what());
    }
}

json FileHandlers::deleteItem(const json &req)
{
    try
    {
        if (fs::remove_all(ToWide(req.value("path", ""))) > 0)
            return makeStatus(true, "Deleted");
        return makeStatus(false, "Not found");
    }
    catch (const std::exception &e)
    {
        return makeStatus(false, e.what());
    }
}

// Hàm xử lý Download
json FileHandlers::downloadFile(const json &req)
{
    std::string path = req.value("path", "");
    try
    {
        // SỬA: Dùng ToWide(path)
        std::ifstream file(ToWide(path).c_str(), std::ios::binary);

        if (!file.is_open())
            return {{"type", "error"}, {"message", "Cannot open file"}};

        file.seekg(0, std::ios::end);
        size_t size = file.tellg();
        file.seekg(0, std::ios::beg);

        if (size > 200 * 1024 * 1024)
        {
            return {{"type", "error"}, {"message", "File too large (>200MB)"}};
        }

        std::vector<unsigned char> buffer(size);
        file.read((char *)buffer.data(), size);

        std::string b64 = base64_encode(buffer);

        // Sửa: Lấy tên file chính xác để trả về cho client
        std::string filename = ToUtf8(fs::path(ToWide(path)).filename().wstring());

        return {
            {"type", "file_download"},
            {"success", true},
            {"name", filename},
            {"data", b64}};
    }
    catch (const std::exception &e)
    {
        return {{"type", "error"}, {"message", e.what()}};
    }
}

// CHỨC NĂNG XEM FILE (VIEW)
json FileHandlers::viewFile(const json &req)
{
    std::string path = req.value("path", "");
    try
    {
        // SỬA: Dùng ToWide(path) để chuyển UTF-8 sang Unicode (Wide String)
        std::ifstream file(ToWide(path).c_str(), std::ios::binary);

        if (!file.is_open())
            return {{"type", "error"}, {"message", "Cannot open file"}};

        // Kiểm tra kích thước
        file.seekg(0, std::ios::end);
        size_t size = file.tellg();
        file.seekg(0, std::ios::beg);

        // Giới hạn 200MB
        if (size > 200 * 1024 * 1024)
        {
            return {{"type", "error"}, {"message", "File too large to view (>200MB). Please download."}};
        }

        std::vector<unsigned char> buffer(size);
        file.read((char *)buffer.data(), size);

        std::string b64 = base64_encode(buffer);

        // Sửa: Lấy tên file an toàn hơn với std::filesystem
        std::string filename = ToUtf8(fs::path(ToWide(path)).filename().wstring());

        return {
            {"type", "file_view"},
            {"success", true},
            {"name", filename},
            {"path", path},
            {"data", b64}};
    }
    catch (const std::exception &e)
    {
        return {{"type", "error"}, {"message", e.what()}};
    }
}

// CHỨC NĂNG UPLOAD FILE (CLIENT -> AGENT)
json FileHandlers::uploadFile(const json &req)
{
    std::string folderPath = req.value("path", "");
    std::string filename = req.value("name", "");
    std::string base64Data = req.value("data", "");
    std::string mode = req.value("mode", "overwrite"); // Thêm tham số mode

    if (folderPath.empty() || filename.empty() || base64Data.empty())
        return makeStatus(false, "Missing upload data");

    // 1. Xử lý Base64 (Cắt bỏ header data:image/png;base64,... nếu có)
    auto commaPos = base64Data.find(',');
    if (commaPos != std::string::npos)
    {
        base64Data = base64Data.substr(commaPos + 1);
    }

    std::string binaryData = base64_decode(base64Data);
    if (binaryData.empty())
    {
        return makeStatus(false, "Base64 decode failed");
    }

    try
    {
        fs::path dest(ToWide(folderPath));
        if (!fs::exists(dest) || !fs::is_directory(dest))
            return makeStatus(false, "Destination is not a directory");

        // ToWide xử lý tên tiếng Việt có dấu thành đường dẫn Unicode chuẩn Windows
        fs::path fullPath = dest / ToWide(filename);

        // 2. Chọn chế độ mở file: "wb" (ghi mới) hoặc "ab" (nối tiếp)
        const wchar_t *openMode = (mode == "append") ? L"ab" : L"wb";

        FILE *f = _wfopen(fullPath.c_str(), openMode);
        if (!f)
            return makeStatus(false, "Cannot write file (Permission denied?)");

        size_t written = fwrite(binaryData.data(), 1, binaryData.size(), f);
        fclose(f);

        if (written != binaryData.size())
        {
            return makeStatus(false, "Write incomplete");
        }

        return makeStatus(true, "Chunk received");
    }
    catch (const std::exception &e)
    {
        return makeStatus(false, e.what());
    }
}