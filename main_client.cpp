#include "Client.h"

int main() {
    Client c;
    std::string uri = "ws://localhost:9002"; // URI của server

    if (!c.connect(uri)) {
        std::cout << "Cannot initialize connection." << std::endl;
        return 1;
    }

    // Chờ cho đến khi kết nối được mở (tối đa 5 giây)
    int wait_cycles = 0;
    while (!c.is_open() && !c.is_done() && wait_cycles < 50) {
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
        wait_cycles++;
    }

    if (!c.is_open()) {
        std::cout << "Cannot connect to server." << std::endl;
        return 1;
    }

    // Vòng lặp chính để nhận input từ người dùng
    std::string input;
    while (!c.is_done()) {
        std::cout << "Input message (input 'quit' to exit): ";
        std::getline(std::cin, input);

        if (c.is_done() || input == "quit") {
            break;
        }

        // Gửi tin nhắn đi
        c.send(input);
    }

    // Hàm hủy (destructor) của 'c' sẽ tự động dọn dẹp
    return 0;
}