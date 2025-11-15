#ifndef SERVER_H
#define SERVER_H

#include <websocketpp/config/asio_no_tls.hpp>
#include <websocketpp/server.hpp>

#include <unordered_map>
#include <unordered_set>
#include <string>
#include <functional>
#include <nlohmann/json.hpp>

using json = nlohmann::json;
using WsServer = websocketpp::server<websocketpp::config::asio>;

class RemoteServer
{
public:
    RemoteServer();
    ~RemoteServer();

    void run();
    void setAuthToken(const std::string &token) { m_authToken = token; }
    void setAllowedProcs(const std::unordered_set<std::string> &names);

private:
    // --- WebSocket handlers ---
    void on_open(websocketpp::connection_hdl hdl);
    void on_close(websocketpp::connection_hdl hdl);
    void on_message(websocketpp::connection_hdl hdl, WsServer::message_ptr msg);

    // Parse + dispatch JSON request
    json handleRequest(const json &req);
    bool checkAuth(const std::string &token) const;

    // --- Command dispatcher ---
    using CommandHandler = std::function<json(const json&)>;
    std::unordered_map<std::string, CommandHandler> m_commandHandlers;
    void registerCommandHandlers();

    // --- Commands ---
    json handleListApplications(const json &req);
    json handleStartApplication(const json &req);
    json handleStopApplication(const json &req);
    json handleListProcesses(const json &req);
    json handleStartProcess(const json &req);
    json handleStopProcessPid(const json &req);
    json handleStopProcessName(const json &req);
    json handleCaptureScreen(const json &req);
    json handleHelp(const json &req);
    json handleUnknown(const json &req);

    // --- Utilities ---
    std::string getLocalLanIp();

private:
    WsServer m_endpoint;
    std::string m_authToken;
    std::unordered_set<std::string> m_procAllow;

#ifdef _WIN32
    uintptr_t m_gdiplusToken;
#endif
};

#endif // SERVER_H
