#pragma once

#include <string>
#include <thread>
#include <atomic>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

class WebcamStream {
public:
    /**
     * @brief Bắt đầu luồng stream webcam trong một thread riêng.
     * @param fps Tốc độ khung hình mong muốn (frames per second).
     */
    static void start(int fps);

    /**
     * @brief Dừng luồng stream webcam và chờ thread kết thúc.
     */
    static void stop();

private:
    /**
     * @brief Hàm chính chạy trong luồng riêng để xử lý stream.
     * @param fps Tốc độ khung hình.
     */
    static void runStream(int fps);
    
    /**
     * @brief Chụp một frame webcam bằng FFmpeg và mã hóa Base64.
     * @param deviceName Tên thiết bị webcam.
     * @param tempFilePath Đường dẫn file tạm để lưu ảnh.
     * @return Chuỗi Base64 của frame ảnh, rỗng nếu thất bại.
     */
    static std::string captureFrameBase64(const std::string& deviceName, const std::string& tempFilePath);


    // Biến điều khiển luồng (static để dễ quản lý)
    static std::atomic<bool> m_running;
    static std::thread m_thread;
    static std::string m_deviceName; // Tên thiết bị webcam
};