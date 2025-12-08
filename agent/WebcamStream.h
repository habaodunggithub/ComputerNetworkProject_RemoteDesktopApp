#pragma once

#include <iostream>
#include <string>
#include <thread>
#include <atomic>
#include <vector>
#include <sstream>
#include <algorithm>
#include <nlohmann/json.hpp>

#include "AgentTcpServer.h"
#include "WebcamRecord.h"  
#include "Utils.h"       

using json = nlohmann::json;

class WebcamStream {
private:
    inline static std::atomic<bool> m_running = false;
    inline static std::thread m_thread;
    inline static std::string m_deviceName;

public:
    static void start(int fps) {
        if (m_running.load()) return;
        m_running.store(true);

        m_thread = std::thread([fps]() {
            // 1. Tìm thiết bị 
            std::string list = WebcamRecord::listDevices();
            m_deviceName = WebcamRecord::findDefaultDevice(list);

            if (m_deviceName.empty()) {
                m_running.store(false);
                return;
            }

            // 2. Xây dựng lệnh FFmpeg
            std::string ffmpeg = getFFmpegPath();
            std::stringstream cmd;
            cmd << ffmpeg 
                << " -loglevel quiet"
                << " -y -f dshow -i video=\"" << m_deviceName << "\""
                << " -framerate " << fps
                << " -s 640x480" 
                << " -c:v mjpeg -q:v 5"
                << " -preset ultrafast -tune zerolatency"
                << " -f image2pipe -";

            FILE* pipe = popen_hidden(cmd.str().c_str(), "rb");
            if (!pipe) {
                m_running.store(false);
                return;
            }

            // 3. Vòng lặp đọc dữ liệu (Buffer lớn)
            std::vector<unsigned char> buffer;
            buffer.reserve(512 * 1024);
            unsigned char chunk[16384]; // Đọc 16KB mỗi lần
            const unsigned char EOI[2] = {0xFF, 0xD9};

            while (m_running.load()) {
                size_t bytes = fread(chunk, 1, sizeof(chunk), pipe);
                if (bytes <= 0) break;

                buffer.insert(buffer.end(), chunk, chunk + bytes);

                // Tách frame JPEG
                auto it = std::search(buffer.begin(), buffer.end(), EOI, EOI + 2);
                if (it != buffer.end()) {
                    size_t frameLen = (it - buffer.begin()) + 2;
                    
                    // Encode & Send
                    std::string b64 = base64_encode(buffer.data(), frameLen);
                    
                    AgentTcpServer::instance().sendJson({
                        {"type", "webcam_frame"},
                        {"data", std::move(b64)}
                    });

                    // Xóa dữ liệu cũ
                    buffer.erase(buffer.begin(), it + 2);
                }
            }
            fclose(pipe);
            m_running.store(false);
        });
    }

    static void stop() {
        m_running.store(false);
        if (m_thread.joinable()) m_thread.join();
    }
};