// Chat Logic (runs after auth.js)

let socket = null;
let chats = [];
let activeChat = null;

// DOM Elements
const myCodeBtn = document.getElementById('myCodeBtn');
const connectBtn = document.getElementById('connectBtn');
const connectBtnMain = document.getElementById('connectBtnMain');
const myCodeCard = document.getElementById('myCodeCard');
const inviteCodeDisplay = document.getElementById('inviteCodeDisplay');
const chatList = document.getElementById('chatList');
const noChatSelected = document.getElementById('noChatSelected');
const chatContent = document.getElementById('chatContent');
const partnerName = document.getElementById('partnerName');
const partnerAvatar = document.getElementById('partnerAvatar');
const messagesContainer = document.getElementById('messagesContainer');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const typingIndicator = document.getElementById('typingIndicator');
const connectModal = document.getElementById('connectModal');
const connectForm = document.getElementById('connectForm');
const connectCodeInput = document.getElementById('connectCodeInput');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const clearChatsBtn = document.getElementById('clearChatsBtn');

// Initialize Socket.io
function initializeSocket() {
    if (socket) return;

    socket = io(SERVER_URL, {
        autoConnect: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
        extraHeaders: {
            'Authorization': currentUser ? currentUser.id : ''
        }
    });

    socket.on('connect', () => {
        console.log('Connected to server');
        if (currentUser) {
            socket.emit('register', { 
                userId: currentUser.id,
                firstName: currentUser.firstName,
                lastName: currentUser.lastName
            });
        }
    });

    socket.on('registered', (data) => {
        currentUser.inviteCode = data.inviteCode;
        localStorage.setItem('voxlo_user', JSON.stringify(currentUser));
        inviteCodeDisplay.textContent = data.inviteCode;
        setupChatEventListeners();
    });

    socket.on('chatConnected', (data) => {
        const newChat = {
            roomId: data.roomId,
            partnerId: data.partnerId,
            partnerName: data.partnerName,
            messages: [],
            createdAt: Date.now()
        };

        const existingChat = chats.find(c => c.roomId === data.roomId);
        if (!existingChat) {
            chats.push(newChat);
            saveChatsToStorage();
        }

        selectChat(newChat);
        renderChatList();
    });

    socket.on('newMessage', (messageData) => {
        const chat = chats.find(c => c.roomId === messageData.roomId);

        if (chat) {
            const msg = {
                id: messageData.id,
                senderId: messageData.senderId,
                message: messageData.message,
                timestamp: messageData.timestamp,
                isOwn: messageData.senderId === currentUser.id
            };
            chat.messages.push(msg);
            saveChatsToStorage();

            if (activeChat && activeChat.roomId === chat.roomId) {
                renderMessages();
                scrollToBottom();
            }
        }
    });

    socket.on('userTyping', ({ userId, isTyping }) => {
        if (activeChat && activeChat.partnerId === userId) {
            typingIndicator.style.display = isTyping ? 'block' : 'none';
        }
    });

    socket.on('error', (error) => {
        alert(error.message);
    });
}

function setupChatEventListeners() {
    if (myCodeBtn && myCodeBtn.onclick === null) {
        myCodeBtn.addEventListener('click', toggleMyCodeCard);
        connectBtn.addEventListener('click', openConnectModal);
        connectBtnMain.addEventListener('click', openConnectModal);
        modalCloseBtn.addEventListener('click', closeConnectModal);
        connectModal.addEventListener('click', closeConnectModalOnOverlay);
        messageForm.addEventListener('submit', handleSendMessage);
        messageInput.addEventListener('input', handleTyping);
        connectForm.addEventListener('submit', handleConnectWithCode);
        clearChatsBtn.addEventListener('click', handleClearChats);
        inviteCodeDisplay.addEventListener('click', copyInviteCode);
    }
}

function toggleMyCodeCard() {
    myCodeCard.style.display = myCodeCard.style.display === 'none' ? 'block' : 'none';
}

function openConnectModal() {
    connectModal.style.display = 'flex';
    connectCodeInput.focus();
}

function closeConnectModal() {
    connectModal.style.display = 'none';
}

function closeConnectModalOnOverlay(e) {
    if (e.target === connectModal) {
        closeConnectModal();
    }
}

function copyInviteCode() {
    navigator.clipboard.writeText(inviteCodeDisplay.textContent);
    alert('Invite code copied to clipboard!');
}

function handleSendMessage(e) {
    e.preventDefault();
    const message = messageInput.value.trim();
    
    if (message && activeChat && socket) {
        socket.emit('sendMessage', {
            roomId: activeChat.roomId,
            message,
            timestamp: Date.now()
        });
        messageInput.value = '';
    }
}

