#include "ProcessHandlers.h"
#include "ProcessManager.h"
#include "Capture.h"

json ProcessHandlers::listProcesses(const json&) {
    auto list = ProcessManager::listProcesses();
    json arr = json::array();

    for (auto& p : list)
        arr.push_back({
            {"pid", p.pid},
            {"name", p.name},
            {"workingSet", p.workingSet},
            {"exePath", p.exePath}
        });

    return { {"type","process_list"}, {"data", arr} };
}

json ProcessHandlers::startProcess(const json& req) {
    std::string path = req.value("path", "");
    std::string args = req.value("args", "");
    if (path.empty())
        return { {"type","status"}, {"success", false}, {"message", "missing path"} };

    unsigned long pid {};
    bool ok = ProcessManager::startProcess(path, args, &pid);
    return { {"type","status"}, {"success", ok}, {"pid", pid} };
}

json ProcessHandlers::stopProcessPid(const json& req) {
    if (!req.contains("pid"))
        return { {"type","status"},{"success",false},{"message","missing pid"} };

    bool ok = ProcessManager::stopProcessByPid(req["pid"]);
    return { {"type","status"},{"success",ok} };
}

// -------------------- APPLICATIONS --------------------

json ProcessHandlers::listApps(const json&) {
    auto apps = ProcessManager::listUserApplications();
    json arr = json::array();

    for (auto& a : apps)
        arr.push_back({ {"name", a.name}, {"process_count", a.processCount} });

    return { {"type","application_list"}, {"data",arr} };
}

json ProcessHandlers::startApp(const json& req) {
    std::string name = req.value("app_name","");
    if (name.empty())
        return {{"type","status"},{"success",false},{"message","missing app_name"}};

    unsigned long pid{};
    bool ok = ProcessManager::startProcess(name, "", &pid);
    return {{"type","status"},{"success",ok},{"pid",pid}};
}

json ProcessHandlers::stopApp(const json& req) {
    std::string name = req.value("app_name","");
    int stop = ProcessManager::stopProcessesByName(name);
    return { {"type","status"}, {"success", stop>0}, {"stopped", stop} };
}

// -------------------- SCREENSHOT --------------------

json ProcessHandlers::captureScreen(const json&) {
    std::string b64 = capture_screenshot_base64();
    if (b64.empty())
        return {{"type","status"},{"success",false},{"message","capture failed"}};

    return {{"type","screenshot"},{"success",true},{"data",b64}};
}

// -------------------- HELP --------------------

json ProcessHandlers::help(const json&) {
    return {
        {"type","help"},
        {"commands", {
            "list_processes", "start_process", "stop_process_pid",
            "list_applications", "start_application", "stop_application",
            "capture_screen", "help"
        }}
    };
}
