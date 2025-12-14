#pragma once
#include <windows.h>
#include <string>
#include <vector>

class KeyboardControl
{
public:
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
    static void HandleInput(const std::string &key, int jsKeyCode)
    {
        int vk = 0;

        if (key == "Backspace")
            vk = VK_BACK;
        else if (key == "Enter")
            vk = VK_RETURN;
        else if (key == "Tab")
            vk = VK_TAB;
        else if (key == "Shift")
            vk = VK_SHIFT;
        else if (key == "Control")
            vk = VK_CONTROL;
        else if (key == "Alt")
            vk = VK_MENU;
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
            vk = VK_LWIN; // Phím Windows
        else
        {
            // Với ký tự thường (A-Z, 0-9), dùng mã ASCII/VirtualKey
            if (jsKeyCode > 0)
                vk = jsKeyCode;
        }

        if (vk != 0)
        {
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
            inputs[0].ki.wVk = 0;    // Phải để 0 khi dùng UNICODE
            inputs[0].ki.wScan = ch; // Mã Unicode của ký tự (ví dụ: 'â', 'đ')
            inputs[0].ki.dwFlags = KEYEVENTF_UNICODE;

            // 2. Sự kiện Nhả ra (KeyUp)
            inputs[1].type = INPUT_KEYBOARD;
            inputs[1].ki.wVk = 0;
            inputs[1].ki.wScan = ch;
            inputs[1].ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;

            // Gửi cả cặp nhấn/nhả
            SendInput(2, inputs, sizeof(INPUT));
        }
    }
};