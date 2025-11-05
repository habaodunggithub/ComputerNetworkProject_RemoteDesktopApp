// Định nghĩa này là cần thiết cho Asio độc lập (standalone)
#define ASIO_STANDALONE

#include <websocketpp/config/asio_no_tls_client.hpp>
#include <websocketpp/client.hpp>

#include <websocketpp/common/thread.hpp>
#include <websocketpp/common/memory.hpp>

#include <iostream>
#include <string>
#include <functional> // Dùng cho std::bind và placeholders

// Định nghĩa kiểu client
typedef websocketpp::client<websocketpp::config::asio_client> client;

// Dùng con trỏ và thread từ thư viện (có thể là std:: hoặc boost::)
using websocketpp::lib::placeholders::_1;
using websocketpp::lib::placeholders::_2;
using websocketpp::lib::bind;

class Client {
public:
    Client();
    ~Client();

    // Kết nối đến một URI
    bool connect(const std::string& uri);

    // Gửi một tin nhắn
    void send(const std::string& message);

    // Kiểm tra xem kết nối đã mở chưa
    bool is_open() {
        return m_open;
    }

    // Kiểm tra xem đã xong (đóng hoặc lỗi) chưa
    bool is_done();

private:
    client m_endpoint;
    websocketpp::lib::shared_ptr<websocketpp::lib::thread> m_thread;
    websocketpp::connection_hdl m_hdl;
    bool m_open;
    bool m_done;
};
