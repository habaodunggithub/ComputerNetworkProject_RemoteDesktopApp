#ifndef APPS_MANAGER_H
#define APPS_MANAGER_H

#include <string>
#include "nlohmann/json.hpp"

using json = nlohmann::json;

/**
 * @brief Lấy danh sách các ứng dụng đang chạy, được nhóm theo tên.
 * @return Một đối tượng JSON chứa một mảng các ứng dụng,
 * mỗi ứng dụng có "name" (tên) và "process_count" (số tiến trình).
 */
json get_application_list();

/**
 * @brief Khởi động một ứng dụng mới.
 * Hàm này cố gắng chạy ứng dụng trong nền (non-blocking).
 * CẢNH BÁO: Rất không an toàn nếu app_name đến từ người dùng mà không được lọc.
 *
 * @param app_name Tên của ứng dụng (ví dụ: "notepad.exe" hoặc "/usr/bin/gedit").
 * @return true nếu lệnh khởi động được thực thi thành công, false nếu thất bại.
 */
bool start_application(const std::string &app_name);

/**
 * @brief Dừng (kill) TẤT CẢ các tiến trình của một ứng dụng bằng TÊN của nó.
 *
 * @param app_name Tên của ứng dụng cần dừng (ví dụ: "notepad.exe").
 * @return true nếu lệnh dừng được thực thi thành công, false nếu thất bại.
 */
bool stop_application(const std::string &app_name);

#endif // PROCESS_MANAGER_H