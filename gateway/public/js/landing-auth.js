// =================================================================
// LANDING AUTH - Handle authentication on landing pages
// =================================================================

(function() {
    // Check if user is already logged in
    function isLoggedIn() {
        return sessionStorage.getItem('rcc_user') !== null;
    }

    // Show auth modal
    function showAuthModal(mode = 'login') {
        const modal = document.getElementById('auth-modal');
        const loginForm = document.getElementById('landing-form-login');
        const registerForm = document.getElementById('landing-form-register');
        
        if (!modal) return;
        
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        
        if (mode === 'login') {
            loginForm.classList.remove('hidden');
            registerForm.classList.add('hidden');
        } else {
            loginForm.classList.add('hidden');
            registerForm.classList.remove('hidden');
        }
    }

    // Hide auth modal
    function hideAuthModal() {
        const modal = document.getElementById('auth-modal');
        if (modal) {
            modal.classList.add('hidden');
            document.body.style.overflow = '';
        }
    }

    // Show message
    function showMessage(msg, isError = true) {
        const msgEl = document.getElementById('landing-auth-msg');
        if (!msgEl) return;
        
        msgEl.textContent = msg;
        msgEl.className = isError ? 'auth-msg error' : 'auth-msg success';
        msgEl.classList.remove('hidden');
        
        setTimeout(() => {
            msgEl.classList.add('hidden');
        }, 4000);
    }

    // Login request
    async function doLogin(username, password) {
        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            
            if (data.success) {
                sessionStorage.setItem('rcc_user', username);
                showMessage('Đăng nhập thành công! Đang chuyển hướng...', false);
                setTimeout(() => {
                    window.location.href = '/dashboard';
                }, 1000);
            } else {
                showMessage(data.message || 'Đăng nhập thất bại');
            }
        } catch (err) {
            showMessage('Lỗi kết nối');
        }
    }

    // Register request
    async function doRegister(username, password) {
        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            
            if (data.success) {
                // Show server message - user needs to wait for admin approval
                showMessage(data.message || 'Đăng ký thành công! Vui lòng chờ Admin phê duyệt.', false);
                // Clear input fields
                document.getElementById('landing-reg-user').value = '';
                document.getElementById('landing-reg-pass').value = '';
                // Don't auto-switch to login - user can't login until approved
            } else {
                showMessage(data.message || 'Đăng ký thất bại');
            }
        } catch (err) {
            showMessage('Lỗi kết nối');
        }
    }

    // Initialize when DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
        // Update nav buttons if logged in
        if (isLoggedIn()) {
            const navActions = document.querySelector('.nav-actions');
            if (navActions) {
                navActions.innerHTML = `
                    <span class="user-greeting">Welcome, ${sessionStorage.getItem('rcc_user')}</span>
                    <a href="/dashboard" class="btn btn-primary">Dashboard</a>
                `;
            }
        }

        // Login button click
        document.querySelectorAll('[data-auth="login"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                if (isLoggedIn()) {
                    window.location.href = '/dashboard';
                } else {
                    showAuthModal('login');
                }
            });
        });

        // Register button click
        document.querySelectorAll('[data-auth="register"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                if (isLoggedIn()) {
                    window.location.href = '/dashboard';
                } else {
                    showAuthModal('register');
                }
            });
        });

        // Dashboard links - check auth first
        document.querySelectorAll('[data-auth="dashboard"]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                if (isLoggedIn()) {
                    window.location.href = '/dashboard';
                } else {
                    showAuthModal('login');
                }
            });
        });

        // Close modal when clicking overlay
        const modal = document.getElementById('auth-modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    hideAuthModal();
                }
            });
        }

        // Close button
        const closeBtn = document.getElementById('auth-modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', hideAuthModal);
        }

        // Switch to register form
        const toRegister = document.getElementById('landing-link-to-register');
        if (toRegister) {
            toRegister.addEventListener('click', (e) => {
                e.preventDefault();
                document.getElementById('landing-form-login').classList.add('hidden');
                document.getElementById('landing-form-register').classList.remove('hidden');
            });
        }

        // Switch to login form
        const toLogin = document.getElementById('landing-link-to-login');
        if (toLogin) {
            toLogin.addEventListener('click', (e) => {
                e.preventDefault();
                document.getElementById('landing-form-register').classList.add('hidden');
                document.getElementById('landing-form-login').classList.remove('hidden');
            });
        }

        // Login form submit
        const loginBtn = document.getElementById('landing-btn-login');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => {
                const user = document.getElementById('landing-login-user').value.trim();
                const pass = document.getElementById('landing-login-pass').value;
                
                if (!user || !pass) {
                    showMessage('Vui lòng nhập tên đăng nhập và mật khẩu');
                    return;
                }
                doLogin(user, pass);
            });
        }

        // Register form submit
        const registerBtn = document.getElementById('landing-btn-register');
        if (registerBtn) {
            registerBtn.addEventListener('click', () => {
                const user = document.getElementById('landing-reg-user').value.trim();
                const pass = document.getElementById('landing-reg-pass').value;
                
                if (!user || !pass) {
                    showMessage('Vui lòng nhập tên đăng nhập và mật khẩu');
                    return;
                }
                if (pass.length < 4) {
                    showMessage('Mật khẩu phải có ít nhất 4 ký tự');
                    return;
                }
                doRegister(user, pass);
            });
        }

        // Enter key support
        ['landing-login-user', 'landing-login-pass'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        document.getElementById('landing-btn-login').click();
                    }
                });
            }
        });

        ['landing-reg-user', 'landing-reg-pass'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        document.getElementById('landing-btn-register').click();
                    }
                });
            }
        });
    });
})();
