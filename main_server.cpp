#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#pragma comment(lib, "Ws2_32.lib")
#endif

#include "Server.h"
#include <iostream>

int main()
{
#ifdef _WIN32
    WSADATA wsa;
    int res = WSAStartup(MAKEWORD(2, 2), &wsa);
    if (res != 0) {
        std::cerr << "WSAStartup failed: " << res << "\n";
        return 1;
    }
#endif

    RemoteServer server;
    server.run();

#ifdef _WIN32
    WSACleanup();
#endif
    return 0;
}
