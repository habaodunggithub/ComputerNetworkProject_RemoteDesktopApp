#pragma once
#include <string>
#include <vector>
#include <cstdint>

struct ProcessInfo
{
    unsigned long pid;
    std::string name;
    uint64_t workingSet;
    std::string exePath;
};

struct AppSummary
{
    std::string name;
    int processCount{};
};

class ProcessManager
{
public:
    static std::vector<ProcessInfo> listProcesses();
    static std::vector<AppSummary> listUserApplications();

    static bool startProcess(const std::string &path, const std::string &args, unsigned long *outPid = nullptr);
    static bool stopProcessByPid(unsigned long pid);
    static int stopProcessesByName(const std::string &name);

private:
    static std::string toLower(std::string s);
    static std::wstring Utf8ToWide(const std::string &s);
    static std::string WideToUtf8(const std::wstring &ws);
    static bool queryProcessDetails(unsigned long pid, std::string &name, std::string &path, uint64_t &mem);
};