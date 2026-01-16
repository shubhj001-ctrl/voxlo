# VOXLO Quick Setup Guide

## ✅ Project Successfully Created!

Your VOXLO chat platform is ready. Here's what has been set up:

### 📁 Project Structure
```
VOXLO/
├── client/          → React frontend (Vite)
├── server/          → Node.js backend (Express + Socket.io)
├── .github/         → GitHub configuration
├── README.md        → Full documentation
└── render.yaml      → Render deployment config
```

### 🚀 Next Steps

#### 1. Install Dependencies

**Important:** You'll need Node.js and npm installed. If you don't have them:
- Download from: https://nodejs.org/

Once installed, run:

```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

#### 2. Run the Application Locally

**Terminal 1 - Start Backend:**
```bash
cd server
npm run dev
```
Server runs on: http://localhost:3001

**Terminal 2 - Start Frontend:**
```bash
cd client
npm run dev
```
Client runs on: http://localhost:5173

#### 3. Test the Application

1. Open http://localhost:5173 in your browser
2. Enter your name to register
3. Click the 🎫 icon to see your invite code
4. Open another browser window (or incognito) and register with a different name
5. Use one person's invite code to connect from the other window
6. Start chatting! Messages will auto-delete after 10 minutes

### 🌐 Deploy to Render

#### Prerequisites
1. Create a GitHub account (if you don't have one)
2. Create a Render account at https://render.com

#### Steps

1. **Push to GitHub:**
   ```bash
   # If you haven't created the repo yet, go to GitHub.com and create a new repo named "VOXLO"
   git remote add origin https://github.com/YOUR_USERNAME/VOXLO.git
   git branch -M main
   git push -u origin main
   ```

2. **Deploy on Render:**
   - Go to https://dashboard.render.com/
   - Click "New +" → "Web Service"
   - Connect your VOXLO repository
   
   **For Backend:**
   - Name: voxlo-server
   - Root Directory: `server`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Add environment variable: `NODE_ENV` = `production`
   
   **For Frontend:**
   - Click "New +" → "Static Site"
   - Name: voxlo-client
   - Root Directory: `client`
   - Build Command: `npm install && npm run build`
   - Publish Directory: `dist`
   
   **Update Environment Variables:**
   - Backend: Set `CLIENT_URL` to your frontend URL
   - Frontend: Set `VITE_SERVER_URL` to your backend URL

### 🎨 Features

- ✅ Real-time messaging with Socket.io
- ✅ Invite code system (6-digit alphanumeric)
- ✅ Local storage only (privacy-first)
- ✅ Auto-delete messages after 10 minutes
- ✅ Typing indicators
- ✅ Modern, responsive UI
- ✅ Connection status notifications

### 📝 Git is Ready

Your project has been committed to Git. To push to GitHub:

```bash
# Create a new repo on GitHub.com named "VOXLO"
git remote add origin https://github.com/YOUR_USERNAME/VOXLO.git
git push -u origin main
```

### 🔧 Troubleshooting

**"npm is not recognized":**
- Install Node.js from https://nodejs.org/
- Restart your terminal/VS Code

**Port already in use:**
- Change the port in `.env` files:
  - Server: Edit `server/.env`, change `PORT=3001`
  - Client: Edit `client/vite.config.js`, change `port: 5173`

**Connection issues:**
- Make sure both server and client are running
- Check that `.env` files have the correct URLs
- Disable browser extensions that might block WebSocket connections

### 📚 Learn More

- Full documentation: See [README.md](README.md)
- React: https://react.dev/
- Vite: https://vitejs.dev/
- Socket.io: https://socket.io/

---

**Need help?** Check the README.md for detailed information or open an issue on GitHub.

Enjoy building with VOXLO! 🚀
