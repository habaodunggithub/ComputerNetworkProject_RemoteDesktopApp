#pragma once
#include <string>
#include <vector>
#include <cstdint>
#include <algorithm>

struct ProcessInfo {
    unsigned long pid;        // DWORD trên Windows
    std::string   name;       // Tên image, ví dụ "notepad.exe" (UTF-8)
    uint64_t      workingSet; // RAM đang dùng (bytes), 0 nếu không đọc được
    std::string   exePath;    // Đường dẫn đầy đủ (UTF-8) nếu lấy được
};

struct AppSummary {
    std::string name;
    int processCount{};
};

// APP = PROCESS có top-level window đang hiển thị


class ProcessManager {
public:
    // Liệt kê / Tìm
    static std::vector<ProcessInfo> listProcesses();
    static std::vector<ProcessInfo> findByName(const std::string& imageNameLowerCase);

    // Start / Stop
    static bool startProcess(const std::string& path, const std::string& args,
                             unsigned long* outPid = nullptr);
    static bool stopProcessByPid(unsigned long pid, unsigned int exitCode = 1);
    static int  stopProcessesByName(const std::string& imageName);

    static std::vector<AppSummary> listUserApplications();

private:
    static std::string toLower(std::string s);

#if defined(_WIN32)
    // Windows helpers
    static bool queryProcessNameAndPath(unsigned long pid, std::string& imageNameOut, std::string& exePathOut);
    static bool queryProcessMemory(unsigned long pid, uint64_t& workingSetOut);

    static std::wstring Utf8ToWide(const std::string& s);
    static std::string  WideToUtf8(const std::wstring& ws);
#endif
};
