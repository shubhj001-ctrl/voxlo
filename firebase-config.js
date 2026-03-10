// ============================================================
//  VOXLO — Firebase Configuration
//  
//  HOW TO GET YOUR FIREBASE KEYS:
//  1. Go to https://console.firebase.google.com
//  2. Click "Add project" → name it "voxlo" → Continue
//  3. Go to Project Settings (⚙️ gear icon, top left)
//  4. Scroll to "Your apps" → Click Web (</>)
//  5. Register app name "voxlo-web" → Copy the config below
//
//  ALSO ENABLE THESE IN FIREBASE CONSOLE:
//  ✅ Authentication → Sign-in method → Email/Password → Enable
//  ✅ Firestore Database → Create database → Start in test mode
//  ✅ Storage → Get started → Start in test mode
// ============================================================

const firebaseConfig = {
  apiKey:            "AIzaSyAjhv4beripAresAhpMhzxO8N1DRxB2qcA",
  authDomain:        "voxlo-9c3da.firebaseapp.com",
  projectId:         "voxlo-9c3da",
  storageBucket:     "voxlo-9c3da.firebasestorage.app",
  messagingSenderId: "444229055118",
  appId:             "1:444229055118:web:cf80ede03d83ac18810fdf",
  measurementId:     "G-H0KNDF2KBV"
};

export default firebaseConfig;

// ============================================================
//  EXAMPLE (what it looks like when filled in):
//
//  const firebaseConfig = {
//    apiKey:            "AIzaSyD-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
//    authDomain:        "voxlo-app.firebaseapp.com",
//    projectId:         "voxlo-app",
//    storageBucket:     "voxlo-app.appspot.com",
//    messagingSenderId: "123456789012",
//    appId:             "1:123456789012:web:abcdef1234567890"
//  };
// ============================================================