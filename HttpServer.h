#pragma once
#include <string>
#include <thread>
#include <asio.hpp>
#include <fstream>
#include <iostream>

class HttpServer {
public:
    HttpServer(const std::string& ip, int port, const std::string& filePath);

    void start();

private:
    void run();

private:
    std::string m_ip;
    int m_port;
    std::string m_file;
    std::thread m_thread;
};
