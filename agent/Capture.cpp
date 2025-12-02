#include "Capture.h"

#ifdef _WIN32
bool capture_screenshot(const std::string &output_path)
{
    // GDI+ được khởi tạo bởi main_server
    HDC hScreen = GetDC(nullptr);
    if (!hScreen)
    {
        std::cerr << "Lỗi: GetDC(nullptr) thất bại.\n";
        return false;
    }

    int width = GetSystemMetrics(SM_CXSCREEN);
    int height = GetSystemMetrics(SM_CYSCREEN);

    HDC hDC = CreateCompatibleDC(hScreen);
    if (!hDC)
    {
        ReleaseDC(nullptr, hScreen);
        std::cerr << "Lỗi: CreateCompatibleDC thất bại.\n";
        return false;
    }

    HBITMAP hBitmap = CreateCompatibleBitmap(hScreen, width, height);
    if (!hBitmap)
    {
        DeleteDC(hDC);
        ReleaseDC(nullptr, hScreen);
        std::cerr << "Lỗi: CreateCompatibleBitmap thất bại.\n";
        return false;
    }

    HGDIOBJ old = SelectObject(hDC, hBitmap);
    BitBlt(hDC, 0, 0, width, height, hScreen, 0, 0, SRCCOPY);
    SelectObject(hDC, old);

    // Làm PNG encoder CLSID
    CLSID clsid;
    CLSIDFromString(L"{557CF406-1A04-11D3-9A73-0000F81EF32E}", &clsid);

    Bitmap bmp(hBitmap, nullptr);
    std::wstring wpath(output_path.begin(), output_path.end());
    Status status = bmp.Save(wpath.c_str(), &clsid, nullptr);

    // Dọn dẹp
    DeleteObject(hBitmap);
    DeleteDC(hDC);
    ReleaseDC(nullptr, hScreen);

    return status == Ok;
}
#endif

// Chuyển file ảnh sang base64
static std::string file_to_base64(const std::string &path)
{
    std::ifstream ifs(path, std::ios::binary | std::ios::ate);
    if (!ifs.is_open())
        return "";

    std::streamsize size = ifs.tellg();
    ifs.seekg(0, std::ios::beg);
    std::vector<char> buffer(size);

    if (!ifs.read(buffer.data(), size))
        return "";

    static const char *base64_chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    std::string encoded;
    encoded.reserve(((size + 2) / 3) * 4);

    int val = 0;
    int valb = -6;
    for (unsigned char c : buffer)
    {
        val = (val << 8) + c;
        valb += 8;
        while (valb >= 0)
        {
            encoded.push_back(base64_chars[(val >> valb) & 0x3F]);
            valb -= 6;
        }
    }
    if (valb > -6)
        encoded.push_back(base64_chars[((val << 8) >> (valb + 8)) & 0x3F]);

    // Thêm padding '='
    while (encoded.size() % 4)
        encoded.push_back('=');

    return encoded;
}

std::string capture_screenshot_base64()
{
    // Dùng tên file tạm thời
    const std::string path = "temp_screenshot.png";
    if (!capture_screenshot(path))
    {
        std::cerr << "Capture screenshot thất bại.\n";
        return "";
    }

    std::string b64 = file_to_base64(path);

    return b64;
}