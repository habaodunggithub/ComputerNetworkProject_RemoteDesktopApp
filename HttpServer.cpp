#include "HttpServer.h"

HttpServer::HttpServer(const std::string& ip, int port, const std::string& filePath)
    : m_ip(ip), m_port(port), m_file(filePath) {}

void HttpServer::start() {
    m_thread = std::thread([this]() { run(); });
    m_thread.detach();
}

void HttpServer::run() {
    try {
        asio::io_context io;
        asio::ip::tcp::acceptor acceptor(
            io, asio::ip::tcp::endpoint(asio::ip::make_address(m_ip), m_port));

        while (true) {
            asio::ip::tcp::socket socket(io);
            acceptor.accept(socket);

            std::string request(1024, 0);
            socket.read_some(asio::buffer(request));

            std::ifstream f(m_file);
            if (!f.is_open()) {
                std::string msg = "HTTP/1.1 500 ERROR\r\n\r\nFile not found";
                asio::write(socket, asio::buffer(msg));
                continue;
            }

            std::string body((std::istreambuf_iterator<char>(f)),
                             std::istreambuf_iterator<char>());

            std::string response =
                "HTTP/1.1 200 OK\r\n"
                "Content-Type: text/html\r\n"
                "Content-Length: " + std::to_string(body.size()) + "\r\n"
                "Connection: close\r\n\r\n" + body;

            asio::write(socket, asio::buffer(response));
        }
    }
    catch (std::exception& e) {
        std::cerr << "[HTTP] Error: " << e.what() << "\n";
    }
}
