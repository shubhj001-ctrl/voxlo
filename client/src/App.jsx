import { useState, useEffect } from 'react';
import io from 'socket.io-client';
import Welcome from './components/Welcome';
import ChatRoom from './components/ChatRoom';
import './App.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

// SIMPLIFIED: Only handles localStorage, nothing else
class ConnectionStore {
  // CONNECTIONS = permanent friend list (survives refresh, page close, server restart)
  static saveConnections(connections) {
    try {
      const connData = connections.map(({ messages, ...conn }) => conn);
      localStorage.setItem('voxlo_connections', JSON.stringify(connData));
      console.log('💾 Saved', connData.length, 'connections to localStorage (PERMANENT)');
    } catch (e) {
      console.error('❌ Failed to save connections:', e);
    }
  }

  static loadConnections() {
    try {
      const data = localStorage.getItem('voxlo_connections');
      const conns = data ? JSON.parse(data) : [];
      console.log('✅ Loaded', conns.length, 'connections from localStorage');
      return conns;
    } catch (e) {
      console.error('❌ Failed to load connections:', e);
      return [];
    }
  }

  // MESSAGES = temporary (expire after 10 min)
  static saveMessages(chats) {
    try {
      const msgData = {};
      chats.forEach(chat => {
        if (chat.messages?.length > 0) {
          msgData[chat.roomId] = chat.messages.map(({ isOwn, ...m }) => m);
        }
      });
      localStorage.setItem('voxlo_messages', JSON.stringify(msgData));
      console.log('💾 Saved messages for', Object.keys(msgData).length, 'chats (temporary, 10 min expiry)');
    } catch (e) {
      console.error('❌ Failed to save messages:', e);
    }
  }

  static loadMessages() {
    try {
      const data = localStorage.getItem('voxlo_messages');
      if (!data) return {};
      
      const msgData = JSON.parse(data);
      const now = Date.now();
      const filtered = {};

      // Remove expired messages (older than 10 minutes)
      Object.entries(msgData).forEach(([roomId, messages]) => {
        const valid = messages.filter(m => (now - m.timestamp) < 10 * 60 * 1000);
        if (valid.length > 0) {
          filtered[roomId] = valid;
          console.log(`  ✅ ${roomId}: ${valid.length} messages still valid`);
        } else {
          console.log(`  ⏰ ${roomId}: all messages expired`);
        }
      });

      // Save back filtered messages
      localStorage.setItem('voxlo_messages', JSON.stringify(filtered));
      return filtered;
    } catch (e) {
      console.error('❌ Failed to load messages:', e);
      return {};
    }
  }

  static saveUser(user) {
    localStorage.setItem('voxlo_user', JSON.stringify(user));
  }

