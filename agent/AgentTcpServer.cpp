#include "AgentTcpServer.h"
#include <iostream>

static AgentTcpServer* g_instance = nullptr;

AgentTcpServer::AgentTcpServer(asio::io_context& io, uint16_t port)
    : m_acceptor(io, asio::ip::tcp::endpoint(asio::ip::tcp::v4(), port)),
      m_socket(io)
{
    Router::registerAllHandlers(m_router);
}

AgentTcpServer& AgentTcpServer::instance() {
    return *g_instance;
}

void AgentTcpServer::setInstance(AgentTcpServer* inst) {
    g_instance = inst;
}

void AgentTcpServer::start() {
    doAccept();
}

void AgentTcpServer::doAccept() {
    std::cout << "[Agent] Listening TCP on port "
              << m_acceptor.local_endpoint().port() << "\n";

    m_acceptor.async_accept(m_socket, [this](std::error_code ec) {
        if (!ec) {
            std::cout << "[Agent] Gateway connected\n";
            m_readBuffer.clear();
            startRead();
        } else {
            std::cerr << "[Agent] Accept error: " << ec.message() << "\n";
            doAccept();
        }
    });
}

void AgentTcpServer::startRead() {
    auto self = this;
    static char buf[4096];

    m_socket.async_read_some(asio::buffer(buf, sizeof(buf)),
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
                m_socket.close();
                // chờ gateway connect lại
                doAccept();
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
        asio::write(m_socket, asio::buffer(data));
    } catch (const std::exception& e) {
        std::cerr << "[Agent] sendJson exception: " << e.what() << "\n";
    }
}
