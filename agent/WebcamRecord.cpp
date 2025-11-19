#include "WebcamRecord.h"

#include <iostream>
#include <sstream>
#include <fstream>
#include <cstdio>
#include <regex>
#include <filesystem>

#ifdef _WIN32
    #include <windows.h>
    #define POPEN _popen
    #define PCLOSE _pclose
#else
    #include <unistd.h>
    #define POPEN popen
    #define PCLOSE pclose
#endif

static std::string FFMPEG_PATH = "..\\include\\FFmpeg\\ffmpeg.exe";

// ==============================
// Constructor
// ==============================
WebcamRecord::WebcamRecord(const std::string& output, const std::string& device)
    : output_file(output), device_name(device), duration_sec(10), running(false)
{
    if (device_name.empty())
        throw std::runtime_error("Device name is empty.");

    if (!ffmpegExists())
        throw std::runtime_error("FFmpeg not found at: " + FFMPEG_PATH);
}

// ==============================
// Kiểm tra FFmpeg
// ==============================
bool WebcamRecord::ffmpegExists() {
    return std::filesystem::exists(FFMPEG_PATH);
}

// ==============================
// Liệt kê thiết bị
// ==============================
std::string WebcamRecord::listDevices() {
#ifdef _WIN32
    std::string cmd = FFMPEG_PATH + " -list_devices true -f dshow -i dummy 2>&1";
#else
    std::string cmd = FFMPEG_PATH + " -f v4l2 -list_formats all -i /dev/video0 2>&1";
#endif

    FILE* pipe = POPEN(cmd.c_str(), "r");
    if (!pipe) return "";

    std::stringstream ss;
    char buf[512];
    while (fgets(buf, sizeof(buf), pipe))
        ss << buf;

    PCLOSE(pipe);
    return ss.str();
}

// ==============================
// Tìm webcam mặc định
// ==============================
std::string WebcamRecord::findDefaultDevice(const std::string& out) {
#ifdef _WIN32
    std::regex re("\"([^\"]+)\"");
    std::smatch m;
    if (std::regex_search(out, m, re))
        return m[1].str();
    return "";
#else
    if (out.find("/dev/video0") != std::string::npos)
        return "/dev/video0";
    return "0";
#endif
}

// ==============================
// Tạo lệnh FFmpeg
// ==============================
std::string WebcamRecord::build_cmd() const {
    std::stringstream cmd;

#ifdef _WIN32
    cmd << FFMPEG_PATH
        << " -y -f dshow -i video=\"" << device_name << "\"";
#else
    cmd << FFMPEG_PATH << " -y -f v4l2 -i " << device_name;
#endif

    if (duration_sec > 0)
        cmd << " -t " << duration_sec;

    cmd << " -c:v libx264 -preset ultrafast -pix_fmt yuv420p "
        << "\"" << output_file << "\"";

    return cmd.str();
}

// ==============================
// Chạy FFmpeg thread
// ==============================
void WebcamRecord::run_cmd() {
    std::string cmd = build_cmd();
    FILE* pipe = POPEN(cmd.c_str(), "r");
    if (!pipe) {
        std::cerr << "FFmpeg run failed\n";
        running = false;
        return;
    }

    running = true;
    char buf[512];
    while (fgets(buf, sizeof(buf), pipe)) {}

    PCLOSE(pipe);
    running = false;
}

// ==============================
// Điều khiển ghi hình
// ==============================
void WebcamRecord::setDuration(int s) { duration_sec = s; }

bool WebcamRecord::start() {
    if (running) return false;
    th = std::thread(&WebcamRecord::run_cmd, this);
    return true;
}

void WebcamRecord::join() {
    if (th.joinable()) th.join();
}

// ==============================
// Base64 encode file
// ==============================
std::string WebcamRecord::file_to_base64(const std::string &path)
{
    std::ifstream ifs(path, std::ios::binary | std::ios::ate);
    if (!ifs.is_open()) return "";

    std::streamsize size = ifs.tellg();
    ifs.seekg(0, std::ios::beg);
    std::vector<unsigned char> buf(size);
    if (!ifs.read((char*)buf.data(), size)) return "";

    static const char* tbl =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    std::string out;
    out.reserve(((size+2)/3)*4);

    int val = 0, valb = -6;
    for (uint8_t c : buf) {
        val = (val << 8) + c;
        valb += 8;
        while (valb >= 0) {
            out.push_back(tbl[(val >> valb) & 0x3F]);
            valb -= 6;
        }
    }
    if (valb > -6)
        out.push_back(tbl[((val << 8) >> (valb + 8)) & 0x3F]);

    while (out.size() % 4) out.push_back('=');
    return out;
}

std::string WebcamRecord::video_to_base64(const std::string &path) {
    return file_to_base64(path);
}

// ==============================
// Ghi video rồi trả Base64
// ==============================
std::string WebcamRecord::record_base64(int seconds) {
    std::string tmp = "temp_capture.mp4";

    std::string list = listDevices();
    std::string dev = findDefaultDevice(list);
    if (dev.empty()) {
        std::cerr << "No webcam detected.\n";
        return "";
    }

    WebcamRecord rec(tmp, dev);
    rec.setDuration(seconds);

    if (!rec.start()) {
        std::cerr << "Cannot start recording.\n";
        return "";
    }

    rec.join();
    return video_to_base64(tmp);
}
