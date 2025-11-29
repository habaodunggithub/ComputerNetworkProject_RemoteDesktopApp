#include "Discovery.h"
#include <iostream>
#include <chrono>
#include <vector>
#include <nlohmann/json.hpp>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#pragma comment(lib, "Ws2_32.lib")
#else
#include <sys/types.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <netdb.h>
#define SOCKET int
#define INVALID_SOCKET -1
#define SOCKET_ERROR -1
#define closesocket close
#endif

using json = nlohmann::json;

std::atomic<bool> Discovery::running(false);
std::thread Discovery::worker;

std::string Discovery::getHostName()
{
    char buffer[256];
    if (gethostname(buffer, sizeof(buffer)) == 0)
    {
        return std::string(buffer);
    }
    return "Unknown-PC";
}

void Discovery::start(int port)
{
    if (running.load())
        return;
    running.store(true);
    worker = std::thread(broadcastLoop, port);
}

void Discovery::stop()
{
    running.store(false);
    if (worker.joinable())
        worker.join();
}

void Discovery::broadcastLoop(int port)
{
    SOCKET sock = socket(AF_INET, SOCK_DGRAM, 0);
    if (sock == INVALID_SOCKET)
    {
        std::cerr << "[Discovery] Cannot create socket\n";
        return;
    }

    // Bật chế độ Broadcast
    int broadcast = 1;
#ifdef _WIN32
    if (setsockopt(sock, SOL_SOCKET, SO_BROADCAST, (char *)&broadcast, sizeof(broadcast)) < 0)
    {
#else
    if (setsockopt(sock, SOL_SOCKET, SO_BROADCAST, &broadcast, sizeof(broadcast)) < 0)
    {
#endif
        std::cerr << "[Discovery] Setsockopt failed\n";
        closesocket(sock);
        return;
    }

    sockaddr_in addr;
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);
    addr.sin_addr.s_addr = INADDR_BROADCAST; // 255.255.255.255

    std::string hostname = getHostName();

    // Tạo JSON thông tin máy
    json info = {
        {"type", "discovery_beacon"},
        {"hostname", hostname},
#ifdef _WIN32
        {"os", "Windows"}
#else
        {"os", "Linux/Unix"}
#endif
    };
    std::string msg = info.dump();

    std::cout << "[Discovery] Broadcasting on port " << port << "...\n";

    while (running.load())
    {
        int ret = sendto(sock, msg.c_str(), (int)msg.size(), 0, (sockaddr *)&addr, sizeof(addr));
        if (ret < 0)
        {
        }

        // Gửi mỗi 3 giây
        std::this_thread::sleep_for(std::chrono::seconds(3));
    }

    closesocket(sock);
    std::cout << "[Discovery] Stopped.\n";
}