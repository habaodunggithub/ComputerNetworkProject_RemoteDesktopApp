#include <iostream>
#include <string>
#include <vector>
#include <array>
#include <cstdio>
#include <windows.h>

std::string exec(const std::string& cmd) {
    std::array<char, 256> buf{};
    std::string out;

    FILE* pipe = _popen(cmd.c_str(), "r");
    if (!pipe) return out;

    while (fgets(buf.data(), buf.size(), pipe))
        out += buf.data();

    _pclose(pipe);
    return out;
}

std::vector<std::string> getWifiProfiles() {
    std::vector<std::string> profiles;
    std::string out = exec("netsh wlan show profile");

    const std::string key = "All User Profile";
    size_t pos = 0;

    while ((pos = out.find(key, pos)) != std::string::npos) {
        pos = out.find(':', pos);
        if (pos == std::string::npos) break;

        size_t start = pos + 1;
        size_t end = out.find('\n', start);

        std::string ssid = out.substr(start, end - start);
        ssid.erase(0, ssid.find_first_not_of(" \t\r"));
        ssid.erase(ssid.find_last_not_of(" \t\r") + 1);

        profiles.push_back(ssid);
        pos = end;
    }
    return profiles;
}

std::string getWifiPassword(const std::string& ssid) {
    std::string out = exec(
        "netsh wlan show profile name=\"" + ssid + "\" key=clear"
    );

    // 1. Có password (PSK)
    size_t pos = out.find("Key Content");
    if (pos != std::string::npos) {
        pos = out.find(':', pos);
        if (pos != std::string::npos) {
            size_t start = pos + 1;
            size_t end = out.find('\n', start);

            std::string pwd = out.substr(start, end - start);
            pwd.erase(0, pwd.find_first_not_of(" \t\r"));
            pwd.erase(pwd.find_last_not_of(" \t\r") + 1);
            return pwd;
        }
    }

    // 2. Enterprise Wi-Fi (802.1X)
    if (out.find("802.1X") != std::string::npos)
        return "(Enterprise Wi-Fi / no PSK)";

    // 3. Free / Open Wi-Fi (ĐIỀU KIỆN ĐÚNG)
    bool isOpen =
        out.find("Authentication") != std::string::npos &&
        out.find("Open") != std::string::npos &&
        out.find("Security key") != std::string::npos &&
        out.find("Absent") != std::string::npos;

    if (isOpen)
        return "(Open network / free Wi-Fi)";

    // 4. Có bảo mật nhưng Windows không lưu key
    if (out.find("Security key") != std::string::npos)
        return "(Password not stored)";

    return "(Password unavailable)";
}

std::string getCurrentWifi() {
    std::string out = exec("netsh wlan show interfaces");

    // Phải đang connected
    if (out.find("State") == std::string::npos ||
        out.find("connected") == std::string::npos)
        return "(Not connected)";

    // Tìm SSID
    size_t pos = out.find("SSID");
    if (pos == std::string::npos)
        return "(Unknown)";

    pos = out.find(':', pos);
    if (pos == std::string::npos)
        return "(Unknown)";

    size_t start = pos + 1;
    size_t end = out.find('\n', start);

    std::string ssid = out.substr(start, end - start);
    ssid.erase(0, ssid.find_first_not_of(" \t\r"));
    ssid.erase(ssid.find_last_not_of(" \t\r") + 1);

    return ssid;
}


int main() {
    // // Không bắt buộc nhưng giúp hiển thị tiếng Việt tốt hơn
    // SetConsoleOutputCP(CP_UTF8);
    // SetConsoleCP(CP_UTF8);

    // std::cout << "Current WiFi: " << getCurrentWifi() << "\n\n";

    // for (const auto& ssid : getWifiProfiles()) {
    //     std::cout << "WiFi: " << ssid << "\n";
    //     std::cout << "Password: " << getWifiPassword(ssid) << "\n\n";
    // }
    std::cout << 95+95+90+85+95+90+90+90+90+85;
}
