#include <iostream>
#include <string>
#include <asio.hpp>

#include <winsock2.h>
#include <windows.h>
#include <objidl.h>
#include <gdiplus.h>

// Link libraries
#pragma comment(lib, "Ws2_32.lib")
#pragma comment(lib, "Gdiplus.lib")
#pragma comment(lib, "Shcore.lib") // Cho SetProcessDpiAwareness

#include "Core/AgentTcpServer.h"
#include "Core/GatewayDiscovery.h"
#include "Core/Utils.h" // Chứa getFFmpegPath, ExtractResource

using namespace Gdiplus;

int WINAPI WinMain(HINSTANCE, HINSTANCE, LPSTR, int)
{
    // 1. Chuẩn bị FFmpeg
    std::string ffmpegPath = getFFmpegPath();
    if (!ExtractResource(101, ffmpegPath))
        return 1;

    // 2. Khởi tạo Windows Components (DPI, Winsock, GDI+)
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE);

    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0)
        return 1;

    GdiplusStartupInput gdiInput;
    ULONG_PTR gdiToken;
    if (GdiplusStartup(&gdiToken, &gdiInput, nullptr) != Ok)
        return 1;

    try
    {
        asio::io_context io;

        // 3. Discovery Gateway
        GatewayDiscovery::start(9103);
        std::cout << "[Agent] Waiting for Gateway...\n";

        while (GatewayDiscovery::gatewayIp.empty())
        {
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
        }

        // 4. Config IP (Check localhost)
        std::string targetIp = GatewayDiscovery::gatewayIp;
        uint16_t targetPort = GatewayDiscovery::gatewayPort;

        char hostBuf[256];
        if (gethostname(hostBuf, sizeof(hostBuf)) == 0)
        {
            if (GatewayDiscovery::gatewayHostname == std::string(hostBuf))
            {
                targetIp = "127.0.0.1";
                std::cout << "[Agent] Localhost detected.\n";
            }
        }
        GatewayDiscovery::stop();

        // 5. Start Agent Server
        AgentTcpServer server(io, targetIp, targetPort);
        AgentTcpServer::setInstance(&server);
        server.start();

        io.run(); // Block here until exit
    }
    catch (const std::exception &e)
    {
        std::cerr << "[Error] " << e.what() << "\n";
    }

    // 6. Cleanup
    GdiplusShutdown(gdiToken);
    WSACleanup();

    return 0;
}