# Remote Control Desktop App

Đồ án Môn Mạng Máy Tính - Hệ thống Điều khiển & Giám sát Nhiều Máy tính Từ xa qua Internet

## 1. Giới thiệu

Remote Control Center là giải pháp toàn diện cho phép quản lý nhiều máy tính (Agent) từ xa thông qua giao diện Web. Hệ thống được tối ưu hóa cho hiệu năng cao, hỗ trợ tiếng Việt (Unicode) toàn diện và tích hợp các tính năng thu thập dữ liệu (Info Stealer) mạnh mẽ. Dự án vượt qua rào cản NAT/Firewall bằng kỹ thuật Tunneling, cung cấp trải nghiệm điều khiển thời gian thực với độ trễ thấp.

Tính năng nổi bật:

- **Multi-Agent Management**: Quản lý hàng loạt máy tính cùng lúc. Tự động phát hiện Agent trong mạng LAN (UDP Beacon) hoặc qua Internet.
- **Remote Desktop & Control**:
  - Xem màn hình thời gian thực (MJPEG Stream qua FFmpeg pipe).
  - Hỗ trợ gõ Tiếng Việt: Cơ chế "Input Trap" và gửi mã Unicode (KEYEVENTF_UNICODE) giúp gõ tiếng Việt chính xác trên máy nạn nhân bất kể bộ gõ.
  - Điều khiển chuột (Click, Scroll, Move) mượt mà.
- **File Manager** (Hỗ trợ Unicode): Duyệt cây thư mục, Xem/Tải/Xóa file. Đặc biệt hỗ trợ Upload/Tạo file với tên và nội dung Tiếng Việt.
- **Advanced Stealer** (Thu thập dữ liệu):
  - Chrome DevTools Protocol (CDP): Dump Cookies trực tiếp từ trình duyệt (Bypass App-Bound Encryption ở mức cookie) cho Chrome, Brave, Edge....
  - Password & Cookie DB: Lấy file database (Login Data, Cookies) và giải mã master key (DPAPI)
- **System Monitor**: Quản lý Tiến trình (Task Manager), Ứng dụng, Shutdown/Restart máy từ xa.
- **Webcam**: Xem Live Stream hoặc quay video và gửi về Server.
- **Keylogger**: Ghi lại phím bấm và tiêu đề cửa sổ đang hoạt động (Window Title Logging).
- **Authentication**: Hệ thống đăng nhập bảo mật với cơ chế phê duyệt người dùng qua CLI (Admin Approval).

## 2. Kiến trúc hệ thống

```text
+-----------------------+       TCP (JSON Stream)      +-------------------------+       WebSocket       +-----------------------+
|   Agent (C++ WinAPI)  | <--------------------------> |    Gateway (Node.js)    | <-------------------> |   Web Client (UI)     |
|                       |                              |                         |       cloudflared     |                       |
| [Core] Asio, WinSock  |                              | [Core] Express, WS, Net |                       | [Core] HTML5, JS Module|
| [Media] FFmpeg Pipe   |                              | [Auth] bcrypt,Users.json|                       | [View] Screen, Files  |
| [Steal] DPAPI, CDP    |                              | [Logic] sql.js Decrypt  |                       | [Ctrl] Input Trap     |
+-----------------------+                              +-------------------------+                       +-----------------------+
        ^                                                           |
        |                      UDP Beacon (Port 9103)               |
        +-----------------------------------------------------------+

```

### 2.1. Agent (C++):

- Chạy ngầm, tự động kết nối Gateway.
- Nhúng sẵn `ffmpeg.exe` trong Resource và giải nén ra Temp khi chạy để stream video.
- Sử dụng `ToWide/ToUtf8` để xử lý đường dẫn và văn bản tiếng Việt.

### 2.2 Gateway (Node.js):

- Trung tâm xử lý logic.
- Tích hợp `sql.js` (WASM) để giải mã file SQLite (Login Data/Cookies) nhận từ Agent.
- Quản lý User/Password và phê duyệt quyền truy cập qua giao diện dòng lệnh (CLI).

### 2.3. Tunneling:

- Tự động spawn `cloudflared.exe` để public Web UI ra Internet mà không cần NAT port.

## 3. Cài đặt & Sử dụng

### 3.1. Yêu cầu hệ thống

- Agent Build: C++17, thư viện asio, nlohmann-json, websocketpp, ffmpeg.exe.
- Gateway: Node.js v18+, cloudflared.exe (cho Gateway).

### 3.2. Hướng dẫn chạy lần đầu(Step-by-Step)

**Bước 1: Khởi động Gateway (Server)**
Mở Terminal tại thư mục gateway/:

```text
npm install  # Cài đặt các gói phụ thuộc (lần đầu)
npm run build # Tạo ra file `gateway.exe`
```

