#pragma once

#include <websocketpp/config/asio_no_tls.hpp>
#include <websocketpp/server.hpp>
#include <unordered_map>
#include <nlohmann/json.hpp>
#include "Router.h"
#include "HttpServer.h"
#include "ProcessHandlers.h"
#include <asio.hpp>
#include <iostream>
#include <algorithm>

using WsServer = websocketpp::server<websocketpp::config::asio>;
using json = nlohmann::json;

class RemoteServer
{
public:
    RemoteServer();
    ~RemoteServer();

    void run();
    static RemoteServer &instance();
    void sendToClient(websocketpp::connection_hdl hdl, const std::string &text);

private:
    void onOpen(websocketpp::connection_hdl);
    void onClose(websocketpp::connection_hdl);
    void onMessage(websocketpp::connection_hdl, WsServer::message_ptr msg);

    std::string getLocalIP();

private:
    WsServer m_endpoint;
    std::unordered_map<std::string, Router::Handler> m_router;

#ifdef _WIN32
    uintptr_t m_gdiplusToken = 0;
#endif
};
