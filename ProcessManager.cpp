#include "ProcessManager.h"
#include <algorithm>

#if defined(_WIN32)
//#  define WIN32_LEAN_AND_MEAN
#  include <windows.h>
#  include <tlhelp32.h>
#  include <psapi.h>
#  pragma comment(lib, "psapi.lib")
#endif

// ================= Allow-list =================
static std::vector<std::string> g_allowList; // lưu lowercase

void ProcessManager::setAllowList(const std::vector<std::string>& names) {
    g_allowList.clear();
    g_allowList.reserve(names.size());
    for (auto s : names) g_allowList.push_back(toLower(std::move(s)));
}

const std::vector<std::string>& ProcessManager::getAllowList() {
    return g_allowList;
}

bool ProcessManager::isAllowed(const std::string& imageName) {
    if (g_allowList.empty()) return true;
    const std::string low = toLower(imageName);
    return std::find(g_allowList.begin(), g_allowList.end(), low) != g_allowList.end();
}

// ================= Common helpers =================
std::string ProcessManager::toLower(std::string s) {
    std::transform(s.begin(), s.end(), s.begin(),
                   [](unsigned char c){ return (char)std::tolower(c); });
    return s;
}

// ================= List / Query =================
std::vector<ProcessInfo> ProcessManager::listProcesses() {
    std::vector<ProcessInfo> out;

#if defined(_WIN32)
    HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snap == INVALID_HANDLE_VALUE) return out;

    PROCESSENTRY32W pe{};
    pe.dwSize = sizeof(pe);

    if (Process32FirstW(snap, &pe)) {
        do {
            ProcessInfo info{};
            info.pid  = static_cast<unsigned long>(pe.th32ProcessID);
            info.name = WideToUtf8(pe.szExeFile ? std::wstring(pe.szExeFile) : std::wstring());
            // best-effort: đầy đủ exePath + workingSet
            (void)queryProcessNameAndPath(info.pid, info.name, info.exePath);
            (void)queryProcessMemory(info.pid, info.workingSet);

            out.push_back(std::move(info));
        } while (Process32NextW(snap, &pe));
    }
    CloseHandle(snap);
#else
    // TODO: Linux/macOS: duyệt /proc
#endif

    return out;
}

std::vector<ProcessInfo> ProcessManager::findByName(const std::string& imageNameLowerCase) {
    const std::string target = toLower(imageNameLowerCase);
    std::vector<ProcessInfo> all = listProcesses();
    std::vector<ProcessInfo> res;
    res.reserve(all.size());

    for (auto& p : all) {
        if (toLower(p.name) == target) res.push_back(std::move(p));
    }
    return res;
}

// ================= Start =================
bool ProcessManager::startProcess(const std::string& path, const std::string& args, unsigned long* outPid) {
#if defined(_WIN32)
    // Lấy tên image từ path để kiểm allow-list
    std::string imageName = path;
    {
        const auto pos = imageName.find_last_of("\\/");
        if (pos != std::string::npos) imageName = imageName.substr(pos + 1);
    }
    if (!isAllowed(imageName)) return false;

    // Build command line: L"\"C:\path\app.exe\" args"
    std::wstring wcmd;
    {
        std::wstring wpath = Utf8ToWide(path);
        std::wstring wargs = Utf8ToWide(args);
        wcmd.reserve(wpath.size() + wargs.size() + 4);
        wcmd.append(L"\"");
        wcmd.append(wpath);
        wcmd.append(L"\"");
        if (!wargs.empty()) {
            wcmd.push_back(L' ');
            wcmd.append(wargs);
        }
    }

    STARTUPINFOW si{};
    si.cb = sizeof(si);
    PROCESS_INFORMATION pi{};

    // CreateProcessW yêu cầu buffer ghi-được
    std::vector<wchar_t> cmdBuf(wcmd.begin(), wcmd.end());
    cmdBuf.push_back(L'\0');

    BOOL ok = CreateProcessW(
        nullptr,               // app name (null -> lấy từ cmdline)
        cmdBuf.data(),         // command line
        nullptr, nullptr,      // security
        FALSE,
        CREATE_NEW_CONSOLE,
        nullptr, nullptr,      // env, cwd
        &si, &pi
    );

    if (!ok) return false;

    if (outPid) *outPid = static_cast<unsigned long>(pi.dwProcessId);
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    return true;
#else
    (void)path; (void)args; (void)outPid;
    return false;
#endif
}

