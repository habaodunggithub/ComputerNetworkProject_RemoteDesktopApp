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
#include "GatewayDiscovery.h"

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

        // ==== Start gateway auto-discovery ====
        GatewayDiscovery::start(9103);

        std::cout << "[Agent] Waiting for Gateway...\n";

        // Wait for beacon
        while (GatewayDiscovery::gatewayIp.empty())
        {
            std::this_thread::sleep_for(std::chrono::milliseconds(200));
        }

        std::string finalGatewayIp = GatewayDiscovery::gatewayIp;
        uint16_t finalGatewayPort = GatewayDiscovery::gatewayPort;

        // ==== Nếu cùng hostname, dùng 127.0.0.1 ====
        if (GatewayDiscovery::gatewayHostname == Discovery::getHostName())
        {
            finalGatewayIp = "127.0.0.1";
            std::cout << "[Agent] Same machine detected. Switching to localhost.\n";
        }

        std::cout << "[Agent] Connecting to Gateway @ "
                  << finalGatewayIp << ":" << finalGatewayPort << "\n";

        GatewayDiscovery::stop(); // ← STOP SPAMMING

        AgentTcpServer server(io, finalGatewayIp, finalGatewayPort);
        AgentTcpServer::setInstance(&server);

        // --- BẮT ĐẦU DISCOVERY ---
        // Bắn gói tin UDP Broadcast mỗi 5 mili giây để Web Client quét thấy
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