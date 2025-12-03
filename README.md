# Remote Control Desktop App
Đồ án Môn Mạng Máy Tính - Hệ thống Điều khiển & Giám sát Máy tính Từ xa qua Internet

## 1. Giới thiệu
Remote Control Center cho phép giám sát và điều khiển máy tính từ xa thông qua trình duyệt web. Dự án vượt qua rào cản NAT/Firewall bằng kỹ thuật Tunneling, cung cấp trải nghiệm điều khiển thời gian thực với độ trễ thấp.

Tính năng nổi bật:
- Quản lý Tiến trình (Task Manager): Xem danh sách, tìm kiếm và tắt (Kill) các tiến trình/ứng dụng đang chạy.
- Stream Màn hình: Xem màn hình máy tính từ xa với độ trễ thấp (MJPEG over TCP/WebSocket).
- Keylogger: Giám sát và ghi lại các phím bấm theo thời gian thực.
- Webcam Surveillance: Xem và ghi lại hình ảnh từ Webcam của máy mục tiêu.
- Shutdown/Restart máy mục tiêu.
- Kết nối thông minh:
    - Auto Discovery: Tự động tìm Gateway trong mạng LAN (UDP Beacon).
    - Internet Access: Tích hợp sẵn Cloudflare Tunnel để truy cập từ bất kỳ đâu mà không cần mở port modem.

## 2. Kiến trúc hệ thống 
```text
+--------------+     TCP (JSON)     +-------------------+     WS + HTTP     +-------------+
|    Agent     | <----------------> |    Node Gateway   | <---------------> | Web Client  |
| (agent.exe)  |                    | (Node.js/gateway) |                   | (Browser)   |
+--------------+                    +-------------------+                   +-------------+

```
- Agent (C++): Chạy ngầm trên máy bị điều khiển. Thực thi các lệnh hệ thống (WinAPI), chụp màn hình (GDI+), và gửi dữ liệu về Gateway.
- Gateway (Node.js): Máy chủ trung gian.
    - Quản lý kết nối TCP với Agent.
    - Phục vụ Web Client qua HTTP/WebSocket.
    - Tự động khởi chạy Cloudflare Tunnel để public ra Internet.
- Web Client (Frontend): Giao diện điều khiển chạy trên trình duyệt, giao tiếp với Gateway qua WebSocket.

## 3. Cài đặt & Sử dụng
### 3.1. Yêu cầu hệ thống
- Agent: Windows 10/11 (Cần quyền Admin để Hook bàn phím và chụp màn hình).
- Gateway: Node.js v14 trở lên.
- Development: VS Code.

### 3.2. Hướng dẫn chạy (Step-by-Step)
**Bước 1: Khởi động Gateway (Server)**
Mở Terminal tại thư mục gateway/:
```text
npm install  # Cài đặt các gói phụ thuộc (lần đầu)
node gateway.js
```
- Gateway sẽ tự động tạo đường dẫn Public (ví dụ: `https://xyz-abc.trycloudflare.com`).
- Copy đường dẫn này để truy cập từ xa.

**Bước 2: Khởi động Agent (Máy mục tiêu)**
Mở Terminal tại thư mục agent/:
```text
build.bat   # Biên dịch mã nguồn C++ (nếu chưa có file exe)
agent.exe   # Chạy Agent
```
- Agent sẽ tự động quét mạng LAN (UDP) để tìm Gateway.
- Khi thấy dòng thông báo `[Agent] Connected to gateway`, kết nối đã thiết lập thành công.

**Bước 3: Điều khiển**
- Mở trình duyệt trên điện thoại hoặc máy tính khác.
- Truy cập vào đường link Cloudflare (hoặc `http://localhost:8080` nếu cùng mạng).
- Nhấn nút Connect.
- Bắt đầu sử dụng các tính năng.

## 4. Cấu trúc thư mục
```text
Project_Root/
├── agent/                  # Mã nguồn C++ (Client bị điều khiển)
│   ├── src/                # File .cpp .h (Capture, Keylog, Socket...)
│   ├── include/            # Thư viện (ASIO, JSON, FFmpeg...)
│   ├── build.bat           # Script biên dịch
│   └── agent.exe           # File thực thi
│
├── gateway/                # Mã nguồn Node.js (Server trung gian)
│   ├── public/             # Giao diện Web (HTML/CSS/JS)
│   ├── gateway.js          # Server Core
│   └── cloudflared.exe     # Tool Tunneling
│
└── README.md               # Tài liệu dự án
```

## 5. Công nghệ sử dụng

| Thành phần | Công nghệ |
| :--- | :--- |
| **Backend Agent** | C++17, Winsock2, GDI+, Windows API |
| **Backend Gateway** | Node.js, Express, WebSocket (`ws`), Net, Dgram |
| **Frontend** | HTML5, CSS3 (Glass UI), JavaScript (ES6+), Feather Icons |
| **Tunneling** | Cloudflare Tunnel (Argo) |
| **Media** | FFmpeg (MJPEG Streaming) |
