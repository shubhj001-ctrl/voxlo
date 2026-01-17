import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, 'users-data.json');
const CHATS_FILE = path.join(__dirname, 'chats-data.json');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST']
  },
  pingInterval: 25000,
  pingTimeout: 60000,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: Infinity
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Configuration
const ADMIN_PASSWORD = 'Voxlo_';
const JWT_SECRET = 'your-secret-key-change-this';

// In-memory database
const users = new Map(); // userId -> { id, firstName, lastName, email, passwordHash, inviteCode, status, createdAt, isTestUser }
const usersByEmail = new Map(); // email -> userId
const inviteCodes = new Map(); // inviteCode -> userId
const chatUsers = new Map(); // socket.id -> { userId, firstName, lastName, inviteCode }
const activeChats = new Map(); // roomId -> { user1, user2, messages, unreadCount }
const userConnections = new Map(); // userId -> Set of socket.ids (support multiple connections)

// Persistent Storage Functions
function loadUsersFromFile() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      const parsedUsers = JSON.parse(data);
      
      // Restore Map structure
      Object.entries(parsedUsers).forEach(([userId, userData]) => {
        users.set(userId, userData);
        usersByEmail.set(userData.email, userId);
        inviteCodes.set(userData.inviteCode, userId);
      });
      
      console.log(`✅ Loaded ${users.size} users from persistent storage`);
    }
  } catch (error) {
    console.error('Error loading users from file:', error);
  }
}

function saveUsersToFile() {
  try {
    const usersObj = {};
    users.forEach((userData, userId) => {
      usersObj[userId] = userData;
    });
    
    fs.writeFileSync(DATA_FILE, JSON.stringify(usersObj, null, 2));
  } catch (error) {
    console.error('Error saving users to file:', error);
  }
}

function loadChatsFromFile() {
  try {
    if (fs.existsSync(CHATS_FILE)) {
      const data = fs.readFileSync(CHATS_FILE, 'utf8');
      const parsedChats = JSON.parse(data);
      
      // Restore Map structure
      Object.entries(parsedChats).forEach(([roomId, chatData]) => {
        // Filter out expired messages (older than 10 minutes)
        const now = Date.now();
        const validMessages = chatData.messages.filter(msg => 
          (now - msg.timestamp) < 10 * 60 * 1000
        );
        
        if (validMessages.length > 0 || true) { // Keep chat even if no messages
          activeChats.set(roomId, {
            ...chatData,
            messages: validMessages
          });
        }
      });
      
      console.log(`✅ Loaded ${activeChats.size} chat rooms from persistent storage`);
    }
  } catch (error) {
    console.error('Error loading chats from file:', error);
  }
}

function saveChatsToFile() {
  try {
    const chatsObj = {};
    activeChats.forEach((chatData, roomId) => {
      chatsObj[roomId] = chatData;
    });
    
    fs.writeFileSync(CHATS_FILE, JSON.stringify(chatsObj, null, 2));
  } catch (error) {
    console.error('Error saving chats to file:', error);
  }
}

async function initializeTestUsers() {
  const testUsers = [
    { email: 'user1@test.com', firstName: 'Test', lastName: 'User One' },
    { email: 'user2@test.com', firstName: 'Test', lastName: 'User Two' }
  ];

  for (const testUser of testUsers) {
    if (!usersByEmail.has(testUser.email)) {
      const userId = generateUserId();
      const passwordHash = await bcrypt.hash('jaggibaba', 10);
      let inviteCode;

      do {
        inviteCode = generateInviteCode();
      } while (inviteCodes.has(inviteCode));

      const user = {
        id: userId,
        firstName: testUser.firstName,
        lastName: testUser.lastName,
        email: testUser.email,
        passwordHash,
        inviteCode,
        status: 'active',
        createdAt: new Date(),
        isTestUser: true // Mark as test user - cannot be deleted
      };

      users.set(userId, user);
      usersByEmail.set(testUser.email, userId);
      inviteCodes.set(inviteCode, userId);
      
      console.log(`✅ Created test user: ${testUser.email}`);
    }
  }
  
  saveUsersToFile();
}

// Utility Functions
function generateInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function getRoomId(userId1, userId2) {
  return [userId1, userId2].sort().join('-');
}

function generateUserId() {
  return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Middleware
function verifyAdminToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.adminAuth = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
}

// REST API Routes

// Authentication Routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (usersByEmail.has(email)) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const userId = generateUserId();
    const passwordHash = await bcrypt.hash(password, 10);
    let inviteCode;

    do {
      inviteCode = generateInviteCode();
    } while (inviteCodes.has(inviteCode));

    const user = {
      id: userId,
      firstName,
      lastName,
      email,
      passwordHash,
      inviteCode,
      status: 'active',
      createdAt: new Date(),
      isTestUser: false
    };

    users.set(userId, user);
    usersByEmail.set(email, userId);
    inviteCodes.set(inviteCode, userId);
    
    saveUsersToFile();

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    const userId = usersByEmail.get(email);
    if (!userId) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const user = users.get(userId);
    const validPassword = await bcrypt.compare(password, user.passwordHash);

    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ message: 'User account is inactive' });
    }

    res.json({
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Login failed' });
  }
});

