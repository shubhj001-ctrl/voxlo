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
        setChats(parsed);
        
        // Clean up expired chats (older than 10 minutes)
        const now = Date.now();
        const validChats = parsed.filter(chat => {
          const lastMessage = chat.messages[chat.messages.length - 1];
          return lastMessage && (now - lastMessage.timestamp) < 10 * 60 * 1000;
        });
        
        if (validChats.length !== parsed.length) {
          localStorage.setItem('voxlo_chats', JSON.stringify(validChats));
          setChats(validChats);
        }
      } catch (e) {
        console.error('Error loading saved chats:', e);
      }
    }

    // Initialize Socket.io
    const newSocket = io(SERVER_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
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
        socket.emit('register', { username: user.username });
      }
    });

    socket.on('registered', (data) => {
      const userData = {
        userId: data.userId,
        username: data.username,
        inviteCode: data.inviteCode
      };
      setUser(userData);
      localStorage.setItem('voxlo_user', JSON.stringify(userData));
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
          if (chat.partnerId === messageData.senderId || 
              messageData.senderId === user?.userId) {
            const newMessages = [...chat.messages, {
              ...messageData,
              isOwn: messageData.senderId === user?.userId
            }];
            
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
      alert(error.message);
    });

    return () => {
      socket.off('connect');
      socket.off('registered');
      socket.off('chatConnected');
      socket.off('newMessage');
      socket.off('userTyping');
      socket.off('error');
    };
  }, [socket, user]);

  // Auto-cleanup expired messages every minute
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      
      setChats(prev => {
        const updated = prev.map(chat => ({
          ...chat,
          messages: chat.messages.filter(msg => 
            (now - msg.timestamp) < 10 * 60 * 1000
          )
        })).filter(chat => chat.messages.length > 0);
        
        if (updated.length !== prev.length) {
          localStorage.setItem('voxlo_chats', JSON.stringify(updated));
        }
        
        return updated;
      });
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, []);

  const handleRegister = (username) => {
    if (socket && socket.connected) {
      socket.emit('register', { username });
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
