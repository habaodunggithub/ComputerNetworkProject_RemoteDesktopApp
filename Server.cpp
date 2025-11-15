#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#include <iphlpapi.h>
#pragma comment(lib, "Iphlpapi.lib")
#endif

#include "Server.h"
#include "SimpleHttpServer.h"

#include <asio.hpp>
#include <iostream>
#include <algorithm>
#include <cctype>

#ifdef _WIN32
#include <windows.h>
#include <objidl.h>
#include <gdiplus.h>
#pragma comment(lib, "Gdiplus.lib")
using namespace Gdiplus;
#endif

#include "ProcessManager.h"
#include "Capture.h"

static std::string toLowerCopy(std::string s)
{
    std::transform(s.begin(), s.end(), s.begin(), ::tolower);
    return s;
}

RemoteServer::RemoteServer()
#ifdef _WIN32
    : m_gdiplusToken(0)
#endif
{
#ifdef _WIN32
    GdiplusStartupInput gdiplusInput;
    if (GdiplusStartup((ULONG_PTR *)&m_gdiplusToken, &gdiplusInput, nullptr) != Ok)
    {
        std::cerr << "GDI+ Startup failed!\n";
    }
#endif

    m_endpoint.init_asio();
    m_endpoint.clear_access_channels(websocketpp::log::alevel::all);

    using websocketpp::lib::bind;
    using websocketpp::lib::placeholders::_1;
    using websocketpp::lib::placeholders::_2;

    m_endpoint.set_open_handler(bind(&RemoteServer::on_open, this, _1));
    m_endpoint.set_close_handler(bind(&RemoteServer::on_close, this, _1));
    m_endpoint.set_message_handler(bind(&RemoteServer::on_message, this, _1, _2)); // <--- FIX QUAN TRỌNG

    registerCommandHandlers();
}

RemoteServer::~RemoteServer()
{
#ifdef _WIN32
    if (m_gdiplusToken)
        GdiplusShutdown(m_gdiplusToken);
#endif
}

void RemoteServer::setAllowedProcs(const std::unordered_set<std::string> &names)
{
    m_procAllow.clear();
    for (auto s : names)
        m_procAllow.insert(toLowerCopy(s));

    ProcessManager::setAllowList(std::vector<std::string>(m_procAllow.begin(), m_procAllow.end()));
}

std::string RemoteServer::getLocalLanIp()
{
#ifdef _WIN32
    ULONG bufLen = 15000;
    IP_ADAPTER_ADDRESSES *addrs = (IP_ADAPTER_ADDRESSES *)malloc(bufLen);

    if (GetAdaptersAddresses(AF_INET,
                             GAA_FLAG_SKIP_MULTICAST | GAA_FLAG_SKIP_ANYCAST | GAA_FLAG_SKIP_DNS_SERVER,
                             nullptr, addrs, &bufLen) != NO_ERROR)
    {
        free(addrs);
        return "127.0.0.1";
    }

    for (auto *a = addrs; a; a = a->Next)
    {
        if (a->IfType == IF_TYPE_SOFTWARE_LOOPBACK ||
            a->OperStatus != IfOperStatusUp)
            continue;

        for (auto *u = a->FirstUnicastAddress; u; u = u->Next)
        {
            if (u->Address.lpSockaddr->sa_family != AF_INET)
                continue;

            char ip[INET_ADDRSTRLEN];
            auto *sa = (sockaddr_in *)u->Address.lpSockaddr;
            inet_ntop(AF_INET, &(sa->sin_addr), ip, sizeof(ip));
            free(addrs);
            return ip;
        }
    }

    free(addrs);
#endif
    return "127.0.0.1";
}

