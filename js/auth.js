// ══════════════════════════════════════════════
//  VOXLO — auth.js  (auth.html only)
// ══════════════════════════════════════════════
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, updateProfile, fetchSignInMethodsForEmail } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { S, toast, showLoader, hideLoader, setLoaderMsg, initLoaderBall, saveFbConfig } from './shared.js';

const EMAILJS_PUBLIC_KEY  = 'fZ7BAKMM1BlBU07S3';
const EMAILJS_SERVICE_ID  = 'service_ay6r58h';
const EMAILJS_TEMPLATE_ID = 'template_rsxuxol';

initLoaderBall();
hideLoader();

// Redirect to app if already logged in
if(S.fbReady){
  onAuthStateChanged(S.auth, user => { if(user) window.location.href='app.html'; });
}

// Read URL mode param
const urlMode = new URLSearchParams(window.location.search).get('mode');
if(urlMode==='login') switchToLogin(); else switchToReg();

// ── OTP state ──
const twoFA = { pendingEmail:null,pendingPass:null,pendingName:null,otp:null,otpExpiry:null,timerInterval:null };

// ── Slide system ──
let currentSlide=1;
window.goToSlide = function(n, back=false){
  document.getElementById('jslide'+currentSlide)?.classList.remove('active','back-anim');
  currentSlide=n;
  const el=document.getElementById('jslide'+n);
  if(el){ if(back) el.classList.add('back-anim'); else el.classList.remove('back-anim'); el.classList.add('active'); setTimeout(()=>el.querySelector('input,select,textarea')?.focus(),120); }
  for(let i=1;i<=5;i++){ const d=document.getElementById('jp'+i); if(!d) continue; d.classList.remove('active','done'); if(i<n) d.classList.add('done'); if(i===n) d.classList.add('active'); }
  for(let i=1;i<5;i++){ document.getElementById('jl'+i)?.classList.toggle('done',i<n); }
};

window.switchToLogin = function switchToLogin(){
  document.getElementById('loginPanel').classList.remove('hidden');
  document.getElementById('journeyWrap').classList.add('hidden');
};
window.switchToReg = function switchToReg(){
  document.getElementById('loginPanel').classList.add('hidden');
  document.getElementById('journeyWrap').classList.remove('hidden');
  goToSlide(1);
};

// ── EmailJS ──
let ejsReady=false;
async function loadEmailJS(){
  if(ejsReady) return;
  if(!window.emailjs){
    await new Promise((res,rej)=>{
      if(document.querySelector('script[src*="emailjs"]')){ const t=setInterval(()=>{if(window.emailjs){clearInterval(t);res();}},50); return; }
      const s=document.createElement('script'); s.src='https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
      s.onload=res; s.onerror=()=>rej(new Error('EmailJS load failed'));
      document.head.appendChild(s);
    });
  }
  window.emailjs.init(EMAILJS_PUBLIC_KEY); ejsReady=true;
}
async function sendOTPEmail(email,name,otp){
  await loadEmailJS();
  return window.emailjs.send(EMAILJS_SERVICE_ID,EMAILJS_TEMPLATE_ID,{
    email, passcode:otp, time:new Date(Date.now()+10*60*1000).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
  });
}
function genOTP(){ const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let o=''; for(let i=0;i<6;i++) o+=c[Math.floor(Math.random()*c.length)]; return o; }

// ── OTP screen ──
function showOTPScreen(email){
  document.getElementById('otpEmail').textContent=email;
  document.getElementById('otpInput').value='';
  document.getElementById('otpError').textContent='';
  document.getElementById('otpModal').classList.add('active');
  setTimeout(()=>document.getElementById('otpInput').focus(),100);
  startOTPTimer();
}
function startOTPTimer(){
  clearInterval(twoFA.timerInterval); let secs=600;
  const el=document.getElementById('otpTimer');
  twoFA.timerInterval=setInterval(()=>{
    secs--; const m=Math.floor(secs/60).toString().padStart(2,'0'),s=(secs%60).toString().padStart(2,'0');
    if(el) el.textContent=m+':'+s;
    if(secs<=0){ clearInterval(twoFA.timerInterval); if(el) el.textContent='Expired'; toast('Code expired. Try again.','err'); document.getElementById('otpModal').classList.remove('active'); }
  },1000);
}

// ── Slide 1 ──
document.getElementById('jbtn1').onclick=()=>{
  const name=document.getElementById('reg-name').value.trim();
  if(!name){ toast('Enter your name','err'); return; }
  document.getElementById('slide2Title').textContent=`Hey ${name.split(' ')[0]}, let's verify you 🔐`;
  goToSlide(2);
};
document.getElementById('jback2').onclick=()=>goToSlide(1,true);

