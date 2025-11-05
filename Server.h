// Define ASIO_STANDALONE là cần thiết để sử dụng phiên bản Asio độc lập.
// Xóa nó nếu bạn đang sử dụng Boost Asio.
#define ASIO_STANDALONE
 
#include <websocketpp/config/asio_no_tls.hpp>
#include <websocketpp/server.hpp>
 
#include <functional>
 
typedef websocketpp::server<websocketpp::config::asio> server;
 
class Server {
public:
    Server();
 
    void run();
private:
    void on_message(websocketpp::connection_hdl hdl, server::message_ptr msg);

    server m_endpoint;
};