let typingTimeout;
function handleTyping() {
    if (activeChat && socket) {
        socket.emit('typing', { roomId: activeChat.roomId, isTyping: true });
        
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            socket.emit('typing', { roomId: activeChat.roomId, isTyping: false });
        }, 1000);
    }
}

function handleConnectWithCode(e) {
    e.preventDefault();
    const code = connectCodeInput.value.trim().toUpperCase();
    
    if (code.length === 6 && socket) {
        socket.emit('connectWithCode', {
            inviteCode: code,
            myUserId: currentUser.id
        });
        connectCodeInput.value = '';
        closeConnectModal();
    }
}

function handleClearChats() {
    if (confirm('Clear all chats? This cannot be undone.')) {
        chats = [];
        activeChat = null;
        saveChatsToStorage();
        renderChatList();
        showNoChatSelected();
    }
}

function selectChat(chat) {
    activeChat = chat;
    noChatSelected.style.display = 'none';
    chatContent.style.display = 'flex';
    partnerName.textContent = chat.partnerName;
    partnerAvatar.textContent = chat.partnerName.charAt(0).toUpperCase();
    renderMessages();
    renderChatList();
    scrollToBottom();
}

function renderChatList() {
    if (chats.length === 0) {
        chatList.innerHTML = `
            <div class="empty-state">
                <p>No active chats</p>
                <p class="hint">Use an invite code to start chatting</p>
            </div>
        `;
        return;
    }

    chatList.innerHTML = chats.map(chat => `
        <div class="chat-item ${activeChat?.roomId === chat.roomId ? 'active' : ''}" onclick="selectChatFromList(${JSON.stringify(chat).replace(/"/g, '&quot;')})">
            <div class="chat-avatar">${chat.partnerName.charAt(0).toUpperCase()}</div>
            <div class="chat-info">
                <div class="chat-name">${chat.partnerName}</div>
                <div class="chat-preview">${chat.messages.length > 0 ? chat.messages[chat.messages.length - 1].message.substring(0, 30) : 'No messages yet'}</div>
            </div>
            ${chat.messages.length > 0 ? `<div class="chat-timer">${getTimeRemaining(chat.messages[chat.messages.length - 1].timestamp)}</div>` : ''}
        </div>
    `).join('');
}

function selectChatFromList(chat) {
    const fullChat = chats.find(c => c.roomId === chat.roomId);
    if (fullChat) selectChat(fullChat);
}

function renderMessages() {
    if (!activeChat || activeChat.messages.length === 0) {
        messagesContainer.innerHTML = '<div class="empty-messages"><p>No messages yet. Start the conversation!</p></div>';
        return;
    }

    messagesContainer.innerHTML = activeChat.messages.map(msg => `
        <div class="message ${msg.isOwn ? 'own' : 'other'}">
            <div class="message-bubble">
                <div class="message-text">${escapeHtml(msg.message)}</div>
                <div class="message-meta">
                    <span class="message-time">${new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span class="message-timer">⏱️ ${getTimeRemaining(msg.timestamp)}</span>
                </div>
            </div>
        </div>
    `).join('');
}

function getTimeRemaining(timestamp) {
    const elapsed = Date.now() - timestamp;
    const remaining = (10 * 60 * 1000) - elapsed;
    
    if (remaining <= 0) return 'Expired';
    
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function scrollToBottom() {
    setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 0);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNoChatSelected() {
    noChatSelected.style.display = 'flex';
    chatContent.style.display = 'none';
}

function saveChatsToStorage() {
    localStorage.setItem('voxlo_chats', JSON.stringify(chats));
}

function loadChatsFromStorage() {
    const saved = localStorage.getItem('voxlo_chats');
    if (saved) {
        chats = JSON.parse(saved);
        
        // Clean up expired messages
        const now = Date.now();
        chats = chats.map(chat => ({
            ...chat,
            messages: chat.messages.filter(msg => (now - msg.timestamp) < 10 * 60 * 1000)
        })).filter(chat => chat.messages.length > 0);
        
        saveChatsToStorage();
    }
}

// Auto-cleanup expired messages
setInterval(() => {
    const now = Date.now();
    chats = chats.map(chat => ({
        ...chat,
        messages: chat.messages.filter(msg => (now - msg.timestamp) < 10 * 60 * 1000)
    })).filter(chat => chat.messages.length > 0);
    
    saveChatsToStorage();
    
    if (activeChat) {
        renderMessages();
        renderChatList();
    }
}, 60000);

// Initialize when chat screen is shown
window.initializeSocket = initializeSocket;

// Load chats from storage
loadChatsFromStorage();
