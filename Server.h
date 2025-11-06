#ifndef SERVER_H
#define SERVER_H

// -------------------------------------

// Dòng include này PHẢI nằm SAU 2 dòng #define ở trên
#include <websocketpp/config/asio_no_tls.hpp>
#include <websocketpp/server.hpp>

#include <functional> // Cho std::bind

// Định nghĩa kiểu cho server
typedef websocketpp::server<websocketpp::config::asio> server;

/**
 * @class RemoteServer
 * @brief Một lớp (class) đóng gói logic của WebSocket server.
 */
class RemoteServer
{
public:
    /**
     * @brief Constructor: Khởi tạo server và gán các hàm xử lý.
     */
    RemoteServer();

    /**
     * @brief Bắt đầu chạy server (lắng nghe, chấp nhận kết nối, và chạy vòng lặp).
     */
    void run();

private:
    /**
     * @brief Được gọi khi nhận được một tin nhắn.
     * Đây là nơi tất cả logic nghiệp vụ (list/start/stop) được xử lý.
     */
    void on_message(websocketpp::connection_hdl hdl, server::message_ptr msg);

    /**
     * @brief Được gọi khi có một client kết nối.
     */
    void on_open(websocketpp::connection_hdl hdl);

    /**
     * @brief Được gọi khi một client ngắt kết nối.
     */
    void on_close(websocketpp::connection_hdl hdl);

private:
    server m_endpoint; // Đối tượng server của websocketpp
};

#endif // SERVER_H