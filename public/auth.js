// Authentication Logic
const SERVER_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3001' 
    : window.location.origin;

let currentUser = null;

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const registerScreen = document.getElementById('registerScreen');
const adminLoginScreen = document.getElementById('adminLoginScreen');
const adminScreen = document.getElementById('adminScreen');
const chatScreen = document.getElementById('chatScreen');

const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const adminLoginForm = document.getElementById('adminLoginForm');
const adminCreateUserForm = document.getElementById('adminCreateUserForm');

const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const loginError = document.getElementById('loginError');

const regFirstName = document.getElementById('regFirstName');
const regLastName = document.getElementById('regLastName');
const regEmail = document.getElementById('regEmail');
const regPassword = document.getElementById('regPassword');
const regPasswordConfirm = document.getElementById('regPasswordConfirm');
const registerError = document.getElementById('registerError');

const adminPassword = document.getElementById('adminPassword');
const adminLoginError = document.getElementById('adminLoginError');

const switchToRegisterBtn = document.getElementById('switchToRegisterBtn');
const switchToLoginBtn = document.getElementById('switchToLoginBtn');
const adminLoginLink = document.getElementById('adminLoginLink');
const backToLoginBtn = document.getElementById('backToLoginBtn');
const adminLogoutBtn = document.getElementById('adminLogoutBtn');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupAuthEventListeners();
    checkIfLoggedIn();
});

function setupAuthEventListeners() {
    loginForm.addEventListener('submit', handleLogin);
    registerForm.addEventListener('submit', handleRegister);
    adminLoginForm.addEventListener('submit', handleAdminLogin);
    adminCreateUserForm.addEventListener('submit', handleAdminCreateUser);

    switchToRegisterBtn.addEventListener('click', () => switchScreen(registerScreen));
    switchToLoginBtn.addEventListener('click', () => switchScreen(loginScreen));
    adminLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        switchScreen(adminLoginScreen);
    });
    backToLoginBtn.addEventListener('click', () => switchScreen(loginScreen));
    adminLogoutBtn.addEventListener('click', handleAdminLogout);

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
}

function switchScreen(screen) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
    
    // Clear error messages
    document.querySelectorAll('.error-message').forEach(el => el.textContent = '');
}

function checkIfLoggedIn() {
    const saved = localStorage.getItem('voxlo_user');
    if (saved) {
        currentUser = JSON.parse(saved);
        showChatScreen();
    }
}

