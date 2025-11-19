#pragma once

#include <string>
#include <thread>
#include <atomic>
#include <vector>
#include <string>
#include <nlohmann/json.hpp>

class AgentTcpServer; // gọi AgentTcpServer để push dữ liệu

class ScreenStream {
public:
    static bool start(int fps = 10);
    static void stop();

private:
    static std::atomic<bool> running;
    static std::thread worker;

    static std::string base64(const unsigned char* data, size_t len);
};
