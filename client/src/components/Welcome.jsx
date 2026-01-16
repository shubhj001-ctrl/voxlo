import { useState } from 'react';
import './Welcome.css';

function Welcome({ onRegister }) {
  const [username, setUsername] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (username.trim()) {
      onRegister(username.trim());
    }
  };

  return (
    <div className="welcome-container fade-in">
      <div className="welcome-card">
        <div className="logo">
          <div className="logo-icon">
            <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
              <path
                d="M30 5L50 15V35L30 45L10 35V15L30 5Z"
                stroke="url(#gradient)"
                strokeWidth="3"
                fill="none"
              />
              <circle cx="30" cy="25" r="8" fill="url(#gradient)" />
              <defs>
                <linearGradient id="gradient" x1="10" y1="5" x2="50" y2="45">
                  <stop offset="0%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1>VOXLO</h1>
        </div>
        
        <p className="tagline">
          Secure Ephemeral Messaging
        </p>
        
        <div className="features">
          <div className="feature">
            <span className="feature-icon">🔒</span>
            <span>Local Storage Only</span>
          </div>
          <div className="feature">
            <span className="feature-icon">⏱️</span>
            <span>10-Min Auto-Delete</span>
          </div>
          <div className="feature">
            <span className="feature-icon">🎫</span>
            <span>Invite Code System</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="register-form">
          <div className="input-group">
            <label htmlFor="username">Enter Your Name</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="John Doe"
              maxLength={20}
              autoFocus
              required
            />
          </div>
          
          <button type="submit" className="btn-primary">
            Get Started
          </button>
        </form>

        <div className="disclaimer">
          <p>Messages are stored locally and automatically deleted after 10 minutes</p>
        </div>
      </div>
    </div>
  );
}

export default Welcome;
