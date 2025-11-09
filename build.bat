g++ -std=gnu++17 ^
  -DASIO_STANDALONE -DWIN32_LEAN_AND_MEAN -D_WIN32_WINNT=0x0601 -D_WEBSOCKETPP_NO_REGEX_ ^
  -D_WEBSOCKETPP_CPP11_THREAD_ -D_WEBSOCKETPP_CPP11_CHRONO_ -D_WEBSOCKETPP_CPP11_SYSTEM_ERROR_ ^
  -I include -I include/asio-1.18.0/include -I include/websocketpp -I include/nlohmann ^
  Server.cpp main_server.cpp AppsManager.cpp ProcessManager.cpp ^
  -o server.exe ^
  -lws2_32 -lmswsock -lpsapi -luser32 -pthread
