# Remote Desktop App

## 1. Cách chạy
  
 - Mở terminal 1: ở folder agent: chạy `build.bat`, sau đó chạy file `agent.exe`
 - Mở terminal 2: ở folder gatewat: chạy `node gateway.js` (yêu cầu đã tải `Node.js`)
 - Trên terminal của gateway hiện: 
    ```txt
        [Gateway] gateway.js started
        [Gateway] Connecting to agent 127.0.0.1:9100 ...
        [Gateway] HTTP listening   at http://192.168.0.102:8080
        [Gateway] WebSocket path   ws://192.168.0.102:8080/ws
        [Gateway] Connected to agent
    ```
 - Vào web client bằng đường link HTTP, nhập websocket path (nếu chưa có sẵn)

## 2. Cấu trúc dự án
```text
+--------------+     TCP (JSON)     +-------------------+     WS + HTTP     +-------------+
|    Agent     | <----------------> |    Node Gateway   | <---------------> | Web Client  |
| (agent.exe)  |                    | (Node.js/gateway) |                   | (Browser)   |
+--------------+                    +-------------------+                   +-------------+