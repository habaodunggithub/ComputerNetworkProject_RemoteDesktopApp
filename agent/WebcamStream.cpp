#include "WebcamStream.h"
#include "WebcamRecord.h"
#include "AgentTcpServer.h"

#include <iostream>
#include <chrono>
#include <sstream>
#include <vector>
#include <algorithm>

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

// Khởi tạo biến static
std::atomic<bool> WebcamStream::m_running = false;
std::thread WebcamStream::m_thread;
std::string WebcamStream::m_deviceName;

// Hàm trợ giúp: Base64 encode từ buffer bộ nhớ (không đọc file)
static std::string mem_base64(const unsigned char *data, size_t len)
{
    static const char tbl[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string out;
    out.reserve(((len + 2) / 3) * 4);
    unsigned int val = 0;
    int valb = -6;
    for (size_t i = 0; i < len; ++i)
    {
        unsigned char c = data[i];
        val = (val << 8) + c;
        valb += 8;
        while (valb >= 0)
        {
            out.push_back(tbl[(val >> valb) & 0x3F]);
            valb -= 6;
        }
    }
    if (valb > -6)
        out.push_back(tbl[((val << 8) >> (valb + 8)) & 0x3F]);
    while (out.size() % 4)
        out.push_back('=');
    return out;
}

void WebcamStream::runStream(int fps)
{
    if (fps <= 0)
        fps = 15;
    m_running = true;

    // 1. Tìm tên thiết bị
    std::string list = WebcamRecord::listDevices();
    m_deviceName = WebcamRecord::findDefaultDevice(list);

    if (m_deviceName.empty())
    {
        std::cerr << "[WebcamStream] No webcam found.\n";
        m_running = false;
        return;
    }

    // 2. Xây dựng lệnh FFmpeg chạy chế độ STREAM (image2pipe)
    // -s 640x480: Giảm độ phân giải để mượt hơn (quan trọng)
    // -q:v 4: Giảm chất lượng JPEG một chút để nhẹ hơn (1-31, thấp hơn là nét hơn)
    // -f image2pipe -: Xuất ra stdout
    std::stringstream cmd;
    cmd << FFMPEG_PATH << " -y -f dshow -i video=\"" << m_deviceName << "\" "
        << "-framerate " << fps << " "
        << "-s 640x480 "                              // Resize để tăng tốc độ truyền tải
        << "-c:v mjpeg -q:v 4 -f image2pipe - 2>nul"; // 2>nul để ẩn log rác

    std::cout << "[WebcamStream] Cmd: " << cmd.str() << "\n";

    FILE *pipe = POPEN(cmd.str().c_str(), "rb"); // Mở chế độ Binary
    if (!pipe)
    {
        std::cerr << "[WebcamStream] Failed to open ffmpeg pipe.\n";
        m_running = false;
        return;
    }

    // 3. Vòng lặp đọc pipe
    std::vector<unsigned char> buffer;
    buffer.reserve(1024 * 512); // Dự trữ 512KB
    unsigned char chunk[4096];
    const unsigned char EOI[2] = {0xFF, 0xD9}; // End Of Image Marker của JPEG

    while (m_running)
    {
        // Đọc dữ liệu từ FFmpeg
        size_t bytes = fread(chunk, 1, sizeof(chunk), pipe);
        if (bytes == 0)
            break; // FFmpeg chết hoặc stream kết thúc

        buffer.insert(buffer.end(), chunk, chunk + bytes);

        // Tìm và tách các frame JPEG
        while (true)
        {
            auto it = std::search(buffer.begin(), buffer.end(), EOI, EOI + 2);
            if (it == buffer.end())
                break; // Chưa đủ 1 ảnh

            size_t frameLen = (it - buffer.begin()) + 2;

            // Encode và gửi ngay lập tức
            std::string b64 = mem_base64(buffer.data(), frameLen);

            json msg = {
                {"type", "webcam_frame"},
                {"data", b64}};
            AgentTcpServer::instance().sendJson(msg);

            // Xóa frame đã xử lý khỏi buffer
            buffer.erase(buffer.begin(), buffer.begin() + frameLen);
        }
    }

    PCLOSE(pipe);
    std::cout << "[WebcamStream] Stopped.\n";
}

void WebcamStream::start(int fps)
{
    if (m_running)
        return;
    m_thread = std::thread(runStream, fps);
}

void WebcamStream::stop()
{
    m_running = false;
    if (m_thread.joinable())
        m_thread.join();
}