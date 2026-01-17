import { useState, useEffect } from 'react';
import io from 'socket.io-client';
import Welcome from './components/Welcome';
import ChatRoom from './components/ChatRoom';
import './App.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

function App() {
  const [socket, setSocket] = useState(null);
  const [user, setUser] = useState(null);
  const [activeChat, setActiveChat] = useState(null);
  const [chats, setChats] = useState([]);

  useEffect(() => {
    // Load saved user from localStorage
    const savedUser = localStorage.getItem('voxlo_user');
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        setUser(parsed);
      } catch (e) {
        console.error('Error loading saved user:', e);
      }
    }

    // Load saved chats
    const savedChats = localStorage.getItem('voxlo_chats');
    if (savedChats) {
      try {
        const parsed = JSON.parse(savedChats);
        
        // Clean up only expired MESSAGES, but keep the chat connections
        const now = Date.now();
        const chatsWithValidMessages = parsed.map(chat => ({
          ...chat,
          messages: chat.messages.filter(msg => 
            (now - msg.timestamp) < 10 * 60 * 1000
          )
        }));
        
        localStorage.setItem('voxlo_chats', JSON.stringify(chatsWithValidMessages));
        setChats(chatsWithValidMessages);
      } catch (e) {
        console.error('Error loading saved chats:', e);
      }
    }

    // Initialize Socket.io
    const newSocket = io(SERVER_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      transports: ['websocket', 'polling']
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('connect', () => {
      console.log('Connected to server');
      
      // Re-register if user exists
      if (user) {
        socket.emit('register', { 
          userId: user.userId,
          firstName: user.firstName,
          lastName: user.lastName
        });
        
        // Restore chats from server
        socket.emit('getChats', { userId: user.userId });
      }
    });

    socket.on('reconnect', () => {
      console.log('Reconnected to server');
      
      // Re-register if user exists
      if (user) {
        socket.emit('register', { 
          userId: user.userId,
          firstName: user.firstName,
          lastName: user.lastName
        });
        
        // Restore chats from server
        socket.emit('getChats', { userId: user.userId });
      }
    });

    socket.on('registered', (data) => {
      const userData = {
        userId: data.userId,
        firstName: data.firstName,
        lastName: data.lastName,
        inviteCode: data.inviteCode
      };
      setUser(userData);
      localStorage.setItem('voxlo_user', JSON.stringify(userData));
    });

    socket.on('chatsLoaded', (data) => {
      // Merge server chats with local chats, keeping local messages and merging with server state
      setChats(prev => {
        const merged = new Map();
        
        // First add all local chats
        prev.forEach(chat => {
          merged.set(chat.roomId, chat);
        });
        
        // Then merge with server chats
        data.chats.forEach(serverChat => {
          if (merged.has(serverChat.roomId)) {
            // Keep local messages but update server state
            const local = merged.get(serverChat.roomId);
            const localMessageIds = new Set(local.messages.map(m => m.id));
            
            // Add any new messages from server that aren't local
            const newMessages = serverChat.messages.filter(m => !localMessageIds.has(m.id));
            
            merged.set(serverChat.roomId, {
              ...local,
              messages: [...local.messages, ...newMessages].sort((a, b) => a.timestamp - b.timestamp)
            });
          } else {
            // New chat from server
            merged.set(serverChat.roomId, serverChat);
          }
        });
        
        const result = Array.from(merged.values());
        localStorage.setItem('voxlo_chats', JSON.stringify(result));
        return result;
      });
    });

    socket.on('chatConnected', (data) => {
      const newChat = {
        roomId: data.roomId,
        partnerId: data.partnerId,
        partnerName: data.partnerName,
        messages: [],
        createdAt: Date.now()
      };

      // Check if chat already exists
      setChats(prev => {
        const existing = prev.find(c => c.roomId === data.roomId);
        if (existing) {
          setActiveChat(existing);
          return prev;
        }
        const updated = [...prev, newChat];
        localStorage.setItem('voxlo_chats', JSON.stringify(updated));
        setActiveChat(newChat);
        return updated;
      });
    });

    socket.on('newMessage', (messageData) => {
      setChats(prev => {
        const updated = prev.map(chat => {
          // Find which chat this message belongs to
          if (chat.roomId === messageData.roomId) {
            const newMessages = [...chat.messages, {
              ...messageData,
              isOwn: messageData.senderId === user?.userId
            }];
            
            // Update active chat if it's the current one
            if (activeChat?.roomId === chat.roomId) {
              setActiveChat({ ...chat, messages: newMessages });
            }
            
            return { ...chat, messages: newMessages };
          }
          return chat;
        });
        
        localStorage.setItem('voxlo_chats', JSON.stringify(updated));
        return updated;
      });
    });

    socket.on('userTyping', ({ userId, isTyping }) => {
      setChats(prev => {
        return prev.map(chat => {
          if (chat.partnerId === userId) {
            return { ...chat, partnerTyping: isTyping };
          }
          return chat;
        });
      });
    });

    socket.on('error', (error) => {
      console.error('Socket error:', error);
      alert(error.message);
    });

    socket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
    });

    return () => {
      socket.off('connect');
      socket.off('reconnect');
      socket.off('registered');
      socket.off('chatsLoaded');
      socket.off('chatConnected');
      socket.off('newMessage');
      socket.off('userTyping');
      socket.off('error');
      socket.off('disconnect');
    };
  }, [socket, user, activeChat]);

  // Auto-cleanup expired messages every minute (but keep chat connections)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      
      setChats(prev => {
        const updated = prev.map(chat => ({
          ...chat,
          messages: chat.messages.filter(msg => 
            (now - msg.timestamp) < 10 * 60 * 1000
          )
        }));
        
        localStorage.setItem('voxlo_chats', JSON.stringify(updated));
        return updated;
      });
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, []);

  const handleRegister = (firstName, lastName) => {
    if (socket && socket.connected) {
      const userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      socket.emit('register', { 
        userId,
        firstName, 
        lastName 
      });
    }
  };

  const handleConnectWithCode = (inviteCode) => {
    if (socket && socket.connected && user) {
      socket.emit('connectWithCode', { 
        inviteCode: inviteCode.toUpperCase(), 
        myUserId: user.userId 
      });
    }
  };

  const handleSendMessage = (message) => {
    if (socket && socket.connected && activeChat) {
      const timestamp = Date.now();
      socket.emit('sendMessage', {
        roomId: activeChat.roomId,
        message,
        timestamp
      });
    }
  };

  const handleTyping = (isTyping) => {
    if (socket && socket.connected && activeChat) {
      socket.emit('typing', {
        roomId: activeChat.roomId,
        isTyping
      });
    }
  };

  const handleClearChats = () => {
    setChats([]);
    setActiveChat(null);
    localStorage.removeItem('voxlo_chats');
  };

  if (!user) {
    return <Welcome onRegister={handleRegister} />;
  }

  return (
    <div className="app">
      <ChatRoom
        user={user}
        chats={chats}
        activeChat={activeChat}
        onSelectChat={setActiveChat}
        onConnectWithCode={handleConnectWithCode}
        onSendMessage={handleSendMessage}
        onTyping={handleTyping}
        onClearChats={handleClearChats}
      />
    </div>
  );
}

export default App;