async function handleLogin(e) {
    e.preventDefault();
    loginError.textContent = '';

    const email = loginEmail.value.trim();
    const password = loginPassword.value.trim();

    if (!email || !password) {
        loginError.textContent = 'Please fill in all fields';
        return;
    }

    try {
        const response = await fetch(`${SERVER_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            loginError.textContent = data.message || 'Login failed';
            return;
        }

        currentUser = data.user;
        localStorage.setItem('voxlo_user', JSON.stringify(currentUser));
        loginEmail.value = '';
        loginPassword.value = '';
        showChatScreen();
    } catch (error) {
        loginError.textContent = 'Connection error. Please try again.';
        console.error('Login error:', error);
    }
}

async function handleRegister(e) {
    e.preventDefault();
    registerError.textContent = '';

    const firstName = regFirstName.value.trim();
    const lastName = regLastName.value.trim();
    const email = regEmail.value.trim();
    const password = regPassword.value.trim();
    const confirmPassword = regPasswordConfirm.value.trim();

    if (!firstName || !lastName || !email || !password || !confirmPassword) {
        registerError.textContent = 'Please fill in all fields';
        return;
    }

    if (password !== confirmPassword) {
        registerError.textContent = 'Passwords do not match';
        return;
    }

    if (password.length < 6) {
        registerError.textContent = 'Password must be at least 6 characters';
        return;
    }

    try {
        const response = await fetch(`${SERVER_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ firstName, lastName, email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            registerError.textContent = data.message || 'Registration failed';
            return;
        }

        alert('Registration successful! Please log in.');
        regFirstName.value = '';
        regLastName.value = '';
        regEmail.value = '';
        regPassword.value = '';
        regPasswordConfirm.value = '';
        switchScreen(loginScreen);
    } catch (error) {
        registerError.textContent = 'Connection error. Please try again.';
        console.error('Register error:', error);
    }
}

async function handleAdminLogin(e) {
    e.preventDefault();
    adminLoginError.textContent = '';

    const password = adminPassword.value.trim();

    if (!password) {
        adminLoginError.textContent = 'Please enter admin password';
        return;
    }

    try {
        const response = await fetch(`${SERVER_URL}/api/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });

        const data = await response.json();

        if (!response.ok) {
            adminLoginError.textContent = data.message || 'Invalid admin password';
            return;
        }

        localStorage.setItem('admin_token', data.token);
        adminPassword.value = '';
        showAdminScreen();
    } catch (error) {
        adminLoginError.textContent = 'Connection error. Please try again.';
        console.error('Admin login error:', error);
    }
}

async function handleAdminCreateUser(e) {
    e.preventDefault();
    const errorEl = document.getElementById('adminCreateError');
    const successEl = document.getElementById('adminCreateSuccess');
    errorEl.textContent = '';
    successEl.textContent = '';

    const firstName = document.getElementById('adminFirstName').value.trim();
    const lastName = document.getElementById('adminLastName').value.trim();
    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminUserPassword').value.trim();
    const token = localStorage.getItem('admin_token');

    if (!firstName || !lastName || !email || !password) {
        errorEl.textContent = 'Please fill in all fields';
        return;
    }

    try {
        const response = await fetch(`${SERVER_URL}/api/admin/create-user`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ firstName, lastName, email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            errorEl.textContent = data.message || 'Failed to create user';
            return;
        }

        successEl.textContent = `User created successfully! Email: ${email}`;
        document.getElementById('adminFirstName').value = '';
        document.getElementById('adminLastName').value = '';
        document.getElementById('adminEmail').value = '';
        document.getElementById('adminUserPassword').value = '';
        loadAdminUsers();
    } catch (error) {
        errorEl.textContent = 'Connection error. Please try again.';
        console.error('Create user error:', error);
    }
}

async function loadAdminUsers() {
    const token = localStorage.getItem('admin_token');
    const tbody = document.getElementById('usersTableBody');
    const userCount = document.getElementById('userCount');

    try {
        const response = await fetch(`${SERVER_URL}/api/admin/users`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (!response.ok) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--error);">Failed to load users</td></tr>';
            return;
        }

        userCount.textContent = data.users.length;

        if (data.users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-secondary);">No users yet</td></tr>';
            return;
        }

        tbody.innerHTML = data.users.map(user => `
            <tr>
                <td>${user.email}</td>
                <td>${user.firstName} ${user.lastName}</td>
                <td><span class="status ${user.status}">${user.status}</span></td>
                <td>${new Date(user.createdAt).toLocaleDateString()}</td>
                <td>
                    <div class="user-actions">
                        ${user.status === 'active' 
                            ? `<button class="btn-small btn-warning" onclick="handleAdminDeactivateUser('${user.id}')">Deactivate</button>
                               <button class="btn-small btn-danger" onclick="handleAdminDeleteUser('${user.id}')">Delete</button>`
                            : `<button class="btn-small btn-success" onclick="handleAdminReactivateUser('${user.id}')">Reactivate</button>
                               <button class="btn-small btn-danger" onclick="handleAdminDeleteUser('${user.id}')">Delete</button>`
                        }
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--error);">Connection error</td></tr>';
        console.error('Load users error:', error);
    }
}

async function handleAdminDeactivateUser(userId) {
    if (!confirm('Deactivate this user?')) return;

    const token = localStorage.getItem('admin_token');

    try {
        const response = await fetch(`${SERVER_URL}/api/admin/users/${userId}/deactivate`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            alert('Failed to deactivate user');
            return;
        }

        loadAdminUsers();
    } catch (error) {
        alert('Connection error');
        console.error('Deactivate error:', error);
    }
}

async function handleAdminReactivateUser(userId) {
    if (!confirm('Reactivate this user?')) return;

    const token = localStorage.getItem('admin_token');

    try {
        const response = await fetch(`${SERVER_URL}/api/admin/users/${userId}/reactivate`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            alert('Failed to reactivate user');
            return;
        }

        loadAdminUsers();
    } catch (error) {
        alert('Connection error');
        console.error('Reactivate error:', error);
    }
}

async function handleAdminDeleteUser(userId) {
    if (!confirm('Delete this user? This cannot be undone.')) return;

    const token = localStorage.getItem('admin_token');

    try {
        const response = await fetch(`${SERVER_URL}/api/admin/users/${userId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            alert('Failed to delete user');
            return;
        }

        loadAdminUsers();
    } catch (error) {
        alert('Connection error');
        console.error('Delete error:', error);
    }
}

function showChatScreen() {
    switchScreen(chatScreen);
    updateUserDisplay();
    
    // Initialize chat
    if (window.initializeSocket) {
        window.initializeSocket();
    }
}

function showAdminScreen() {
    switchScreen(adminScreen);
    loadAdminUsers();
}

function handleAdminLogout() {
    if (confirm('Logout from admin panel?')) {
        localStorage.removeItem('admin_token');
        switchScreen(loginScreen);
    }
}

function handleLogout() {
    if (confirm('Logout from VOXLO?')) {
        currentUser = null;
        localStorage.removeItem('voxlo_user');
        localStorage.removeItem('voxlo_chats');
        loginEmail.value = '';
        loginPassword.value = '';
        switchScreen(loginScreen);
    }
}

function updateUserDisplay() {
    if (currentUser) {
        const avatar = document.getElementById('userAvatar');
        const nameEl = document.getElementById('userName');
        if (avatar) avatar.textContent = currentUser.firstName.charAt(0).toUpperCase();
        if (nameEl) nameEl.textContent = `${currentUser.firstName} ${currentUser.lastName}`;
    }
}
