#include "ProcessManager.h"
#include <algorithm>

#include <windows.h>
#include <tlhelp32.h>
#include <psapi.h>
#include <winreg.h>
#include <vector>
#include <unordered_set>
#include <unordered_map>

#pragma comment(lib, "Advapi32.lib")
#pragma comment(lib, "psapi.lib")

// --- String Utils ---
std::wstring ProcessManager::Utf8ToWide(const std::string& s) {
    if (s.empty()) return L"";
    int len = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, nullptr, 0);
    std::wstring out(len - 1, 0);
    MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, &out[0], len);
    return out;
}

std::string ProcessManager::WideToUtf8(const std::wstring& ws) {
    if (ws.empty()) return "";
    int len = WideCharToMultiByte(CP_UTF8, 0, ws.c_str(), -1, nullptr, 0, nullptr, nullptr);
    std::string out(len - 1, 0);
    WideCharToMultiByte(CP_UTF8, 0, ws.c_str(), -1, &out[0], len, nullptr, nullptr);
    return out;
}

std::string ProcessManager::toLower(std::string s) {
    std::transform(s.begin(), s.end(), s.begin(), ::tolower);
    return s;
}

// --- Helper: Get Registry Path ---
static std::wstring GetAppPathFromReg(const std::wstring& exeName) {
    wchar_t buf[MAX_PATH];
    DWORD size = sizeof(buf);
    std::wstring key = L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\" + exeName;
    
    if (RegGetValueW(HKEY_LOCAL_MACHINE, key.c_str(), nullptr, RRF_RT_REG_SZ, nullptr, buf, &size) == ERROR_SUCCESS) {
        return std::wstring(buf, (size / sizeof(wchar_t)) - 1);
    }
    return L"";
}

// --- Helper: Query Process Info (Name, Path, Memory) ---
bool ProcessManager::queryProcessDetails(unsigned long pid, std::string& name, std::string& path, uint64_t& mem) {
    HANDLE h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_VM_READ, FALSE, pid);
    if (!h) return false;

    // 1. Get Memory
    PROCESS_MEMORY_COUNTERS pmc;
    if (GetProcessMemoryInfo(h, &pmc, sizeof(pmc))) mem = pmc.WorkingSetSize;

    // 2. Get Path & Name
    wchar_t buf[MAX_PATH];
    DWORD size = MAX_PATH;
    if (QueryFullProcessImageNameW(h, 0, buf, &size)) {
        path = WideToUtf8(buf);
        if (name.empty()) { // Lấy tên file từ path nếu tên chưa có
            std::wstring wp(buf);
            auto pos = wp.find_last_of(L"\\/");
            name = WideToUtf8(pos == std::wstring::npos ? wp : wp.substr(pos + 1));
        }
    } else {
        // Fallback PSAPI
        if (GetModuleBaseNameW(h, nullptr, buf, MAX_PATH)) name = WideToUtf8(buf);
        if (GetModuleFileNameExW(h, nullptr, buf, MAX_PATH)) path = WideToUtf8(buf);
    }

    CloseHandle(h);
    return true;
}

std::vector<ProcessInfo> ProcessManager::listProcesses() {
    std::vector<ProcessInfo> out;
    HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snap == INVALID_HANDLE_VALUE) return out;

    PROCESSENTRY32W pe = {sizeof(pe)};
    if (Process32FirstW(snap, &pe)) {
        do {
            ProcessInfo info;
            info.pid = pe.th32ProcessID;
            info.name = WideToUtf8(pe.szExeFile);
            queryProcessDetails(info.pid, info.name, info.exePath, info.workingSet);
            out.push_back(std::move(info));
        } while (Process32NextW(snap, &pe));
    }
    CloseHandle(snap);
    return out;
}

std::vector<AppSummary> ProcessManager::listUserApplications() {
    std::unordered_set<DWORD> visiblePids;
    
    // EnumWindows lambda
    EnumWindows([](HWND hwnd, LPARAM lParam) -> BOOL {
        if (!IsWindowVisible(hwnd)) return TRUE;
        if (GetWindowTextLengthW(hwnd) == 0) return TRUE;
        DWORD pid;
        GetWindowThreadProcessId(hwnd, &pid);
        reinterpret_cast<std::unordered_set<DWORD>*>(lParam)->insert(pid);
        return TRUE;
    }, reinterpret_cast<LPARAM>(&visiblePids));

    // Count processes
    std::unordered_map<std::string, int> counts;
    for (const auto& p : listProcesses()) {
        if (!p.name.empty() && visiblePids.count(p.pid)) {
            counts[p.name]++;
        }
    }

    std::vector<AppSummary> out;
    for (const auto& [name, count] : counts) out.push_back({name, count});
    std::sort(out.begin(), out.end(), [](auto& a, auto& b) { return a.name < b.name; });
    return out;
}

bool ProcessManager::startProcess(const std::string& path, const std::string& args, unsigned long* outPid) {
    std::wstring finalPath = Utf8ToWide(path);
    if (path.find_first_of("\\/") == std::string::npos) {
        std::wstring regPath = GetAppPathFromReg(finalPath);
        if (!regPath.empty()) finalPath = regPath;
    }

    std::wstring cmd = L"\"" + finalPath + L"\" " + Utf8ToWide(args);
    std::vector<wchar_t> cmdBuf(cmd.begin(), cmd.end());
    cmdBuf.push_back(0);

    STARTUPINFOW si = {sizeof(si)};
    PROCESS_INFORMATION pi = {};

    if (!CreateProcessW(nullptr, cmdBuf.data(), nullptr, nullptr, FALSE, CREATE_NEW_CONSOLE, nullptr, nullptr, &si, &pi)) {
        return false;
    }

    if (outPid) *outPid = pi.dwProcessId;
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    return true;
}

bool ProcessManager::stopProcessByPid(unsigned long pid) {
    HANDLE h = OpenProcess(PROCESS_TERMINATE, FALSE, pid);
    if (!h) return false;
    BOOL ok = TerminateProcess(h, 1);
    CloseHandle(h);
    return ok;
}

int ProcessManager::stopProcessesByName(const std::string& name) {
    int count = 0;
    std::string target = toLower(name);
    for (const auto& p : listProcesses()) {
        if (toLower(p.name) == target) {
            if (stopProcessByPid(p.pid)) count++;
        }
    }
    return count;
}
