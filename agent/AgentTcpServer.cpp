#include "AgentTcpServer.h"
#include <iostream>
#include <winsock2.h> 

static AgentTcpServer* g_instance = nullptr;

AgentTcpServer& AgentTcpServer::instance() { return *g_instance; }
void AgentTcpServer::setInstance(AgentTcpServer* inst) { g_instance = inst; }

AgentTcpServer::AgentTcpServer(asio::io_context& io, const std::string& host, uint16_t port)
    : m_io(io), m_socket(io), m_reconnectTimer(io), m_heartbeatTimer(io), m_gatewayHost(host), m_gatewayPort(port) {
    Router::registerAllHandlers(m_router);
}

void AgentTcpServer::start() {
    connectToGateway();
}

void AgentTcpServer::connectToGateway() {
    std::cout << "[Agent] Connecting to " << m_gatewayHost << ":" << m_gatewayPort << "...\n";
    m_socket.close(); // Reset socket

    asio::ip::tcp::resolver resolver(m_io);
    auto endpoints = resolver.resolve(m_gatewayHost, std::to_string(m_gatewayPort));

    asio::async_connect(m_socket, endpoints,
        [this](std::error_code ec, const asio::ip::tcp::endpoint&) {
            if (!ec) {
                std::cout << "[Agent] Connected!\n";
                m_socket.set_option(asio::ip::tcp::no_delay(true));

                // Gửi HELLO packet
                char hostBuf[256] = {0};
                gethostname(hostBuf, sizeof(hostBuf));
                sendJson({{"type", "hello"}, {"hostname", hostBuf}, {"os", "Windows"}});

                startRead();
                startHeartbeat();
            } else {
                std::cerr << "[Agent] Connect failed: " << ec.message() << "\n";
                scheduleReconnect();
            }
        });
}

void AgentTcpServer::scheduleReconnect() {
    m_reconnectTimer.expires_after(std::chrono::seconds(3));
    m_reconnectTimer.async_wait([this](std::error_code ec) {
        if (!ec) connectToGateway();
    });
}

void AgentTcpServer::startRead() {
    // Đọc cho đến khi gặp ký tự xuống dòng '\n'
    asio::async_read_until(m_socket, m_readBuffer, '\n',
        [this](std::error_code ec, std::size_t length) {
            if (!ec) {
                // Trích xuất dòng từ buffer
                std::istream is(&m_readBuffer);
                std::string line;
                std::getline(is, line);
                
                if (!line.empty()) processLine(line);
                startRead(); // Đọc tiếp
            } else {
                std::cerr << "[Agent] Disconnected (" << ec.message() << ")\n";
                m_socket.close();
                scheduleReconnect();
            }
        });
}

void AgentTcpServer::processLine(std::string line) {
    try {
        if (!line.empty() && line.back() == '\r') line.pop_back();
        
        json req = json::parse(line);
        json res = Router::dispatch(m_router, req);
        sendJson(res);
    } catch (const std::exception& e) {
        sendJson({{"type", "error"}, {"message", std::string("JSON error: ") + e.what()}});
    }
}

void AgentTcpServer::sendJson(const nlohmann::json& j) {
    if (!m_socket.is_open()) return;
    try {
        // Thêm \n vào cuối để server nhận diện message
        std::string data = j.dump() + "\n";
        asio::write(m_socket, asio::buffer(data));
    } catch (...) {}
}

void AgentTcpServer::startHeartbeat() {
    m_heartbeatTimer.expires_after(std::chrono::seconds(2));
    m_heartbeatTimer.async_wait([this](std::error_code ec) {
        if (!ec && m_socket.is_open()) {
            sendJson({{"type", "heartbeat"}});
            startHeartbeat();
        }
    });
}