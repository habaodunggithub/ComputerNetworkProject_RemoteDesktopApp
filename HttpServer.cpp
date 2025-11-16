#include "HttpServer.h"
#include <sstream>

static std::string getContentType(const std::string &path)
{
    if (path.find(".css") != std::string::npos)
        return "text/css";
    if (path.find(".js") != std::string::npos)
        return "application/javascript";
    if (path.find(".html") != std::string::npos)
        return "text/html";
    return "text/plain";
}

HttpServer::HttpServer(const std::string &ip, int port, const std::string &filePath)
    : m_ip(ip), m_port(port), m_file(filePath) {}

void HttpServer::start()
{
    m_thread = std::thread([this]()
                           { run(); });
    m_thread.detach();
}

void HttpServer::run()
{
    try
    {
        asio::io_context io;
        asio::ip::tcp::acceptor acceptor(
            io, asio::ip::tcp::endpoint(asio::ip::make_address(m_ip), m_port));

        while (true)
        {
            asio::ip::tcp::socket socket(io);
            acceptor.accept(socket);

            std::string request(2048, 0);
            socket.read_some(asio::buffer(request));

            std::string path = "/";
            try
            {
                size_t first_space = request.find(' ');
                if (first_space != std::string::npos)
                {
                    size_t second_space = request.find(' ', first_space + 1);
                    if (second_space != std::string::npos)
                    {
                        path = request.substr(first_space + 1, second_space - (first_space + 1));
                    }
                }
            }
            catch (...)
            {
            }

            std::string filename_to_open = m_file;

            if (path != "/")
            {
                filename_to_open = path.substr(1);
            }

            if (filename_to_open.find("..") != std::string::npos)
            {
                std::string msg = "HTTP/1.1 403 Forbidden\r\n\r\nForbidden";
                asio::write(socket, asio::buffer(msg));
                continue;
            }

            std::ifstream f(filename_to_open);
            if (!f.is_open())
            {
                std::string msg = "HTTP/1.1 404 Not Found\r\n\r\nFile not found: " + filename_to_open;
                asio::write(socket, asio::buffer(msg));
                continue;
            }

            std::string body((std::istreambuf_iterator<char>(f)),
                             std::istreambuf_iterator<char>());

            std::string contentType = getContentType(filename_to_open);

            std::string response =
                "HTTP/1.1 200 OK\r\n"
                "Content-Type: " +
                contentType + "\r\n"
                              "Content-Length: " +
                std::to_string(body.size()) + "\r\n"
                                              "Connection: close\r\n\r\n" +
                body;

            asio::write(socket, asio::buffer(response));
        }
    }
    catch (std::exception &e)
    {
        std::cerr << "[HTTP] Error: " << e.what() << "\n";
    }
}