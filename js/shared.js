// ══════════════════════════════════════════════
//  VOXLO — shared.js  (imported by every page)
// ══════════════════════════════════════════════
import { initializeApp }                      from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, onAuthStateChanged }        from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore }                       from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getStorage }                         from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';
import firebaseConfig                         from './firebase-config.js';

// ── GLOBAL STATE ──
export const S = {
  app:null, auth:null, db:null, storage:null,
  user:null, profile:null,
  chatId:null, chatUser:null,
  unsubMsgs:null, unsubUsers:null,
  pendingImgs:[],
  fbReady:false, demoMode:true,
};

// ── FIREBASE INIT ──
function loadSavedConfig(){
  const s = localStorage.getItem('voxlo_fb_config');
  if(s){ try{ return JSON.parse(s); }catch(e){} }
  return null;
}

export function initFirebase(config){
  try{
    S.app     = initializeApp(config);
    S.auth    = getAuth(S.app);
    S.db      = getFirestore(S.app);
    S.storage = getStorage(S.app);
    S.fbReady = true; S.demoMode = false;
    document.getElementById('fbBanner')?.classList.remove('show');
    return true;
  } catch(e){ console.error('Firebase init failed:',e); return false; }
}

// Auto-init on load
if(firebaseConfig?.apiKey && firebaseConfig.apiKey !== 'YOUR_API_KEY'){
  initFirebase(firebaseConfig);
} else {
  const saved = loadSavedConfig();
  if(saved) initFirebase(saved);
  else document.getElementById('fbBanner')?.classList.add('show');
}

// ── HELPERS ──
export const AV_COLORS  = ['av1','av2','av3','av4','av5','av6'];
export const TAG_COLORS = ['tp','tc','tpk','ta','tg'];
export const avColor  = uid  => AV_COLORS[uid ? uid.charCodeAt(0)%6 : 0];
export const initials = name => (name||'?').split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
export const tagColor = i    => TAG_COLORS[i % TAG_COLORS.length];
export const fmtTime  = ts   => { if(!ts) return ''; const d=ts.toDate?ts.toDate():new Date(ts); return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); };
export const esc      = t    => { const d=document.createElement('div'); d.appendChild(document.createTextNode(t)); return d.innerHTML; };

// ── TOAST ──
export function toast(msg, type='ok'){
  let c = document.getElementById('toastC');
  if(!c){ c=document.createElement('div'); c.id='toastC'; c.className='toast-c'; document.body.appendChild(c); }
  const el=document.createElement('div');
  el.className=`toast ${type}`;
  el.innerHTML=`<span>${type==='ok'?'✓':'✕'}</span> ${msg}`;
  c.appendChild(el);
  setTimeout(()=>el.remove(),3200);
}

// ── LOADER ──
export function setLoaderMsg(msg){ const el=document.getElementById('loaderSub'); if(el) el.textContent=msg; }
export function showLoader(){
  const l=document.getElementById('loader'); if(!l) return;
  l.style.display='flex'; requestAnimationFrame(()=>l.classList.remove('fade-out'));
}
export function hideLoader(){
  const l=document.getElementById('loader'); if(!l) return;
  l.classList.add('fade-out'); setTimeout(()=>{ l.style.display='none'; },500);
}

// ── LOADER BALL ANIMATION ──
export function initLoaderBall(){
  const ball=document.getElementById('loaderBall');
  const letters=document.querySelectorAll('.ll');
  const shadows=document.querySelectorAll('.ls');
  if(!ball||!letters.length) return;
  const N=letters.length, DUR=420, LIT=260;
  let animFrame, startTime, pos=[];

  function measure(){
    const sr=document.querySelector('.loader-scene')?.getBoundingClientRect();
    if(!sr) return;
    pos=Array.from(letters).map(el=>{ const r=el.getBoundingClientRect(); return{cx:r.left-sr.left+r.width/2,top:r.top-sr.top,bottom:r.top-sr.top+r.height}; });
  }
  function place(x,y){ ball.style.left=(x-8)+'px'; ball.style.top=y+'px'; }
  const easeOut=t=>t*(2-t), easeIn=t=>t*t;

  function bounce(fi,ti,done){
    const f=pos[fi],t=pos[ti];
    const ay=Math.min(f.top,t.top)-48, gy=Math.max(f.bottom,t.bottom)-20;
    startTime=null;
    function step(ts){
      if(!startTime) startTime=ts;
      const p=Math.min((ts-startTime)/DUR,1);
      const y=p<.5?gy+(ay-gy)*easeOut(p*2):ay+(gy-ay)*easeIn((p-.5)*2);
      const x=f.cx+(t.cx-f.cx)*p;
      place(x,y-16);
      const sq=p>.85?1+(1-p)*3:1;
      ball.style.transform=`scaleX(${sq>1?sq:1}) scaleY(${sq>1?1/sq:1})`;
      p<1?animFrame=requestAnimationFrame(step):(ball.style.transform='',done());
    }
    animFrame=requestAnimationFrame(step);
  }

  function hit(i){
    letters[i].classList.add('lit'); shadows[i]?.classList.add('squish');
    ball.style.transform='scaleX(1.5) scaleY(0.6)';
    setTimeout(()=>{ ball.style.transform=''; },120);
    setTimeout(()=>{ letters[i].classList.remove('lit'); shadows[i]?.classList.remove('squish'); },LIT);
  }

  function run(){
    if(!document.getElementById('loader')||document.getElementById('loader').classList.contains('fade-out')) return;
    measure();
    if(!pos.length){ setTimeout(run,100); return; }
    place(pos[0].cx,pos[0].bottom-20);
    let i=0;
    function next(){
      if(document.getElementById('loader')?.classList.contains('fade-out')) return;
      hit(i);
      const ni=(i+1)%N;
      setTimeout(()=>bounce(i,ni,()=>{ i=ni; next(); }),60);
    }
    next();
  }
  setTimeout(run,120);
}

// ── FIREBASE SETUP HELPER ──
export async function saveFbConfig(){
  const raw=document.getElementById('fbConfigInput')?.value.trim();
  if(!raw){ toast('Paste your Firebase config first','err'); return; }
  try{
    const cfg=JSON.parse(raw);
    localStorage.setItem('voxlo_fb_config',JSON.stringify(cfg));
    toast('Firebase connected! Reloading...');
    setTimeout(()=>location.reload(),1000);
  } catch(e){ toast('Invalid JSON — check your config','err'); }
}