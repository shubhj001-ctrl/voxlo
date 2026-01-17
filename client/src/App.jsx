import { useState, useEffect } from 'react';
import io from 'socket.io-client';
import Welcome from './components/Welcome';
import ChatRoom from './components/ChatRoom';
import './App.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

// Helper function to save chats properly (split metadata and messages)
function saveChatState(chats) {
  // Save connection metadata (never expires)
  const connections = chats.map(({ messages, ...metadata }) => metadata);
  localStorage.setItem('voxlo_connections', JSON.stringify(connections));
  
  // Save messages separately (can expire)
  const messages = {};
  chats.forEach(chat => {
    if (chat.messages && chat.messages.length > 0) {
      messages[chat.roomId] = chat.messages.map(({ isOwn, ...msg }) => msg);
    }
  });
  localStorage.setItem('voxlo_messages', JSON.stringify(messages));
}

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
        console.log('👤 Loaded user from localStorage:', parsed.firstName, parsed.lastName);
        setUser(parsed);
      } catch (e) {
        console.error('Error loading saved user:', e);
      }
    }

    // Load saved connections (METADATA - never expires)
    const savedConnections = localStorage.getItem('voxlo_connections');
    const connectionMetadata = new Map();
    
    if (savedConnections) {
      try {
        const parsed = JSON.parse(savedConnections);
        console.log('👥 Loaded', parsed.length, 'direct connections metadata from localStorage');
        console.log('📋 Connections:', parsed.map(c => c.partnerName));
        parsed.forEach(conn => {
          connectionMetadata.set(conn.roomId, conn);
        });
      } catch (e) {
        console.error('Error loading saved connections:', e);
      }
    }

    // Load saved messages (temporary - expires after 10 min)
    const savedMessages = localStorage.getItem('voxlo_messages');
    const messagesByRoom = new Map();
    
    if (savedMessages) {
      try {
        const parsed = JSON.parse(savedMessages);
        console.log('💬 Loaded messages from localStorage');
        
        // Clean up expired messages
        const now = Date.now();
        Object.entries(parsed).forEach(([roomId, messages]) => {
          const validMessages = messages.filter(msg => 
            (now - msg.timestamp) < 10 * 60 * 1000
          );
          if (validMessages.length > 0) {
            messagesByRoom.set(roomId, validMessages);
            console.log(`  ✅ ${roomId}: ${validMessages.length} recent messages`);
          }
        });
        localStorage.setItem('voxlo_messages', JSON.stringify(Object.fromEntries(messagesByRoom)));
      } catch (e) {
        console.error('Error loading saved messages:', e);
      }
    }

    // Merge connections with their messages
    const chats = Array.from(connectionMetadata.values()).map(conn => ({
      ...conn,
      messages: messagesByRoom.get(conn.roomId) || []
    }));
    
    console.log('✅ After cleanup:', chats.length, 'connections still active');
    localStorage.setItem('voxlo_connections', JSON.stringify(
      chats.map(({ messages, ...conn }) => conn) // Save only metadata
    ));
    setChats(chats);

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
      console.log('🔗 Connected to server');
      
      // Re-register if user exists
      if (user) {
        console.log('👤 Re-registering user:', user.firstName);
        socket.emit('register', { 
          userId: user.userId,
          firstName: user.firstName,
          lastName: user.lastName
        });
        
        // Tell server about existing connections from localStorage
        // This rebuilds server-side state
        setTimeout(() => {
          console.log('📤 Rebuilding connections on server');
          socket.emit('getChats', { userId: user.userId });
        }, 100);
      }
    });

    socket.on('reconnect', () => {
      console.log('🔄 Reconnected to server');
      
      // Re-register if user exists
      if (user) {
        console.log('👤 Re-registering user:', user.firstName);
        socket.emit('register', { 
          userId: user.userId,
          firstName: user.firstName,
          lastName: user.lastName
        });
        
        // Rebuild connections on server
        setTimeout(() => {
          console.log('📤 Rebuilding connections after reconnect');
          socket.emit('getChats', { userId: user.userId });
        }, 100);
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
      console.log('📥 chatsLoaded from server:', data.chats.length, 'chats');
      
      setChats(prev => {
        console.log('📊 Local connections before merge:', prev.length);
        console.log('📊 Server connections:', data.chats.length);
        
        // If server has chats, add any that aren't locally stored
        const localMap = new Map(prev.map(c => [c.roomId, c]));
        
        data.chats.forEach(serverChat => {
          if (!localMap.has(serverChat.roomId)) {
            // Server has a connection we don't - this shouldn't happen but add it anyway
            console.log('⚠️  Adding server-side connection:', serverChat.partnerName);
            localMap.set(serverChat.roomId, serverChat);
          }
        });
        
        // Map isOwn flags for display
        const result = Array.from(localMap.values()).map(chat => ({
          ...chat,
          messages: chat.messages.map(m => ({
            ...m,
            isOwn: m.senderId === user?.userId
          }))
        }));
        
        console.log('✅ Final merged connections:', result.length);
        
        // Save using new split storage system
        saveChatState(result);
        
        return result;
      });
    });

    socket.on('chatConnected', (data) => {
      console.log('🤝 New connection established with:', data.partnerName);
      
      const newConnection = {
        roomId: data.roomId,
        partnerId: data.partnerId,
        partnerName: data.partnerName,
        messages: data.messages || [],
        createdAt: Date.now()
      };

      setChats(prev => {
        // Check if this connection already exists
        const existing = prev.find(c => c.roomId === data.roomId);
        
        if (existing) {
          console.log('✅ Connection already exists with:', data.partnerName);
          // Update with new messages from server if any
          const merged = {
            ...existing,
            messages: data.messages && data.messages.length > 0 
              ? data.messages.map(msg => ({
                  ...msg,
                  isOwn: msg.senderId === user?.userId
                }))
              : existing.messages
          };
          
          const updated = prev.map(c => c.roomId === data.roomId ? merged : c);
          saveChatState(updated);
          setActiveChat(merged);
          return updated;
        }
        
        // New connection
        console.log('➕ Adding new connection:', data.partnerName);
        const updated = [...prev, newConnection];
        saveChatState(updated);
        setActiveChat(newConnection);
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
        
        saveChatState(updated);
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
  }, [socket, user]);

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
        
        // Save with split storage - connections stay, only messages cleaned
        saveChatState(updated);
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
