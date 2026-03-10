// ══════════════════════════════════════════════
//  VOXLO — Firebase Real-time App
//  Full integration: Auth + Firestore + Storage
// ══════════════════════════════════════════════

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, addDoc, query, orderBy, onSnapshot, serverTimestamp, updateDoc, where, limit } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';
import firebaseConfig from '../firebase-config.js';

// ── EMAILJS CONFIG ──
const EMAILJS_PUBLIC_KEY  = 'fZ7BAKMM1BlBU07S3';
const EMAILJS_SERVICE_ID  = 'service_ay6r58h';
const EMAILJS_TEMPLATE_ID = 'template_rsxuxol';

// ── STATE ──
const S = {
  app: null, auth: null, db: null, storage: null,
  user: null, profile: null,
  chatId: null, chatUser: null,
  unsubMsgs: null, unsubUsers: null,
  pendingImgs: [],
  fbReady: false,
  demoMode: true,
  twoFA: {
    pendingEmail: null, pendingPass: null, pendingName: null,
    otp: null, otpExpiry: null, isLogin: false, timerInterval: null,
  }
};

// ── OTP HELPERS ──
function generateOTP(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let otp = '';
  for(let i = 0; i < 6; i++) otp += chars[Math.floor(Math.random() * chars.length)];
  return otp;
}

async function sendOTPEmail(email, name, otp){
  if(!window.emailjs){
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
    window.emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
  }
  return window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
    to_name:  name || 'there',
    to_email: email,
    otp_code: otp,
  });
}

