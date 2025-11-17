#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>   
#include <objidl.h>   
#include <gdiplus.h>

#pragma comment(lib, "Ws2_32.lib")
#pragma comment(lib, "Gdiplus.lib")
using namespace Gdiplus;
#endif

#include <iostream>
#include <asio.hpp>
#include "AgentTcpServer.h"

int main() {
#ifdef _WIN32
    // WinSock
    WSADATA wsa;
    int res = WSAStartup(MAKEWORD(2, 2), &wsa);
    if (res != 0) {
        std::cerr << "WSAStartup failed: " << res << "\n";
        return 1;
    }

    // GDI+ dùng cho screenshot
    ULONG_PTR gdiplusToken = 0;
    {
        GdiplusStartupInput gdiplusStartupInput;
        Status st = GdiplusStartup(&gdiplusToken, &gdiplusStartupInput, nullptr);
        if (st != Ok) {
            std::cerr << "[GDI+] Startup failed, status = " << st << "\n";
        }
    }
#endif

    try {
        asio::io_context io;
        AgentTcpServer server(io, 9100);        // listen TCP 9100
        AgentTcpServer::setInstance(&server); // cho các nơi khác dùng sendJson

        server.start();
        io.run();
    } catch (const std::exception& e) {
        std::cerr << "[Agent] Fatal error: " << e.what() << "\n";
    }

#ifdef _WIN32
    if (gdiplusToken != 0) {
        GdiplusShutdown(gdiplusToken);
    }
    WSACleanup();
#endif
    return 0;
}
