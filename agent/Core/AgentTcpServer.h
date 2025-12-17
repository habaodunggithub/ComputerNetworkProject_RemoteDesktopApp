#pragma once
#include <asio.hpp>
#include <string>
#include <unordered_map>
#include <nlohmann/json.hpp>
#include "Router.h"

class AgentTcpServer {
private:
    void connectToGateway();
    void scheduleReconnect();
    
    // Đọc dữ liệu dùng async_read_until
    void startRead();
    void processLine(std::string line);
    void startHeartbeat();

    asio::io_context &m_io;
    asio::ip::tcp::socket m_socket;
    asio::steady_timer m_reconnectTimer;
    asio::steady_timer m_heartbeatTimer;

    std::string m_gatewayHost;
    uint16_t m_gatewayPort;

    asio::streambuf m_readBuffer; 
    
    std::unordered_map<std::string, Router::Handler> m_router;
    
public:
    AgentTcpServer(asio::io_context &io, const std::string &gatewayHost, uint16_t gatewayPort);
    void start();
    
    // Singleton
    static AgentTcpServer& instance();
    static void setInstance(AgentTcpServer* inst);

    void sendJson(const nlohmann::json &j);
};