// ── AVATAR COLORS ──
const AV_COLORS = ['av1','av2','av3','av4','av5','av6'];
const TAG_COLORS = ['tp','tc','tpk','ta','tg'];
function avColor(uid){ return AV_COLORS[uid ? uid.charCodeAt(0) % 6 : 0]; }
function initials(name){ return name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2); }
function tagColor(i){ return TAG_COLORS[i % TAG_COLORS.length]; }
function fmtTime(ts){
  if(!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
}
function esc(t){ const d=document.createElement('div'); d.appendChild(document.createTextNode(t)); return d.innerHTML; }

// ── TOAST ──
function toast(msg, type='ok'){
  const c=document.getElementById('toastC');
  const el=document.createElement('div');
  el.className=`toast ${type}`;
  el.innerHTML=`<span>${type==='ok'?'✓':'✕'}</span> ${msg}`;
  c.appendChild(el);
  setTimeout(()=>el.remove(),3200);
}

// ── PAGE ──
function showPage(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── LOADER ──
function setLoaderMsg(msg){
  const el = document.getElementById('loaderSub');
  if(el) el.textContent = msg;
}
function hideLoader(){
  const loader = document.getElementById('loader');
  if(!loader) return;
  loader.classList.add('fade-out');
  setTimeout(()=>{ loader.style.display='none'; }, 420);
}

// ── FIREBASE INIT ──
function loadFirebaseConfig(){
  const saved = localStorage.getItem('voxlo_fb_config');
  if(saved){
    try{ return JSON.parse(saved); }catch(e){}
  }
  return null;
}

function initFirebase(config){
  try{
    S.app = initializeApp(config);
    S.auth = getAuth(S.app);
    S.db = getFirestore(S.app);
    S.storage = getStorage(S.app);
    S.fbReady = true;
    S.demoMode = false;
    document.getElementById('fbBanner').classList.remove('show');
    return true;
  } catch(e){
    console.error('Firebase init failed:', e);
    return false;
  }
}

// Auto-init from imported config file
if(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.apiKey !== 'YOUR_API_KEY'){
  initFirebase(firebaseConfig);
} else {
  // Fallback: try localStorage saved config
  const savedConfig = loadFirebaseConfig();
  if(savedConfig){ initFirebase(savedConfig); }
  else{ document.getElementById('fbBanner').classList.add('show'); }
}

// ── AUTH LISTENERS ──
function setupAuthListener(){
  if(!S.fbReady) return;
  onAuthStateChanged(S.auth, async (user) => {
    if(user){
      S.user = user;
      setLoaderMsg('Loading your profile...');
      try{
        const snap = await getDoc(doc(S.db,'users',user.uid));
        if(snap.exists()){
          S.profile = snap.data();
          setLoaderMsg('Almost there...');
          await updateDoc(doc(S.db,'users',user.uid),{ online:true, lastSeen: serverTimestamp() });
          hideLoader();
          initApp();
        } else {
          hideLoader();
          showPage('pg-auth');
        }
      } catch(e){
        console.error('Profile fetch error:', e);
        hideLoader();
        showPage('pg-auth');
      }
    } else {
      S.user = null; S.profile = null;
      hideLoader();
      showPage('pg-land');
    }
  });
}

// ══════════════════════════════
//  LANDING
// ══════════════════════════════
document.getElementById('btnGetStarted').onclick = ()=>{ showPage('pg-auth'); switchToReg(); };
document.getElementById('btnSignIn').onclick = ()=>showPage('pg-auth');

// ══════════════════════════════
//  AUTH
// ══════════════════════════════
window.switchToLogin = ()=>{
  document.querySelectorAll('.a-tab').forEach(t=>t.classList.remove('active'));
  document.querySelector('[data-tab="login"]').classList.add('active');
  document.getElementById('reg-form').classList.add('hidden');
  document.getElementById('login-form').classList.remove('hidden');
};

window.switchToReg = ()=>{
  document.querySelectorAll('.a-tab').forEach(t=>t.classList.remove('active'));
  document.querySelector('[data-tab="reg"]').classList.add('active');
  document.getElementById('reg-form').classList.remove('hidden');
  document.getElementById('login-form').classList.add('hidden');
};

document.querySelectorAll('.a-tab').forEach(tab=>{
  tab.onclick = ()=>{
    document.querySelectorAll('.a-tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    const t = tab.dataset.tab;
    document.getElementById('reg-form').classList.toggle('hidden', t!=='reg');
    document.getElementById('login-form').classList.toggle('hidden', t!=='login');
  };
});

document.querySelectorAll('.itag').forEach(t=>t.onclick=()=>t.classList.toggle('sel'));

// ── STEP INDICATOR ──
function setRegStep(step){
  [1,2,3].forEach(n=>{
    const el=document.getElementById('rstep'+n);
    if(!el) return;
    el.classList.remove('active','done');
    if(n < step) el.classList.add('done');
    if(n === step) el.classList.add('active');
  });
  document.querySelectorAll('.reg-step-line').forEach((l,i)=>{
    l.classList.toggle('done', i+1 < step);
  });
}

// REGISTER — Step 1: Email + Password → Send OTP
document.getElementById('regBtn').onclick = async ()=>{
  const email = document.getElementById('reg-email').value.trim();
  const pass  = document.getElementById('reg-pass').value;
  const pass2 = document.getElementById('reg-pass2').value;
  if(!email||!pass){ toast('Please enter email and password','err'); return; }
  if(pass.length<6){ toast('Password must be at least 6 characters','err'); return; }
  if(pass !== pass2){ toast('Passwords do not match','err'); return; }

  const btn = document.getElementById('regBtn');
  btn.disabled=true; btn.textContent='Sending code... 📧';

  if(!S.fbReady){
    S.twoFA = { pendingEmail:email, pendingPass:pass, isLogin:false, otp:'DEMO01', otpExpiry:Date.now()+600000 };
    setRegStep(2);
    showOTPScreen(email);
    btn.disabled=false; btn.textContent='Send Verification Code 📧';
    return;
  }

  try{
    const otp = generateOTP();
    S.twoFA = { pendingEmail:email, pendingPass:pass,
      otp, otpExpiry: Date.now()+10*60*1000, isLogin:false };
    await sendOTPEmail(email, email.split('@')[0], otp);
    toast('Code sent! Check your email 📧');
    setRegStep(2);
    showOTPScreen(email);
  } catch(e){
    console.error('OTP error:', e);
    toast('Failed to send code: '+e.message,'err');
  }
  btn.disabled=false; btn.textContent='Send Verification Code 📧';
};

// REGISTER — Step 3: Profile setup (called after OTP verified)
window.initProfileStep = ()=>{
  setRegStep(3);
  document.getElementById('reg-step1').classList.add('hidden');
  document.getElementById('reg-step3').classList.remove('hidden');
  document.querySelectorAll('.itag').forEach(t=>t.onclick=()=>t.classList.toggle('sel'));
};

document.getElementById('completeProfileBtn').onclick = async ()=>{
  const name = document.getElementById('reg-name').value.trim();
  const bio  = document.getElementById('reg-bio').value.trim();
  const interests = [...document.querySelectorAll('.itag.sel')].map(t=>t.textContent);
  if(!name||!bio){ toast('Please fill in name and bio','err'); return; }

  const btn = document.getElementById('completeProfileBtn');
  btn.disabled=true; btn.textContent='Creating profile...';

  if(!S.fbReady){
    S.profile = { uid:'demo_'+Date.now(), name, email:S.twoFA.pendingEmail, bio, interests,
      handle:'@'+name.toLowerCase().replace(/\s+/g,'.'), online:true };
    S.user = { uid: S.profile.uid };
    toast('Welcome to VOXLO! 🎉');
    setTimeout(()=>initApp(),400);
    return;
  }

  try{
    const cred = await createUserWithEmailAndPassword(S.auth, S.twoFA.pendingEmail, S.twoFA.pendingPass);
    await updateProfile(cred.user, { displayName: name });
    const profile = {
      uid: cred.user.uid, name, email: S.twoFA.pendingEmail, bio,
      interests: interests.length ? interests : ['Vibes'],
      handle: '@'+name.toLowerCase().replace(/\s+/g,'.'),
      online: true, createdAt: serverTimestamp(), lastSeen: serverTimestamp()
    };
    await setDoc(doc(S.db,'users',cred.user.uid), profile);
    S.profile = profile;
    toast('Welcome to VOXLO! 🎉');
  } catch(e){
    toast(e.message,'err');
    btn.disabled=false; btn.textContent='Create My Profile ✦';
  }
};

// LOGIN
document.getElementById('loginBtn').onclick = async ()=>{
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-pass').value;
  if(!email||!pass){ toast('Enter email and password','err'); return; }

  const btn = document.getElementById('loginBtn');
  btn.disabled=true; btn.textContent='Signing in...';

  if(!S.fbReady){
    // DEMO MODE
    S.profile = { uid:'demo_me', name:'Shubham Jaggi', email, bio:'CRM & PRM Integration specialist @ Mindmatrix. Building VOXLO 🚀', interests:['Tech','Coding','CRM'], handle:'@shubham.jaggi', online:true };
    S.user = { uid: S.profile.uid };
    toast('Welcome back! 👋 (Demo mode)');
    setTimeout(()=>initApp(),400);
    btn.disabled=false; btn.textContent='Sign In to VOXLO ✦';
    return;
  }

  try{
    // First verify credentials are correct by signing in temporarily
    const cred = await signInWithEmailAndPassword(S.auth, email, pass);
    // Immediately sign out — we still need OTP verification
    await signOut(S.auth);

    // Send OTP
    const otp = generateOTP();
    const name = cred.user.displayName || email.split('@')[0];
    S.twoFA = { pendingEmail:email, pendingPass:pass, pendingName:name,
      otp, otpExpiry: Date.now() + 10*60*1000, isLogin:true };
    await sendOTPEmail(email, name, otp);
    toast('Verification code sent to '+email+' 📧');
    showOTPScreen(email);
  } catch(e){
    console.error('Login error:', e);
    toast(e.message,'err');
  }
  btn.disabled=false; btn.textContent='Sign In to VOXLO ✦';
};

// ══════════════════════════════
//  OTP SCREEN
// ══════════════════════════════
function showOTPScreen(email){
  // Update OTP modal content
  document.getElementById('otpEmail').textContent = email;
  document.getElementById('otpInput').value = '';
  document.getElementById('otpError').textContent = '';
  document.getElementById('otpModal').classList.add('active');
  // Focus first input
  setTimeout(()=> document.getElementById('otpInput').focus(), 100);
  // Start countdown timer
  startOTPTimer();
}

function startOTPTimer(){
  clearInterval(S.twoFA.timerInterval);
  let secs = 600; // 10 mins
  const el = document.getElementById('otpTimer');
  S.twoFA.timerInterval = setInterval(()=>{
    secs--;
    const m = Math.floor(secs/60).toString().padStart(2,'0');
    const s = (secs%60).toString().padStart(2,'0');
    if(el) el.textContent = m+':'+s;
    if(secs <= 0){
      clearInterval(S.twoFA.timerInterval);
      if(el) el.textContent = 'Expired';
      toast('Code expired. Please try again.','err');
      document.getElementById('otpModal').classList.remove('active');
    }
  }, 1000);
}

async function verifyOTP(){
  const entered = document.getElementById('otpInput').value.trim().toUpperCase();
  const errEl = document.getElementById('otpError');
  const btn = document.getElementById('otpVerifyBtn');

  if(entered.length !== 6){ errEl.textContent = 'Enter the 6-character code'; return; }
  if(Date.now() > S.twoFA.otpExpiry){ errEl.textContent = 'Code expired. Please try again.'; return; }
  if(entered !== S.twoFA.otp){ 
    errEl.textContent = 'Incorrect code. Please try again.';
    document.getElementById('otpInput').value = '';
    document.getElementById('otpInput').focus();
    // Shake animation
    document.getElementById('otpInput').classList.add('shake');
    setTimeout(()=>document.getElementById('otpInput').classList.remove('shake'), 500);
    return;
  }

  // OTP correct!
  btn.disabled=true; btn.textContent='Verified! ✓';
  clearInterval(S.twoFA.timerInterval);

  if(S.twoFA.isLogin){
    // Login flow — sign in for real now
    try{
      await signInWithEmailAndPassword(S.auth, S.twoFA.pendingEmail, S.twoFA.pendingPass);
      toast('Welcome back! 👋');
      document.getElementById('otpModal').classList.remove('active');
    } catch(e){
      console.error('Login error:', e);
      errEl.textContent = e.message;
      btn.disabled=false; btn.textContent='Verify Code ✦';
    }
  } else {
    // Register flow — email verified, now show profile setup (Step 3)
    document.getElementById('otpModal').classList.remove('active');
    toast('Email verified! ✅ Now set up your profile.');
    initProfileStep();
  }
}

async function resendOTP(){
  const btn = document.getElementById('otpResendBtn');
  btn.disabled=true; btn.textContent='Sending...';
  try{
    const otp = generateOTP();
    S.twoFA.otp = otp;
    S.twoFA.otpExpiry = Date.now() + 10*60*1000;
    await sendOTPEmail(S.twoFA.pendingEmail, S.twoFA.pendingName, otp);
    toast('New code sent! 📧');
    document.getElementById('otpError').textContent = '';
    document.getElementById('otpInput').value = '';
    startOTPTimer();
  } catch(e){
    toast('Failed to resend: '+e.message,'err');
  }
  btn.disabled=false; btn.textContent='Resend Code';
}

// ══════════════════════════════
//  APP INIT
// ══════════════════════════════
function initApp(){
  showPage('pg-app');
  updateSidebarProfile();
  loadUsers();
  renderDiscover();
  initChatInput();
  initNav();
  showDiscover();
  if(S.fbReady) setOnlineStatus(true);
}

function updateSidebarProfile(){
  if(!S.profile) return;
  document.getElementById('sbName').textContent = S.profile.name;
  document.getElementById('sbHandle').textContent = S.profile.handle || '@voxlo';
  const av = document.getElementById('sbAvatar');
  av.className = `av av-sm ${avColor(S.profile.uid)}`;
  av.textContent = initials(S.profile.name);
}

// ── PRESENCE ──
async function setOnlineStatus(online){
  if(!S.fbReady||!S.user) return;
  await updateDoc(doc(S.db,'users',S.user.uid),{ online, lastSeen: serverTimestamp() }).catch(()=>{});
}

window.addEventListener('beforeunload',()=>setOnlineStatus(false));

// ══════════════════════════════
//  NAV
// ══════════════════════════════
function initNav(){
  document.querySelectorAll('.nav-pill').forEach(p=>{
    p.onclick=()=>{
      document.querySelectorAll('.nav-pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
      p.dataset.view==='discover' ? showDiscover() : showChatListView();
    };
  });
  document.getElementById('btnDiscover').onclick=()=>{
    document.querySelectorAll('.nav-pill').forEach(x=>x.classList.remove('active'));
    document.querySelector('[data-view="discover"]').classList.add('active');
    showDiscover();
  };
  document.querySelectorAll('.fchip').forEach(c=>{
    c.onclick=()=>{
      document.querySelectorAll('.fchip').forEach(x=>x.classList.remove('active'));
      c.classList.add('active');
      renderDiscover(c.dataset.filter);
    };
  });
  document.getElementById('btnSettings').onclick=openSettings;
  document.getElementById('btnLogout').onclick=logout;
  document.getElementById('btnViewProf').onclick=toggleProfPanel;
  document.getElementById('btnCloseProf').onclick=()=>document.getElementById('profPanel').classList.remove('active');
  document.getElementById('closeSettings').onclick=()=>document.getElementById('settingsModal').classList.remove('active');
  document.getElementById('saveSettings').onclick=saveSettings;
  document.getElementById('closeFbSetup').onclick=()=>document.getElementById('fbSetupModal').classList.remove('active');
  document.getElementById('saveFbConfig').onclick=saveFbConfig;
  document.getElementById('chatSearch').addEventListener('input',e=>{
    const q=e.target.value.toLowerCase();
    document.querySelectorAll('.chat-item').forEach(i=>{
      i.style.display=i.querySelector('.cn').textContent.toLowerCase().includes(q)?'':'none';
    });
  });
}

function showDiscover(){
  document.getElementById('discPanel').classList.remove('hidden');
  document.getElementById('chatPanel').classList.remove('active');
  document.querySelectorAll('.chat-item').forEach(i=>i.classList.remove('active'));
  S.chatId=null;
  if(S.unsubMsgs){ S.unsubMsgs(); S.unsubMsgs=null; }
}

function showChatListView(){
  document.getElementById('discPanel').classList.add('hidden');
}

async function logout(){
  if(S.fbReady) await setOnlineStatus(false);
  if(S.fbReady) await signOut(S.auth).catch(()=>{});
  S.user=null; S.profile=null; S.chatId=null;
  if(S.unsubMsgs){S.unsubMsgs();S.unsubMsgs=null;}
  toast('Logged out. See you soon! 👋');
  setTimeout(()=>showPage('pg-land'),600);
}

// ══════════════════════════════
//  LOAD USERS (Firestore)
// ══════════════════════════════
let allUsers = [];

async function loadUsers(){
  if(!S.fbReady){
    // Demo users
    allUsers = DEMO_USERS;
    renderChatList();
    document.getElementById('onlineCount').textContent = '3 people online';
    return;
  }
  try{
    const q = query(collection(S.db,'users'), limit(50));
    // Real-time listener for user list
    if(S.unsubUsers) S.unsubUsers();
    S.unsubUsers = onSnapshot(q, snap=>{
      allUsers = [];
      let online = 0;
      snap.forEach(d=>{
        const u = d.data();
        if(u.uid !== S.user?.uid){ allUsers.push(u); if(u.online) online++; }
      });
      document.getElementById('onlineCount').textContent = `${online} people online`;
      renderDiscover();
      renderChatList();
    });
  } catch(e){
    console.error('Load users error:',e);
    allUsers = DEMO_USERS;
    renderChatList();
  }
}

// ══════════════════════════════
//  DISCOVER
// ══════════════════════════════
function renderDiscover(filter='all'){
  const grid = document.getElementById('discGrid');
  grid.innerHTML='';
  let users = filter==='all' ? [...allUsers] : allUsers.filter(u=>u.interests?.some(i=>i.toLowerCase().includes(filter)));
  if(!users.length){
    grid.innerHTML='<div class="empty"><div class="empty-ico">👥</div><h3>No users found</h3><p>Be the first in this category!</p></div>';
    return;
  }
  users.forEach((u,idx)=>{
    const av = avColor(u.uid);
    const card=document.createElement('div');
    card.className='pcard';
    card.style.cssText=`animation:fiu .4s ease forwards;animation-delay:${idx*.05}s;opacity:0`;
    const matchScore = calcMatch(u);
    card.innerHTML=`
      <div class="card-hd">
        <div class="av ${av}" style="position:relative">${initials(u.name)}${u.online?'<div class="ondot"></div>':''}</div>
        <div><div class="card-nm">${esc(u.name)}</div><div class="card-loc">📍 ${esc(u.location||'Earth')}</div></div>
      </div>
      <div class="card-bio">${esc(u.bio||'')}</div>
      <div class="tags">${(u.interests||[]).map((t,i)=>`<span class="tag ${tagColor(i)}">${esc(t)}</span>`).join('')}</div>
      <div class="card-ft">
        <div class="match">⚡ ${matchScore}% match</div>
        <button class="btn-conn" onclick="startChat('${u.uid}',event)">Connect</button>
      </div>`;
    card.onclick=()=>openChat(u.uid);
    grid.appendChild(card);
  });
}

function calcMatch(user){
  if(!S.profile?.interests) return Math.floor(70+Math.random()*25);
  const mine = S.profile.interests.map(i=>i.toLowerCase());
  const theirs = (user.interests||[]).map(i=>i.toLowerCase());
  const common = mine.filter(i=>theirs.includes(i)).length;
  const base = Math.min(common*15, 40);
  return Math.min(99, 60 + base + Math.floor(Math.random()*15));
}

// ══════════════════════════════
//  CHAT LIST
// ══════════════════════════════
function renderChatList(){
  const list=document.getElementById('chatList');
  list.innerHTML='';
  const users = allUsers.slice(0,8);
  if(!users.length){
    list.innerHTML='<div style="padding:20px;text-align:center;color:var(--t3);font-size:13px">No chats yet.<br>Discover people to start!</div>';
    return;
  }
  users.forEach(u=>{
    const av=avColor(u.uid);
    const item=document.createElement('div');
    item.className='chat-item';
    item.dataset.uid=u.uid;
    item.innerHTML=`
      <div class="av ${av}" style="position:relative">${initials(u.name)}${u.online?'<div class="ondot"></div>':''}</div>
      <div class="ci">
        <div class="cn">${esc(u.name)}</div>
        <div class="cp">${u.online?'🟢 Online':'Last seen recently'}</div>
      </div>
      <div class="cm"><div class="ct">${u.online?'now':''}</div></div>`;
    item.onclick=()=>openChat(u.uid);
    list.appendChild(item);
  });
}

// ══════════════════════════════
//  OPEN CHAT
// ══════════════════════════════
window.startChat = (uid,e)=>{ if(e) e.stopPropagation(); openChat(uid); };

async function openChat(uid){
  S.chatId = uid;
  const user = allUsers.find(u=>u.uid===uid) || DEMO_USERS.find(u=>u.uid===uid);
  if(!user) return;
  S.chatUser = user;

  // UI
  document.getElementById('discPanel').classList.add('hidden');
  document.getElementById('chatPanel').classList.add('active');
  document.querySelectorAll('.chat-item').forEach(i=>i.classList.toggle('active',i.dataset.uid===uid));

  const av=avColor(uid);
  const chAv=document.getElementById('chAv');
  chAv.className=`av ${av}`;
  chAv.textContent=initials(user.name);
  document.getElementById('chName').textContent=user.name;
  document.getElementById('chStatus').textContent=user.online?'🟢 Online now':'⚪ Last seen recently';
  updateProfPanel(user);

  // Messages
  if(S.unsubMsgs){S.unsubMsgs();S.unsubMsgs=null;}

  if(!S.fbReady){
    // Demo messages
    renderDemoMessages(uid);
    return;
  }

  // Firestore chat ID (sorted UIDs for consistency)
  const chatRoomId = [S.user.uid, uid].sort().join('_');
  const msgsRef = collection(S.db,'chats',chatRoomId,'messages');
  const q = query(msgsRef, orderBy('createdAt','asc'));

  const container=document.getElementById('msgsContainer');
  container.innerHTML='<div style="text-align:center;padding:20px;color:var(--t3);font-size:12px">Loading messages...</div>';

  S.unsubMsgs = onSnapshot(q, snap=>{
    container.innerHTML='';
    if(snap.empty){
      container.innerHTML=`<div class="empty"><div class="empty-ico">💬</div><h3>Start the conversation</h3><p>Say hey to ${esc(user.name)}!</p></div>`;
      return;
    }
    let lastDate='';
    snap.forEach(d=>{
      const msg=d.data();
      const dateStr = msg.createdAt?.toDate ? msg.createdAt.toDate().toDateString() : 'Today';
      if(dateStr!==lastDate){
        lastDate=dateStr;
        const div=document.createElement('div');
        div.className='ddiv';
        div.innerHTML=`<span>${dateStr==='Today'||dateStr===new Date().toDateString()?'Today':dateStr}</span>`;
        container.appendChild(div);
      }
      appendMessage(msg, container);
    });
    container.scrollTop=container.scrollHeight;
  });
}

function appendMessage(msg, container){
  const isSent = msg.senderId === (S.user?.uid || S.profile?.uid);
  const group=document.createElement('div');
  group.className=`mg ${isSent?'sent':'recv'}`;
  if(msg.type==='image'){
    group.innerHTML=`
      <div class="msg-img" onclick="openLightbox('${msg.imageUrl}')">
        <img src="${msg.imageUrl}" alt="Photo" loading="lazy"/>
      </div>
      <div class="mt">${fmtTime(msg.createdAt)}</div>`;
  } else {
    group.innerHTML=`<div class="mb">${esc(msg.text)}</div><div class="mt">${fmtTime(msg.createdAt)}</div>`;
  }
  container.appendChild(group);
}

// ══════════════════════════════
//  SEND MESSAGE
// ══════════════════════════════
async function sendMsg(text, images=[]){
  if(!S.chatId) return;
  const uid = S.chatId;
  const myUid = S.user?.uid || S.profile?.uid;
  const time = new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});

  if(!S.fbReady){
    // Demo mode
    if(!DEMO_MSGS[uid]) DEMO_MSGS[uid]=[];
    if(text.trim()) DEMO_MSGS[uid].push({senderId:'me',text:text.trim(),createdAt:new Date(),type:'text'});
    images.forEach(url=>DEMO_MSGS[uid].push({senderId:'me',imageUrl:url,createdAt:new Date(),type:'image'}));
    renderDemoMessages(uid);
    simulateReply(uid);
    return;
  }

  const chatRoomId=[myUid,uid].sort().join('_');
  const msgsRef=collection(S.db,'chats',chatRoomId,'messages');

  try{
    if(text.trim()){
      await addDoc(msgsRef,{ senderId:myUid, text:text.trim(), type:'text', createdAt:serverTimestamp() });
    }
    for(const imgData of images){
      const url = await uploadImage(imgData);
      if(url) await addDoc(msgsRef,{ senderId:myUid, imageUrl:url, type:'image', createdAt:serverTimestamp() });
    }
  } catch(e){ toast('Failed to send: '+e.message,'err'); }
}

// ── CONVERT BASE64 DATA URL → BLOB (reliable, no fetch needed) ──
function dataUrlToBlob(dataUrl){
  const [header, data] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)[1];
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for(let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// ── UPLOAD PROGRESS UI ──
function showUploadUI(){ document.getElementById('uploadProg').classList.add('active'); }
function hideUploadUI(){ 
  document.getElementById('uploadProg').classList.remove('active');
  document.getElementById('uploadFill').style.width = '0%';
  document.getElementById('uploadPct').textContent = '0%';
}
function setUploadProgress(pct){
  document.getElementById('uploadFill').style.width = pct + '%';
  document.getElementById('uploadPct').textContent = pct + '%';
  document.getElementById('uploadLabel').textContent = pct < 100 ? 'Uploading photo...' : 'Processing...';
}

// ── IMAGE UPLOAD ──
// Compresses image and stores as base64 in Firestore directly.
// No Firebase Storage needed — works instantly, no CORS/rules issues.
async function uploadImage(dataUrl, chatId){
  showUploadUI();
  try{
    // Compress image using canvas before storing
    const compressed = await compressImage(dataUrl, 800, 0.75);
    // Simulate a quick progress animation so it feels real
    for(let p = 10; p <= 90; p += 20){
      setUploadProgress(p);
      await new Promise(r => setTimeout(r, 60));
    }
    setUploadProgress(100);
    await new Promise(r => setTimeout(r, 200));
    hideUploadUI();
    return compressed;
  } catch(e){
    hideUploadUI();
    console.error('Image processing error:', e);
    return dataUrl;
  }
}

// ── COMPRESS IMAGE USING CANVAS ──
function compressImage(dataUrl, maxWidth, quality){
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height;
      if(w > maxWidth){ h = Math.round(h * maxWidth / w); w = maxWidth; }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// ══════════════════════════════
//  CHAT INPUT
// ══════════════════════════════
function initChatInput(){
  const ta=document.getElementById('chatInput');
  ta.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSend();} });
  ta.addEventListener('input',()=>{ ta.style.height='auto'; ta.style.height=Math.min(ta.scrollHeight,110)+'px'; });
  document.getElementById('sendBtn').onclick=handleSend;
  document.getElementById('attachBtn').onclick=()=>document.getElementById('imgInput').click();
  document.getElementById('imgInput').addEventListener('change',e=>{
    Array.from(e.target.files).forEach(file=>{
      const r=new FileReader();
      r.onload=ev=>{ S.pendingImgs.push(ev.target.result); renderPreviews(); };
      r.readAsDataURL(file);
    });
    e.target.value='';
  });
}

function handleSend(){
  const ta=document.getElementById('chatInput');
  const text=ta.value;
  if(!text.trim()&&!S.pendingImgs.length) return;
  if(!S.chatId){toast('Select a chat first!','err');return;}
  sendMsg(text,[...S.pendingImgs]);
  ta.value=''; ta.style.height='auto';
  S.pendingImgs=[]; renderPreviews();
}

function renderPreviews(){
  const strip=document.getElementById('imgPrevStrip');
  strip.innerHTML='';
  S.pendingImgs.forEach((img,i)=>{
    const t=document.createElement('div');
    t.className='prev-thumb';
    t.innerHTML=`<img src="${img}"/><button class="prev-rm" onclick="removePreview(${i})">✕</button>`;
    strip.appendChild(t);
  });
}
window.removePreview=i=>{ S.pendingImgs.splice(i,1); renderPreviews(); };

// ══════════════════════════════
//  PROFILE PANEL
// ══════════════════════════════
function toggleProfPanel(){ document.getElementById('profPanel').classList.toggle('active'); }

function updateProfPanel(u){
  const av=avColor(u.uid);
  document.getElementById('ppAv').className=`av av-lg ${av}`;
  document.getElementById('ppAv').textContent=initials(u.name);
  document.getElementById('ppName').textContent=u.name;
  document.getElementById('ppHandle').textContent=u.handle||'@user';
  document.getElementById('ppBio').textContent=u.bio||'';
  document.getElementById('ppLoc').textContent='📍 '+(u.location||'Earth');
  document.getElementById('ppTags').innerHTML=(u.interests||[]).map((t,i)=>`<span class="tag ${tagColor(i)}">${esc(t)}</span>`).join('');
  document.getElementById('ppMatch').textContent=`⚡ ${calcMatch(u)}% match with you`;
}

// ══════════════════════════════
//  SETTINGS
// ══════════════════════════════
function openSettings(){
  if(S.profile){
    document.getElementById('set-name').value=S.profile.name||'';
    document.getElementById('set-bio').value=S.profile.bio||'';
  }
  document.getElementById('settingsModal').classList.add('active');
}

async function saveSettings(){
  const name=document.getElementById('set-name').value.trim();
  const bio=document.getElementById('set-bio').value.trim();
  if(!name){toast('Name cannot be empty','err');return;}
  S.profile.name=name; S.profile.bio=bio;
  S.profile.handle='@'+name.toLowerCase().replace(/\s/g,'.');
  if(S.fbReady&&S.user){
    await updateDoc(doc(S.db,'users',S.user.uid),{name,bio,handle:S.profile.handle}).catch(e=>console.error(e));
  }
  updateSidebarProfile();
  document.getElementById('settingsModal').classList.remove('active');
  toast('Profile updated! ✓');
}

// ══════════════════════════════
//  FIREBASE SETUP
// ══════════════════════════════
window.showFbHelp=()=>document.getElementById('fbSetupModal').classList.add('active');

async function saveFbConfig(){
  const raw=document.getElementById('fbConfigInput').value.trim();
  try{
    const config=JSON.parse(raw);
    if(!config.apiKey||!config.projectId) throw new Error('Missing required fields');
    localStorage.setItem('voxlo_fb_config',JSON.stringify(config));
    const ok=initFirebase(config);
    if(ok){
      document.getElementById('fbSetupModal').classList.remove('active');
      toast('Firebase connected! 🔥 Please sign in again.');
      setupAuthListener();
      setTimeout(()=>showPage('pg-auth'),1000);
    } else { toast('Firebase init failed. Check your config.','err'); }
  } catch(e){ toast('Invalid JSON: '+e.message,'err'); }
}

// ══════════════════════════════
//  LIGHTBOX
// ══════════════════════════════
window.openLightbox=src=>{ document.getElementById('lbImg').src=src; document.getElementById('lightbox').classList.add('active'); };

// ══════════════════════════════
//  DEMO MODE DATA & MESSAGES
// ══════════════════════════════
const DEMO_USERS = [
  {uid:'du1',name:'Aanya Sharma',handle:'@aanya.s',bio:'Designer by day, dreamer by night. Typography, lo-fi beats, and midnight chai. Looking for deep conversations ✨',interests:['Design','Music','Books'],location:'Mumbai, IN',online:true},
  {uid:'du2',name:'Rohan Dev',handle:'@rohan.dev',bio:'Full stack developer. JavaScript, sarcasm, and occasionally touching grass 🌿',interests:['Coding','Gaming','Music'],location:'Bangalore, IN',online:true},
  {uid:'du3',name:'Zara Khan',handle:'@zarakhan',bio:'Poet with a camera. Film photography fanatic. Manifesting my solo trip to Japan 🗾',interests:['Photography','Poetry','Travel'],location:'Delhi, IN',online:false},
  {uid:'du4',name:'Kabir Mehta',handle:'@kabir.m',bio:'Economics student. Hot takes about markets, cold takes about life. I explain inflation in memes.',interests:['Finance','Memes','Reading'],location:'Pune, IN',online:true},
  {uid:'du5',name:'Priya Nair',handle:'@priya.creates',bio:'Content creator who actually touches grass. Mental health, slow living, and why we all need more rest 🌸',interests:['Mental Health','Yoga','Cooking'],location:'Chennai, IN',online:true},
];

const DEMO_MSGS = {
  'du1':[
    {senderId:'du1',text:'omg hey!! finally someone who gets it 😭',createdAt:new Date(Date.now()-3600000),type:'text'},
    {senderId:'me',text:'RIGHT?? like this app actually lets us vibe without being judged on looks lol',createdAt:new Date(Date.now()-3500000),type:'text'},
    {senderId:'du1',text:'exactly!! btw CRM integrations sounds so interesting?? i do ui/ux and we could have a whole convo about user flows',createdAt:new Date(Date.now()-3400000),type:'text'},
    {senderId:'me',text:'yooo yes! user flows in CRM are a nightmare sometimes 😅 but so satisfying when they work',createdAt:new Date(Date.now()-3300000),type:'text'},
  ],
  'du2':[
    {senderId:'du2',text:'bro you built a claims management system?? thats actually insane',createdAt:new Date(Date.now()-86400000),type:'text'},
    {senderId:'me',text:'haha yeah! used AI to help build it but learned a ton in the process',createdAt:new Date(Date.now()-86300000),type:'text'},
    {senderId:'du2',text:'thats literally how i started too. ai assisted coding is the future no cap',createdAt:new Date(Date.now()-86200000),type:'text'},
  ],
};

function renderDemoMessages(uid){
  const container=document.getElementById('msgsContainer');
  container.innerHTML='';
  const msgs=DEMO_MSGS[uid]||[];
  if(!msgs.length){
    container.innerHTML=`<div class="empty"><div class="empty-ico">💬</div><h3>Start the conversation</h3><p>Say something!</p></div>`;
    return;
  }
  const ddiv=document.createElement('div');
  ddiv.className='ddiv'; ddiv.innerHTML='<span>Today</span>';
  container.appendChild(ddiv);
  msgs.forEach(m=>appendMessage(m,container));
  container.scrollTop=container.scrollHeight;
}

function simulateReply(uid){
  const container=document.getElementById('msgsContainer');
  setTimeout(()=>{
    const tg=document.createElement('div');
    tg.className='mg recv'; tg.id='typingInd';
    tg.innerHTML='<div class="typing"><div class="td"></div><div class="td"></div><div class="td"></div></div>';
    container.appendChild(tg); container.scrollTop=container.scrollHeight;
  },700);
  setTimeout(()=>{
    const el=document.getElementById('typingInd');
    if(el) el.remove();
    const replies=['omg yes exactly!! 😭','hahaha no way 💀','okay but why is this so relatable','we literally have the same brain cell','okay you get it fr fr 🔥','wait that\'s actually wild'];
    const reply=replies[Math.floor(Math.random()*replies.length)];
    if(!DEMO_MSGS[uid]) DEMO_MSGS[uid]=[];
    DEMO_MSGS[uid].push({senderId:uid,text:reply,createdAt:new Date(),type:'text'});
    renderDemoMessages(uid);
  },2400);
}

// ══════════════════════════════
//  BOOT
// ══════════════════════════════
window.addEventListener('DOMContentLoaded',()=>{
  if(S.fbReady){
    setLoaderMsg('Connecting...');
    setupAuthListener();
    // Safety fallback — if Firebase takes too long, stop waiting
    setTimeout(()=>{
      const loader = document.getElementById('loader');
      if(loader && loader.style.display !== 'none' && !loader.classList.contains('fade-out')){
        hideLoader();
        showPage('pg-land');
      }
    }, 6000);
  } else {
    setLoaderMsg('Starting...');
    setTimeout(()=>{
      hideLoader();
      showPage('pg-land');
    }, 900);
  }
});