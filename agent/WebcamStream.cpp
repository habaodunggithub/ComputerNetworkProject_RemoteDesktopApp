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

std::atomic<bool> WebcamStream::m_running = false;
std::thread WebcamStream::m_thread;
std::string WebcamStream::m_deviceName;

// Mã hóa base64 từ buffer
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

    // Tìm thiết bị webcam
    std::string list = WebcamRecord::listDevices();
    m_deviceName = WebcamRecord::findDefaultDevice(list);

    if (m_deviceName.empty())
    {
        std::cerr << "[WebcamStream] No webcam found.\n";
        m_running = false;
        return;
    }

    // Xây dựng lệnh FFmpeg stream (MJPEG)
    std::stringstream cmd;
    cmd << FFMPEG_PATH << " -y -f dshow -i video=\"" << m_deviceName << "\" "
        << "-framerate " << fps << " "
        << "-s 640x480 " // Giảm độ phân giải để tăng tốc độ
        << "-c:v mjpeg -q:v 4 -f image2pipe - 2>nul";

    std::cout << "[WebcamStream] Cmd: " << cmd.str() << "\n";

    FILE *pipe = POPEN(cmd.str().c_str(), "rb");
    if (!pipe)
    {
        std::cerr << "[WebcamStream] Failed to open ffmpeg pipe.\n";
        m_running = false;
        return;
    }

    // Vòng lặp đọc pipe và tách frame
    std::vector<unsigned char> buffer;
    buffer.reserve(1024 * 512);
    unsigned char chunk[4096];
    const unsigned char EOI[2] = {0xFF, 0xD9}; // JPEG End Of Image

    while (m_running)
    {
        size_t bytes = fread(chunk, 1, sizeof(chunk), pipe);
        if (bytes == 0)
            break;

        buffer.insert(buffer.end(), chunk, chunk + bytes);

        // Tìm và tách các frame JPEG
        while (true)
        {
            auto it = std::search(buffer.begin(), buffer.end(), EOI, EOI + 2);
            if (it == buffer.end())
                break;

            size_t frameLen = (it - buffer.begin()) + 2;

            // Mã hóa và gửi frame
            std::string b64 = mem_base64(buffer.data(), frameLen);
            json msg = {
                {"type", "webcam_frame"},
                {"data", b64}};
            AgentTcpServer::instance().sendJson(msg);

            // Xóa frame đã xử lý
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