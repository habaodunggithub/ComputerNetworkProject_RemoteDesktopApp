#pragma once
#include <nlohmann/json.hpp>
#include <string>

using json = nlohmann::json;

class FileHandlers {
public:
    // Lấy danh sách ổ đĩa (C:\, D:\...)
    static json listDrives(const json& req);
    
    // Lấy nội dung thư mục (Hỗ trợ context để biết là load cây hay load view)
    static json listDirectory(const json& req);
    
    // Các lệnh thao tác
    static json createDirectory(const json& req);
    static json createFile(const json& req);
    static json deleteItem(const json& req);
    static json downloadFile(const json& req);
};