// ── Email availability check ──
let emailState='idle';
document.getElementById('reg-email').addEventListener('blur',async()=>{
  const e=document.getElementById('reg-email').value.trim();
  if(!e||!e.includes('@')) return;
  if(!S.fbReady){ emailState='ok'; return; }
  emailState='checking'; setEmailStatus('checking');
  try{
    const m=await fetchSignInMethodsForEmail(S.auth,e);
    if(m&&m.length){ emailState='taken'; setEmailStatus('taken',e); }
    else{ emailState='ok'; setEmailStatus('ok'); }
  }catch(e){ emailState='idle'; clearEmailStatus(); }
});
document.getElementById('reg-email').addEventListener('input',()=>{ emailState='idle'; clearEmailStatus(); });

function clearEmailStatus(){ document.getElementById('emailStatusMsg')?.remove(); document.getElementById('reg-email').style.borderColor=''; }
function setEmailStatus(state,email=''){
  clearEmailStatus();
  const inp=document.getElementById('reg-email');
  const msg=document.createElement('div'); msg.id='emailStatusMsg';
  if(state==='checking'){ inp.style.borderColor='var(--p)'; msg.className='email-status checking'; msg.innerHTML=`<span class="es-spinner"></span><span>Checking...</span>`; }
  else if(state==='ok'){ inp.style.borderColor='var(--g)'; msg.className='email-status ok'; msg.innerHTML=`<span>✓</span><span>Looks good!</span>`; }
  else if(state==='taken'){ inp.style.borderColor='var(--pk)'; msg.className='email-status taken'; msg.innerHTML=`<span>⚠️</span><span><strong>${email}</strong> already registered. <button class="es-login-btn" id="esLoginBtn">Sign in →</button></span>`; }
  inp.after(msg);
  if(state==='taken') document.getElementById('esLoginBtn').onclick=()=>{ clearEmailStatus(); switchToLogin(); setTimeout(()=>{ document.getElementById('login-email').value=email; },100); };
}

// ── Slide 2: Send OTP ──
document.getElementById('regBtn').onclick=async()=>{
  const email=document.getElementById('reg-email').value.trim();
  const pass=document.getElementById('reg-pass').value;
  const pass2=document.getElementById('reg-pass2').value;
  if(!email||!pass){ toast('Enter email and password','err'); return; }
  if(pass.length<6){ toast('Password must be 6+ chars','err'); return; }
  if(pass!==pass2){ toast('Passwords do not match','err'); return; }
  if(emailState==='taken'){ toast('Email already registered','err'); return; }
  const btn=document.getElementById('regBtn');
  btn.disabled=true; btn.textContent='Sending code... 📧';
  if(!S.fbReady){
    Object.assign(twoFA,{pendingEmail:email,pendingPass:pass,pendingName:document.getElementById('reg-name').value.trim(),otp:'DEMO01',otpExpiry:Date.now()+600000});
    showOTPScreen(email); btn.disabled=false; btn.textContent='Send Verification Code 📧'; return;
  }
  try{
    if(emailState==='idle'||emailState==='checking'){
      btn.textContent='Checking email... ⏳';
      const m=await fetchSignInMethodsForEmail(S.auth,email);
      if(m&&m.length){ emailState='taken'; setEmailStatus('taken',email); btn.disabled=false; btn.textContent='Send Verification Code 📧'; return; }
      emailState='ok';
    }
    const otp=genOTP();
    Object.assign(twoFA,{pendingEmail:email,pendingPass:pass,pendingName:document.getElementById('reg-name').value.trim(),otp,otpExpiry:Date.now()+10*60*1000});
    await sendOTPEmail(email,twoFA.pendingName,otp);
    toast('Code sent! Check your email 📧'); showOTPScreen(email);
  }catch(e){ toast('Error: '+e.message,'err'); }
  btn.disabled=false; btn.textContent='Send Verification Code 📧';
};

// ── OTP verify ──
document.getElementById('otpVerifyBtn').onclick=verifyOTP;
document.getElementById('otpInput').addEventListener('keydown',e=>{ if(e.key==='Enter') verifyOTP(); });
async function verifyOTP(){
  const entered=document.getElementById('otpInput').value.trim().toUpperCase();
  const errEl=document.getElementById('otpError'), btn=document.getElementById('otpVerifyBtn');
  if(entered.length!==6){ errEl.textContent='Enter the 6-character code'; return; }
  if(Date.now()>twoFA.otpExpiry){ errEl.textContent='Code expired'; return; }
  if(entered!==twoFA.otp){ errEl.textContent='Incorrect code'; document.getElementById('otpInput').value=''; document.getElementById('otpInput').focus(); document.getElementById('otpInput').classList.add('shake'); setTimeout(()=>document.getElementById('otpInput').classList.remove('shake'),500); return; }
  btn.disabled=true; btn.textContent='Verified! ✓';
  clearInterval(twoFA.timerInterval);
  document.getElementById('otpModal').classList.remove('active');
  toast('Email verified! ✅');
  goToSlide(3);
}
document.getElementById('otpResendBtn').onclick=async()=>{
  const btn=document.getElementById('otpResendBtn'); btn.disabled=true; btn.textContent='Sending...';
  try{ const otp=genOTP(); twoFA.otp=otp; twoFA.otpExpiry=Date.now()+10*60*1000; await sendOTPEmail(twoFA.pendingEmail,twoFA.pendingName||'',otp); toast('New code sent! 📧'); document.getElementById('otpError').textContent=''; document.getElementById('otpInput').value=''; startOTPTimer(); }
  catch(e){ toast('Failed: '+e.message,'err'); }
  btn.disabled=false; btn.textContent='Resend Code';
};

