# VOXLO

**Secure Ephemeral Chat Platform**

VOXLO is a real-time chat application with invite-only access, local storage, and auto-expiring messages. Messages are stored only in your browser's local storage and automatically delete after 10 minutes.

## Features

- 🔒 **Privacy First**: Messages stored locally in browser storage only
- ⏱️ **Auto-Delete**: Messages automatically expire after 10 minutes
- 🎫 **Invite System**: Connect with others using 6-digit alphanumeric invite codes
- ⚡ **Real-Time**: Instant messaging using WebSocket (Socket.io)
- 🎨 **Modern UI**: Clean, intuitive interface inspired by popular chat apps
- 🚀 **Fast & Lightweight**: Built with React and Vite

## Tech Stack

### Frontend
- React 18
- Vite
- Socket.io Client
- CSS3 (Custom styling)

### Backend
- Node.js
- Express
- Socket.io
- In-memory session management

## Getting Started

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/VOXLO.git
   cd VOXLO
   ```

2. **Install Server Dependencies**
   ```bash
   cd server
   npm install
   ```

3. **Install Client Dependencies**
   ```bash
   cd ../client
   npm install
   ```

4. **Configure Environment Variables**

   Server (.env):
   ```bash
   cd ../server
   cp .env.example .env
   ```
   Edit `.env` and set:
   ```
   PORT=3001
   CLIENT_URL=http://localhost:5173
   NODE_ENV=development
   ```

   Client (.env):
   ```bash
   cd ../client
   cp .env.example .env
   ```
   Edit `.env` and set:
   ```
   VITE_SERVER_URL=http://localhost:3001
   ```

### Running Locally

1. **Start the Backend Server**
   ```bash
   cd server
   npm run dev
   ```
   Server will run on `http://localhost:3001`

2. **Start the Frontend (in a new terminal)**
   ```bash
   cd client
   npm run dev
   ```
   Client will run on `http://localhost:5173`

3. **Open your browser** and navigate to `http://localhost:5173`

## Usage

1. **Register**: Enter your name to get started
2. **Get Your Invite Code**: Click the 🎫 icon to view your unique 6-character code
3. **Connect with Others**: 
   - Share your invite code with someone
   - Or enter someone else's invite code to start chatting
4. **Chat**: Messages are stored locally and auto-delete after 10 minutes

## Deployment

### Deploy to Render

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/yourusername/VOXLO.git
   git push -u origin main
   ```

2. **Deploy Backend on Render**
   - Go to [Render Dashboard](https://dashboard.render.com/)
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - **Name**: voxlo-server
     - **Root Directory**: `server`
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
     - **Environment Variables**:
       - `PORT`: (Render auto-assigns)
       - `CLIENT_URL`: `https://your-frontend-url.onrender.com`
       - `NODE_ENV`: `production`

3. **Deploy Frontend on Render**
   - Click "New +" → "Static Site"
   - Connect your GitHub repository
   - Configure:
     - **Name**: voxlo-client
     - **Root Directory**: `client`
     - **Build Command**: `npm install && npm run build`
     - **Publish Directory**: `dist`
     - **Environment Variables**:
       - `VITE_SERVER_URL`: `https://your-backend-url.onrender.com`

4. **Update CORS Settings**
   - After deployment, update the backend's `CLIENT_URL` environment variable with your frontend URL
   - Restart the backend service

## Project Structure

```
VOXLO/
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/     # React components
│   │   │   ├── Welcome.jsx
│   │   │   ├── ChatRoom.jsx
│   │   │   └── *.css
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── index.css
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── server/                 # Backend Node.js server
│   ├── server.js           # Main server file
│   ├── package.json
│   └── .env.example
├── .github/
│   └── copilot-instructions.md
├── .gitignore
└── README.md
```

## Features in Detail

### Invite Code System
- Each user gets a unique 6-character alphanumeric code
- Codes are randomly generated and collision-free
- Users connect by exchanging codes

### Auto-Delete Messages
- Messages expire 10 minutes after being sent
- Client-side cleanup runs every minute
- Visual countdown timer on each message
- Expired messages are automatically removed

### Local Storage
- All chat data stored in browser's localStorage
- No server-side message persistence
- Data cleared when chats are deleted or expire

### Real-Time Communication
- WebSocket-based instant messaging
- Typing indicators
- Connection status notifications
- Automatic reconnection

## Security Considerations

- Messages are stored only in local browser storage
- No server-side message persistence (in-memory only during active sessions)
- CORS configured for specific origins
- Invite codes required for connections
- Auto-deletion ensures ephemeral communication

## Future Enhancements

- [ ] End-to-end encryption
- [ ] File sharing
- [ ] Voice/Video calls
- [ ] Group chats
- [ ] Custom message expiration times
- [ ] Push notifications
- [ ] Mobile app (React Native)
- [ ] Dark/Light theme toggle

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.

## Support

For issues and questions, please open an issue on GitHub.

---

Built with ❤️ using React, Node.js, and Socket.io
