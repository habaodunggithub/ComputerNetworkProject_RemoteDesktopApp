#include "Server.h"
#include <iostream>

Server::Server() {
        // Thiết lập cài đặt logging
    m_endpoint.set_error_channels(websocketpp::log::elevel::all);
    m_endpoint.set_access_channels(websocketpp::log::alevel::all ^ websocketpp::log::alevel::frame_payload);

    // Khởi tạo Asio
    m_endpoint.init_asio();

    m_endpoint.set_message_handler(std::bind(
        &Server::on_message,
        this,
        std::placeholders::_1,
        std::placeholders::_2
    ));
}

void Server::run() {
    // Lắng nghe trên cổng 9002
    m_endpoint.listen(9002);

    // Đưa vào hàng đợi một hoạt động chấp nhận kết nối
    m_endpoint.start_accept();

    // Bắt đầu vòng lặp chạy io_service của Asio
    m_endpoint.run();
}

// Trong file utility_server.cpp
void Server::on_message(websocketpp::connection_hdl hdl, server::message_ptr msg) {
    // In ra thông báo (tùy chọn, nhưng hữu ích để gỡ lỗi)
    std::cout << "Receive a message: " << msg->get_payload() << "\n";

    try {
        // Gửi tin nhắn trở lại!
        // m_endpoint.send(hdl, payload, opcode)
        m_endpoint.send(hdl, msg->get_payload(), msg->get_opcode());
    } catch (const websocketpp::exception& e) {
        std::cout << "Echo error: " << e.what() << std::endl;
    }
}