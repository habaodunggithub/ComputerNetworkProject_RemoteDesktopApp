#include "Server.h"

#include <asio.hpp>
#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <iostream>
#include <unordered_map>
#include <vector>

// JSON
#include <nlohmann/json.hpp>
using json = nlohmann::json;

// Managers
#include "AppsManager.h"    // giữ nguyên bộ lệnh app-level cũ
#include "ProcessManager.h" // bộ lệnh process mới

static std::string toLowerCopy(std::string s)
{
    std::transform(s.begin(), s.end(), s.begin(),
                   [](unsigned char c)
                   { return char(std::tolower(c)); });
    return s;
}

RemoteServer::RemoteServer()
{
    m_endpoint.init_asio();
    m_endpoint.clear_access_channels(websocketpp::log::alevel::all);

    using websocketpp::lib::bind;
    using websocketpp::lib::placeholders::_1;
    using websocketpp::lib::placeholders::_2;

    m_endpoint.set_open_handler(bind(&RemoteServer::on_open, this, _1));
    m_endpoint.set_close_handler(bind(&RemoteServer::on_close, this, _1));
    m_endpoint.set_message_handler(bind(&RemoteServer::on_message, this, _1, _2));
}

void RemoteServer::setAllowedProcs(const std::unordered_set<std::string> &names)
{
    m_procAllow.clear();
    for (auto s : names)
        m_procAllow.insert(toLowerCopy(std::move(s)));
    // Đồng bộ sang ProcessManager
    ProcessManager::setAllowList(std::vector<std::string>(m_procAllow.begin(), m_procAllow.end()));
}

void RemoteServer::run()
{
    // Đọc token ENV (nếu có)
    if (m_authToken.empty())
    {
        if (const char *tok = std::getenv("REMOTE_DESKTOP_TOKEN"))
        {
            m_authToken = tok;
        }
    }

#if defined(_WIN32)
    // Nếu chưa set allow-list, đặt mặc định an toàn cho demo
    if (m_procAllow.empty())
    {
        setAllowedProcs({"notepad.exe", "calc.exe"});
    }
#endif

    const std::string host = "127.0.0.1";
    const uint16_t port = 9002;

    try
    {
        asio::ip::tcp::endpoint ep(asio::ip::make_address(host), port);
        m_endpoint.listen(ep);
        m_endpoint.start_accept();

        std::cout << "[Server] Listening on " << host << ":" << port << "\n";
        std::cout << "[Server] Auth: " << (m_authToken.empty() ? "DISABLED" : "ENABLED") << "\n";

        m_endpoint.run();
    }
    catch (const std::exception &e)
    {
        std::cerr << "[Server] listen/run error: " << e.what() << std::endl;
    }
}

void RemoteServer::on_open(websocketpp::connection_hdl)
{
    std::cout << "[WS] Client connected\n";
}
void RemoteServer::on_close(websocketpp::connection_hdl)
{
    std::cout << "[WS] Client disconnected\n";
}

bool RemoteServer::checkAuth(const std::string &token) const
{
    if (m_authToken.empty())
        return true;
    return token == m_authToken;
}

void RemoteServer::on_message(websocketpp::connection_hdl hdl, WsServer::message_ptr msg)
{
    std::string out;
    try
    {
        out = handleMessage(msg->get_payload());
    }
    catch (const std::exception &e)
    {
        out = json({{"type", "error"}, {"message", std::string("internal error: ") + e.what()}}).dump();
    }

    try
    {
        m_endpoint.send(hdl, out, msg->get_opcode());
    }
    catch (const websocketpp::exception &e)
    {
        std::cerr << "[WS] send error: " << e.what() << std::endl;
    }
}

