#pragma once
#include <string>
#include <thread>
#include <atomic>

class GatewayDiscovery
{
private:
    static void listenLoop(int port);
    static std::atomic<bool> running;
    static std::thread worker;
public:
    static void start(int port = 9103);
    static void stop();

    static std::string gatewayIp;
    static uint16_t gatewayPort;
    static std::string gatewayHostname;
};
