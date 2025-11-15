#include "ProcessManager.h"

#if defined(_WIN32)

// Headers của Windows 
#include <windows.h>
#include <tlhelp32.h> // cho CreateToolhelp32Snapshot
#include <psapi.h>    // cho EnumProcessModules, GetModuleBaseNameW
#include <winreg.h>   // cho RegGetValueW (Registry)
#include <vector>
#include <unordered_set>
#include <unordered_map>

// Liên kết (Link) tự động với các thư viện Windows cần thiết 
#pragma comment(lib, "Advapi32.lib") // cho Registry
#pragma comment(lib, "psapi.lib")    // cho PSAPI (GetModuleBaseNameW...)

/**
 * @brief (Windows) Tìm đường dẫn đầy đủ của một file exe từ registry "App Paths".
 *
 * Kiểm tra trong `HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\<exeName>`.
 * Điều này cho phép tìm các ứng dụng như "chrome.exe", "code.exe" mà không cần
 * chúng phải nằm trong biến môi trường PATH.
 *
 * @param exeName Tên file thực thi, ví dụ L"chrome.exe".
 * @return std::wstring Đường dẫn đầy đủ nếu tìm thấy, chuỗi rỗng nếu không.
 */
static std::wstring GetPathFromAppPaths(const std::wstring& exeName)
{
    std::wstring subKey = L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\";
    subKey += exeName;

    wchar_t pathBuf[MAX_PATH];
    DWORD pathSize = sizeof(pathBuf); // Kích thước tính bằng byte

    LSTATUS status = RegGetValueW(
        HKEY_LOCAL_MACHINE,
        subKey.c_str(),
        nullptr, // Lấy giá trị (Default) của key
        RRF_RT_REG_SZ,
        nullptr,
        pathBuf,
        &pathSize
    );

    if (status == ERROR_SUCCESS)
    {
        // pathSize là kích thước (byte) của chuỗi, đã bao gồm NULL terminator.
        // Cần chia cho sizeof(wchar_t) và trừ 1 (NULL) để lấy độ dài.
        return std::wstring(pathBuf, (pathSize / sizeof(wchar_t)) - 1);
    }
    return L""; // Không tìm thấy
}

/**
 * @brief (Windows) Hàm callback cho EnumWindows để thu thập PID của các cửa sổ hiển thị.
 *
 * Hàm này sẽ được gọi cho mọi cửa sổ top-level.
 * Nó lọc ra các cửa sổ không hiển thị hoặc không có tiêu đề.
 */
static BOOL CALLBACK EnumWindowsCollectPids(HWND hwnd, LPARAM lParam)
{
    // Bỏ qua nếu cửa sổ không hiển thị
    if (!IsWindowVisible(hwnd))
        return TRUE; // Tiếp tục duyệt

    // Bỏ qua cửa sổ không có title (ví dụ: các cửa sổ tool/popup nhỏ)
    // Chỉ cần kiểm tra 1 ký tự + null là đủ
    wchar_t title[2];
    if (GetWindowTextW(hwnd, title, 2) == 0)
        return TRUE; // Tiếp tục duyệt

    // Lấy PID từ cửa sổ
    DWORD pid = 0;
    GetWindowThreadProcessId(hwnd, &pid);
    if (pid != 0)
    {
        // Thêm PID vào tập hợp (set)
        auto *s = reinterpret_cast<std::unordered_set<DWORD> *>(lParam);
        s->insert(pid);
    }
    return TRUE; // Tiếp tục duyệt
}

/**
 * @brief (Windows) Liệt kê các ứng dụng người dùng đang chạy.
 */
