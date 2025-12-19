#pragma once
#include <string>
#include <vector>
#include <array>
#include <windows.h>
#include <nlohmann/json.hpp>
#include <thread>
#include <mutex>
#include <queue>
#include <condition_variable>
#include <atomic>

using json = nlohmann::json;

class WifiSearcher
{
public:
    static json getWifiInfo()
    {
        // Set code page để đọc tiếng Việt/Ký tự đặc biệt
        SetConsoleOutputCP(65001); // CP_UTF8
        SetConsoleCP(65001);

        json result;
        std::string current = getCurrentWifi();

        result["current"] = current.empty() ? nullptr : current;
        result["networks"] = json::array();

        std::vector<std::string> profiles = getWifiProfiles();
        if (profiles.empty())
            return result;

        // === FIX 1: GIẢM SỐ LUỒNG XUỐNG ===
        // 2 luồng là an toàn nhất cho netsh. 8 luồng quá nhiều gây nghẽn.
        const size_t MAX_THREADS = 2;
        const size_t numThreads = (std::min)(MAX_THREADS, profiles.size());

        std::vector<json> networkResults(profiles.size());
        std::mutex resultMutex;
        std::atomic<size_t> nextIndex(0);

        auto worker = [&]()
        {
            while (true)
            {
                size_t i = nextIndex.fetch_add(1);
                if (i >= profiles.size())
                    break;

                // === FIX 2: TRY-CATCH ĐỂ KHÔNG CRASH APP ===
                try
                {
                    const auto &ssid = profiles[i];
                    std::string password = getWifiPassword(ssid);
                    bool connected = (!current.empty() && ssid == current);

                    std::lock_guard<std::mutex> lock(resultMutex);
                    networkResults[i] = {
                        {"ssid", ssid},
                        {"password", password},
                        {"connected", connected}};
                }
                catch (...)
                {
                    // Nếu lỗi thì bỏ qua profile này
                }
            }
        };

        std::vector<std::thread> threads;
        for (size_t i = 0; i < numThreads; ++i)
            threads.emplace_back(worker);

        for (auto &t : threads)
            if (t.joinable())
                t.join();

        for (const auto &net : networkResults)
            if (!net.is_null())
                result["networks"].push_back(net);

        return result;
    }

private:
    static std::string exec(std::string cmd)
    {
        std::string result;
        HANDLE hPipeRead, hPipeWrite;
        SECURITY_ATTRIBUTES saAttr = {sizeof(SECURITY_ATTRIBUTES), NULL, TRUE};

        if (!CreatePipe(&hPipeRead, &hPipeWrite, &saAttr, 0))
            return "";
        SetHandleInformation(hPipeRead, HANDLE_FLAG_INHERIT, 0);

        STARTUPINFOA si = {sizeof(STARTUPINFOA)};
        si.dwFlags = STARTF_USESHOWWINDOW | STARTF_USESTDHANDLES;
        si.wShowWindow = SW_HIDE;
        si.hStdOutput = hPipeWrite;
        si.hStdError = hPipeWrite;

        PROCESS_INFORMATION pi = {0};

        // Dùng cmd /c để chạy
        cmd = "cmd.exe /C " + cmd;

        if (!CreateProcessA(NULL, &cmd[0], NULL, NULL, TRUE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi))
        {
            CloseHandle(hPipeWrite);
            CloseHandle(hPipeRead);
            return "";
        }

        CloseHandle(hPipeWrite);

        DWORD bytesRead;
        CHAR buffer[2048]; // Tăng buffer lên chút
        while (ReadFile(hPipeRead, buffer, sizeof(buffer) - 1, &bytesRead, NULL) && bytesRead != 0)
        {
            buffer[bytesRead] = '\0';
            result.append(buffer);
        }

        CloseHandle(hPipeRead);
        WaitForSingleObject(pi.hProcess, 2000); // Timeout 2s để tránh treo
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);

        return result;
    }

    static std::string trim(const std::string &s)
    {
        size_t b = s.find_first_not_of(" \t\r\n");
        size_t e = s.find_last_not_of(" \t\r\n");
        return (b == std::string::npos) ? "" : s.substr(b, e - b + 1);
    }

    // === Helper thay thế ký tự đặc biệt trong SSID ===
    static std::string escapeSSID(std::string ssid)
    {
        std::string res = "";
        for (char c : ssid)
        {
            if (c == '\"')
                res += "\\\""; // Escape dấu " thành \"
            else
                res += c;
        }
        return res;
    }

    static std::vector<std::string> getWifiProfiles()
    {
        std::vector<std::string> profiles;
        // Thêm chcp 65001 để cmd output ra UTF-8 chuẩn hơn
        std::string out = exec("chcp 65001 >nul & netsh wlan show profile");

        const std::string key = "All User Profile";
        size_t pos = 0;
        while ((pos = out.find(key, pos)) != std::string::npos)
        {
            pos = out.find(':', pos);
            if (pos == std::string::npos)
                break;
            size_t end = out.find('\n', pos);
            profiles.push_back(trim(out.substr(pos + 1, end - pos)));
            pos = end;
        }
        return profiles;
    }

    static std::string getWifiPassword(const std::string &ssid)
    {
        // === FIX 3: Xử lý SSID có dấu ngoặc kép ===
        std::string safeSSID = escapeSSID(ssid);
        std::string out = exec("chcp 65001 >nul & netsh wlan show profile name=\"" + safeSSID + "\" key=clear");

        size_t pos = out.find("Key Content");
        if (pos != std::string::npos)
        {
            pos = out.find(':', pos);
            return trim(out.substr(pos + 1, out.find('\n', pos) - pos));
        }

        if (out.find("802.1X") != std::string::npos)
            return "Enterprise";
        if (out.find("Open") != std::string::npos)
            return "Free Wifi";

        // Kiểm tra tiếng Anh và tiếng Việt (nếu Windows tiếng Việt)
        if ((out.find("Security key") != std::string::npos || out.find("Mã bảo mật") != std::string::npos) &&
            (out.find("Present") != std::string::npos || out.find("Hiện diện") != std::string::npos))
            return "Protected/No Permission";

        return "Absent";
    }

    static std::string getCurrentWifi()
    {
        std::string out = exec("chcp 65001 >nul & netsh wlan show interfaces");

        // Check cả tiếng Việt
        if (out.find("connected") == std::string::npos && out.find("Connected") == std::string::npos && out.find("Đã kết nối") == std::string::npos)
            return "";

        // Tìm dòng SSID (cẩn thận nhầm BSSID)
        size_t pos = out.find("\n    SSID");
        if (pos == std::string::npos)
            pos = out.find(" SSID");

        if (pos != std::string::npos)
        {
            pos = out.find(':', pos);
            if (pos != std::string::npos)
            {
                return trim(out.substr(pos + 1, out.find('\n', pos) - pos));
            }
        }
        return "";
    }
};