// ================= Stop =================
bool ProcessManager::stopProcessByPid(unsigned long pid, unsigned int exitCode) {
#if defined(_WIN32)
    // (Tuỳ chọn) kiểm allow-list theo tên image trước khi terminate
    /*
    {
        std::string img, exe;
        if (queryProcessNameAndPath(pid, img, exe)) {
            if (!isAllowed(img)) return false;
        }
    }
    */
    HANDLE h = OpenProcess(PROCESS_TERMINATE | PROCESS_QUERY_LIMITED_INFORMATION, FALSE, (DWORD)pid);
    if (!h) return false;
    BOOL ok = TerminateProcess(h, exitCode);
    CloseHandle(h);
    return ok == TRUE;
#else
    (void)pid; (void)exitCode;
    return false;
#endif
}

int ProcessManager::stopProcessesByName(const std::string& imageName) {
#if defined(_WIN32)
    const std::string target = toLower(imageName);
    if (!isAllowed(target)) return 0;

    int count = 0;
    auto list = findByName(target);
    for (auto& p : list) {
        if (toLower(p.name) == target) {
            if (stopProcessByPid(p.pid)) ++count;
        }
    }
    return count;
#else
    (void)imageName;
    return 0;
#endif
}

// ================= Windows helpers =================
#if defined(_WIN32)

std::wstring ProcessManager::Utf8ToWide(const std::string& s) {
    if (s.empty()) return {};
    int len = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, nullptr, 0);
    if (len <= 1) return {};
    std::wstring out((size_t)len - 1, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, out.data(), len);
    return out;
}

std::string ProcessManager::WideToUtf8(const std::wstring& ws) {
    if (ws.empty()) return {};
    int len = WideCharToMultiByte(CP_UTF8, 0, ws.c_str(), -1, nullptr, 0, nullptr, nullptr);
    if (len <= 1) return {};
    std::string out((size_t)len - 1, '\0');
    WideCharToMultiByte(CP_UTF8, 0, ws.c_str(), -1, out.data(), len, nullptr, nullptr);
    return out;
}

bool ProcessManager::queryProcessNameAndPath(unsigned long pid, std::string& imageNameOut, std::string& exePathOut) {
    bool okAny = false;
    HANDLE h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_VM_READ, FALSE, (DWORD)pid);
    if (!h) return false;

    // QueryFullProcessImageNameW (đường dẫn đầy đủ)
    wchar_t buf[32768]; // đủ dài cho đường dẫn dài
    DWORD size = (DWORD)(sizeof(buf) / sizeof(wchar_t));
    if (QueryFullProcessImageNameW(h, 0, buf, &size)) {
        exePathOut = WideToUtf8(std::wstring(buf, size));
        if (imageNameOut.empty()) {
            std::wstring tmp(buf, size);
            auto pos = tmp.find_last_of(L"\\/");
            std::wstring base = (pos == std::wstring::npos) ? tmp : tmp.substr(pos + 1);
            imageNameOut = WideToUtf8(base);
        }
        okAny = true;
    } else {
        // Fallback: PSAPI
        HMODULE hMod;
        DWORD cbNeeded;
        if (EnumProcessModules(h, &hMod, sizeof(hMod), &cbNeeded)) {
            wchar_t modName[MAX_PATH]{0};
            if (GetModuleBaseNameW(h, hMod, modName, MAX_PATH)) {
                imageNameOut = WideToUtf8(modName);
                okAny = true;
            }
            wchar_t fullPath[MAX_PATH]{0};
            if (GetModuleFileNameExW(h, hMod, fullPath, MAX_PATH)) {
                exePathOut = WideToUtf8(fullPath);
                okAny = true;
            }
        }
    }

    CloseHandle(h);
    return okAny;
}

bool ProcessManager::queryProcessMemory(unsigned long pid, uint64_t& workingSetOut) {
    workingSetOut = 0;
    HANDLE h = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, FALSE, (DWORD)pid);
    if (!h) return false;

    PROCESS_MEMORY_COUNTERS pmc{};
    if (GetProcessMemoryInfo(h, &pmc, sizeof(pmc))) {
        workingSetOut = (uint64_t)pmc.WorkingSetSize;
        CloseHandle(h);
        return true;
    }
    CloseHandle(h);
    return false;
}
#endif
