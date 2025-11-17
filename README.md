# Remote Desktop App

## 1. Cấu trúc dự án
```text
+--------------+     TCP (JSON)     +-------------------+     WS + HTTP     +-------------+
|    Agent     | <----------------> |    Node Gateway   | <---------------> | Web Client  |
| (agent.exe)  |                    | (Node.js/gateway) |                   | (Browser)   |
+--------------+                    +-------------------+                   +-------------+

```
### 1.1. Agent (C++ - máy bị điều khiển)

- Thư mục: `agent/`

- Chức năng:

    - Kết nối TCP tới `Gateway` (Node) theo cấu hình `gatewayHost:gatewayPort`.

    - Nhận JSON command (list/start/stop process, list/start/stop app, screenshot, keylogger, …).

    - Thực thi bằng WinAPI/ProcessManager/Capture/Keylogging.

    - Trả JSON kết quả (hoặc screenshot base64, log phím, …) ngược về Gateway.

### 1.2. Gateway (Node.js – máy trung gian)

- Thư mục: `gateway/`

- Chức năng:

    - TCP server lắng nghe kết nối từ các Agent trên port `AGENT_PORT` (mặc định 9100).

    - HTTP server serve UI tại `http://<IP_GATEWAY>:8080` (static từ gateway/public).

    - WebSocket server tại `ws://<IP_GATEWAY>:8080/ws` cho web client.

- Bridge dữ liệu:

    - Nhận JSON từ WebSocket → forward qua TCP cho Agent.

    - Nhận JSON từ Agent → forward ngược lại WebSocket cho web.

### 1.3. Web Client (Browser – giao diện điều khiển)

- Thư mục: `gateway/public/`

- Chức năng:

    - UI kết nối đến Gateway qua WebSocket (`ws://<IP_GATEWAY>:8080/ws`).

    - Gửi các command JSON (list apps, list processes, capture, start/stop keylog, …).

    - Nhận JSON phản hồi từ Agent (qua Gateway) và hiển thị: bảng process/app, ảnh screenshot (base64), log phím, thông báo trạng thái, …

### 1.4. Luồng hoạt động 

- Gateway (máy A) chạy `node gateway.js` → mở:

    - TCP server cho Agent (`0.0.0.0:9100`),

    - HTTP + WebSocket cho Web (`0.0.0.0:8080`).

- Agent (Máy B) chạy `agent.exe` → chủ động TCP connect tới Gateway (`gatewayHost:gatewayPort`) và giữ kết nối.

- Web client (Máy C) truy cập `http://<IP_GATEWAY>:8080`, kết nối WebSocket tới `ws://<IP_GATEWAY>:8080/ws`, gửi lệnh điều khiển.

- Gateway trung chuyển toàn bộ JSON 2 chiều giữa Web client và Agent, đảm bảo mô hình 3 lớp: Web UI ⇄ Gateway (Node) ⇄ Agent (C++).


## 2. Cách chạy
  
 - Mở terminal 1: ở folder gatewat: chạy `node gateway.js` (yêu cầu đã tải `Node.js`)
 - Trên terminal của gateway hiện: 
    ```txt
        [Gateway] gateway.js started (TCP server for agent, WS+HTTP for web)
        [Gateway] TCP listening for agents at 0.0.0.0:9100
        [Gateway] HTTP listening at  http://192.168.0.102:8080
        [Gateway] WebSocket path    ws://192.168.0.102:8080/ws
        [Gateway] Agent connected from 127.0.0.1 : 62596
    ```
- Mở terminal 2: ở folder agent: chạy `build.bat`, chạy file `agent.exe`.
 - Trên terminal của agent hiện:
    ```txt
        [GDI+] Started
        [Agent] Gateway = 127.0.0.1:9100
        [Agent] Connecting to gateway 127.0.0.1:9100...
        [Agent] Connected to gateway
    ```
 - Vào web client bằng đường link HTTP, nhập websocket path (nếu chưa có sẵn)