#pragma once
#include <windows.h>
#include <string>
#include <atomic>

/**
 * InputBlocker - Khóa bàn phím và chuột của người dùng
 *
 * Sử dụng Low-Level Hooks (WH_KEYBOARD_LL + WH_MOUSE_LL) để chặn input
 * KHÔNG CẦN QUYỀN ADMIN - hoạt động ở user-mode
 *
 * Nguyên lý: Hook callback không gọi CallNextHookEx() → input bị "nuốt"
 * Chỉ chặn input vật lý (LLKHF_INJECTED = 0), không chặn SendInput() từ remote
 */
class InputBlocker
{
private:
    static inline std::atomic<bool> isBlocked{false};
    static inline HHOOK keyboardHook = nullptr;
    static inline HHOOK mouseHook = nullptr;
    static inline DWORD hookThreadId = 0;

    // Keyboard Hook Callback
    static LRESULT CALLBACK KeyboardProc(int nCode, WPARAM wParam, LPARAM lParam)
    {
        if (nCode >= 0 && isBlocked.load())
        {
            KBDLLHOOKSTRUCT *pKey = (KBDLLHOOKSTRUCT *)lParam;

            // Chỉ chặn phím VẬT LÝ (không phải từ SendInput)
            // LLKHF_INJECTED flag = 0 nghĩa là phím vật lý
            bool isInjected = (pKey->flags & LLKHF_INJECTED) != 0;

            if (!isInjected)
            {
                // "Nuốt" input bằng cách return 1 và KHÔNG gọi CallNextHookEx
                return 1;
            }
        }
        return CallNextHookEx(keyboardHook, nCode, wParam, lParam);
    }

    // Mouse Hook Callback
    static LRESULT CALLBACK MouseProc(int nCode, WPARAM wParam, LPARAM lParam)
    {
        if (nCode >= 0 && isBlocked.load())
        {
            MSLLHOOKSTRUCT *pMouse = (MSLLHOOKSTRUCT *)lParam;

            // Chỉ chặn chuột VẬT LÝ (không phải từ SendInput)
            bool isInjected = (pMouse->flags & LLMHF_INJECTED) != 0;

            if (!isInjected)
            {
                // "Nuốt" mouse input
                return 1;
            }
        }
        return CallNextHookEx(mouseHook, nCode, wParam, lParam);
    }

    // Cài đặt hooks
    static bool InstallHooks()
    {
        if (keyboardHook || mouseHook)
            return true; // Đã cài rồi

        HINSTANCE hInst = GetModuleHandle(nullptr);

        keyboardHook = SetWindowsHookEx(WH_KEYBOARD_LL, KeyboardProc, hInst, 0);
        mouseHook = SetWindowsHookEx(WH_MOUSE_LL, MouseProc, hInst, 0);

        if (!keyboardHook || !mouseHook)
        {
            // Cleanup nếu fail
            if (keyboardHook)
            {
                UnhookWindowsHookEx(keyboardHook);
                keyboardHook = nullptr;
            }
            if (mouseHook)
            {
                UnhookWindowsHookEx(mouseHook);
                mouseHook = nullptr;
            }
            return false;
        }

        hookThreadId = GetCurrentThreadId();
        return true;
    }

    // Gỡ hooks
    static void UninstallHooks()
    {
        if (keyboardHook)
        {
            UnhookWindowsHookEx(keyboardHook);
            keyboardHook = nullptr;
        }
        if (mouseHook)
        {
            UnhookWindowsHookEx(mouseHook);
            mouseHook = nullptr;
        }
        hookThreadId = 0;
    }

public:
    /**
     * Bật chặn input - Khóa bàn phím và chuột người dùng
     * KHÔNG CẦN ADMIN - sử dụng low-level hooks
     */
    static bool Block()
    {
        if (isBlocked.load())
            return true; // Đã khóa rồi

        // Cài hooks nếu chưa có
        if (!InstallHooks())
            return false;

        isBlocked.store(true);
        return true;
    }

    /**
     * Tắt chặn input - Mở khóa bàn phím và chuột
     */
    static bool Unblock()
    {
        if (!isBlocked.load())
            return true; // Chưa khóa

        isBlocked.store(false);
        // Không gỡ hooks ngay - giữ lại để có thể Block lại nhanh
        return true;
    }

    /**
     * Toggle trạng thái khóa
     */
    static bool Toggle()
    {
        if (isBlocked.load())
            return Unblock();
        else
            return Block();
    }

    /**
     * Kiểm tra trạng thái hiện tại
     */
    static bool IsBlocked()
    {
        return isBlocked.load();
    }

    /**
     * Reset về trạng thái mặc định và gỡ hooks hoàn toàn
     * Nên gọi khi ngắt kết nối hoặc thoát chương trình
     */
    static void Reset()
    {
        isBlocked.store(false);
        UninstallHooks();
    }
};
