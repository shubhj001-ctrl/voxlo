// ══════════════════════════════════════════════
//  VOXLO — Firebase Real-time App
//  Full integration: Auth + Firestore + Storage
// ══════════════════════════════════════════════

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, fetchSignInMethodsForEmail } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, addDoc, deleteDoc, query, orderBy, onSnapshot, serverTimestamp, updateDoc, arrayUnion, where, limit } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
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

let emailjsReady = false;

async function loadEmailJS(){
  if(emailjsReady) return;
  if(!window.emailjs){
    await new Promise((res, rej) => {
      // Check if script already added
      if(document.querySelector('script[src*="emailjs"]')){ 
        const wait = setInterval(()=>{ if(window.emailjs){ clearInterval(wait); res(); } }, 50);
        return;
      }
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
      s.onload = res;
      s.onerror = () => rej(new Error('Failed to load EmailJS SDK'));
      document.head.appendChild(s);
    });
  }
  window.emailjs.init(EMAILJS_PUBLIC_KEY);
  emailjsReady = true;
}

async function sendOTPEmail(email, name, otp){
  try{
    await loadEmailJS();
    const result = await window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      email:    email,
      passcode: otp,
      time:     new Date(Date.now() + 10*60*1000).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
    });
    console.log('EmailJS success:', result);
    return result;
  } catch(e){
    console.error('EmailJS full error:', JSON.stringify(e), e);
    throw new Error(e?.text || e?.message || JSON.stringify(e) || 'Email sending failed');
  }
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
          // ── Locked account check ──
          if(S.profile.locked){
            await signOut(S.auth);
            hideLoader();
            showPage('pg-auth');
            switchToLogin();
            setTimeout(()=> toast('🔒 Your account has been locked. Contact support.','err'), 400);
            return;
          }
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
document.getElementById('btnSignIn').onclick = ()=>{ showPage('pg-auth'); switchToLogin(); };

// ══════════════════════════════
//  AUTH
// ══════════════════════════════
// ── JOURNEY SLIDE SYSTEM ──
let currentSlide = 1;

window.goToSlide = function goToSlide(n, goingBack=false){
  const prev = document.getElementById('jslide'+currentSlide);
  if(prev){ prev.classList.remove('active','back-anim'); }
  currentSlide = n;
  const next = document.getElementById('jslide'+n);
  if(next){
    if(goingBack) next.classList.add('back-anim');
    else next.classList.remove('back-anim');
    next.classList.add('active');
    setTimeout(()=>{ const inp=next.querySelector('input,select,textarea'); if(inp) inp.focus(); },120);
  }
  // Update progress dots
  for(let i=1;i<=5;i++){
    const dot=document.getElementById('jp'+i);
    if(!dot) continue;
    dot.classList.remove('active','done');
    if(i<n) dot.classList.add('done');
    if(i===n) dot.classList.add('active');
  }
  for(let i=1;i<5;i++){
    const line=document.getElementById('jl'+i);
    if(line) line.classList.toggle('done', i<n);
  }
}

window.switchToLogin = ()=>{
  document.getElementById('loginPanel').classList.remove('hidden');
  document.getElementById('journeyWrap').classList.add('hidden');
};

window.switchToReg = ()=>{
  document.getElementById('loginPanel').classList.add('hidden');
  document.getElementById('journeyWrap').classList.remove('hidden');
  goToSlide(1);
};