// ── Slides 3-5 ──
document.getElementById('jbtn3').onclick=()=>goToSlide(4);
document.getElementById('jback3').onclick=()=>goToSlide(2,true);
document.getElementById('reg-bio').addEventListener('input',e=>{ document.getElementById('bioCount').textContent=e.target.value.length; });
document.getElementById('jbtn4').onclick=()=>{ if(!document.getElementById('reg-bio').value.trim()){toast('Add a bio','err');return;} goToSlide(5); };
document.getElementById('jback4').onclick=()=>goToSlide(3,true);
document.getElementById('jback5').onclick=()=>goToSlide(4,true);
document.querySelectorAll('.itag').forEach(t=>t.onclick=()=>t.classList.toggle('sel'));

// ── Complete profile ──
document.getElementById('completeProfileBtn').onclick=async()=>{
  const name=document.getElementById('reg-name').value.trim();
  const bio=document.getElementById('reg-bio').value.trim();
  const country=document.getElementById('reg-country').value||'Earth';
  const interests=[...document.querySelectorAll('.itag.sel')].map(t=>t.textContent);
  if(!name||!bio){ toast('Complete all steps','err'); return; }
  const btn=document.getElementById('completeProfileBtn');
  btn.disabled=true; btn.textContent='Creating profile... ✨';
  if(!S.fbReady){ toast('Welcome to VOXLO! 🎉 (Demo)'); setTimeout(()=>{ window.location.href='app.html'; },600); return; }
  try{
    showLoader(); setLoaderMsg('Creating your profile...');
    const cred=await createUserWithEmailAndPassword(S.auth,twoFA.pendingEmail,twoFA.pendingPass);
    await updateProfile(cred.user,{displayName:name});
    const db=getFirestore(S.auth.app);
    await setDoc(doc(db,'users',cred.user.uid),{
      uid:cred.user.uid, name, email:twoFA.pendingEmail, bio,
      interests:interests.length?interests:['Vibes'], location:country,
      handle:'@'+name.toLowerCase().replace(/\s+/g,'.'),
      online:true, createdAt:serverTimestamp(), lastSeen:serverTimestamp()
    });
    setLoaderMsg('Welcome to VOXLO! ✨');
    await new Promise(r=>setTimeout(r,900));
    window.location.href='app.html';
  }catch(e){ hideLoader(); toast(e.message,'err'); btn.disabled=false; btn.textContent='Create My Profile ✦'; }
};

// ── Login ──
document.getElementById('loginBtn').onclick=handleLogin;
document.getElementById('login-pass').addEventListener('keydown',e=>{ if(e.key==='Enter') handleLogin(); });
async function handleLogin(){
  const email=document.getElementById('login-email').value.trim();
  const pass=document.getElementById('login-pass').value;
  if(!email||!pass){ toast('Enter email and password','err'); return; }
  const btn=document.getElementById('loginBtn'); btn.disabled=true; btn.textContent='Signing in...';
  if(!S.fbReady){ toast('Welcome back! 👋 (Demo)'); setTimeout(()=>{ window.location.href='app.html'; },600); btn.disabled=false; btn.textContent='Sign In to VOXLO ✦'; return; }
  try{
    showLoader(); setLoaderMsg('Signing you in...');
    await signInWithEmailAndPassword(S.auth,email,pass);
    // onAuthStateChanged at top will redirect to app.html
  }catch(e){
    hideLoader();
    const msg=e.code==='auth/invalid-credential'||e.code==='auth/wrong-password'?'Incorrect email or password':e.message;
    toast(msg,'err'); btn.disabled=false; btn.textContent='Sign In to VOXLO ✦';
  }
}

// ── Firebase setup modal ──
window.showFbHelp=()=>document.getElementById('fbSetupModal').classList.add('active');
document.getElementById('closeFbSetup').onclick=()=>document.getElementById('fbSetupModal').classList.remove('active');
document.getElementById('saveFbConfig').onclick=saveFbConfig;