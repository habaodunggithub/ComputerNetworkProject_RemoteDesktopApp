#pragma once

#include <string>
#include <thread>
#include <fstream>
#include <iostream>
#include <sstream>
#include <asio.hpp>

class SimpleHttpServer {
public:
    SimpleHttpServer(const std::string& host, int port, const std::string& htmlPath)
        : m_host(host), m_port(port), m_htmlPath(htmlPath) {}

    void start() {
        m_thread = std::thread([this]() { this->run(); });
        m_thread.detach(); // Tạo 1 luông mới, chạy độc lập với luồng chính
    }

private:
    std::string m_host;
    int m_port;
    std::string m_htmlPath;
    std::thread m_thread;

    void run() {
        try {
            asio::io_context io;
            asio::ip::tcp::acceptor acceptor(io,
                asio::ip::tcp::endpoint(asio::ip::make_address(m_host), m_port));

            std::cout << "[HTTP] Serving index.html on http://" 
                      << m_host << ":" << m_port << "\n";

            for (;;) {
                asio::ip::tcp::socket socket(io);
                acceptor.accept(socket);

                std::string request(1024, 0);
                socket.read_some(asio::buffer(request));

                // Load index.html
                std::ifstream f(m_htmlPath);
                if (!f.is_open()) {
                    std::string msg = "HTTP/1.1 500 ERROR\r\n\r\nCannot open index.html";
                    asio::write(socket, asio::buffer(msg));
                    continue;
                }

                std::stringstream ss;
                ss << f.rdbuf();
                std::string body = ss.str();

                std::string response =
                    "HTTP/1.1 200 OK\r\n"
                    "Content-Type: text/html\r\n"
                    "Content-Length: " + std::to_string(body.size()) + "\r\n"
                    "Connection: close\r\n"
                    "\r\n" + body;

                asio::write(socket, asio::buffer(response));
            }
        }
        catch (const std::exception& e) {
            std::cerr << "[HTTP] Error: " << e.what() << "\n";
        }
    }
};