// Admin Routes
app.post('/api/admin/login', (req, res) => {
  try {
    const { password } = req.body;

    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ message: 'Invalid admin password' });
    }

    const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ message: 'Admin login failed' });
  }
});

app.post('/api/admin/create-user', verifyAdminToken, async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (usersByEmail.has(email)) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    const userId = generateUserId();
    const passwordHash = await bcrypt.hash(password, 10);
    let inviteCode;

    do {
      inviteCode = generateInviteCode();
    } while (inviteCodes.has(inviteCode));

    const user = {
      id: userId,
      firstName,
      lastName,
      email,
      passwordHash,
      inviteCode,
      status: 'active',
      createdAt: new Date()
    };

    users.set(userId, user);
    usersByEmail.set(email, userId);
    inviteCodes.set(inviteCode, userId);

    res.status(201).json({ message: 'User created successfully' });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ message: 'Failed to create user' });
  }
});

app.get('/api/admin/users', verifyAdminToken, (req, res) => {
  try {
    const userList = Array.from(users.values()).map(user => ({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      status: user.status,
      createdAt: user.createdAt,
      isTestUser: user.isTestUser
    }));

    res.json({ users: userList });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

app.put('/api/admin/users/:userId/deactivate', verifyAdminToken, (req, res) => {
  try {
    const { userId } = req.params;
    const user = users.get(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.status = 'inactive';
    saveUsersToFile();
    res.json({ message: 'User deactivated' });
  } catch (error) {
    console.error('Deactivate user error:', error);
    res.status(500).json({ message: 'Failed to deactivate user' });
  }
});

app.put('/api/admin/users/:userId/reactivate', verifyAdminToken, (req, res) => {
  try {
    const { userId } = req.params;
    const user = users.get(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.status = 'active';
    saveUsersToFile();
    res.json({ message: 'User reactivated' });
  } catch (error) {
    console.error('Reactivate user error:', error);
    res.status(500).json({ message: 'Failed to reactivate user' });
  }
});

app.delete('/api/admin/users/:userId', verifyAdminToken, (req, res) => {
  try {
    const { userId } = req.params;
    const user = users.get(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent deletion of test users
    if (user.isTestUser) {
      return res.status(403).json({ message: 'Cannot delete test users. Deactivate instead.' });
    }

    usersByEmail.delete(user.email);
    inviteCodes.delete(user.inviteCode);
    users.delete(userId);
    
    saveUsersToFile();

    res.json({ message: 'User deleted' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Failed to delete user' });
  }
});

// Socket.io Events
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('register', ({ userId, firstName, lastName }) => {
    const user = users.get(userId);

    if (!user) {
      socket.emit('error', { message: 'User not found' });
      return;
    }

    // Track this socket connection for the user
    if (!userConnections.has(userId)) {
      userConnections.set(userId, new Set());
    }
    userConnections.get(userId).add(socket.id);

    chatUsers.set(socket.id, {
      userId,
      firstName,
      lastName,
      inviteCode: user.inviteCode
    });

    socket.emit('registered', {
      userId,
      firstName,
      lastName,
      inviteCode: user.inviteCode
    });

    console.log(`User registered: ${firstName} ${lastName} (${socket.id})`);
  });

  socket.on('reconnect', () => {
    console.log('User reconnected:', socket.id);
  });

  socket.on('getChats', ({ userId }) => {
    if (!userId) return;

    const user = users.get(userId);
    if (!user) {
      socket.emit('error', { message: 'User not found' });
      return;
    }

    // Track this socket for the user
    if (!userConnections.has(userId)) {
      userConnections.set(userId, new Set());
    }
    userConnections.get(userId).add(socket.id);
    
    // Register this socket with user info
    if (!chatUsers.has(socket.id)) {
      chatUsers.set(socket.id, {
        userId,
        firstName: user.firstName,
        lastName: user.lastName,
        inviteCode: user.inviteCode
      });
    }

    // Send all active chats this user is part of
    const userChats = [];
    activeChats.forEach((chat, roomId) => {
      if (chat.user1 === userId || chat.user2 === userId) {
        const partnerId = chat.user1 === userId ? chat.user2 : chat.user1;
        const partner = users.get(partnerId);
        
        // Join socket to all existing chat rooms
        socket.join(roomId);
        
        userChats.push({
          roomId,
          partnerId,
          partnerName: `${partner.firstName} ${partner.lastName}`,
          messages: chat.messages.filter(msg => (Date.now() - msg.timestamp) < 10 * 60 * 1000), // Only active messages
          unreadCount: 0
        });
      }
    });

    socket.emit('chatsLoaded', { chats: userChats });
  });

  socket.on('connectWithCode', ({ inviteCode, myUserId }) => {
    const targetUserId = inviteCodes.get(inviteCode);

    if (!targetUserId) {
      socket.emit('error', { message: 'Invalid invite code' });
      return;
    }

    if (targetUserId === myUserId) {
      socket.emit('error', { message: 'Cannot use your own invite code' });
      return;
    }

    const targetUser = users.get(targetUserId);
    const currentUser = users.get(myUserId);

    if (!targetUser || !currentUser) {
      socket.emit('error', { message: 'User not found' });
      return;
    }

    if (targetUser.status !== 'active' || currentUser.status !== 'active') {
      socket.emit('error', { message: 'One or both users are inactive' });
      return;
    }

    const roomId = getRoomId(myUserId, targetUserId);

    // Ensure current user is tracked
    if (!userConnections.has(myUserId)) {
      userConnections.set(myUserId, new Set());
    }
    if (!userConnections.get(myUserId).has(socket.id)) {
      userConnections.get(myUserId).add(socket.id);
    }

    // Join current user to room
    socket.join(roomId);

    // Create or get existing chat room
    if (!activeChats.has(roomId)) {
      activeChats.set(roomId, {
        user1: myUserId,
        user2: targetUserId,
        messages: [],
        unreadCount: {}
      });
      saveChatsToFile(); // Persist new chat
    }

    const chatData = {
      roomId,
      partnerId: targetUserId,
      partnerName: `${targetUser.firstName} ${targetUser.lastName}`,
      messages: activeChats.get(roomId).messages.filter(msg => (Date.now() - msg.timestamp) < 10 * 60 * 1000)
    };

    socket.emit('chatConnected', chatData);

    // Join all sockets of the target user to the room
    const targetSockets = userConnections.get(targetUserId) || new Set();
    targetSockets.forEach(socketId => {
      const targetSocket = io.sockets.sockets.get(socketId);
      if (targetSocket) {
        targetSocket.join(roomId);
        targetSocket.emit('chatConnected', {
          roomId,
          partnerId: myUserId,
          partnerName: `${currentUser.firstName} ${currentUser.lastName}`,
          messages: activeChats.get(roomId).messages.filter(msg => (Date.now() - msg.timestamp) < 10 * 60 * 1000)
        });
      }
    });

    console.log(`Chat connected: ${currentUser.firstName} <-> ${targetUser.firstName}`);
  });

  socket.on('sendMessage', ({ roomId, message, timestamp }) => {
    const chat = activeChats.get(roomId);

    if (!chat) {
      console.error(`❌ Chat room not found: ${roomId}`);
      socket.emit('error', { message: 'Chat room not found' });
      return;
    }

    const senderInfo = chatUsers.get(socket.id);
    if (!senderInfo) {
      console.error(`❌ Sender not registered for socket: ${socket.id}`);
      socket.emit('error', { message: 'Sender not registered' });
      return;
    }

    const messageData = {
      id: Date.now() + Math.random(),
      senderId: senderInfo.userId,
      roomId,
      message,
      timestamp
    };

    chat.messages.push(messageData);
    saveChatsToFile(); // Persist message
    
    // Broadcast to all connections in the room
    io.to(roomId).emit('newMessage', messageData);

    console.log(`✅ Message in room ${roomId} from ${senderInfo.firstName}:`, message);
  });

  socket.on('typing', ({ roomId, isTyping }) => {
    const senderInfo = chatUsers.get(socket.id);
    socket.to(roomId).emit('userTyping', {
      userId: senderInfo?.userId || socket.id,
      isTyping
    });
  });

  socket.on('disconnect', () => {
    const user = chatUsers.get(socket.id);

    if (user) {
      console.log(`User disconnected: ${user.firstName} ${user.lastName}`);
      
      // Remove this socket connection from the user
      const userSockets = userConnections.get(user.userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          userConnections.delete(user.userId);
        }
      }
      
      chatUsers.delete(socket.id);
    }
  });
});

// Serve HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;

// Initialize server
async function initializeServer() {
  // Load existing users from file
  loadUsersFromFile();
  
  // Load existing chats from file
  loadChatsFromFile();
  
  // Initialize test users
  await initializeTestUsers();
  
  httpServer.listen(PORT, () => {
    console.log(`🚀 VOXLO server running on port ${PORT}`);
    console.log(`Admin password: ${ADMIN_PASSWORD}`);
    console.log(`📝 Test Users:`);
    console.log(`   Email: user1@test.com | Password: jaggibaba`);
    console.log(`   Email: user2@test.com | Password: jaggibaba`);
  });
}

initializeServer();
