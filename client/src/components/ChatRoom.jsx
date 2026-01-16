import { useState, useEffect, useRef } from 'react';
import './ChatRoom.css';

function ChatRoom({ 
  user, 
  chats, 
  activeChat, 
  onSelectChat, 
  onConnectWithCode, 
  onSendMessage, 
  onTyping,
  onClearChats 
}) {
  const [message, setMessage] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showMyCode, setShowMyCode] = useState(false);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeChat?.messages]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (message.trim()) {
      onSendMessage(message.trim());
      setMessage('');
      onTyping(false);
    }
  };

  const handleMessageChange = (e) => {
    setMessage(e.target.value);
    
    // Typing indicator
    onTyping(true);
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      onTyping(false);
    }, 1000);
  };

  const handleConnectWithCode = (e) => {
    e.preventDefault();
    if (inviteCode.trim().length === 6) {
      onConnectWithCode(inviteCode.trim());
      setInviteCode('');
      setShowInviteModal(false);
    }
  };

  const copyInviteCode = () => {
    navigator.clipboard.writeText(user.inviteCode);
    alert('Invite code copied to clipboard!');
  };

  const getTimeRemaining = (timestamp) => {
    const elapsed = Date.now() - timestamp;
    const remaining = (10 * 60 * 1000) - elapsed;
    
    if (remaining <= 0) return 'Expired';
    
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const activeChatData = chats.find(c => c.roomId === activeChat?.roomId);

  return (
    <div className="chat-room">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="user-info">
            <div className="user-avatar">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="user-name">{user.username}</div>
              <div className="user-status">Online</div>
            </div>
          </div>
          
          <div className="sidebar-actions">
            <button 
              className="icon-btn" 
              onClick={() => setShowMyCode(!showMyCode)}
              title="My Invite Code"
            >
              🎫
            </button>
            <button 
              className="icon-btn" 
              onClick={() => setShowInviteModal(true)}
              title="Connect with Code"
            >
              ➕
            </button>
          </div>
        </div>

        {showMyCode && (
          <div className="my-code-card slide-in">
            <div className="code-label">Your Invite Code</div>
            <div className="code-display" onClick={copyInviteCode}>
              {user.inviteCode}
            </div>
            <div className="code-hint">Click to copy</div>
          </div>
        )}

        <div className="chat-list">
          {chats.length === 0 ? (
            <div className="empty-state">
              <p>No active chats</p>
              <p className="hint">Use an invite code to start chatting</p>
            </div>
          ) : (
            chats.map(chat => (
              <div
                key={chat.roomId}
                className={`chat-item ${activeChat?.roomId === chat.roomId ? 'active' : ''}`}
                onClick={() => onSelectChat(chat)}
              >
                <div className="chat-avatar">
                  {chat.partnerName.charAt(0).toUpperCase()}
                </div>
                <div className="chat-info">
                  <div className="chat-name">{chat.partnerName}</div>
                  <div className="chat-preview">
                    {chat.messages.length > 0
                      ? chat.messages[chat.messages.length - 1].message.substring(0, 30)
                      : 'No messages yet'}
                  </div>
                </div>
                {chat.messages.length > 0 && (
                  <div className="chat-timer">
                    {getTimeRemaining(chat.messages[chat.messages.length - 1].timestamp)}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {chats.length > 0 && (
          <button className="clear-chats-btn" onClick={onClearChats}>
            Clear All Chats
          </button>
        )}
      </div>

      {/* Main Chat Area */}
      <div className="chat-main">
        {!activeChatData ? (
          <div className="no-chat-selected">
            <div className="empty-icon">💬</div>
            <h2>Welcome to VOXLO</h2>
            <p>Select a chat or connect with someone using an invite code</p>
            <button 
              className="btn-primary"
              onClick={() => setShowInviteModal(true)}
            >
              Connect with Code
            </button>
          </div>
        ) : (
          <>
            <div className="chat-header">
              <div className="chat-partner-info">
                <div className="partner-avatar">
                  {activeChatData.partnerName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="partner-name">{activeChatData.partnerName}</div>
                  {activeChatData.partnerTyping && (
                    <div className="typing-indicator">typing...</div>
                  )}
                </div>
              </div>
              <div className="chat-info-badge">
                🔒 Messages auto-delete in 10 min
              </div>
            </div>

            <div className="messages-container">
              {activeChatData.messages.length === 0 ? (
                <div className="empty-messages">
                  <p>No messages yet. Start the conversation!</p>
                </div>
              ) : (
                activeChatData.messages.map(msg => (
                  <div
                    key={msg.id}
                    className={`message ${msg.isOwn ? 'own' : 'other'} slide-in`}
                  >
                    <div className="message-bubble">
                      <div className="message-text">{msg.message}</div>
                      <div className="message-meta">
                        <span className="message-time">
                          {new Date(msg.timestamp).toLocaleTimeString([], { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </span>
                        <span className="message-timer">
                          ⏱️ {getTimeRemaining(msg.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <form className="message-input-form" onSubmit={handleSendMessage}>
              <input
                type="text"
                value={message}
                onChange={handleMessageChange}
                placeholder="Type a message..."
                className="message-input"
                maxLength={500}
              />
              <button type="submit" className="send-btn" disabled={!message.trim()}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </form>
          </>
        )}
      </div>

      {/* Invite Code Modal */}
      {showInviteModal && (
        <div className="modal-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="modal-content fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Connect with Invite Code</h2>
              <button 
                className="modal-close"
                onClick={() => setShowInviteModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleConnectWithCode}>
              <div className="input-group">
                <label>Enter 6-Digit Code</label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  maxLength={6}
                  autoFocus
                  required
                  pattern="[A-Z0-9]{6}"
                />
              </div>
              <button type="submit" className="btn-primary">
                Connect
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatRoom;