// ══ JOURNEY REGISTRATION FLOW ══
// All button listeners moved inside DOMContentLoaded to ensure elements exist
function initJourneyListeners(){
  document.querySelectorAll('.itag').forEach(t=>t.onclick=()=>t.classList.toggle('sel'));

  // Slide 1 → 2: Name
  document.getElementById('jbtn1').onclick = ()=>{
  const name = document.getElementById('reg-name').value.trim();
  if(!name){ toast('Enter your name to continue','err'); return; }
  // Personalise slide 2 title
  document.getElementById('slide2Title').textContent = `Hey ${name.split(' ')[0]}, let's verify you 🔐`;
  goToSlide(2);
};
document.getElementById('jback2').onclick = ()=> goToSlide(1, true);

// ── Real-time email check on blur ──
let emailCheckState = 'idle'; // idle | checking | ok | taken
document.getElementById('reg-email').addEventListener('blur', async ()=>{
  const email = document.getElementById('reg-email').value.trim();
  if(!email || !email.includes('@')) return;
  if(!S.fbReady){ emailCheckState='ok'; return; }
  runEmailCheck(email);
});
// Also re-check if they edit the field
document.getElementById('reg-email').addEventListener('input', ()=>{
  emailCheckState = 'idle';
  clearEmailStatus();
});

async function runEmailCheck(email){
  emailCheckState = 'checking';
  setEmailStatus('checking');
  try{
    const methods = await fetchSignInMethodsForEmail(S.auth, email);
    if(methods && methods.length > 0){
      emailCheckState = 'taken';
      setEmailStatus('taken', email);
    } else {
      emailCheckState = 'ok';
      setEmailStatus('ok');
    }
  } catch(e){
    emailCheckState = 'idle';
    clearEmailStatus();
  }
}

function clearEmailStatus(){
  const el = document.getElementById('emailStatusMsg');
  if(el) el.remove();
  const inp = document.getElementById('reg-email');
  inp.style.borderColor = '';
}

function setEmailStatus(state, email=''){
  clearEmailStatus();
  const inp = document.getElementById('reg-email');
  const msg = document.createElement('div');
  msg.id = 'emailStatusMsg';

  if(state === 'checking'){
    inp.style.borderColor = 'var(--p)';
    msg.className = 'email-status checking';
    msg.innerHTML = `<span class="es-spinner"></span><span>Checking availability...</span>`;
  } else if(state === 'ok'){
    inp.style.borderColor = 'var(--g)';
    msg.className = 'email-status ok';
    msg.innerHTML = `<span>✓</span><span>Looks good! Set your password below.</span>`;
  } else if(state === 'taken'){
    inp.style.borderColor = 'var(--pk)';
    msg.className = 'email-status taken';
    msg.innerHTML = `<span>⚠️</span><span><strong>${email}</strong> already has an account. <button class="es-login-btn" id="esLoginBtn">Sign in instead →</button></span>`;
  }

  inp.after(msg);

  if(state === 'taken'){
    document.getElementById('esLoginBtn').onclick = ()=>{
      clearEmailStatus();
      switchToLogin();
      setTimeout(()=>{ document.getElementById('login-email').value = email; }, 100);
    };
  }
}

// Slide 2: Send OTP
document.getElementById('regBtn').onclick = async ()=>{
  const email = document.getElementById('reg-email').value.trim();
  const pass  = document.getElementById('reg-pass').value;
  const pass2 = document.getElementById('reg-pass2').value;
  if(!email||!pass){ toast('Please enter email and password','err'); return; }
  if(pass.length<6){ toast('Password must be at least 6 characters','err'); return; }
  if(pass !== pass2){ toast('Passwords do not match','err'); return; }

  // Block if email is taken
  if(emailCheckState === 'taken'){ toast('This email is already registered. Sign in instead.','err'); return; }

  const btn = document.getElementById('regBtn');
  btn.disabled=true; btn.textContent='Sending code... 📧';

  if(!S.fbReady){
    S.twoFA = { pendingEmail:email, pendingPass:pass, isLogin:false, otp:'DEMO01', otpExpiry:Date.now()+600000 };
    showOTPScreen(email);
    btn.disabled=false; btn.textContent='Send Verification Code 📧';
    return;
  }

  try{
    // If check hasn't run yet (user skipped blur), run it now
    if(emailCheckState === 'idle' || emailCheckState === 'checking'){
      btn.textContent='Checking email... ⏳';
      const methods = await fetchSignInMethodsForEmail(S.auth, email);
      if(methods && methods.length > 0){
        emailCheckState = 'taken';
        setEmailStatus('taken', email);
        btn.disabled=false; btn.textContent='Send Verification Code 📧';
        return;
      }
      emailCheckState = 'ok';
    }

    // Email is free — send OTP
    btn.textContent='Sending code... 📧';
    const otp = generateOTP();
    S.twoFA = { pendingEmail:email, pendingPass:pass, otp, otpExpiry:Date.now()+10*60*1000, isLogin:false };
    await sendOTPEmail(email, document.getElementById('reg-name').value.trim(), otp);
    toast('Code sent! Check your email 📧');
    showOTPScreen(email);
  } catch(e){
    console.error('Registration error:', e);
    toast('Something went wrong: '+e.message,'err');
  }
  btn.disabled=false; btn.textContent='Send Verification Code 📧';
};

// After OTP verified → go to slide 3 (location)
window.initProfileStep = ()=>{
  goToSlide(3);
  document.getElementById('otpModal').classList.remove('active');
  toast('Email verified! ✅');
};

document.getElementById('jbtn3').onclick = ()=>{
  goToSlide(4);
};
document.getElementById('jback3').onclick = ()=> goToSlide(2, true);

// Slide 4: Bio — live char counter
document.getElementById('reg-bio').addEventListener('input', e=>{
  document.getElementById('bioCount').textContent = e.target.value.length;
});
document.getElementById('jbtn4').onclick = ()=>{
  const bio = document.getElementById('reg-bio').value.trim();
  if(!bio){ toast('Add a short bio to continue','err'); return; }
  goToSlide(5);
};
document.getElementById('jback4').onclick = ()=> goToSlide(3, true);
document.getElementById('jback5').onclick = ()=> goToSlide(4, true);

// Slide 5: Interests + Complete Profile
document.getElementById('completeProfileBtn').onclick = async ()=>{
  const name      = document.getElementById('reg-name').value.trim();
  const bio       = document.getElementById('reg-bio').value.trim();
  const country   = document.getElementById('reg-country').value || 'Earth';
  const interests = [...document.querySelectorAll('.itag.sel')].map(t=>t.textContent);
  if(!name||!bio){ toast('Please complete all steps','err'); return; }

  const btn = document.getElementById('completeProfileBtn');
  btn.disabled=true; btn.textContent='Creating your profile... ✨';

  if(!S.fbReady){
    S.profile = { uid:'demo_'+Date.now(), name, email:S.twoFA?.pendingEmail||'demo@voxlo.app', bio,
      interests, location:country, handle:'@'+name.toLowerCase().replace(/\s+/g,'.'), online:true };
    S.user = { uid:S.profile.uid };
    toast('Welcome to VOXLO! 🎉');
    setTimeout(()=>initApp(),500);
    return;
  }
  try{
    const cred = await createUserWithEmailAndPassword(S.auth, S.twoFA.pendingEmail, S.twoFA.pendingPass);
    await updateProfile(cred.user, { displayName: name });
    const profile = {
      uid:cred.user.uid, name, email:S.twoFA.pendingEmail, bio,
      interests: interests.length ? interests : ['Vibes'],
      location: country,
      handle:'@'+name.toLowerCase().replace(/\s+/g,'.'),
      online:true, createdAt:serverTimestamp(), lastSeen:serverTimestamp()
    };
    await setDoc(doc(S.db,'users',cred.user.uid), profile);
    S.profile = profile;
    toast('Welcome to VOXLO! 🎉');
  } catch(e){
    toast(e.message,'err');
    btn.disabled=false; btn.textContent='Create My Profile ✦';
  }
};
} // end initJourneyListeners

