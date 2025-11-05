#include "Client.h"

Client::Client() : m_open(false), m_done(false) {
    // Thiết lập logging ở mức tối thiểu
    m_endpoint.clear_access_channels(websocketpp::log::alevel::all);
    m_endpoint.clear_error_channels(websocketpp::log::elevel::all);

    // Khởi tạo Asio và chạy ở chế độ "vĩnh cửu" (perpetual)
    m_endpoint.init_asio();
    m_endpoint.start_perpetual();

    // Chạy vòng lặp xử lý của endpoint trong một luồng riêng
    m_thread.reset(new websocketpp::lib::thread(&client::run, &m_endpoint));
}

Client::~Client() {
    m_endpoint.stop_perpetual(); // Dừng vòng lặp

    // Nếu kết nối đang mở, hãy đóng nó
    if (m_open) {
        websocketpp::lib::error_code ec;
        m_endpoint.close(m_hdl, websocketpp::close::status::going_away, "", ec);
        if (ec) {
            std::cout << "Error closing connection: " << ec.message() << std::endl;
        }
    }
    
    // Đợi luồng Asio kết thúc
    m_thread->join();
}

bool Client::connect(const std::string& uri) {
    websocketpp::lib::error_code ec;
    client::connection_ptr con = m_endpoint.get_connection(uri, ec);
    if (ec) {
        std::cout << "Error getting connection: " << ec.message() << std::endl;
        return false;
    }

    // Lưu lại handle
    m_hdl = con->get_handle();

    // Thiết lập các trình xử lý (handler) cho kết nối này
    // Chúng ta dùng lambda (C++11) để dễ dàng bắt (capture) con trỏ 'this'
    con->set_open_handler([this](websocketpp::connection_hdl hdl) {
        m_open = true;
        std::cout << "Connection has been opened!" << std::endl;
    });

    con->set_fail_handler([this](websocketpp::connection_hdl hdl) {
        m_open = false;
        m_done = true; // Báo cho luồng chính là đã xong
        std::cout << "Failed connection!" << std::endl;
    });

    con->set_message_handler([this](websocketpp::connection_hdl hdl, client::message_ptr msg) {
        // Đây là nơi chúng ta nhận tin nhắn echo từ server
        std::cout << "Server (echo): " << msg->get_payload() << std::endl;
    });

    con->set_close_handler([this](websocketpp::connection_hdl hdl) {
        m_open = false;
        m_done = true; // Báo cho luồng chính là đã xong
        std::cout << "Connection is closed." << std::endl;
    });

    // Bắt đầu kết nối
    m_endpoint.connect(con);
    return true;
}

// Gửi một tin nhắn
void Client::send(const std::string& message) {
    if (!m_open) {
        std::cout << "Error: Haven't connected yet." << std::endl;
        return;
    }
    
    websocketpp::lib::error_code ec;
    m_endpoint.send(m_hdl, message, websocketpp::frame::opcode::text, ec);
    if (ec) {
        std::cout << "Error sending message: " << ec.message() << std::endl;
    }
}

bool Client::is_done() {
    return m_done;
}