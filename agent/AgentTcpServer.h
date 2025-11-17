#pragma once
#include <asio.hpp>
#include <string>
#include <unordered_map>
#include <nlohmann/json.hpp>
#include "Router.h"

using json = nlohmann::json;

class AgentTcpServer {
public:
    AgentTcpServer(asio::io_context& io, uint16_t port);

    // khởi động accept
    void start();

    // singleton để ProcessHandlers, Keylogging dùng sendJson
    static AgentTcpServer& instance();
    static void setInstance(AgentTcpServer* inst);

    // gửi JSON (từ bất kì chỗ nào)
    void sendJson(const json& j);

private:
    void doAccept();
    void startRead();
    void handleLine(const std::string& line);

    asio::ip::tcp::acceptor m_acceptor;
    asio::ip::tcp::socket   m_socket;
    std::string             m_readBuffer;

    std::unordered_map<std::string, Router::Handler> m_router;
};
