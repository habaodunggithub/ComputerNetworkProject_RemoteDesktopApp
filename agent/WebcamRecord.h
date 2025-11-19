#ifndef WEBCAM_RECORD_H
#define WEBCAM_RECORD_H

#include <string>
#include <thread>
#include <vector>

//
// CLASS GHI WEBCAM + CHUYỂN VIDEO BASE64
//
class WebcamRecord {
public:
    WebcamRecord(const std::string& output, const std::string& device);
    void setDuration(int seconds);
    bool start();
    void join();

    // Static utilities
    static bool ffmpegExists();
    static std::string listDevices();
    static std::string findDefaultDevice(const std::string& output);

    // Base64 utilities
    static std::string file_to_base64(const std::string &path);
    static std::string video_to_base64(const std::string &path);

    // Ghi video + trả base64
    static std::string record_base64(int seconds);

private:
    std::string build_cmd() const;
    void run_cmd();

    std::string output_file;
    std::string device_name;
    int duration_sec;
    std::thread th;
    bool running;
};

#endif
