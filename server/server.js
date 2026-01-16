import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// In-memory storage for active users and invite codes
const users = new Map(); // userId -> { username, inviteCode, socketId }
const inviteCodes = new Map(); // inviteCode -> userId
const activeChats = new Map(); // roomId -> { user1, user2, messages }

// Generate random 6-character alphanumeric invite code
function generateInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Create unique room ID for two users
function getRoomId(userId1, userId2) {
  return [userId1, userId2].sort().join('-');
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // User registration
  socket.on('register', ({ username }) => {
    const userId = socket.id;
    let inviteCode;
    
    // Generate unique invite code
    do {
      inviteCode = generateInviteCode();
    } while (inviteCodes.has(inviteCode));

    users.set(userId, {
      username,
      inviteCode,
      socketId: socket.id
    });
    
    inviteCodes.set(inviteCode, userId);

    socket.emit('registered', {
      userId,
      username,
      inviteCode
    });

    console.log(`User registered: ${username} with code ${inviteCode}`);
  });

  // Connect with another user using invite code
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

    const roomId = getRoomId(myUserId, targetUserId);
    
    // Join both users to the room
    socket.join(roomId);
    io.to(targetUser.socketId).socketsJoin(roomId);

    // Initialize or get existing chat
    if (!activeChats.has(roomId)) {
      activeChats.set(roomId, {
        user1: myUserId,
        user2: targetUserId,
        messages: []
      });
    }

    // Notify both users
    const chatData = {
      roomId,
      partnerId: targetUserId,
      partnerName: targetUser.username
    };

    socket.emit('chatConnected', chatData);
    
    io.to(targetUser.socketId).emit('chatConnected', {
      roomId,
      partnerId: myUserId,
      partnerName: currentUser.username
    });

    console.log(`Chat connected: ${currentUser.username} <-> ${targetUser.username}`);
  });

  // Send message
  socket.on('sendMessage', ({ roomId, message, timestamp }) => {
    const chat = activeChats.get(roomId);
    
    if (!chat) {
      socket.emit('error', { message: 'Chat room not found' });
      return;
    }

    const messageData = {
      id: Date.now() + Math.random(),
      senderId: socket.id,
      message,
      timestamp
    };

    chat.messages.push(messageData);

    // Broadcast message to room
    io.to(roomId).emit('newMessage', messageData);

    console.log(`Message in room ${roomId}:`, message);
  });

  // Typing indicator
  socket.on('typing', ({ roomId, isTyping }) => {
    socket.to(roomId).emit('userTyping', { userId: socket.id, isTyping });
  });

  // Disconnect
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    
    if (user) {
      inviteCodes.delete(user.inviteCode);
      users.delete(socket.id);
      console.log(`User disconnected: ${user.username}`);
    }
  });
});

// REST API endpoints
app.get('/', (req, res) => {
  res.json({ message: 'VOXLO Server Running', activeUsers: users.size });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`🚀 VOXLO server running on port ${PORT}`);
});
