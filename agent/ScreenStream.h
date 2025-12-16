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

class ScreenStream
{
private:
    inline static std::atomic<bool> running = false;
    inline static std::thread worker;

public:
    static bool start(int fps = 30)
    {
        if (running.load())
            return false;
        running.store(true);

        worker = std::thread([fps]()
                             {
            std::string ffmpeg = getFFmpegPath(); 
            std::stringstream cmd;
            
            cmd << ffmpeg 
                << " -loglevel quiet"
                << " -f gdigrab"
                << " -framerate " << fps
                << " -draw_mouse 1"
                << " -i desktop"
                // << " -vf scale=1280:-2" 
                << " -b:v 1500k"
                << " -maxrate 1500k"
                << " -bufsize 3000k"
                << " -c:v libx264"      
                << " -preset ultrafast"
                << " -tune zerolatency"
                << " -profile:v baseline" 
                << " -pix_fmt yuv420p"
                << " -f h264 -";

            FILE* pipe = popen_hidden(cmd.str().c_str(), "rb");
            if (!pipe) {
                running.store(false);
                return;
            }

            unsigned char chunk[16384]; // Đọc mỗi lần 16KB

            while (running.load()) {
                // Đọc bất cứ thứ gì FFmpeg nhả ra
                size_t bytes = fread(chunk, 1, sizeof(chunk), pipe);
                if (bytes <= 0) break;

                // Gửi ngay lập tức
                std::string b64 = base64_encode(chunk, bytes);
                
                AgentTcpServer::instance().sendJson({
                    {"type", "video_chunk"}, 
                    {"data", std::move(b64)}
                });
            }

            fclose(pipe);
            running.store(false); });

        return true;
    }

    static void stop()
    {
        running.store(false);
        if (worker.joinable())
            worker.join();
    }
};