std::vector<AppSummary> ProcessManager::listUserApplications()
{
    std::vector<AppSummary> out;

    // Bước 1: Lấy tập hợp (set) các PID có cửa sổ top-level đang hiển thị.
    std::unordered_set<DWORD> pidsWithWindows;
    EnumWindows(EnumWindowsCollectPids, reinterpret_cast<LPARAM>(&pidsWithWindows));

    // Bước 2: Lấy danh sách TẤT CẢ các tiến trình
    auto procs = listProcesses();

    // Bước 3: Lọc, nhóm và đếm các tiến trình nằm trong tập hợp PID ở Bước 1.
    std::unordered_map<std::string, int> countMap;
    for (auto &p : procs)
    {
        if (p.name.empty())
            continue;
        
        // Chỉ quan tâm đến các tiến trình có cửa sổ (đã tìm ở Bước 1)
        if (pidsWithWindows.find((DWORD)p.pid) != pidsWithWindows.end())
        {
            countMap[p.name] += 1;
        }
    }

    // Bước 4: Chuyển map thành vector và sắp xếp theo tên
    std::vector<std::pair<std::string, int>> vec(countMap.begin(), countMap.end());
    std::sort(vec.begin(), vec.end(), [](auto &a, auto &b)
              { return a.first < b.first; });

    // Đổ kết quả vào vector output
    out.reserve(vec.size());
    for (auto &kv : vec)
        out.push_back(AppSummary{kv.first, kv.second});

    return out;
}

/**
 * @brief (Windows) Liệt kê tất cả các tiến trình đang chạy trên hệ thống.
 */
std::vector<ProcessInfo> ProcessManager::listProcesses()
{
    std::vector<ProcessInfo> out;

    // Sử dụng Toolhelp Snapshot để duyệt qua các tiến trình
    HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snap == INVALID_HANDLE_VALUE)
        return out;

    PROCESSENTRY32W pe{};
    pe.dwSize = sizeof(pe);

    if (Process32FirstW(snap, &pe))
    {
        do
        {
            ProcessInfo info{};
            info.pid = static_cast<unsigned long>(pe.th32ProcessID);
            // Tên file exe từ snapshot (chuẩn hóa sang UTF-8)
            info.name = WideToUtf8(pe.szExeFile ? std::wstring(pe.szExeFile) : std::wstring());
            
            // Cố gắng "best-effort" để lấy thêm thông tin chi tiết (đường dẫn, memory)
            // (void) để tắt cảnh báo "unused result"
            (void)queryProcessNameAndPath(info.pid, info.name, info.exePath);
            (void)queryProcessMemory(info.pid, info.workingSet);

            out.push_back(std::move(info));
        } while (Process32NextW(snap, &pe));
    }
    
    CloseHandle(snap);
    return out;
}

/**
 * @brief (Windows) Khởi chạy một tiến trình mới.
 */
bool ProcessManager::startProcess(const std::string &path, const std::string &args, unsigned long *outPid)
{
    std::string finalPath = path; // Path cuối cùng để thực thi

    // Bước 1: Kiểm tra Registry 'App Paths' nếu path là tên đơn giản (không chứa '\' hoặc '/')
    if (path.find_first_of("\\/") == std::string::npos)
    {
        std::wstring wExeName = Utf8ToWide(path);
        std::wstring wAppPath = GetPathFromAppPaths(wExeName);

        if (!wAppPath.empty())
        {
            // Tìm thấy trong App Paths! Dùng đường dẫn đầy đủ này.
            finalPath = WideToUtf8(wAppPath);
        }
        // Nếu không tìm thấy, chúng ta vẫn tiếp tục với 'path' gốc (ví dụ: notepad.exe)
        // để CreateProcessW tự tìm trong PATH hệ thống.
    }

    // Bước 2: Build command line
    // Phải có dạng: L"\"C:\path\to\app.exe\" args" để xử lý các đường dẫn có dấu cách.
    std::wstring wcmd;
    {
        std::wstring wpath = Utf8ToWide(finalPath);
        std::wstring wargs = Utf8ToWide(args);
        wcmd.reserve(wpath.size() + wargs.size() + 4); // +4 cho 2 dấu " và 1 dấu cách, 1 null
        wcmd.append(L"\"");
        wcmd.append(wpath);
        wcmd.append(L"\"");
        if (!wargs.empty())
        {
            wcmd.push_back(L' ');
            wcmd.append(wargs);
        }
    }

    STARTUPINFOW si{};
    si.cb = sizeof(si);
    PROCESS_INFORMATION pi{};

    // CreateProcessW yêu cầu một buffer có thể ghi (non-const) cho lpCommandLine
    std::vector<wchar_t> cmdBuf(wcmd.begin(), wcmd.end());
    cmdBuf.push_back(L'\0'); // Thêm null terminator

    BOOL ok = CreateProcessW(
        nullptr,          // lpApplicationName (null -> lấy từ cmdline)
        cmdBuf.data(),    // lpCommandLine (phải là non-const)
        nullptr, nullptr, // lpProcessAttributes, lpThreadAttributes
        FALSE,            // bInheritHandles
        CREATE_NEW_CONSOLE, // dwCreationFlags (hoặc 0 nếu không muốn console mới)
        nullptr, nullptr, // lpEnvironment, lpCurrentDirectory
        &si, &pi);        // lpStartupInfo, lpProcessInformation

    if (!ok)
        return false; // Tạo tiến trình thất bại

    // Trả về PID nếu user yêu cầu
    if (outPid)
        *outPid = static_cast<unsigned long>(pi.dwProcessId);
    
    // Đóng các handle không cần thiết trả về từ CreateProcess
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    return true;
}