std::string RemoteServer::handleMessage(const std::string &payload)
{
    json req;
    try
    {
        req = json::parse(payload);
    }
    catch (...)
    {
        return json({{"type", "error"}, {"message", "invalid json"}}).dump();
    }

    // Auth
    if (!checkAuth(req.value("auth_token", "")))
    {
        return json({{"type", "error"}, {"message", "unauthorized"}}).dump();
    }

    // Command + alias thường gặp
    std::string cmd = req.value("command", "");
    std::string C = toLowerCopy(cmd);
    if (C == "list_apps" || C == "list_app")
        C = "list_applications";
    if (C == "start_app" || C == "start")
        C = "start_application";
    if (C == "stop_app" || C == "stop")
        C = "stop_application";
    if (C == "list_proc" || C == "process_list")
        C = "list_processes";
    if (C == "kill_pid" || C == "terminate_pid")
        C = "stop_process_pid";
    if (C == "kill_name" || C == "stop_by_name" ||
        C == "terminate_name")
        C = "stop_process_name";

    // ================= APPS (dùng ProcessManager để thống nhất dữ liệu) =================
    if (C == "list_applications")
    {
        // Lấy toàn bộ tiến trình và group theo tên image
        auto procs = ProcessManager::listProcesses();
        std::unordered_map<std::string, int> cnt;
        for (auto &p : procs)
        {
            if (!p.name.empty())
                cnt[p.name] += 1;
        }
        std::vector<std::pair<std::string, int>> vec(cnt.begin(), cnt.end());
        std::sort(vec.begin(), vec.end(), [](auto &a, auto &b)
                  { return a.first < b.first; });

        json arr = json::array();
        for (auto &kv : vec)
        {
            arr.push_back({{"name", kv.first}, {"process_count", kv.second}});
        }
        return json({{"type", "application_list"}, {"data", arr}}).dump();
    }

    if (C == "start_application")
    {
        std::string path = req.value("app_name", ""); // UI đang gửi vào app_name
        if (path.empty())
        {
            return json({{"type", "status"}, {"success", false}, {"message", "app_name required"}}).dump();
        }
        unsigned long pid{};
        bool ok = ProcessManager::startProcess(path, "", &pid);
        json res = {{"type", "status"}, {"success", ok}, {"pid", pid}};
        if (!ok)
            res["message"] = "failed to start (maybe not allowed?)";
        return res.dump();
    }

    if (C == "stop_application")
    {
        std::string app = req.value("app_name", "");
        int stopped = app.empty() ? 0 : ProcessManager::stopProcessesByName(app);
        return json({{"type", "status"}, {"success", stopped > 0}, {"stopped", stopped}}).dump();
    }

    // ================= PROCESSES (ProcessManager) =================
    if (C == "list_processes")
    {
        auto v = ProcessManager::listProcesses();
        json arr = json::array();
        for (auto &p : v)
        {
            arr.push_back({{"pid", p.pid},
                           {"name", p.name},
                           {"workingSet", p.workingSet},
                           {"exePath", p.exePath}});
        }
        return json({{"type", "process_list"}, {"data", arr}}).dump();
    }

    if (C == "start_process")
    {
        const std::string path = req.value("path", "");
        const std::string args = req.value("args", "");
        if (path.empty())
            return json({{"type", "status"}, {"success", false}, {"message", "path required"}}).dump();
        unsigned long pid{};
        const bool ok = ProcessManager::startProcess(path, args, &pid);
        json res = {{"type", "status"}, {"success", ok}, {"pid", pid}};
        if (!ok)
            res["message"] = "failed to start (maybe not allowed?)";
        return res.dump();
    }

    if (C == "stop_process_pid")
    {
        if (!req.contains("pid"))
            return json({{"type", "status"}, {"success", false}, {"message", "pid required"}}).dump();
        unsigned long pid = req["pid"].get<unsigned long>();
        const bool ok = ProcessManager::stopProcessByPid(pid);
        return json({{"type", "status"}, {"success", ok}}).dump();
    }

    if (C == "stop_process_name")
    {
        const std::string name = req.value("name", "");
        if (name.empty())
            return json({{"type", "status"}, {"success", false}, {"message", "name required"}}).dump();
        const int stopped = ProcessManager::stopProcessesByName(name);
        return json({{"type", "status"}, {"success", stopped > 0}, {"stopped", stopped}}).dump();
    }

    // help
    if (C == "help")
    {
        return json({{"type", "help"},
                     {"commands", {"list_applications", "start_application", "stop_application", "list_processes", "start_process", "stop_process_pid", "stop_process_name"}}})
            .dump();
    }

    return json({{"type", "error"}, {"message", std::string("Lệnh không xác định: ") + cmd}}).dump();
}