void RemoteServer::run()
{
    const uint16_t port = 9002;
    const std::string host = "0.0.0.0";
    std::string lanIp = getLocalLanIp();

    try
    {
        m_endpoint.listen(asio::ip::tcp::endpoint(asio::ip::make_address(host), port));
        m_endpoint.start_accept();

        std::cout << "[Server] Listening on 0.0.0.0:" << port << "\n";
        std::cout << "====================================================\n";
        std::cout << "==> ws://" << lanIp << ":" << port << "\n";
        std::cout << "====================================================\n";

        // === START MINI HTTP SERVER ===
        try
        {
            std::string lanIp = getLocalLanIp();
            SimpleHttpServer http(lanIp, 8080, "index.html");
            http.start();

            std::cout << "[HTTP] Web UI tại: http://" << lanIp << ":8080\n";
        }
        catch (...)
        {
            std::cerr << "[HTTP] Không thể khởi động mini HTTP server!\n";
        }

        m_endpoint.run();
    }
    catch (const std::exception &e)
    {
        std::cerr << "[Server] ERROR: " << e.what() << "\n";
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
    json response;

    try
    {
        json req = json::parse(msg->get_payload());

        if (!checkAuth(req.value("auth_token", "")))
            response = {{"type", "error"}, {"message", "unauthorized"}};
        else
            response = handleRequest(req);
    }
    catch (...)
    {
        response = {{"type", "error"}, {"message", "invalid json"}};
    }

    m_endpoint.send(hdl, response.dump(), msg->get_opcode());
}

json RemoteServer::handleRequest(const json &req)
{
    std::string cmd = toLowerCopy(req.value("command", ""));

    // alias
    if (cmd == "list_apps")
        cmd = "list_applications";
    if (cmd == "start_app")
        cmd = "start_application";

    auto it = m_commandHandlers.find(cmd);
    if (it != m_commandHandlers.end())
        return it->second(req);

    return handleUnknown(req);
}

void RemoteServer::registerCommandHandlers()
{
    m_commandHandlers["list_applications"] = [&](auto &j)
    { return handleListApplications(j); };
    m_commandHandlers["start_application"] = [&](auto &j)
    { return handleStartApplication(j); };
    m_commandHandlers["stop_application"] = [&](auto &j)
    { return handleStopApplication(j); };

    m_commandHandlers["list_processes"] = [&](auto &j)
    { return handleListProcesses(j); };
    m_commandHandlers["start_process"] = [&](auto &j)
    { return handleStartProcess(j); };
    m_commandHandlers["stop_process_pid"] = [&](auto &j)
    { return handleStopProcessPid(j); };
    m_commandHandlers["stop_process_name"] = [&](auto &j)
    { return handleStopProcessName(j); };

    m_commandHandlers["capture_screen"] = [&](auto &j)
    { return handleCaptureScreen(j); };
    m_commandHandlers["help"] = [&](auto &j)
    { return handleHelp(j); };
}

json RemoteServer::handleListApplications(const json &)
{
    auto apps = ProcessManager::listUserApplications();
    json arr = json::array();

    for (auto &a : apps)
        arr.push_back({{"name", a.name}, {"process_count", a.processCount}});

    return {{"type", "application_list"}, {"data", arr}};
}

json RemoteServer::handleStartApplication(const json &req)
{
    std::string name = req.value("app_name", "");
    if (name.empty())
        return {{"type", "status"}, {"success", false}, {"message", "missing app_name"}};

    unsigned long pid{};
    bool ok = ProcessManager::startProcess(name, "", &pid);
    return {{"type", "status"}, {"success", ok}, {"pid", pid}};
}

json RemoteServer::handleStopApplication(const json &req)
{
    auto name = req.value("app_name", "");
    int count = ProcessManager::stopProcessesByName(name);
    return {{"type", "status"}, {"success", count > 0}, {"stopped", count}};
}

json RemoteServer::handleListProcesses(const json &)
{
    auto list = ProcessManager::listProcesses();
    json arr = json::array();

    for (auto &p : list)
        arr.push_back({{"pid", p.pid},
                       {"name", p.name},
                       {"workingSet", p.workingSet},
                       {"exePath", p.exePath}});

    return {{"type", "process_list"}, {"data", arr}};
}

json RemoteServer::handleStartProcess(const json &req)
{
    auto path = req.value("path", "");
    auto args = req.value("args", "");

    if (path.empty())
        return {{"type", "status"}, {"success", false}, {"message", "missing path"}};

    unsigned long pid{};
    bool ok = ProcessManager::startProcess(path, args, &pid);
    return {{"type", "status"}, {"success", ok}, {"pid", pid}};
}

json RemoteServer::handleStopProcessPid(const json &req)
{
    if (!req.contains("pid"))
        return {{"type", "status"}, {"success", false}, {"message", "missing pid"}};

    bool ok = ProcessManager::stopProcessByPid(req["pid"]);
    return {{"type", "status"}, {"success", ok}};
}

json RemoteServer::handleStopProcessName(const json &req)
{
    auto n = req.value("name", "");
    int c = ProcessManager::stopProcessesByName(n);
    return {{"type", "status"}, {"success", c > 0}, {"stopped", c}};
}

json RemoteServer::handleCaptureScreen(const json &)
{
    std::string b64 = capture_screenshot_base64();
    if (b64.empty())
        return {{"type", "status"}, {"success", false}, {"message", "failed"}};

    return {{"type", "screenshot"}, {"success", true}, {"data", b64}};
}

json RemoteServer::handleHelp(const json &)
{
    json arr = json::array();
    for (auto &p : m_commandHandlers)
        arr.push_back(p.first);
    return {{"type", "help"}, {"commands", arr}};
}

json RemoteServer::handleUnknown(const json &req)
{
    return {{"type", "error"}, {"message", "unknown command: " + req.value("command", "")}};
}
