#include "AgentTcpServer.h"

#include <iostream>
#include <chrono>

static AgentTcpServer* g_instance = nullptr;

AgentTcpServer& AgentTcpServer::instance() {
    return *g_instance;
}

void AgentTcpServer::setInstance(AgentTcpServer* inst) {
    g_instance = inst;
}

AgentTcpServer::AgentTcpServer(asio::io_context& io,
                               const std::string& gatewayHost,
                               uint16_t gatewayPort)
    : m_io(io),
      m_socket(io),
      m_reconnectTimer(io),
      m_gatewayHost(gatewayHost),
      m_gatewayPort(gatewayPort) {

    Router::registerAllHandlers(m_router);
}

void AgentTcpServer::start() {
    connectToGateway();
}

void AgentTcpServer::connectToGateway() {
    std::cout << "[Agent] Connecting to gateway "
              << m_gatewayHost << ":" << m_gatewayPort << "...\n";

    // đảm bảo socket sạch
    if (m_socket.is_open()) {
        std::error_code ec;
        m_socket.close(ec);
    }

    asio::ip::tcp::resolver resolver(m_io);
    std::error_code ecResolve;
    auto endpoints = resolver.resolve(m_gatewayHost,
                                      std::to_string(m_gatewayPort),
                                      ecResolve);
    if (ecResolve) {
        std::cerr << "[Agent] Resolve gateway failed: "
                  << ecResolve.message() << "\n";
        scheduleReconnect();
        return;
    }

    asio::async_connect(
        m_socket,
        endpoints,
        [this](std::error_code ec, const asio::ip::tcp::endpoint&) {
            if (!ec) {
                std::cout << "[Agent] Connected to gateway\n";
                m_readBuffer.clear();
                startRead();
            } else {
                std::cerr << "[Agent] Connect failed: "
                          << ec.message() << "\n";
                scheduleReconnect();
            }
        });
}

void AgentTcpServer::scheduleReconnect() {
    using namespace std::chrono_literals;
    std::cout << "[Agent] Reconnecting to gateway in 3 seconds...\n";
    m_reconnectTimer.expires_after(3s);
    m_reconnectTimer.async_wait(
        [this](std::error_code ec) {
            if (!ec) {
                connectToGateway();
            }
        });
}

void AgentTcpServer::startRead() {
    auto self = this;
    static char buf[4096];

    m_socket.async_read_some(
        asio::buffer(buf, sizeof(buf)),
        [this, self](std::error_code ec, std::size_t length) {
            if (!ec) {
                m_readBuffer.append(buf, buf + length);

                // tách theo '\n'
                size_t pos;
                while ((pos = m_readBuffer.find('\n')) != std::string::npos) {
                    std::string line = m_readBuffer.substr(0, pos);
                    m_readBuffer.erase(0, pos + 1);
                    if (!line.empty())
                        handleLine(line);
                }

                startRead();
            } else {
                std::cerr << "[Agent] Read error: " << ec.message()
                          << " (disconnect)\n";
                std::error_code ecClose;
                m_socket.close(ecClose);
                scheduleReconnect();
            }
        });
}

void AgentTcpServer::handleLine(const std::string& line) {
    try {
        json req = json::parse(line);
        json res = Router::dispatch(m_router, req);
        sendJson(res);
    } catch (const std::exception& e) {
        json err = {
            {"type", "error"},
            {"message", std::string("invalid json: ") + e.what()}
        };
        sendJson(err);
    }
}

void AgentTcpServer::sendJson(const json& j) {
    if (!m_socket.is_open())
        return;

    try {
        std::string data = j.dump() + "\n";
        asio::write(m_socket, asio::buffer(data)); // đồng bộ, tránh lỗi pointer
    } catch (const std::exception& e) {
        std::cerr << "[Agent] sendJson exception: "
                  << e.what() << "\n";
    }
}
