# Quick Start Commands

## ⚡ If you have Node.js installed:

### Option 1: Using VS Code Tasks (Recommended)
1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
2. Type "Run Task"
3. Select "Install All Dependencies" (first time only)
4. Then select "Start VOXLO (Full Stack)"

### Option 2: Using Terminal

**First time setup:**
```bash
# Terminal 1 - Install and run server
cd server
npm install
npm run dev

# Terminal 2 - Install and run client
cd client
npm install
npm run dev
```

**After dependencies are installed:**
```bash
# Terminal 1
cd server && npm run dev

# Terminal 2
cd client && npm run dev
```

## 🌐 Access the App
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

## 📤 Push to GitHub

1. Create a new repository on GitHub.com named "VOXLO"
2. Run these commands:

```bash
git remote add origin https://github.com/YOUR_USERNAME/VOXLO.git
git branch -M main
git push -u origin main
```

## 🎯 Test the App

1. Open http://localhost:5173
2. Enter a name (e.g., "Alice")
3. Click 🎫 to see your invite code
4. Open a new incognito/private window
5. Register with a different name (e.g., "Bob")
6. Click ➕ and enter Alice's invite code
7. Start chatting!

Messages will auto-delete after 10 minutes ⏱️

## 📚 Full Documentation
- [SETUP.md](SETUP.md) - Detailed setup instructions
- [README.md](README.md) - Complete project documentation

---

Need help? Check SETUP.md or README.md for troubleshooting.
