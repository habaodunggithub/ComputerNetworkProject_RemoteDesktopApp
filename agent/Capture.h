#pragma once

#include <string>
#include <vector>
#include <fstream>
#include <iostream>

#ifdef _WIN32
#include <windows.h>

#include <objidl.h>  // định nghĩa PROPID
#include <objbase.h> // khai báo CLSIDFromString
#include <gdiplus.h>

#pragma comment(lib, "Gdiplus.lib")
#pragma comment(lib, "Ole32.lib")
#pragma comment(lib, "Gdi32.lib")
#pragma comment(lib, "User32.lib")

using namespace Gdiplus;
#endif


#ifdef _WIN32
bool capture_screenshot(const std::string &output_path);
#endif

static std::string file_to_base64(const std::string &path);

std::string capture_screenshot_base64();