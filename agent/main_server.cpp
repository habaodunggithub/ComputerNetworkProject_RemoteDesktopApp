// Entry point cho agent.exe: kết nối tới Gateway bằng TCP, chạy Router, Capture, Keylog...

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <objidl.h>
#include <gdiplus.h>

#include <shellscalingapi.h>
#pragma comment(lib, "Shcore.lib")

#pragma comment(lib, "Ws2_32.lib")
#pragma comment(lib, "Gdiplus.lib")

using namespace Gdiplus;
#endif

#include <iostream>
#include <string>

#include <asio.hpp>

#include "AgentTcpServer.h"
#include "Discovery.h"

int main()
{
#ifdef _WIN32

    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE);

    // --- Khởi tạo WinSock ---
    WSADATA wsa;
    int wsaRes = WSAStartup(MAKEWORD(2, 2), &wsa);
    if (wsaRes != 0)
    {
        std::cerr << "[Agent] WSAStartup failed: " << wsaRes << "\n";
        return 1;
    }

    // --- Khởi tạo GDI+ ---
    ULONG_PTR gdiplusToken = 0;
    {
        GdiplusStartupInput gdiplusStartupInput;
        Status st = GdiplusStartup(&gdiplusToken, &gdiplusStartupInput, nullptr);
        if (st != Ok)
        {
            std::cerr << "[GDI+] Startup failed, status = " << st << "\n";
        }
        else
        {
            std::cout << "[GDI+] Started\n";
        }
    }
#endif

    try
    {
        asio::io_context io;

        // Nếu Agent & Gateway cùng máy  -> "127.0.0.1"
        // Nếu Gateway là máy khác      -> IP LAN của máy chạy node gateway.js
        std::string gatewayHost = "10.29.160.78";
        uint16_t gatewayPort = 9100; // phải trùng với AGENT_PORT trong gateway.js

        std::cout << "[Agent] Gateway = " << gatewayHost
                  << ":" << gatewayPort << "\n";

        AgentTcpServer server(io, gatewayHost, gatewayPort);
        AgentTcpServer::setInstance(&server);

        // --- BẮT ĐẦU DISCOVERY ---
        // Bắn gói tin UDP Broadcast mỗi 3 giây để Web Client quét thấy
        Discovery::start(9102);

        server.start(); // bắt đầu connect tới Gateway (TCP)
        io.run();       // vòng lặp event ASIO (Blocking tại đây)
    }
    catch (const std::exception &e)
    {
        std::cerr << "[Agent] Fatal error: " << e.what() << "\n";
    }

    // --- DỪNG DISCOVERY ---
    // Đảm bảo dừng luồng bắn UDP khi chương trình thoát
    Discovery::stop();

#ifdef _WIN32
    // --- Shutdown GDI+ ---
    if (gdiplusToken != 0)
    {
        GdiplusShutdown(gdiplusToken);
        std::cout << "[GDI+] Shutdown\n";
    }

    // --- Cleanup WinSock ---
    WSACleanup();
#endif

    return 0;
}