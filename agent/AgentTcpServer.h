#pragma once

#include <asio.hpp>
#include <string>
#include <unordered_map>
#include <nlohmann/json.hpp>
#include "Router.h"

using json = nlohmann::json;

class AgentTcpServer {
public:
    AgentTcpServer(asio::io_context& io,
                   const std::string& gatewayHost,
                   uint16_t gatewayPort);

    // bắt đầu connect tới gateway
    void start();

    // singleton để ProcessHandlers, Keylogging dùng sendJson
    static AgentTcpServer& instance();
    static void setInstance(AgentTcpServer* inst);

    // gửi JSON lên gateway
    void sendJson(const json& j);

private:
    // kết nối lại khi mất
    void connectToGateway();
    void scheduleReconnect();

    // đọc từ socket
    void startRead();
    void handleLine(const std::string& line);

    // context & socket
    asio::io_context&      m_io;
    asio::ip::tcp::socket  m_socket;
    asio::steady_timer     m_reconnectTimer;

    std::string            m_gatewayHost;
    uint16_t               m_gatewayPort;

    // buffer để ghép JSON theo dòng
    std::string            m_readBuffer;

    // router command -> handler
    std::unordered_map<std::string, Router::Handler> m_router;
};