/**
 * @brief (Windows) Dừng một tiến trình bằng PID của nó.
 */
bool ProcessManager::stopProcessByPid(unsigned long pid, unsigned int exitCode)
{
    // Yêu cầu quyền PROCESS_TERMINATE để dừng
    HANDLE h = OpenProcess(PROCESS_TERMINATE | PROCESS_QUERY_LIMITED_INFORMATION, FALSE, (DWORD)pid);
    if (!h)
        return false; // Không mở được process (không có quyền, hoặc PID không tồn tại)

    BOOL ok = TerminateProcess(h, exitCode);
    CloseHandle(h);
    return ok == TRUE;
}

/**
 * @brief (Windows) Dừng tất cả các tiến trình có tên file thực thi khớp.
 */
int ProcessManager::stopProcessesByName(const std::string &imageName)
{
    const std::string target = toLower(imageName);
    int count = 0;

    // Tìm tất cả các tiến trình khớp tên
    auto list = findByName(target); // findByName đã dùng toLower
    for (auto &p : list)
    {
        // Phải kiểm tra lại vì findByName có thể trả về listProcesses()
        // (mặc dù logic hiện tại là nó tự lọc)
        if (toLower(p.name) == target)
        {
            if (stopProcessByPid(p.pid))
                ++count;
        }
    }
    return count;
}

/**
 * @brief (Windows) Chuyển đổi chuỗi std::string (UTF-8) sang std::wstring (UTF-16).
 */
std::wstring ProcessManager::Utf8ToWide(const std::string &s)
{
    if (s.empty())
        return {};
    
    // Tính toán độ dài buffer cần thiết
    int len = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, nullptr, 0);
    if (len <= 1) // -1 nghĩa là bao gồm cả null terminator, nên <= 1 là rỗng/lỗi
        return {};
    
    std::wstring out((size_t)len - 1, L'\0'); // -1 để không chứa null
    MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, out.data(), len);
    return out;
}

/**
 * @brief (Windows) Chuyển đổi chuỗi std::wstring (UTF-16) sang std::string (UTF-8).
 */
std::string ProcessManager::WideToUtf8(const std::wstring &ws)
{
    if (ws.empty())
        return {};

    // Tính toán độ dài buffer cần thiết
    int len = WideCharToMultiByte(CP_UTF8, 0, ws.c_str(), -1, nullptr, 0, nullptr, nullptr);
    if (len <= 1)
        return {};

    std::string out((size_t)len - 1, '\0');
    WideCharToMultiByte(CP_UTF8, 0, ws.c_str(), -1, out.data(), len, nullptr, nullptr);
    return out;
}

/**
 * @brief (Windows) Truy vấn tên và đường dẫn đầy đủ của một tiến trình từ PID.
 */
