#pragma once

#include <string>
#include <thread>
#include <vector>
#include <fstream>
#include <sstream>
#include <regex>
#include <filesystem>
#include "Utils.h"

class WebcamRecord {
public:
    // Liệt kê thiết bị (Chạy FFmpeg list_devices)
    static std::string listDevices() {
        std::string ffmpeg = getFFmpegPath();
        std::string cmd = ffmpeg + " -list_devices true -f dshow -i dummy 2>&1";
        
        FILE* pipe = popen_hidden(cmd.c_str(), "r");
        if (!pipe) return "";

        std::stringstream ss;
        char buf[512];
        while (fgets(buf, sizeof(buf), pipe)) ss << buf;
        fclose(pipe);
        return ss.str();
    }

    // Parse tên thiết bị từ log FFmpeg
    static std::string findDefaultDevice(const std::string& log) {
        std::regex re("\"([^\"]+)\"");
        std::smatch m;
        if (std::regex_search(log, m, re)) return m[1].str();
        return "";
    }

    // Hàm chính: Ghi hình và trả về Base64
    static std::string record_base64(int seconds) {
        std::string tmpFile = "temp_rec.mp4";
        std::string ffmpeg = getFFmpegPath();

        // 1. Tìm thiết bị
        std::string dev = findDefaultDevice(listDevices());
        if (dev.empty()) return "";

        // 2. Chạy lệnh Ghi hình 
        // Dùng libx264 preset ultrafast để ghi nhanh, tốn ít CPU
        std::stringstream cmd;
        cmd << ffmpeg 
            << " -y -f dshow -i video=\"" << dev << "\""
            << " -t " << seconds
            << " -c:v libx264 -preset ultrafast -pix_fmt yuv420p "
            << " -loglevel quiet "
            << "\"" << tmpFile << "\"";

        // Chạy lệnh và chờ kết thúc 
        FILE* pipe = popen_hidden(cmd.str().c_str(), "r");
        if (pipe) {
            char buf[128];
            while (fgets(buf, sizeof(buf), pipe)); 
            fclose(pipe);
        }

        // 3. Đọc file vào buffer và Convert Base64
        std::ifstream ifs(tmpFile, std::ios::binary | std::ios::ate);
        if (!ifs.is_open()) return "";

        std::streamsize size = ifs.tellg();
        ifs.seekg(0, std::ios::beg);
        
        std::vector<unsigned char> data(size);
        if (ifs.read((char*)data.data(), size)) {
            // Xóa file tạm ngay sau khi đọc xong
            ifs.close();
            std::filesystem::remove(tmpFile);
            
            return base64_encode(data);
        }
        
        return "";
    }
};