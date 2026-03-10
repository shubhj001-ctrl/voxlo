# ✦ VOXLO — Connect Beyond Looks

> Bio-first Gen Z chat app with real-time messaging, photo sharing & Firebase backend.

---

## 📁 Project Structure

```
VOXLO-Project/
├── index.html          ← Main app (open this in browser)
├── firebase-config.js  ← Your Firebase keys go here
├── css/
│   └── style.css       ← All styling
├── js/
│   └── app.js          ← All app logic + Firebase integration
└── README.md           ← You're reading this!
```

---

## 🚀 How to Run Locally

### Option 1 — VS Code Live Server (Recommended)
1. Open the `VOXLO-Project` folder in VS Code
2. Install the **Live Server** extension (by Ritwick Dey)
3. Right-click `index.html` → **"Open with Live Server"**
4. App opens at `http://127.0.0.1:5500`

> ⚠️ **Do NOT just double-click index.html** — ES modules (Firebase SDK)
> require a local server to work. Use Live Server or any HTTP server.

### Option 2 — Node HTTP Server
```bash
npx serve .
# or
python3 -m http.server 3000
```

---

## 🔥 Firebase Setup (to go LIVE with real users)

### Step 1 — Create Firebase Project
1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **"Add project"** → name it `voxlo`
3. Disable Google Analytics (optional) → **Create project**

### Step 2 — Enable Services
In the Firebase console, enable these 3 things:

| Service | Steps |
|---|---|
| **Authentication** | Build → Authentication → Get Started → Email/Password → Enable |
| **Firestore** | Build → Firestore Database → Create database → Test mode → Next |
| **Storage** | Build → Storage → Get started → Test mode → Done |

### Step 3 — Get Your Config Keys
1. Project Settings (⚙️ top left) → **Your apps**
2. Click **Web** (`</>`) → Register app as `voxlo-web`
3. Copy the `firebaseConfig` object

### Step 4 — Add Keys to Project
Open `firebase-config.js` and replace the placeholder values:

```javascript
const firebaseConfig = {
  apiKey:            "AIzaSyD-your-actual-key",
  authDomain:        "voxlo-app.firebaseapp.com",
  projectId:         "voxlo-app",
  storageBucket:     "voxlo-app.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abc123"
};
```

### Step 5 — Run & Test
Start Live Server → Sign up with a real email → Done! 🎉

---

## ✨ Features

- 🌑 Dark Gen Z UI with animated gradient orbs
- 🔐 Real Firebase Authentication (email/password)
- 👥 Live user discovery with interest-based filtering
- ⚡ Match score algorithm
- 💬 Real-time chat powered by Firestore
- 📷 Photo sharing with Firebase Storage upload
- 🟢 Live online/offline presence system
- ⚙️ Edit profile (syncs to Firestore)
- 🎭 Demo mode (works without Firebase for UI testing)

---

## 🌐 Deploy to the Web (Free)

### Netlify (easiest)
1. Go to [netlify.com](https://netlify.com) → Sign up free
2. Drag & drop your `VOXLO-Project` folder
3. Your app is live at `https://random-name.netlify.app` 🚀

### Vercel
```bash
npm install -g vercel
cd VOXLO-Project
vercel
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JS (ES Modules) |
| Auth | Firebase Authentication |
| Database | Firebase Firestore (NoSQL, real-time) |
| Storage | Firebase Storage (photos) |
| Fonts | Syne + DM Sans (Google Fonts) |
| Hosting | Any static host (Netlify, Vercel, Firebase Hosting) |

---

## 📱 Next Steps / Roadmap

- [ ] Mobile responsive layout
- [ ] Push notifications
- [ ] Voice messages
- [ ] Group chats / communities
- [ ] Profile photo upload
- [ ] React Native mobile app

---

Built with ❤️ by Shubham Jaggi
