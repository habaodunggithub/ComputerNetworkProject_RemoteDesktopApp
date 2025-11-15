@echo off
echo Compiling server...

g++ -std=gnu++17 ^
  -DASIO_STANDALONE -DWIN32_LEAN_AND_MEAN -D_WIN32_WINNT=0x0601 -D_WEBSOCKETPP_NO_REGEX_ ^
  -D_WEBSOCKETPP_CPP11_THREAD_ -D_WEBSOCKETPP_CPP11_CHRONO_ -D_WEBSOCKETPP_CPP11_SYSTEM_ERROR_ ^
  -I include -I include/asio-1.18.0/include -I include/websocketpp -I include/nlohmann ^
  Server.cpp main_server.cpp ProcessManager.cpp Capture.cpp ^
  -o server.exe ^
  -static-libgcc -static-libstdc++ ^
  -lws2_32 -lmswsock -lpsapi -luser32 -lgdi32 -lgdiplus -lole32 -liphlpapi

if %errorlevel% neq 0 (
  echo.
  echo === BUILD FAILED! ===
  pause
) else (
  echo.
  echo === BUILD SUCCESSFUL (server.exe) ===
)