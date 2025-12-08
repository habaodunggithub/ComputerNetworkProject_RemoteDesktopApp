#include "GatewayDiscovery.h"
#include <nlohmann/json.hpp>
#include <iostream>
#include <winsock2.h>
#include <ws2tcpip.h>

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
    if (sock == INVALID_SOCKET)
        return;

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);
    addr.sin_addr.s_addr = INADDR_ANY;

    if (bind(sock, (sockaddr *)&addr, sizeof(addr)) == SOCKET_ERROR)
    {
        closesocket(sock);
        return;
    }

    char buffer[1024];

    while (running)
    {
        sockaddr_in sender{};
        socklen_t slen = sizeof(sender);
        int len = recvfrom(sock, buffer, sizeof(buffer) - 1, 0, (sockaddr*)&sender, &slen);
        
        if (len > 0) {
            buffer[len] = 0;
            try {
                auto j = nlohmann::json::parse(buffer);
                if (j.value("type", "") == "gateway_beacon") {
                    gatewayHostname = j.value("hostname", "");
                    gatewayIp = j.value("ip", "");
                    gatewayPort = j.value("port", 0);
                    
                    std::cout << "[Agent] Beacon found: " << gatewayHostname 
                              << " @ " << gatewayIp << ":" << gatewayPort << "\n";
                }
            } catch (...) {}
        }
    }

    closesocket(sock);
}