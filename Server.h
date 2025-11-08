#ifndef SERVER_H
#define SERVER_H

// WebSocket++ (Asio standalone)

#include <websocketpp/config/asio_no_tls.hpp>
#include <websocketpp/server.hpp>

#include <string>
#include <unordered_set>

using WsServer = websocketpp::server<websocketpp::config::asio>;

class RemoteServer {
public:
    RemoteServer();

    // Chạy server: bind 127.0.0.1:9002, đọc REMOTE_DESKTOP_TOKEN nếu có
    void run();

    // Tuỳ chọn cấu hình trước khi run()
    void setAuthToken(const std::string& token) { m_authToken = token; }
    // Cho phép đặt allow-list process theo tên image (lowercase), vd: {"notepad.exe","calc.exe"}
    void setAllowedProcs(const std::unordered_set<std::string>& names);

private:
    // WS handlers
    void on_open(websocketpp::connection_hdl hdl);
    void on_close(websocketpp::connection_hdl hdl);
    void on_message(websocketpp::connection_hdl hdl, WsServer::message_ptr msg);

    // Xử lý JSON 1 request -> JSON string response
    std::string handleMessage(const std::string& payload);
    bool checkAuth(const std::string& token) const;

private:
    WsServer m_endpoint;
    std::string m_authToken;                 // rỗng => không yêu cầu auth
    std::unordered_set<std::string> m_procAllow; // tên process cho phép (lowercase)
};

#endif // SERVER_H
