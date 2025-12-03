#include "ScreenStream.h"
#include "AgentTcpServer.h"
#include <sstream>
#include <algorithm>

#ifdef _WIN32
#include <windows.h>
#define POPEN _popen
#define PCLOSE _pclose
#endif

static std::string FFMPEG = "..\\include\\FFmpeg\\ffmpeg.exe";

std::atomic<bool> ScreenStream::running(false);
std::thread ScreenStream::worker;

bool ScreenStream::start(int fps)
{
    if (running.load())
        return false;
    running.store(true);

    worker = std::thread([fps]()
                         {
        std::stringstream cmd;
        cmd << FFMPEG
            << " -loglevel quiet"
            << " -f gdigrab -framerate " << fps << " -i desktop "
            << " -c:v mjpeg -q:v 4 -f image2pipe -";

        FILE* pipe = POPEN(cmd.str().c_str(), "rb");
        if (!pipe) {
            running.store(false);
            return;
        }

        std::vector<unsigned char> buffer;
        buffer.reserve(1024 * 1024);

        unsigned char chunk[4096];
        const unsigned char EOI[2] = { 0xFF, 0xD9 }; // JPEG End Of Image

        while (running.load()) {
            size_t bytes = fread(chunk, 1, sizeof(chunk), pipe);
            if (bytes == 0) break;

            buffer.insert(buffer.end(), chunk, chunk + bytes);

            // Tách từng frame khi tìm được EOI
            for (;;) {
                auto it = std::search(buffer.begin(), buffer.end(), EOI, EOI + 2);
                if (it == buffer.end()) break;

                size_t frameLen = (it - buffer.begin()) + 2;

                // Mã hóa và gửi frame
                std::string b64 = base64(buffer.data(), frameLen);
                nlohmann::json msg = {
                    {"type", "screen_frame"},
                    {"data", b64}
                };
                AgentTcpServer::instance().sendJson(msg);

                // Xóa frame đã gửi, giữ phần dư
                buffer.erase(buffer.begin(), buffer.begin() + frameLen);
            }
        }

        PCLOSE(pipe);
        running.store(false); });

    return true;
}

void ScreenStream::stop()
{
    running.store(false);
    if (worker.joinable())
        worker.join();
}

std::string ScreenStream::base64(const unsigned char *data, size_t len)
{
    static const char tbl[] =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

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
    {
        out.push_back(tbl[((val << 8) >> (valb + 8)) & 0x3F]);
    }

    while (out.size() % 4)
    {
        out.push_back('=');
    }

    return out;
}
