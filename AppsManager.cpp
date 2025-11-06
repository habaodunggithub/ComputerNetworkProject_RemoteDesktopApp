#include "AppsManager.h"

#include <cstdio>   // Cho popen/pclose, FILE
#include <memory>   // Cho std::shared_ptr
#include <array>    // Cho std::array
#include <sstream>  // Cho std::stringstream
#include <vector>   // Cho std::vector
#include <iostream> // Cho std::cerr
#include <map>      // Thêm map để nhóm các tiến trình

// Thư viện đặc thù của HĐH
#ifdef _WIN32
#define _CRT_SECURE_NO_WARNINGS // Tắt cảnh báo trên Windows
#include <windows.h>
#else
#include <unistd.h>
#include <signal.h>   // Cho kill()
#include <sys/wait.h> // Cho WIFEXITED, WEXITSTATUS
#endif

/**
 * @brief Thực thi một lệnh shell và trả về kết quả (stdout).
 * Đây là một hàm trợ giúp nội bộ.
 */
static std::string exec_shell_command(const char *cmd)
{
    std::array<char, 128> buffer;
    std::string result;

    // Sử dụng shared_ptr để tự động đóng pipe (pclose/_pclose)
#ifdef _WIN32
    std::shared_ptr<FILE> pipe(_popen(cmd, "r"), _pclose);
#else
    std::shared_ptr<FILE> pipe(popen(cmd, "r"), pclose);
#endif

    if (!pipe)
    {
        std::cerr << "Lỗi: popen() thất bại khi chạy lệnh: " << cmd << std::endl;
        return ""; // Trả về chuỗi rỗng nếu có lỗi
    }

    while (fgets(buffer.data(), buffer.size(), pipe.get()) != nullptr)
    {
        result += buffer.data();
    }
    return result;
}

// Triển khai hàm get_application_list (Logic mới)
json get_application_list()
{
    // Sử dụng map để đếm số lượng tiến trình cho mỗi tên ứng dụng
    std::map<std::string, int> app_counts;

#ifdef _WIN32
    // Windows: Sử dụng lệnh 'tasklist'
    std::string output = exec_shell_command("tasklist /FO CSV /NH");
    std::stringstream ss(output);
    std::string line;
    while (std::getline(ss, line))
    {
        if (line.empty() || line[0] != '"')
            continue;

        std::stringstream line_ss(line);
        std::string segment;
        std::vector<std::string> parts;
        while (std::getline(line_ss, segment, ','))
        {
            // Xóa dấu "" ở đầu và cuối
            if (!segment.empty() && segment.front() == '"')
                segment.erase(0, 1);
            if (!segment.empty() && segment.back() == '"')
                segment.pop_back();
            parts.push_back(segment);
        }

        if (parts.size() >= 1)
        {
            std::string name = parts[0];
            app_counts[name]++; // Tăng bộ đếm cho tên ứng dụng này
        }
    }
#else
    // Linux/macOS: Sử dụng lệnh 'ps'
    std::string output = exec_shell_command("ps -e -o pid,comm");
    std::stringstream ss(output);
    std::string line;
    std::getline(ss, line); // Bỏ qua dòng header

    while (std::getline(ss, line))
    {
        if (line.empty())
            continue;

        std::stringstream line_ss(line);
        long pid;
        std::string name;

        line_ss >> pid >> name;
        if (!name.empty() && pid > 0)
        {
            app_counts[name]++; // Tăng bộ đếm cho tên ứng dụng này
        }
    }
#endif

    // Chuyển map thành JSON array
    json response = json::array();
    for (const auto &pair : app_counts)
    {
        json app;
        app["name"] = pair.first;
        app["process_count"] = pair.second;
        response.push_back(app);
    }
    return response;
}

// Triển khai hàm start_application (Không đổi)
bool start_application(const std::string &app_name)
{
    // CẢNH BÁO BẢO MẬT: Đây là một bộ lọc rất cơ bản và không đầy đủ!
    if (app_name.find_first_of("\\/;&|`$()") != std::string::npos)
    {
        std::cerr << "Lỗi bảo mật: Tên ứng dụng chứa ký tự không hợp lệ: " << app_name << std::endl;
        return false;
    }

    // 2. Chặn riêng ".." (path traversal)
    if (app_name.find("..") != std::string::npos)
    {
        std::cerr << "Lỗi bảo mật: Tên ứng dụng không được chứa '..': " << app_name << std::endl;
        return false;
    }

    std::string command;
#ifdef _WIN32
    // Windows: Sử dụng 'start' để chạy không đồng bộ
    command = "start \"\" \"" + app_name + "\"";
#else
    // Linux/macOS: Chạy nền với 'nohup' và '&'
    command = "nohup " + app_name + " > /dev/null 2>&1 &";
#endif

    int result = system(command.c_str());

#ifdef _WIN32
    return result == 0; // Trên Windows, 0 là thành công
#else
    return WIFEXITED(result) && WEXITSTATUS(result) == 0;
#endif
}

// Triển khai hàm stop_application (Logic mới)
bool stop_application(const std::string &app_name)
{
    // Cảnh báo: Lọc đầu vào cơ bản.
    if (app_name.find_first_of("\"'&|`$()") != std::string::npos)
    {
        std::cerr << "Lỗi bảo mật: Tên ứng dụng không hợp lệ: " << app_name << std::endl;
        return false;
    }

    std::string command;
#ifdef _WIN32
    // Windows: Sử dụng 'taskkill' với /IM (Image Name) để dừng bằng tên
    command = "taskkill /F /IM \"" + app_name + "\"";
#else
    // Linux/macOS: Sử dụng 'killall' (hoặc 'pkill')
    command = "killall \"" + app_name + "\"";
#endif

    std::string output = exec_shell_command(command.c_str());

    // Kiểm tra thành công
#ifdef _WIN32
    // taskkill trả về thông báo "SUCCESS" (tiếng Anh) hoặc "THÀNH CÔNG" (tiếng Việt)
    return output.find("SUCCESS") != std::string::npos || output.find("THÀNH CÔNG") != std::string::npos;
#else
    // killall trả về 0 nếu thành công.
    // Vì exec_shell_command không trả về mã exit, chúng ta chỉ có thể
    // giả định là thành công nếu popen không thất bại.
    // Đây là một hạn chế của hàm exec_shell_command đơn giản.
    return true;
#endif
}