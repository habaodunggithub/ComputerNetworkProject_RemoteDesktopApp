#include "GatewayDiscovery.h"
#include <nlohmann/json.hpp>
#include <iostream>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#pragma comment(lib, "Ws2_32.lib")
#endif

std::atomic<bool> GatewayDiscovery::running(false);
std::thread GatewayDiscovery::worker;

std::string GatewayDiscovery::gatewayIp = "";
uint16_t GatewayDiscovery::gatewayPort = 0;
std::string GatewayDiscovery::gatewayHostname = "";

void GatewayDiscovery::start(int port)
{
    if (running)
        return;
    running = true;
    worker = std::thread(listenLoop, port);
}

void GatewayDiscovery::stop()
{
    running = false;
    if (worker.joinable())
        worker.join();
}

void GatewayDiscovery::listenLoop(int port)
{
    SOCKET sock = socket(AF_INET, SOCK_DGRAM, 0);

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);
    addr.sin_addr.s_addr = INADDR_ANY;

    bind(sock, (sockaddr *)&addr, sizeof(addr));

    char buffer[1024];

    while (running)
    {
        sockaddr_in sender{};
        socklen_t slen = sizeof(sender);
        int len = recvfrom(sock, buffer, sizeof(buffer) - 1, 0, (sockaddr *)&sender, &slen);
        if (len <= 0)
            continue;

        buffer[len] = 0;

        // Parse JSON beacon từ Gateway
        try
        {
            auto j = nlohmann::json::parse(buffer);
            if (j["type"] == "gateway_beacon")
            {
                gatewayHostname = j.value("hostname", "");
                gatewayIp = j.value("ip", "");
                gatewayPort = j.value("port", 0);

                std::cout << "[Agent] Beacon from "
                          << gatewayHostname << " @ "
                          << gatewayIp << ":" << gatewayPort << "\n";
            }
        }
        catch (...)
        {
        }
    }

    closesocket(sock);
}