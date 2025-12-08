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
#include "Utils.h"

class ScreenStream {
private:
    inline static std::atomic<bool> running = false;
    inline static std::thread worker;

public:
    static bool start(int fps = 15) {
        if (running.load()) return false;
        running.store(true);

        worker = std::thread([fps]() {
            std::string ffmpeg = getFFmpegPath(); 
            
            std::stringstream cmd;
            cmd << ffmpeg 
                << " -loglevel quiet"
                << " -f gdigrab"
                << " -framerate " << fps
                << " -draw_mouse 1"
                << " -i desktop"
                << " -vf scale=1280:-1" 
                << " -c:v mjpeg"
                << " -q:v 15"            
                << " -preset ultrafast"
                << " -tune zerolatency"
                << " -f image2pipe -";

            FILE* pipe = popen_hidden(cmd.str().c_str(), "rb");
            if (!pipe) {
                running.store(false);
                return;
            }

            std::vector<unsigned char> buffer;
            buffer.reserve(1024 * 512); // 512KB buffer
            unsigned char chunk[16384]; // Đọc mỗi lần 16KB

            const unsigned char EOI[2] = { 0xFF, 0xD9 }; // JPEG End Of Image

            while (running.load()) {
                size_t bytes = fread(chunk, 1, sizeof(chunk), pipe);
                if (bytes <= 0) break;

                buffer.insert(buffer.end(), chunk, chunk + bytes);

                // Tìm và tách frame
                auto it = std::search(buffer.begin(), buffer.end(), EOI, EOI + 2);
                if (it != buffer.end()) {
                    size_t frameLen = (it - buffer.begin()) + 2;

                    // Encode & Send
                    std::string b64 = base64_encode(buffer.data(), frameLen);
                    
                    AgentTcpServer::instance().sendJson({
                        {"type", "screen_frame"},
                        {"data", std::move(b64)}
                    });

                    // Xóa phần đã xử lý
                    buffer.erase(buffer.begin(), it + 2);
                }
            }

            fclose(pipe);
            running.store(false);
        });

        return true;
    }

    static void stop() {
        running.store(false);
        if (worker.joinable()) worker.join();
    }
};