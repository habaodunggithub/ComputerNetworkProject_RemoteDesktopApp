#include "WebcamStream.h"

// Cần include các thư viện và định nghĩa từ WebcamRecord.cpp để tái sử dụng
#include "WebcamRecord.h" // Chứa logic listDevices, findDefaultDevice, file_to_base64
#include "AgentTcpServer.h" // Chứa AgentTcpServer::instance().sendJson
#include <iostream>
#include <chrono>
#include <sstream>
#include <fstream>
#include <filesystem>
#include <cstdio> // Cho POPEN/PCLOSE

using namespace std::chrono_literals;

// =======================================================
// ĐỊNH NGHĨA BIẾN VÀ MACROS (Sao chép từ WebcamRecord.cpp)
// =======================================================

#ifdef _WIN32
    #include <windows.h>
    #define POPEN _popen
    #define PCLOSE _pclose
    static const std::string FFMPEG_PATH = "..\\include\\FFmpeg\\ffmpeg.exe";
#else
    #include <unistd.h>
    #define POPEN popen
    #define PCLOSE pclose
    static const std::string FFMPEG_PATH = "ffmpeg"; 
#endif

// Khởi tạo các biến static
std::atomic<bool> WebcamStream::m_running = false;
std::thread WebcamStream::m_thread;
std::string WebcamStream::m_deviceName;

// =======================================================
// TRIỂN KHAI HÀM FFmpeg CAPTURE
// =======================================================

std::string WebcamStream::captureFrameBase64(const std::string& deviceName, const std::string& tempFilePath) {
    if (deviceName.empty()) return "";

    std::stringstream cmd;
    
    // Xây dựng lệnh FFmpeg để chụp 1 frame (vframes 1)
    // -y: overwrite output
    // -q:v 2: chất lượng ảnh JPEG tốt
    
    cmd << FFMPEG_PATH << " -y ";

#ifdef _WIN32
    cmd << "-f dshow -i video=\"" << deviceName << "\" ";
#else
    cmd << "-f v4l2 -i " << deviceName << " ";
#endif

    cmd << "-vframes 1 -q:v 2 " << tempFilePath << " 2>&1";

    // Chạy lệnh
    FILE* pipe = POPEN(cmd.str().c_str(), "r");
    if (!pipe) {
        std::cerr << "[WebcamStream] FFmpeg capture failed (popen).\n";
        return "";
    }
    
    // Đọc đầu ra (để chờ FFmpeg hoàn thành)
    char buf[512];
    while (fgets(buf, sizeof(buf), pipe)) {
        // Có thể in ra log nếu cần debug
        // std::cerr << buf;
    }
    PCLOSE(pipe);

    // Kiểm tra file tồn tại và mã hóa Base64
    if (!std::filesystem::exists(tempFilePath)) {
        // FFmpeg không tạo được file
        return "";
    }
    
    std::string b64 = WebcamRecord::file_to_base64(tempFilePath);

    // Xóa file tạm
    std::filesystem::remove(tempFilePath); 

    return b64;
}

// =======================================================
// TRIỂN KHAI HÀM STREAM
// =======================================================

void WebcamStream::runStream(int fps) {
    if (fps <= 0) fps = 1;
    // Tính toán thời gian ngủ giữa các frame để đạt FPS mong muốn
    auto frame_duration = 1000ms / fps; 
    m_running = true;
    const std::string TEMP_FILE = "temp_webcam_frame.jpg"; 

    // Tìm thiết bị mặc định
    std::string list = WebcamRecord::listDevices();
    m_deviceName = WebcamRecord::findDefaultDevice(list);
    
    if (m_deviceName.empty()) {
        std::cerr << "[WebcamStream] No default webcam detected. Stopping stream.\n";
        m_running = false;
        return;
    }

    std::cout << "[WebcamStream] Starting stream on device: " << m_deviceName << " @ " << fps << " FPS\n";

    while (m_running) {
        auto start_time = std::chrono::steady_clock::now();
        
        // 1. Chụp frame và Base64 bằng FFmpeg
        std::string b64 = captureFrameBase64(m_deviceName, TEMP_FILE); 

        if (!m_running) break;

        if (!b64.empty()) {
            // 2. Gửi JSON frame lên Gateway
            json msg = {
                {"type", "webcam_frame"},
                {"data", b64}
            };
            
            AgentTcpServer::instance().sendJson(msg);
        } else {
            // Log lỗi nhưng tiếp tục cố gắng chụp frame tiếp theo
            std::cerr << "[WebcamStream] Frame capture failed.\n";
        }

        // 3. Kiểm soát FPS
        auto end_time = std::chrono::steady_clock::now();
        auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(end_time - start_time);
        
        // Ngủ nếu thời gian chụp frame nhanh hơn thời gian cần thiết cho 1 frame
        if (elapsed < frame_duration) {
            std::this_thread::sleep_for(frame_duration - elapsed);
        }
    }

    // Dọn dẹp
    std::filesystem::remove(TEMP_FILE); 
    std::cout << "[WebcamStream] Stream stopped.\n";
}

// =======================================================
// TRIỂN KHAI HÀM PUBLIC
// =======================================================

void WebcamStream::start(int fps) {
    if (m_running) return;
    
    // Khởi tạo luồng mới
    m_thread = std::thread(runStream, fps);
}

void WebcamStream::stop() {
    if (!m_running) return;

    m_running = false;
    if (m_thread.joinable()) {
        m_thread.join();
    }
}