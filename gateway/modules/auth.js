// --- Module: Authentication ---
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const readline = require("readline");

// --- SỬA ĐỔI ĐOẠN KHAI BÁO ĐƯỜNG DẪN ---

const isPkg = typeof process.pkg !== 'undefined';

let USERS_FILE;

let baseDir;
if (isPkg) {
    USERS_FILE = path.join(path.dirname(process.execPath), "users.json");
} 
else {
    USERS_FILE = path.join(__dirname, "..", "users.json");
}

// --- HELPER FUNCTIONS ---
const getUsers = () => {
    if (!fs.existsSync(USERS_FILE)) return [];
    try { return JSON.parse(fs.readFileSync(USERS_FILE)); } catch (e) { return []; }
};

const saveAllUsers = (users) => {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
};

const saveUser = (user) => {
    const users = getUsers();
    users.push(user);
    saveAllUsers(users);
};

// --- MAIN MODULE EXPORT ---
module.exports = {
    setup: (app) => {
        // --- 1. API REGISTER ---
        app.post("/api/register", async (req, res) => {
            const { username, password } = req.body;
            if (!username || !password) return res.json({ success: false, message: "Missing info" });

            const users = getUsers();
            if (users.find(u => u.username === username)) {
                return res.json({ success: false, message: "Username exists" });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            saveUser({ username, password: hashedPassword, approved: false, createdAt: Date.now() });

            console.log(`\n\x1b[33m[ALERT] New user: "${username}". Type 'approve ${username}' to allow.\x1b[0m`);
            // Gọi lại prompt nếu CLI đang chạy
            if (process.stdout.isTTY) process.stdout.write("ADMIN> "); 

            res.json({ success: true, message: "Registered! Wait for approval." });
        });

        // --- 2. API LOGIN ---
        app.post("/api/login", async (req, res) => {
            const { username, password } = req.body;
            const users = getUsers();
            const user = users.find(u => u.username === username);

            if (!user) return res.json({ success: false, message: "User not found" });
            if (!await bcrypt.compare(password, user.password)) return res.json({ success: false, message: "Wrong password" });
            if (!user.approved) return res.json({ success: false, message: "Account pending approval." });

            res.json({ success: true, username: user.username });
        });
    },

    startCLI: () => {
        const rl = readline.createInterface({ 
            input: process.stdin, 
            output: process.stdout, 
            prompt: 'ADMIN> ' 
        });

        // Lưu lại hàm log gốc của Node.js
        const originalLog = console.log;

        // Ghi đè console.log để xử lý giao diện
        console.log = function (...args) {
            // 1. Xóa dòng hiện tại (nơi đang có chữ ADMIN>)
            readline.clearLine(process.stdout, 0);
            readline.cursorTo(process.stdout, 0);
            
            // 2. In log như bình thường
            originalLog.apply(console, args);
            
            // 3. Vẽ lại prompt (ADMIN>) ở dòng mới
            // tham số 'true' giúp giữ lại những gì bạn đang gõ dở
            rl.prompt(true); 
        };
        // -------------------------
        
        console.log("\n[Admin CLI] Ready. Type 'help' for commands.\n");
        rl.prompt();

        rl.on('line', (line) => {
            const args = line.trim().split(' ');
            const cmd = args[0].toLowerCase();
            const target = args[1];
            const users = getUsers();

            switch (cmd) {
                case 'help':
                    console.log(`
  ================== ADMIN COMMANDS ==================
  list                : Show pending registration requests
  users               : Show all registered users
  approve <username>  : Approve a pending user
  ban <username>      : Delete/Ban a user
  clear               : Clear console
  exit                : Stop Gateway
  ====================================================
                    `);
                    break;
                case 'list': 
                    const pending = users.filter(u => !u.approved);
                    pending.length ? pending.forEach(u => console.log(`- ${u.username}`)) : console.log("No pending requests.");
                    break;
                case 'users': 
                    users.forEach(u => console.log(`- ${u.username} [${u.approved ? 'OK' : 'WAIT'}]`));
                    break;
                case 'approve':
                    const uApprove = users.find(u => u.username === target);
                    if (uApprove) { uApprove.approved = true; saveAllUsers(users); console.log(`[SUCCESS] User '${target}' APPROVED.`); }
                    else console.log(`User '${target}' not found.`);
                    break;
                case 'ban':
                case 'del':
                    const newUsers = users.filter(u => u.username !== target);
                    if (newUsers.length < users.length) { saveAllUsers(newUsers); console.log(`[DELETED] User '${target}' removed.`); }
                    else console.log(`User '${target}' not found.`);
                    break;
                case 'exit': process.exit(0); break;
                case 'clear': console.clear(); break;
                default: if(line.trim()) console.log(`Unknown command: '${cmd}'`);
            }
            rl.prompt();
        });
    }
};
