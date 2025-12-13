#pragma once
#include <windows.h>
#include <string>

class MouseControl
{
public:
    // Di chuyển chuột đến tọa độ tỉ lệ (x, y từ 0.0 đến 1.0)
    static void Move(double x, double y)
    {
        // Lấy độ phân giải màn hình hiện tại
        int width = GetSystemMetrics(SM_CXSCREEN);
        int height = GetSystemMetrics(SM_CYSCREEN);

        // Chuyển đổi từ tỉ lệ sang pixel
        int absX = static_cast<int>(x * width);
        int absY = static_cast<int>(y * height);

        SetCursorPos(absX, absY);
    }

    // Xử lý Click (Trái/Phải/Giữa - Nhấn/Thả)
    static void Action(const std::string &button, const std::string &action)
    {
        INPUT input = {0};
        input.type = INPUT_MOUSE;

        DWORD flags = 0;

        if (button == "left")
        {
            flags = (action == "down") ? MOUSEEVENTF_LEFTDOWN : MOUSEEVENTF_LEFTUP;
        }
        else if (button == "right")
        {
            flags = (action == "down") ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_RIGHTUP;
        }
        else if (button == "middle")
        {
            flags = (action == "down") ? MOUSEEVENTF_MIDDLEDOWN : MOUSEEVENTF_MIDDLEUP;
        }

        if (flags != 0)
        {
            input.mi.dwFlags = flags;
            SendInput(1, &input, sizeof(INPUT));
        }
    }

    // Xử lý lăn chuột (Scroll)
    static void Scroll(int delta)
    {
        INPUT input = {0};
        input.type = INPUT_MOUSE;
        input.mi.dwFlags = MOUSEEVENTF_WHEEL;
        input.mi.mouseData = static_cast<DWORD>(delta);
        SendInput(1, &input, sizeof(INPUT));
    }
};