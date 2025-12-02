#pragma once
#include <string>
#include <thread>
#include <atomic>

class Discovery
{
public:
    static void start(int port = 9102); // Port UDP mặc định
    static void stop();
    static std::string getHostName();

private:
    static void broadcastLoop(int port);

    static std::atomic<bool> running;
    static std::thread worker;
};