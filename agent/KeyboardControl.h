#pragma once
#include <windows.h>
#include <string>
#include <vector>

class KeyboardControl
{
private:
    // Theo dõi các modifier key đang được giữ từ remote
    inline static bool remoteShiftHeld = false;
    inline static bool remoteCtrlHeld = false;
    inline static bool remoteAltHeld = false;

public:
    // Reset tất cả modifier keys - gọi khi disconnect hoặc cần cleanup
    static void ResetModifierKeys()
    {
        INPUT input = {0};
        input.type = INPUT_KEYBOARD;
        input.ki.dwFlags = KEYEVENTF_KEYUP;

        // Nhả Shift nếu đang giữ
        if (remoteShiftHeld)
        {
            input.ki.wVk = VK_SHIFT;
            SendInput(1, &input, sizeof(INPUT));
            remoteShiftHeld = false;
        }

        // Nhả Ctrl nếu đang giữ
        if (remoteCtrlHeld)
        {
            input.ki.wVk = VK_CONTROL;
            SendInput(1, &input, sizeof(INPUT));
            remoteCtrlHeld = false;
        }

        // Nhả Alt nếu đang giữ
        if (remoteAltHeld)
        {
            input.ki.wVk = VK_MENU;
            SendInput(1, &input, sizeof(INPUT));
            remoteAltHeld = false;
        }
    }

    static void SimulateKey(int keyCode)
    {
        INPUT input = {0};
        input.type = INPUT_KEYBOARD;
        input.ki.wVk = keyCode;

        // Nhấn xuống
        input.ki.dwFlags = 0;
        SendInput(1, &input, sizeof(INPUT));

        // Nhả ra
        input.ki.dwFlags = KEYEVENTF_KEYUP;
        SendInput(1, &input, sizeof(INPUT));
    }

    // Simulate với trạng thái press/release riêng (cho modifier keys)
    static void SimulateKeyDown(int keyCode)
    {
        INPUT input = {0};
        input.type = INPUT_KEYBOARD;
        input.ki.wVk = keyCode;
        input.ki.dwFlags = 0;
        SendInput(1, &input, sizeof(INPUT));
    }

    static void SimulateKeyUp(int keyCode)
    {
        INPUT input = {0};
        input.type = INPUT_KEYBOARD;
        input.ki.wVk = keyCode;
        input.ki.dwFlags = KEYEVENTF_KEYUP;
        SendInput(1, &input, sizeof(INPUT));
    }

    static void HandleInput(const std::string &key, int jsKeyCode, bool isKeyDown = true, bool isKeyUp = true)
    {
        int vk = 0;
        bool isModifier = false;

        if (key == "Backspace")
            vk = VK_BACK;
        else if (key == "Enter")
            vk = VK_RETURN;
        else if (key == "Tab")
            vk = VK_TAB;
        else if (key == "Shift")
        {
            vk = VK_SHIFT;
            isModifier = true;
        }
        else if (key == "Control")
        {
            vk = VK_CONTROL;
            isModifier = true;
        }
        else if (key == "Alt")
        {
            vk = VK_MENU;
            isModifier = true;
        }
        else if (key == "Escape")
            vk = VK_ESCAPE;
        else if (key == "ArrowUp")
            vk = VK_UP;
        else if (key == "ArrowDown")
            vk = VK_DOWN;
        else if (key == "ArrowLeft")
            vk = VK_LEFT;
        else if (key == "ArrowRight")
            vk = VK_RIGHT;
        else if (key == "Delete")
            vk = VK_DELETE;
        else if (key == "Meta")
            vk = VK_LWIN;
        else if (key == "CapsLock")
            vk = VK_CAPITAL;
        else if (key == "Space" || key == " ")
            vk = VK_SPACE;
        else if (key == "Home")
            vk = VK_HOME;
        else if (key == "End")
            vk = VK_END;
        else if (key == "PageUp")
            vk = VK_PRIOR;
        else if (key == "PageDown")
            vk = VK_NEXT;
        else if (key == "Insert")
            vk = VK_INSERT;
        else if (key.length() >= 2 && key[0] == 'F')
        {
            // F1-F12
            int fNum = std::stoi(key.substr(1));
            if (fNum >= 1 && fNum <= 12)
                vk = VK_F1 + fNum - 1;
        }
        else
        {
            // Với ký tự thường (A-Z, 0-9), dùng mã ASCII/VirtualKey
            if (jsKeyCode > 0)
                vk = jsKeyCode;
        }

        if (vk == 0)
            return;

        // Xử lý modifier keys đặc biệt (giữ trạng thái)
        if (isModifier)
        {
            if (isKeyDown && !isKeyUp)
            {
                // Chỉ nhấn xuống
                SimulateKeyDown(vk);
                if (vk == VK_SHIFT)
                    remoteShiftHeld = true;
                else if (vk == VK_CONTROL)
                    remoteCtrlHeld = true;
                else if (vk == VK_MENU)
                    remoteAltHeld = true;
            }
            else if (isKeyUp && !isKeyDown)
            {
                // Chỉ nhả ra
                SimulateKeyUp(vk);
                if (vk == VK_SHIFT)
                    remoteShiftHeld = false;
                else if (vk == VK_CONTROL)
                    remoteCtrlHeld = false;
                else if (vk == VK_MENU)
                    remoteAltHeld = false;
            }
            else
            {
                // Press + Release ngay (tap)
                SimulateKey(vk);
            }
        }
        else
        {
            // Phím thường - press + release
            SimulateKey(vk);
        }
    }

    // Gửi chuỗi Unicode (Hỗ trợ tiếng Việt)
    static void SendUnicodeString(const std::wstring &text)
    {
        for (wchar_t ch : text)
        {
            INPUT inputs[2] = {};

            // 1. Sự kiện Nhấn xuống (KeyDown)
            inputs[0].type = INPUT_KEYBOARD;
            inputs[0].ki.wVk = 0;
            inputs[0].ki.wScan = ch;
            inputs[0].ki.dwFlags = KEYEVENTF_UNICODE;

            // 2. Sự kiện Nhả ra (KeyUp)
            inputs[1].type = INPUT_KEYBOARD;
            inputs[1].ki.wVk = 0;
            inputs[1].ki.wScan = ch;
            inputs[1].ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;

            SendInput(2, inputs, sizeof(INPUT));
        }
    }
};