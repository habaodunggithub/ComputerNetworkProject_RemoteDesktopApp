# Remote Control Desktop App
Đồ án Môn Mạng Máy Tính - Hệ thống Điều khiển & Giám sát Nhiều Máy tính Từ xa qua Internet

## 1. Giới thiệu
Remote Control Center cho phép giám sát và điều khiển nhiều máy tính từ xa thông qua trình duyệt web. Dự án vượt qua rào cản NAT/Firewall bằng kỹ thuật Tunneling, cung cấp trải nghiệm điều khiển thời gian thực với độ trễ thấp.

Tính năng nổi bật:
- Multi-Agent Support: Quản lý nhiều Agent đồng thời với agentId (địa chỉ IP), chọn Agent từ giao diện Scan.
- Quản lý Tiến trình (Task Manager): Xem danh sách, tìm kiếm và tắt (Kill) các tiến trình/ứng dụng đang chạy.
- Stream Màn hình: Xem màn hình máy tính từ xa với độ trễ thấp (MJPEG over TCP/WebSocket).
- Keylogger: Giám sát và ghi lại các phím bấm theo thời gian thực.
- Webcam Surveillance: Xem và ghi lại hình ảnh từ Webcam của máy mục tiêu.
- Shutdown/Restart máy mục tiêu.
- Kết nối thông minh:
    - Auto Discovery: Tự động tìm Gateway trong mạng LAN (UDP Beacon).
    - Internet Access: Tích hợp sẵn Cloudflare Tunnel để truy cập từ bất kỳ đâu mà không cần mở port modem.
    - Heartbeat Mechanism: Agent gửi heartbeat mỗi 10 giây, Gateway tự động xóa Agent không hoạt động (60 giây timeout).

## 2. Kiến trúc hệ thống 
```text
+--------------+     TCP (JSON)     +-------------------+     WS + HTTP     +-------------+
|   Agent 1    | <----------------> |                   |                   |             |
| (agent.exe)  |                    |                   |                   |             |
+--------------+                    |                   |                   |             |
                                    |    Node Gateway   | <---------------> | Web Client  |
+--------------+     TCP (JSON)     |  (Multi-Agent)    |                   | (Browser)   |
|   Agent 2    | <----------------> |   gateway.js      |                   |             |
| (agent.exe)  |                    |                   |                   |             |
+--------------+                    +-------------------+                   +-------------+

```
- Agent (C++): Chạy ngầm trên máy bị điều khiển. Thực thi các lệnh hệ thống (WinAPI), chụp màn hình (GDI+), và gửi dữ liệu về Gateway.
    - Gửi heartbeat mỗi 10 giây để duy trì kết nối.
    - Tự động tìm Gateway qua UDP beacon (port 9103).
- Gateway (Node.js): Máy chủ trung gian hỗ trợ nhiều Agent.
    - Quản lý nhiều kết nối TCP với Agent (lưu theo agentId - địa chỉ IP).
    - Phục vụ Web Client qua HTTP/WebSocket.
    - Tự động khởi chạy Cloudflare Tunnel để public ra Internet.
    - Xử lý heartbeat và tự động xóa Agent không hoạt động (timeout 60 giây).
- Web Client (Frontend): Giao diện điều khiển chạy trên trình duyệt, giao tiếp với Gateway qua WebSocket.
    - Hiển thị danh sách Agent và cho phép chọn Agent cần điều khiển.
    - Giao diện đẹp với Glass UI và highlight Agent đang chọn.

## 3. Cài đặt & Sử dụng
### 3.1. Yêu cầu hệ thống
- Agent: Windows 10/11 (Cần quyền Admin để Hook bàn phím và chụp màn hình).
- Gateway: Node.js v14 trở lên.
- Development: VS Code.

### 3.2. Hướng dẫn chạy lần đầu(Step-by-Step)
**Bước 1: Khởi động Gateway (Server)**
Mở Terminal tại thư mục gateway/:
```text
npm install  # Cài đặt các gói phụ thuộc (lần đầu)
npm run build # Tạo ra file `gateway.exe`
```
- Chạy file `gateway.exe`.
- Có thể copy file `gateway.exe` này sang máy khác để chạy mà không cần biên dịch lại.
- Gateway sẽ tự động tạo đường dẫn Public (ví dụ: `https://xyz-abc.trycloudflare.com`).
- Copy đường dẫn này để truy cập từ xa.

**Bước 2: Khởi động Agent (Máy mục tiêu)**
Mở Terminal tại thư mục agent/:
```text
build.bat   # Biên dịch mã nguồn C++ (nếu chưa có file exe)
agent.exe   # Chạy Agent
```
- `agent.exe` sẽ chạy ẩn trong máy tính của victims, cần bật Task Manager để tắt.
- Có thể copy file `agent.exe` này vào máy victims (yêu cầu chạy Window) để chạy mà không cần biên dịch lại.
- Agent sẽ tự động quét mạng LAN (UDP) để tìm Gateway.
- Có thể chạy nhiều Agent trên các máy khác nhau để kết nối đến cùng một Gateway.

**Bước 3: Điều khiển**
- Mở trình duyệt trên điện thoại hoặc máy tính khác.
- Truy cập vào đường link Cloudflare (hoặc `http://localhost:8080` nếu cùng mạng).
- Nhấn nút **Scan** để xem danh sách tất cả Agent đang kết nối (hiển thị IP, hostname, OS).
- Click chọn Agent muốn điều khiển (Agent được chọn sẽ có highlight màu cyan).
- Bắt đầu sử dụng các tính năng (Process Manager, Screen Stream, Keylogger, Webcam...).


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
│   ├── gateway.exe         # File thực thi
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
