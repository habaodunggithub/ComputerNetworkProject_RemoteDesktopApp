#include "Server.h"

// Bao gồm các thư viện cần thiết cho on_message
#include <iostream>
#include <string>
#include "nlohmann/json.hpp" // Cần cho việc xử lý JSON
#include "AppsManager.h"     // Cần cho các hàm (get_application_list, v.v.)

// Sử dụng namespace cho gọn
using json = nlohmann::json;
using namespace std::placeholders;

RemoteServer::RemoteServer()
{
    // Thiết lập cài đặt logging (logging)
    m_endpoint.set_error_channels(websocketpp::log::elevel::all);
    m_endpoint.set_access_channels(websocketpp::log::alevel::all ^ websocketpp::log::alevel::frame_payload);

    // Khởi tạo Asio
    m_endpoint.init_asio();

    // Gán các hàm xử lý sự kiện
    // Sử dụng std::bind để gán các hàm thành viên (member functions)
    m_endpoint.set_open_handler(std::bind(
        &RemoteServer::on_open,
        this,
        _1));

    m_endpoint.set_close_handler(std::bind(
        &RemoteServer::on_close,
        this,
        _1));

    m_endpoint.set_message_handler(std::bind(
        &RemoteServer::on_message,
        this,
        _1,
        _2));
}

void RemoteServer::run()
{
    uint16_t port = 9002;
    std::cout << "WebSocket server C++ (OOP) đang lắng nghe trên cổng " << port << std::endl;

    // Lắng nghe trên cổng 9002
    m_endpoint.listen(port);

    // Đưa vào hàng đợi một hoạt động chấp nhận kết nối
    m_endpoint.start_accept();

    // Bắt đầu vòng lặp chạy io_service của Asio
    m_endpoint.run();
}

// --- TRIỂN KHAI CÁC HÀM XỬ LÝ SỰ KIỆN ---

void RemoteServer::on_open(websocketpp::connection_hdl hdl)
{
    std::cout << "Client đã kết nối." << std::endl;
    json welcome;
    welcome["type"] = "status";
    welcome["success"] = true;
    welcome["message"] = "Chào mừng bạn đến với Server C++!";

    try
    {
        // Chú ý: Dùng m_endpoint (thành viên của lớp)
        m_endpoint.send(hdl, welcome.dump(), websocketpp::frame::opcode::text);
    }
    catch (websocketpp::exception const &e)
    {
        std::cerr << "Lỗi khi gửi tin nhắn chào mừng: " << e.what() << std::endl;
    }
}

void RemoteServer::on_close(websocketpp::connection_hdl hdl)
{
    std::cout << "Client đã ngắt kết nối." << std::endl;
}

void RemoteServer::on_message(websocketpp::connection_hdl hdl, server::message_ptr msg)
{
    std::cout << "Nhận được tin nhắn từ client" << std::endl;
    std::string payload = msg->get_payload();
    json response;

    try
    {
        json j = json::parse(payload);
        std::string command = j.value("command", "");

        if (command == "list_applications")
        {
            response["type"] = "application_list";
            response["data"] = get_application_list(); // Gọi hàm từ process_manager
        }
        else if (command == "start_app")
        {
            std::string app_name = j.value("app_name", "");
            bool success = start_application(app_name); // Gọi hàm từ process_manager
            response["type"] = "status";
            response["success"] = success;
            response["message"] = success ? "Đã khởi động " + app_name : "Không thể khởi động " + app_name;
        }
        else if (command == "stop_application")
        {
            std::string app_name = j.value("app_name", "");
            bool success = stop_application(app_name); // Gọi hàm từ process_manager
            response["type"] = "status";
            response["success"] = success;
            response["message"] = success ? "Đã dừng ứng dụng " + app_name : "Không thể dừng ứng dụng " + app_name;
        }
        else
        {
            response["type"] = "error";
            response["message"] = "Lệnh không xác định: " + command;
        }
    }
    catch (json::parse_error &e)
    {
        std::cerr << "Lỗi phân tích JSON: " << e.what() << std::endl;
        response["type"] = "error";
        response["message"] = "Tin nhắn không phải là JSON hợp lệ.";
    }
    catch (std::exception &e)
    {
        std::cerr << "Lỗi runtime: " << e.what() << std::endl;
        response["type"] = "error";
        response["message"] = "Lỗi máy chủ nội bộ: " + std::string(e.what());
    }

    // Gửi phản hồi lại cho client
    try
    {
        // Chú ý: Dùng m_endpoint (thành viên của lớp)
        m_endpoint.send(hdl, response.dump(), msg->get_opcode());
    }
    catch (websocketpp::exception const &e)
    {
        std::cerr << "Lỗi khi gửi tin nhắn phản hồi: " << e.what() << std::endl;
    }
}