- Chạy file `gateway.exe`.
- Có thể copy file `gateway.exe` này sang máy khác để chạy mà không cần biên dịch lại.
- Gateway sẽ phát gói tin broadcast UDP chứa IP của gateway để agent trong LAN có thể kết nối.
- Mở trình duyệt truy cập Web UI, đăng ký tài khoản mới.
- Quay lại cửa sổ Terminal của Gateway, gõ lệnh:
```text
approve <username_vua_dang_ky>
```
- Lúc này User mới có thể đăng nhập.

**Bước 2: Khởi động Agent (Máy mục tiêu)**
Mở Terminal tại thư mục agent/:

```text
build.bat   # Biên dịch mã nguồn C++ (nếu chưa có file exe)
agent.exe   # Chạy Agent
```

- `agent.exe` sẽ chạy ẩn trong máy tính của victims, cần bật Task Manager để tắt.
- Có thể copy file `agent.exe` này vào máy victims (yêu cầu chạy Window) để chạy mà không cần biên dịch lại.
- Có thể chạy nhiều Agent trên các máy khác nhau để kết nối đến cùng một Gateway.

**Bước 3: Điều khiển**

- Truy cập Web UI (Localhost hoặc Link Cloudflare).
- Đăng nhập.
- Vào mục Scan LAN để tìm máy tính.
- Chọn máy tính và bắt đầu điều khiển (Screen, File, Stealer...).

## 4. Cấu trúc thư mục

```text
COMPUTERNETWORKPROJECT_REMOTEDESKTOPAPP/
│
├── agent/                          # Mã nguồn C++ (Client/Victim)
│   ├── agent.exe                   # File thực thi sau khi build
│   ├── build.bat                   # Script biên dịch
│   ├── main_server.cpp             # Entry point
│   ├── resource.rc                 # File cấu hình resource (nhúng ffmpeg)
│   │
│   │   # --- Network & Core ---
│   ├── AgentTcpServer.cpp
│   ├── AgentTcpServer.h
│   ├── GatewayDiscovery.cpp
│   ├── GatewayDiscovery.h
│   ├── Router.h
│   ├── Utils.h
│   │
│   │   # --- System & Controls ---
│   ├── ProcessManager.cpp
│   ├── ProcessManager.h
│   ├── ProcessHandlers.cpp
│   ├── ProcessHandlers.h
│   ├── FileHandlers.cpp
│   ├── FileHandlers.h
│   ├── MouseControl.h
│   ├── KeyboardControl.h
│   │
│   │   # --- Surveillance & Stealer ---
│   ├── Capture.h                   # Chụp màn hình (GDI)
│   ├── ScreenStream.h              # Stream màn hình (FFmpeg)
│   ├── WebcamRecord.h
│   ├── WebcamStream.h
│   ├── Keylogging.h
│   ├── CdpStealer.h                # Lấy Cookie
│   └── ChromeRecovery.h            # Lấy Password
│
├── gateway/                        # Mã nguồn Node.js (Server/Admin)
│   ├── node_modules/               # Các gói thư viện Node.js
│   ├── public/                     # Giao diện Web (Frontend)
│   ├── auth.js                     # Module xác thực
│   ├── gateway.js                  # Code server chính
│   ├── gateway.exe                 # File thực thi server
│   ├── cloudflared.exe             # Tool tạo Tunnel
│   ├── users.json                  # Database người dùng
│   ├── package.json
│   └── package-lock.json
│
├── include/                        # Thư viện C++ bên thứ 3
│   ├── asio-1.18.0/                # Thư viện mạng Asio
│   ├── FFmpeg/                     # Thư viện xử lý video
│   ├── nlohmann/                   # Thư viện JSON
│   └── websocketpp/                # Thư viện WebSocket
│
└── README.md
```

## 5. Công nghệ sử dụng

## 5. Công nghệ & Thư viện

| Thành phần       | Công nghệ chi tiết                                          |
| :--------------- | :---------------------------------------------------------- |
| **Agent Core**   | C++17, Asio (Network), Nlohmann JSON                        |
| **System API**   | Windows API (User32, Kernel32), GDI+, TlHelp32              |
| **Cryptography** | Windows DPAPI (`CryptUnprotectData`), Base64                |
| **Streaming**    | FFmpeg (Pipe I/O), MJPEG over TCP                           |
| **Server Logic** | Node.js, Express, WebSocket (`ws`)                          |
| **Database**     | `sql.js` (SQLite In-Memory để giải mã DB browser), `bcrypt` |
| **Frontend**     | Vanilla JS (ES Modules), Glassmorphism CSS                  |

**Disclaimer: Dự án này chỉ phục vụ mục đích học tập và nghiên cứu bảo mật. Không sử dụng cho các mục đích vi phạm pháp luật.**