// LOGIN — handled in DOMContentLoaded below
async function handleLogin(){
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-pass').value;
  if(!email||!pass){ toast('Enter email and password','err'); return; }

  const btn = document.getElementById('loginBtn');
  btn.disabled=true; btn.textContent='Signing in...';

  if(!S.fbReady){
    S.profile = { uid:'demo_me', name:'Shubham Jaggi', email, bio:'CRM & PRM Integration specialist @ Mindmatrix. Building VOXLO 🚀', interests:['Tech','Coding','CRM'], handle:'@shubham.jaggi', online:true };
    S.user = { uid: S.profile.uid };
    toast('Welcome back! 👋 (Demo mode)');
    setTimeout(()=>initApp(),400);
    btn.disabled=false; btn.textContent='Sign In to VOXLO ✦';
    return;
  }

  try{
    // Direct sign in — no OTP for returning users
    await signInWithEmailAndPassword(S.auth, email, pass);
    toast('Welcome back! 👋');
    // setupAuthListener will handle the rest
  } catch(e){
    console.error('Login error:', e);
    const msg = e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password'
      ? 'Incorrect email or password' : e.message;
    toast(msg, 'err');
    btn.disabled=false; btn.textContent='Sign In to VOXLO ✦';
  }
}

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

window.verifyOTP = async function verifyOTP(){
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

window.resendOTP = async function resendOTP(){
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
  // Set Discover as active on load
  document.querySelectorAll('.sb-menu-item').forEach(x=>x.classList.remove('active'));
  document.querySelector('.sb-nav-item[data-view="discover"]')?.classList.add('active');
  showDiscover();
  if(S.fbReady){
    setOnlineStatus(true);
    loadFriendData();
    loadChattedWith();
  }
}

// Load the set of UIDs this user has actually chatted with
async function loadChattedWith(){
  if(!S.fbReady||!S.user) return;
  try{
    const snap = await getDoc(doc(S.db,'users',S.user.uid));
    if(snap.exists()){
      const data = snap.data();
      chattedWith = new Set(data.chattedWith || []);
      renderChatList();
    }
  } catch(e){ console.error('loadChattedWith error:', e); }
}

// Mark that we've chatted with a user (saves to Firestore)
async function markChattedWith(uid){
  if(!S.fbReady||!S.user||chattedWith.has(uid)) return;
  chattedWith.add(uid);
  renderChatList();
  try{
    await updateDoc(doc(S.db,'users',S.user.uid),{ chattedWith: arrayUnion(uid) });
  } catch(e){ console.error('markChattedWith error:', e); }
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
function closeSidebar(){
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('hamBtn')?.classList.remove('open');
}
function openSidebar(){
  document.getElementById('sidebar')?.classList.add('open');
  document.getElementById('hamBtn')?.classList.add('open');
}
function toggleSidebar(){
  const sb = document.getElementById('sidebar');
  if(sb?.classList.contains('open')) closeSidebar();
  else openSidebar();
}

function initNav(){
  // Hamburger
  document.getElementById('hamBtn')?.addEventListener('click', toggleSidebar);
  document.getElementById('sbOverlay')?.addEventListener('click', closeSidebar);

  // Nav menu items (Discover + Requests)
  document.querySelectorAll('.sb-nav-item').forEach(item=>{
    item.addEventListener('click',()=>{
      document.querySelectorAll('.sb-menu-item').forEach(x=>x.classList.remove('active'));
      item.classList.add('active');
      const view = item.dataset.view;
      if(view === 'discover') showDiscover();
      else if(view === 'requests') showRequestsPanel();
      closeSidebar();
    });
  });

  // Swipe action buttons
  document.getElementById('btnSkip')?.addEventListener('click',()=>{
    const stack = document.getElementById('swipeStack');
    const top = stack?.lastElementChild;
    if(!top||!swipeQueue.length) return;
    swipeSkipped.add(swipeQueue[0].uid);
    top.style.transition='transform .35s ease';
    top.style.transform='translateX(-120vw) rotate(-25deg)';
    setTimeout(()=>{ swipeQueue.shift(); buildSwipeStack(); },350);
  });
  document.getElementById('btnConnect')?.addEventListener('click',()=>{
    const stack = document.getElementById('swipeStack');
    const top = stack?.lastElementChild;
    if(!top) return;
    top.classList.add('flipped');
  });
  document.getElementById('swipeResetBtn')?.addEventListener('click',()=>{
    swipeSkipped.clear();
    renderDiscover();
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
      swipeSkipped.clear();
      swipeHadUsers = false;
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
  document.getElementById('requestsPanel').classList.add('hidden');
  document.querySelectorAll('.sb-menu-item').forEach(i=>i.classList.remove('active'));
  document.querySelector('.sb-nav-item[data-view="discover"]')?.classList.add('active');
  S.chatId=null;
  if(S.unsubMsgs){ S.unsubMsgs(); S.unsubMsgs=null; }
  renderDiscover();
}

function showChatListView(){
  document.getElementById('discPanel').classList.add('hidden');
  document.getElementById('requestsPanel').classList.add('hidden');
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
let chattedWith = new Set(); // uids of users we've actually messaged

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
//  DISCOVER — SWIPE CARDS
// ══════════════════════════════
let swipeQueue = [];
let swipeSkipped = new Set();
let swipeFilter = 'all';

function renderDiscover(filter){
  if(filter !== undefined) swipeFilter = filter;
  let users = allUsers.filter(u=> u.uid !== S.user?.uid);
  if(swipeFilter !== 'all') users = users.filter(u=>u.interests?.some(i=>i.toLowerCase().includes(swipeFilter)));
  users = users.filter(u=> !swipeSkipped.has(u.uid));
  swipeQueue = users;
  buildSwipeStack();
}

let swipeHadUsers = false; // track if we ever had users to show

function buildSwipeStack(){
  const stack = document.getElementById('swipeStack');
  const empty = document.getElementById('swipeEmpty');
  const actions = document.getElementById('swipeActions');
  if(!stack) return;
  stack.innerHTML = '';

  if(!swipeQueue.length){
    // Only show "that's all" if we actually had users before
    if(swipeHadUsers){
      stack.classList.add('hidden');
      if(empty) empty.classList.remove('hidden');
      if(actions) actions.style.display = 'none';
    } else {
      // No users at all yet — show nothing, wait for data
      stack.classList.add('hidden');
      if(empty) empty.classList.add('hidden');
      if(actions) actions.style.display = 'none';
    }
    return;
  }

  swipeHadUsers = true;
  stack.classList.remove('hidden');
  if(empty) empty.classList.add('hidden');
  if(actions) actions.style.display = 'flex';

  [...swipeQueue.slice(0,3)].reverse().forEach(u=> stack.appendChild(buildCard(u)));
  attachDrag(stack.lastElementChild, swipeQueue[0]);
}

function buildCard(u){
  const av = avColor(u.uid);
  const ini = initials(u.name);
  const matchScore = calcMatch(u);
  const status = S.fbReady ? getFriendStatus(u.uid) : 'none';
  const isPrivate = u.isPrivate;

  let backBtns = '';
  if(status === 'friends'){
    backBtns = `<button class="cb-btn cb-btn-chat" data-uid="${u.uid}" data-action="chat">💬 Open Chat</button>`;
  } else if(status === 'requested'){
    backBtns = `<button class="cb-btn cb-btn-req" disabled>✓ Request Sent</button>`;
  } else if(isPrivate){
    backBtns = `
      <button class="cb-btn cb-btn-chat" data-uid="${u.uid}" data-action="msgReq">💬 Send Message + Request</button>
      <button class="cb-btn cb-btn-req" data-uid="${u.uid}" data-action="req">🤝 Friend Request Only</button>`;
  } else {
    backBtns = `<button class="cb-btn cb-btn-chat" data-uid="${u.uid}" data-action="chat">💬 Start Chatting</button>`;
  }

  const privNote = isPrivate
    ? `<div class="cb-note">🔒 Private account — your message will go as a friend request. Chat unlocks once accepted.</div>`
    : '';

  const card = document.createElement('div');
  card.className = 'swipe-card';
  card.dataset.uid = u.uid;
  card.innerHTML = `
    <div class="card-inner">
      <div class="card-face card-front">
        <div class="cf-top">
          <div class="cf-av-row">
            <div class="av ${av} cf-av">${ini}${u.online?'<div class="cf-ondot"></div>':''}</div>
            <div>
              <div class="cf-name">${esc(u.name)}</div>
              <div class="cf-handle">${esc(u.handle||'')}</div>
            </div>
            <div style="margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:6px">
              <div class="cf-match">⚡ ${matchScore}%</div>
              ${isPrivate?'<div class="cf-priv-badge">🔒 Private</div>':''}
            </div>
          </div>
          <div class="cf-loc">📍 ${esc(u.location||'Earth')}</div>
          <div class="cf-bio">${esc(u.bio||'')}</div>
          <div class="cf-tags">${(u.interests||[]).map((t,i)=>`<span class="tag ${tagColor(i)}">${esc(t)}</span>`).join('')}</div>
        </div>
        <div class="cf-bottom">
          <div class="cf-tap-hint">👆 Tap to connect · swipe to skip</div>
        </div>
      </div>
      <div class="card-face card-back">
        <div class="cb-av ${av}">${ini}</div>
        <div class="cb-name">${esc(u.name)}</div>
        <div class="cb-bio">${esc(u.bio||'')}</div>
        <div class="cb-divider"></div>
        <div class="cb-btns">
          ${backBtns}
          <button class="cb-btn cb-btn-back" data-action="flip">← Back</button>
        </div>
        ${privNote}
      </div>
    </div>`;

  card.querySelector('.card-front').addEventListener('click', ()=> card.classList.add('flipped'));
  card.querySelector('[data-action="flip"]').addEventListener('click', e=>{ e.stopPropagation(); card.classList.remove('flipped'); });
  card.querySelectorAll('[data-action]:not([data-action="flip"])').forEach(btn=>{
    btn.addEventListener('click', e=>{ e.stopPropagation(); handleCardAction(btn.dataset.action, btn.dataset.uid); });
  });
  return card;
}

async function handleCardAction(action, uid){
  if(action === 'chat' || action === 'msgReq'){
    openChat(uid);
    skipTopCard();
  } else if(action === 'req'){
    await sendFriendRequest(uid, null);
    skipTopCard();
  }
}

function skipTopCard(animate=false){
  const stack = document.getElementById('swipeStack');
  const top = stack?.lastElementChild;
  if(top && animate){
    top.style.transition = 'transform .35s ease';
    top.style.transform = 'translateX(-120vw) rotate(-25deg)';
    setTimeout(()=>{ swipeQueue.shift(); buildSwipeStack(); }, 350);
  } else {
    swipeQueue.shift();
    buildSwipeStack();
  }
}

function attachDrag(card, user){
  if(!card||!user) return;
  let startX=0, startY=0, currX=0, isDragging=false;

  const onStart=(e)=>{
    if(card.classList.contains('flipped')) return;
    isDragging=true;
    startX = e.type==='touchstart'?e.touches[0].clientX:e.clientX;
    startY = e.type==='touchstart'?e.touches[0].clientY:e.clientY;
    card.style.transition='none';
  };
  const onMove=(e)=>{
    if(!isDragging) return;
    currX=(e.type==='touchmove'?e.touches[0].clientX:e.clientX)-startX;
    const currY=(e.type==='touchmove'?e.touches[0].clientY:e.clientY)-startY;
    card.style.transform=`translateX(${currX}px) translateY(${currY*.25}px) rotate(${currX*.07}deg)`;
    const like=document.getElementById('swipeLabelLike');
    const nope=document.getElementById('swipeLabelNope');
    if(like&&nope){
      if(Math.abs(currX)>40){
        const o=Math.min((Math.abs(currX)-40)/60,1);
        nope.style.opacity=o; like.style.opacity=0;
      } else{like.style.opacity=0;nope.style.opacity=0;}
    }
  };
  const onEnd=()=>{
    if(!isDragging) return;
    isDragging=false;
    const like=document.getElementById('swipeLabelLike');
    const nope=document.getElementById('swipeLabelNope');
    if(like) like.style.opacity=0;
    if(nope) nope.style.opacity=0;
    card.style.transition='';

    if(Math.abs(currX) > 100){
      // Either direction = skip (slide away)
      const dir = currX > 0 ? 1 : -1;
      card.style.transform=`translateX(${dir*120}vw) rotate(${dir*25}deg)`;
      swipeSkipped.add(user.uid);
      setTimeout(()=>{ swipeQueue.shift(); buildSwipeStack(); },350);
    } else {
      card.style.transform='';
    }
    currX=0;
  };

  card.addEventListener('mousedown',onStart);
  card.addEventListener('touchstart',onStart,{passive:true});
  window.addEventListener('mousemove',onMove);
  window.addEventListener('touchmove',onMove,{passive:true});
  window.addEventListener('mouseup',onEnd);
  window.addEventListener('touchend',onEnd);
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
//  FRIEND REQUEST SYSTEM
// ══════════════════════════════
let myFriends = new Set();
let sentRequests = new Set();
let incomingRequests = [];
let sentRequestsList = [];

async function loadFriendData(){
  if(!S.fbReady || !S.user) return;
  const myUid = S.user.uid;
  const reqRef = collection(S.db,'friendRequests');
  onSnapshot(query(reqRef, where('toUid','==',myUid)), snap=>{
    incomingRequests = [];
    myFriends = new Set();
    snap.forEach(d=>{ const r={id:d.id,...d.data()}; incomingRequests.push(r); if(r.status==='accepted') myFriends.add(r.fromUid); });
    updateReqBadge(); renderDiscover(); renderChatList();
    if(document.getElementById('reqTabIncoming')?.classList.contains('active')) renderReqList('incoming');
  });
  onSnapshot(query(reqRef, where('fromUid','==',myUid)), snap=>{
    sentRequestsList = []; sentRequests = new Set();
    snap.forEach(d=>{ const r={id:d.id,...d.data()}; sentRequestsList.push(r); if(r.status==='pending') sentRequests.add(r.toUid); if(r.status==='accepted') myFriends.add(r.toUid); });
    updateReqBadge(); renderDiscover(); renderChatList();
    if(document.getElementById('reqTabSent')?.classList.contains('active')) renderReqList('sent');
  });
}

function updateReqBadge(){
  const pending = incomingRequests.filter(r=>r.status==='pending').length;
  const badge = document.getElementById('reqBadge');
  if(!badge) return;
  pending > 0 ? (badge.textContent=pending, badge.classList.remove('hidden')) : badge.classList.add('hidden');
}

function getFriendStatus(uid){
  if(myFriends.has(uid)) return 'friends';
  if(sentRequests.has(uid)) return 'requested';
  if(incomingRequests.find(r=>r.fromUid===uid && r.status==='pending')) return 'incoming';
  return 'none';
}

async function sendFriendRequest(uid, e){
  if(e) e.stopPropagation();
  if(!S.fbReady){ toast('Connect Firebase to use this feature','err'); return; }
  try{
    const existing = await getDocs(query(collection(S.db,'friendRequests'), where('fromUid','==',S.user.uid), where('toUid','==',uid)));
    if(!existing.empty){ toast('Request already sent!'); return; }
    await addDoc(collection(S.db,'friendRequests'),{
      fromUid:S.user.uid, toUid:uid,
      fromName:S.profile.name, fromHandle:S.profile.handle, fromBio:S.profile.bio||'',
      status:'pending', createdAt:serverTimestamp()
    });
    toast('Friend request sent! 🤝');
  } catch(e){ console.error(e); toast('Failed to send request','err'); }
}

async function acceptRequest(requestId, fromUid){
  try{
    await updateDoc(doc(S.db,'friendRequests',requestId),{status:'accepted'});
    toast('Friend accepted! 🎉');
    setTimeout(()=>openChat(fromUid),400);
  } catch(e){ toast('Error','err'); }
}

async function declineRequest(requestId){
  try{ await updateDoc(doc(S.db,'friendRequests',requestId),{status:'declined'}); toast('Request declined'); }
  catch(e){ toast('Error','err'); }
}

async function cancelRequest(requestId){
  try{ await deleteDoc(doc(S.db,'friendRequests',requestId)); toast('Request cancelled'); }
  catch(e){ toast('Error','err'); }
}

window.showReqTab = (tab)=>{
  document.getElementById('reqTabIncoming').classList.toggle('active',tab==='incoming');
  document.getElementById('reqTabSent').classList.toggle('active',tab==='sent');
  renderReqList(tab);
};

function showRequestsPanel(){
  document.getElementById('discPanel').classList.add('hidden');
  document.getElementById('chatPanel').classList.remove('active');
  document.getElementById('requestsPanel').classList.remove('hidden');
  document.querySelectorAll('.sb-menu-item').forEach(i=>i.classList.remove('active'));
  document.querySelector('.sb-nav-item[data-view="requests"]')?.classList.add('active');
  renderReqList('incoming');
}

function renderReqList(tab){
  const list = document.getElementById('reqList'); if(!list) return;
  list.innerHTML='';
  const items = tab==='incoming' ? incomingRequests.filter(r=>r.status==='pending') : sentRequestsList.filter(r=>r.status==='pending');
  if(!items.length){
    list.innerHTML=`<div class="empty" style="padding:40px 0"><div class="empty-ico">${tab==='incoming'?'📭':'📤'}</div><h3>${tab==='incoming'?'No incoming requests':'No sent requests'}</h3><p>${tab==='incoming'?"When someone wants to connect, they'll appear here":'Requests you send will appear here'}</p></div>`;
    return;
  }
  items.forEach(r=>{
    const user = tab==='incoming'
      ? allUsers.find(u=>u.uid===r.fromUid)||{name:r.fromName,handle:r.fromHandle,bio:r.fromBio,uid:r.fromUid}
      : allUsers.find(u=>u.uid===r.toUid)||{name:'User',handle:'',uid:r.toUid};
    const av=avColor(user.uid);
    const card=document.createElement('div');
    card.className='req-card';
    card.innerHTML=`
      <div class="req-card-hd">
        <div class="av av-sm ${av}">${initials(user.name||'?')}</div>
        <div class="req-card-info"><div class="req-card-name">${esc(user.name||'Unknown')}</div><div class="req-card-handle">${esc(user.handle||'')}</div></div>
        <span class="req-status-badge pending">Pending</span>
      </div>
      <div class="req-card-bio">${esc(user.bio||r.fromBio||'')}</div>
      <div class="req-card-acts">
        ${tab==='incoming'
          ? `<button class="btn-accept" data-id="${r.id}">Accept ✓</button><button class="btn-decline" data-id="${r.id}">Decline</button>`
          : `<button class="btn-cancel-req" data-id="${r.id}">Cancel Request</button>`}
      </div>`;
    if(tab==='incoming'){
      card.querySelector('.btn-accept').onclick=()=>acceptRequest(r.id,r.fromUid);
      card.querySelector('.btn-decline').onclick=()=>declineRequest(r.id);
    } else {
      card.querySelector('.btn-cancel-req').onclick=()=>cancelRequest(r.id);
    }
    list.appendChild(card);
  });
}

// ══════════════════════════════
//  CHAT LIST
// ══════════════════════════════
function renderChatList(){
  const list=document.getElementById('chatList');
  list.innerHTML='';

  // Demo mode: show demo users
  if(!S.fbReady){
    const users = allUsers.slice(0,4);
    if(!users.length){
      list.innerHTML='<div style="padding:20px;text-align:center;color:var(--t3);font-size:13px">No chats yet.<br>Discover people to connect!</div>';
      return;
    }
    users.forEach(u=>addChatItem(list, u));
    return;
  }

  // Firebase mode: ONLY show users we've actually chatted with
  const users = allUsers.filter(u=> chattedWith.has(u.uid));

  if(!users.length){
    list.innerHTML=`<div style="padding:24px 16px;text-align:center;color:var(--t3);font-size:13px;line-height:1.7">
      No chats yet 💬<br>
      <span style="font-size:12px">Go to <strong style="color:var(--t2)">Discover</strong> to find people</span>
    </div>`;
    return;
  }
  users.forEach(u=> addChatItem(list, u));
}

function addChatItem(list, u){
  const av=avColor(u.uid);
  const item=document.createElement('div');
  item.className='sb-menu-item'; item.dataset.uid=u.uid;
  const isFriend = S.fbReady && getFriendStatus(u.uid)==='friends';
  const friendTag = isFriend ? ' ✓' : '';
  const onlineDot = u.online ? `<span style="width:8px;height:8px;background:var(--g);border-radius:50%;flex-shrink:0"></span>` : '';
  item.innerHTML=`
    <div class="av av-sm ${av}" style="flex-shrink:0;position:relative">${initials(u.name)}${u.online?'<div class="ondot"></div>':''}</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:13px;font-weight:600;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(u.name)}${friendTag}</div>
      <div style="font-size:11px;color:var(--t3);margin-top:1px">${u.online?'🟢 Online':'Last seen recently'}</div>
    </div>`;
  item.onclick=()=>{ openChat(u.uid); closeSidebar(); };
  list.appendChild(item);
}

// ══════════════════════════════
//  OPEN CHAT
// ══════════════════════════════
window.startChat = (uid,e)=>{ if(e) e.stopPropagation(); openChat(uid); };
window.sendFriendRequest = sendFriendRequest;

async function openChat(uid){
  // Guard: if user is private and not a friend, block
  if(S.fbReady){
    const user = allUsers.find(u=>u.uid===uid);
    if(user?.isPrivate && getFriendStatus(uid) !== 'friends'){
      toast('Send a friend request to chat 🔒','err');
      return;
    }
  }

  S.chatId = uid;
  const user = allUsers.find(u=>u.uid===uid) || DEMO_USERS.find(u=>u.uid===uid);
  if(!user) return;
  S.chatUser = user;

  // Track that we've chatted with this person
  markChattedWith(uid);

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
    document.getElementById('set-name').value = S.profile.name || '';
    document.getElementById('set-bio').value = S.profile.bio || '';
    document.getElementById('set-private').checked = S.profile.isPrivate || false;
  }
  document.getElementById('settingsModal').classList.add('active');
}

async function saveSettings(){
  const name = document.getElementById('set-name').value.trim();
  const bio = document.getElementById('set-bio').value.trim();
  const isPrivate = document.getElementById('set-private').checked;
  if(!name){ toast('Name cannot be empty','err'); return; }
  S.profile.name = name;
  S.profile.bio = bio;
  S.profile.isPrivate = isPrivate;
  S.profile.handle = '@'+name.toLowerCase().replace(/\s+/g,'.');
  if(S.fbReady && S.user){
    await updateDoc(doc(S.db,'users',S.user.uid),{
      name, bio, isPrivate, handle: S.profile.handle
    }).catch(e=>console.error(e));
  }
  updateSidebarProfile();
  document.getElementById('settingsModal').classList.remove('active');
  toast(isPrivate ? 'Profile updated! Account is now 🔒 Private' : 'Profile updated! Account is 🌐 Public');
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

  // ── OTP button listeners ──
  document.getElementById('otpVerifyBtn').textContent = 'Verify Code ✦';
  document.getElementById('otpVerifyBtn').addEventListener('click', ()=> window.verifyOTP());
  document.getElementById('otpResendBtn').addEventListener('click', ()=> window.resendOTP());
  document.getElementById('otpInput').addEventListener('keydown', e=>{ if(e.key==='Enter') window.verifyOTP(); });

  // ── Journey + Login listeners ──
  initJourneyListeners();
  document.getElementById('loginBtn').onclick = ()=> handleLogin();

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