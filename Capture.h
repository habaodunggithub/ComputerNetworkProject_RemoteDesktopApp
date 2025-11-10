#pragma once
#include <string>

/**
 * @brief Chụp ảnh màn hình hiện tại của server và lưu tạm vào file.
 * @param output_path Đường dẫn file ảnh (VD: "screenshot.png").
 * @return true nếu chụp thành công, false nếu có lỗi.
 */
bool capture_screenshot(const std::string& output_path);

/**
 * @brief Chụp ảnh màn hình và trả về chuỗi base64 của ảnh PNG.
 * @return std::string chứa dữ liệu base64, hoặc rỗng nếu lỗi.
 */
std::string capture_screenshot_base64();