  static loadUser() {
    try {
      const data = localStorage.getItem('voxlo_user');
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  }
}

// Debug function - call from console
window.debugVoxloStorage = function() {
  const conns = localStorage.getItem('voxlo_connections');
  const msgs = localStorage.getItem('voxlo_messages');
  const user = localStorage.getItem('voxlo_user');
  
  console.log('\n=== VOXLO STORAGE DEBUG ===');
  console.log('👥 Connections (PERMANENT):', conns ? JSON.parse(conns).length : 0);
  if (conns) {
    JSON.parse(conns).forEach(c => {
      console.log(`   • ${c.partnerName} (${c.roomId}) - created ${new Date(c.createdAt).toLocaleString()}`);
    });
  }
  console.log('💬 Messages (10 min expiry):', msgs ? Object.keys(JSON.parse(msgs)).length : 0, 'chats');
  console.log('👤 User:', user ? JSON.parse(user).firstName : 'Not logged in');
  console.log('=========================\n');
};

function App() {
  const [socket, setSocket] = useState(null);
  const [user, setUser] = useState(null);
  const [activeChat, setActiveChat] = useState(null);
  const [chats, setChats] = useState([]);

  // LOAD INITIAL STATE FROM LOCALSTORAGE
  useEffect(() => {
    console.log('\n🚀 App starting - loading from localStorage...\n');
    
    // Load user
    const savedUser = ConnectionStore.loadUser();
    if (savedUser) {
      console.log('👤 User found:', savedUser.firstName);
      setUser(savedUser);
    }

    // Load connections (PERMANENT - never expire)
    const connections = ConnectionStore.loadConnections();
    
    // Load messages (temporary - filter expired)
    const msgsByRoom = ConnectionStore.loadMessages();
    
    // Merge: connections + their messages
    const merged = connections.map(conn => ({
      ...conn,
      messages: msgsByRoom[conn.roomId] || []
    }));

    console.log('📊 Total loaded:', merged.length, 'connections');
    setChats(merged);
  }, []);

  // CONNECT TO SERVER
  useEffect(() => {
    const newSocket = io(SERVER_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      console.log('🔗 Connected to server');
      if (user) {
        newSocket.emit('register', {
          userId: user.userId,
          firstName: user.firstName,
          lastName: user.lastName
        });
      }
    });

    newSocket.on('registered', (data) => {
      const userData = {
        userId: data.userId,
        firstName: data.firstName,
        lastName: data.lastName,
        inviteCode: data.inviteCode
      };
      setUser(userData);
      ConnectionStore.saveUser(userData);
      console.log('✅ Registered:', userData.firstName);
    });

    newSocket.on('chatsLoaded', (data) => {
      console.log('📥 Server sent', data.chats.length, 'connections');
      setChats(prev => {
        const localMap = new Map(prev.map(c => [c.roomId, c]));
        
        // Add any server-side connections we don't have locally
        data.chats.forEach(serverChat => {
          if (!localMap.has(serverChat.roomId)) {
            localMap.set(serverChat.roomId, serverChat);
          }
        });

        const result = Array.from(localMap.values());
        ConnectionStore.saveConnections(result);
        return result;
      });
    });

    newSocket.on('chatConnected', (data) => {
      console.log('✅ New connection: ', data.partnerName);
      
      setChats(prev => {
        const exists = prev.some(c => c.roomId === data.roomId);
        if (exists) {
          console.log('   (Already connected)');
          return prev;
        }

        const newConn = {
          roomId: data.roomId,
          partnerId: data.partnerId,
          partnerName: data.partnerName,
          messages: [],
          createdAt: Date.now()
        };

        const updated = [...prev, newConn];
        ConnectionStore.saveConnections(updated); // ✅ SAVE TO LOCALSTORAGE
        setActiveChat(newConn);
        return updated;
      });
    });

    newSocket.on('newMessage', (msg) => {
      setChats(prev => {
        const updated = prev.map(chat => {
          if (chat.roomId === msg.roomId) {
            return {
              ...chat,
              messages: [...chat.messages, { ...msg, isOwn: msg.senderId === user?.userId }]
            };
          }
          return chat;
        });

        ConnectionStore.saveMessages(updated); // ✅ SAVE MESSAGES
        
        // Update active chat if it's the current one
        if (activeChat?.roomId === msg.roomId) {
          setActiveChat(updated.find(c => c.roomId === msg.roomId));
        }

        return updated;
      });
    });

    newSocket.on('userTyping', ({ userId, isTyping }) => {
      setChats(prev =>
        prev.map(c => c.partnerId === userId ? { ...c, partnerTyping: isTyping } : c)
      );
    });

    newSocket.on('error', (error) => {
      console.error('❌ Server error:', error.message);
      alert(error.message);
    });

    newSocket.on('disconnect', () => {
      console.log('❌ Disconnected from server');
    });

    setSocket(newSocket);

    return () => newSocket.close();
  }, [user]);

  // AUTO-CLEANUP: Delete expired messages every minute (keep connections!)
  useEffect(() => {
    const interval = setInterval(() => {
      setChats(prev => {
        const now = Date.now();
        const updated = prev.map(chat => ({
          ...chat,
          messages: chat.messages.filter(m => (now - m.timestamp) < 10 * 60 * 1000)
        }));
        
        ConnectionStore.saveMessages(updated);
        return updated;
      });
    }, 60000); // Every minute

    return () => clearInterval(interval);
  }, []);

  // HANDLERS
  const handleRegister = (firstName, lastName) => {
    if (socket?.connected) {
      const userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      socket.emit('register', { userId, firstName, lastName });
    }
  };

  const handleConnectWithCode = (code) => {
    if (socket?.connected && user) {
      socket.emit('connectWithCode', { inviteCode: code.toUpperCase(), myUserId: user.userId });
    }
  };

  const handleSendMessage = (text) => {
    if (socket?.connected && activeChat) {
      socket.emit('sendMessage', {
        roomId: activeChat.roomId,
        message: text,
        timestamp: Date.now()
      });
    }
  };

  const handleTyping = (isTyping) => {
    if (socket?.connected && activeChat) {
      socket.emit('typing', { roomId: activeChat.roomId, isTyping });
    }
  };

  const handleClearChats = () => {
    setChats([]);
    setActiveChat(null);
    localStorage.removeItem('voxlo_connections');
    localStorage.removeItem('voxlo_messages');
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