bool ProcessManager::queryProcessNameAndPath(unsigned long pid, std::string &imageNameOut, std::string &exePathOut)
{
    bool okAny = false; // Đã lấy được ít nhất 1 thông tin?
    
    // Yêu cầu quyền PROCESS_QUERY_LIMITED_INFORMATION
    HANDLE h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_VM_READ, FALSE, (DWORD)pid);
    if (!h)
        return false;

    // Phương thức 1: QueryFullProcessImageNameW (ưu tiên, hiện đại)
    // Cần buffer đủ lớn cho đường dẫn dài (UNC paths)
    wchar_t buf[32768]; 
    DWORD size = (DWORD)(sizeof(buf) / sizeof(wchar_t));
    if (QueryFullProcessImageNameW(h, 0, buf, &size))
    {
        exePathOut = WideToUtf8(std::wstring(buf, size));
        if (imageNameOut.empty()) // Chỉ ghi đè tên nếu chưa có
        {
            std::wstring tmp(buf, size);
            auto pos = tmp.find_last_of(L"\\/"); // Tìm dấu \ hoặc / cuối cùng
            std::wstring base = (pos == std::wstring::npos) ? tmp : tmp.substr(pos + 1);
            imageNameOut = WideToUtf8(base);
        }
        okAny = true;
    }
    else
    {
        // Phương thức 2: Fallback về PSAPI (cũ hơn, nhưng vẫn tốt)
        HMODULE hMod;
        DWORD cbNeeded;
        if (EnumProcessModules(h, &hMod, sizeof(hMod), &cbNeeded))
        {
            wchar_t modName[MAX_PATH]{0};
            // Lấy tên base (ví dụ: "notepad.exe")
            if (GetModuleBaseNameW(h, hMod, modName, MAX_PATH))
            {
                imageNameOut = WideToUtf8(modName);
                okAny = true;
            }
            // Lấy đường dẫn đầy đủ
            wchar_t fullPath[MAX_PATH]{0};
            if (GetModuleFileNameExW(h, hMod, fullPath, MAX_PATH))
            {
                exePathOut = WideToUtf8(fullPath);
                okAny = true;
            }
        }
    }

    CloseHandle(h);
    return okAny;
}

/**
 * @brief (Windows) Truy vấn bộ nhớ (Working Set) đang sử dụng của một tiến trình.
 */
bool ProcessManager::queryProcessMemory(unsigned long pid, uint64_t &workingSetOut)
{
    workingSetOut = 0;
    HANDLE h = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, FALSE, (DWORD)pid);
    if (!h)
        return false;

    PROCESS_MEMORY_COUNTERS pmc{};
    if (GetProcessMemoryInfo(h, &pmc, sizeof(pmc)))
    {
        workingSetOut = (uint64_t)pmc.WorkingSetSize;
        CloseHandle(h);
        return true;
    }
    
    CloseHandle(h);
    return false;
}

#endif // kết thúc #if defined(_WIN32)


/**
 * @brief Chuyển đổi một chuỗi sang chữ thường (chung cho mọi nền tảng).
 */
std::string ProcessManager::toLower(std::string s)
{
    std::transform(s.begin(), s.end(), s.begin(),
                   [](unsigned char c)
                   { return (char)std::tolower(c); });
    return s;
}

/**
 * @brief Tìm các tiến trình theo tên (chung cho mọi nền tảng).
 *
 * Hàm này dựa vào `listProcesses()`, nên nó sẽ tự động
 * trả về rỗng nếu `listProcesses()` không được triển khai.
 */
std::vector<ProcessInfo> ProcessManager::findByName(const std::string &imageNameLowerCase)
{
    const std::string target = toLower(imageNameLowerCase);
    std::vector<ProcessInfo> all = listProcesses();
    std::vector<ProcessInfo> res;
    res.reserve(all.size());

    for (auto &p : all)
    {
        if (toLower(p.name) == target)
            res.push_back(std::move(p));
    }
    return res;
}

