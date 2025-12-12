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
        std::ofstream(req.value("path", ""));
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
        if (fs::remove_all(req.value("path", "")) > 0)
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
        std::ifstream file(path, std::ios::binary);
        if (!file.is_open())
            return {{"type", "error"}, {"message", "Cannot open file"}};

        // Lấy kích thước file
        file.seekg(0, std::ios::end);
        size_t size = file.tellg();
        file.seekg(0, std::ios::beg);

        // Giới hạn dung lượng gửi qua JSON (ví dụ 10MB để tránh crash)
        if (size > 10 * 1024 * 1024)
        {
            return {{"type", "error"}, {"message", "File too large (>10MB)"}};
        }

        std::vector<unsigned char> buffer(size);
        file.read((char *)buffer.data(), size);

        std::string b64 = base64_encode(buffer);

        return {
            {"type", "file_download"},
            {"success", true},
            {"name", fs::path(path).filename().string()},
            {"data", b64}};
    }
    catch (const std::exception &e)
    {
        return {{"type", "error"}, {"message", e.what()}};
    }
}