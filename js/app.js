// ══════════════════════════════════════════════
//  VOXLO — app.js  (app.html only)
// ══════════════════════════════════════════════
import { signOut, onAuthStateChanged }        from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { collection, doc, getDoc, getDocs, addDoc, deleteDoc, query, orderBy, onSnapshot, serverTimestamp, updateDoc, arrayUnion, where, limit } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { S, toast, showLoader, hideLoader, setLoaderMsg, initLoaderBall, avColor, initials, tagColor, fmtTime, esc } from './shared.js';

// ── Boot: show loader, init ball ──
initLoaderBall();
showLoader(); setLoaderMsg('Loading...');

// ── Auth guard: redirect to auth.html if not signed in ──
if(S.fbReady){
  onAuthStateChanged(S.auth, async user => {
    if(!user){ window.location.href='auth.html'; return; }
    S.user=user; setLoaderMsg('Loading your profile...');
    try{
      let snap, retries=6;
      while(retries-->0){ snap=await getDoc(doc(S.db,'users',user.uid)); if(snap.exists()) break; await new Promise(r=>setTimeout(r,500)); }
      if(snap?.exists()){
        S.profile=snap.data();
        if(S.profile.locked){ await signOut(S.auth); window.location.href='auth.html?locked=1'; return; }
        setLoaderMsg('Almost there...');
        await updateDoc(doc(S.db,'users',user.uid),{online:true,lastSeen:serverTimestamp()});
        hideLoader(); initApp();
      } else { window.location.href='auth.html'; }
    }catch(e){ console.error(e); hideLoader(); initApp(); }
  });
} else {
  // Demo mode
  S.profile={uid:'demo_me',name:'Demo User',email:'demo@voxlo.app',bio:'Demo mode — connect Firebase to go live!',interests:['Tech','Gaming'],handle:'@demo',online:true};
  S.user={uid:S.profile.uid};
  setTimeout(()=>{ hideLoader(); initApp(); },900);
}

// ══════════════════════════════
//  APP INIT
// ══════════════════════════════
async function initApp(){
  updateSidebarProfile(); initChatInput(); initNav();
  document.querySelectorAll('.sb-menu-item').forEach(x=>x.classList.remove('active'));
  document.querySelector('.sb-nav-item[data-view="discover"]')?.classList.add('active');
  showDiscover();
  if(S.fbReady){
    setOnlineStatus(true);
    // Load chattedWith FIRST so discover never shows people we already chatted with
    await loadChattedWith();
    loadFriendData();
  }
  loadUsers();
}

async function loadChattedWith(){
  if(!S.fbReady||!S.user) return;
  try{ const snap=await getDoc(doc(S.db,'users',S.user.uid)); if(snap.exists()){ chattedWith=new Set(snap.data().chattedWith||[]); } }catch(e){}
  finally{ chattedWithLoaded=true; renderChatList(); renderDiscover(); }
}
async function markChattedWith(uid){
  if(!S.fbReady||!S.user||chattedWith.has(uid)) return;
  chattedWith.add(uid); renderChatList();
  try{ await updateDoc(doc(S.db,'users',S.user.uid),{chattedWith:arrayUnion(uid)}); }catch(e){}
}
function updateSidebarProfile(){
  if(!S.profile) return;
  document.getElementById('sbName').textContent=S.profile.name;
  document.getElementById('sbHandle').textContent=S.profile.handle||'@voxlo';
  const av=document.getElementById('sbAvatar');
  av.className=`av av-sm ${avColor(S.profile.uid)}`; av.textContent=initials(S.profile.name);
}
async function setOnlineStatus(online){
  if(!S.fbReady||!S.user) return;
  await updateDoc(doc(S.db,'users',S.user.uid),{online,lastSeen:serverTimestamp()}).catch(()=>{});
}
window.addEventListener('beforeunload',()=>setOnlineStatus(false));

// ══════════════════════════════
//  NAV
// ══════════════════════════════
const closeSidebar=()=>{ document.getElementById('sidebar')?.classList.remove('open'); document.getElementById('hamBtn')?.classList.remove('open'); };
const openSidebar =()=>{ document.getElementById('sidebar')?.classList.add('open');    document.getElementById('hamBtn')?.classList.add('open');    };
const toggleSidebar=()=>document.getElementById('sidebar')?.classList.contains('open')?closeSidebar():openSidebar();

function initNav(){
  document.getElementById('hamBtn')?.addEventListener('click',toggleSidebar);
  document.getElementById('sbOverlay')?.addEventListener('click',closeSidebar);
  document.querySelectorAll('.sb-nav-item').forEach(item=>{
    item.addEventListener('click',()=>{
      document.querySelectorAll('.sb-menu-item').forEach(x=>x.classList.remove('active'));
      item.classList.add('active');
      if(item.dataset.view==='discover') showDiscover();
      else if(item.dataset.view==='requests') showRequestsPanel();
      closeSidebar();
    });
  });
  document.getElementById('btnDiscover')?.addEventListener('click',showDiscover);
  document.querySelectorAll('.fchip').forEach(c=>{ c.onclick=()=>{ document.querySelectorAll('.fchip').forEach(x=>x.classList.remove('active')); c.classList.add('active'); swipeSkipped.clear(); swipeHadUsers=false; renderDiscover(c.dataset.filter); }; });
  document.getElementById('swipeResetBtn')?.addEventListener('click',()=>{ swipeSkipped.clear(); swipeHadUsers=false; document.querySelectorAll('.fchip').forEach(x=>x.classList.remove('active')); document.querySelector('.fchip[data-filter="all"]')?.classList.add('active'); renderDiscover('all'); });
  document.getElementById('btnChatBack')?.addEventListener('click',()=>{ document.getElementById('chatPanel').classList.remove('active'); document.body.classList.remove('chat-open'); showDiscover(); });
  document.getElementById('btnSettings').onclick=openSettings;
  document.getElementById('btnLogout').onclick=logout;
  document.getElementById('btnViewProf').onclick=toggleProfPanel;
  document.getElementById('btnCloseProf').onclick=()=>document.getElementById('profPanel').classList.remove('active');
  document.getElementById('closeSettings').onclick=()=>document.getElementById('settingsModal').classList.remove('active');
  document.getElementById('saveSettings').onclick=saveSettings;
  document.getElementById('btnBlockUser').onclick=()=>promptBlock(S.chatId);
}

function showDiscover(){
  document.getElementById('discPanel').classList.remove('hidden');
  document.getElementById('chatPanel').classList.remove('active');
  document.body.classList.remove('chat-open');
  document.getElementById('requestsPanel').classList.add('hidden');
  document.querySelectorAll('.sb-menu-item').forEach(i=>i.classList.remove('active'));
  document.querySelector('.sb-nav-item[data-view="discover"]')?.classList.add('active');
  S.chatId=null;
  if(S.unsubMsgs){ S.unsubMsgs(); S.unsubMsgs=null; }
  renderDiscover();
}

async function logout(){
  if(S.fbReady){ await setOnlineStatus(false); await signOut(S.auth).catch(()=>{}); }
  S.user=null; S.profile=null; S.chatId=null;
  if(S.unsubMsgs){ S.unsubMsgs(); S.unsubMsgs=null; }
  toast('Logged out. See you soon! 👋');
  setTimeout(()=>{ window.location.href='index.html'; },600);
}

// ══════════════════════════════
//  USERS
// ══════════════════════════════
let allUsers=[], chattedWith=new Set(), chattedWithLoaded=false;
async function loadUsers(){
  if(!S.fbReady){ allUsers=DEMO_USERS; renderChatList(); document.getElementById('onlineCount').textContent='3 people online'; renderDiscover(); return; }
  try{
    if(S.unsubUsers) S.unsubUsers();
    S.unsubUsers=onSnapshot(query(collection(S.db,'users'),limit(50)),snap=>{
      allUsers=[]; let online=0;
      snap.forEach(d=>{ const u=d.data(); if(u.uid!==S.user?.uid){ allUsers.push(u); if(u.online) online++; } });
      document.getElementById('onlineCount').textContent=`${online} people online`;
      // Only render discover if chattedWith has been loaded (prevents chatted users flashing in stack)
      if(chattedWithLoaded) renderDiscover();
      renderChatList();
    });
  }catch(e){ allUsers=DEMO_USERS; renderChatList(); }
}

// ══════════════════════════════
//  DISCOVER + ADS
// ══════════════════════════════
let swipeQueue=[], swipeSkipped=new Set(), swipeFilter='all', swipeHadUsers=false;
let swipeCount=0, adTimer=null, adResolve=null;
const AD_EVERY=4, AD_DURATION=10;

function showAd(){
  return new Promise(resolve=>{
    adResolve=resolve;
    const overlay=document.getElementById('adOverlay');
    const bar=document.getElementById('adTimerBar'),label=document.getElementById('adTimerLabel');
    const skipBtn=document.getElementById('adSkipBtn'),cdTxt=document.getElementById('adCountdown');
    if(!overlay){ resolve(); return; }
    skipBtn.disabled=true; cdTxt.textContent=AD_DURATION; label.textContent=AD_DURATION;
    bar.style.transition='none'; bar.style.transform='scaleX(1)';
    overlay.classList.add('active');
    void bar.offsetWidth;
    bar.style.transition=`transform ${AD_DURATION}s linear`; bar.style.transform='scaleX(0)';
    let rem=AD_DURATION;
    adTimer=setInterval(()=>{ rem--; cdTxt.textContent=rem; label.textContent=rem; if(rem<=0){ clearInterval(adTimer); skipBtn.disabled=false; skipBtn.innerHTML='Continue Discovering ✦'; } },1000);
    skipBtn.onclick=()=>{ if(!skipBtn.disabled){ clearInterval(adTimer); overlay.classList.remove('active'); if(adResolve){adResolve();adResolve=null;} } };
  });
}

function renderDiscover(filter){
  if(filter!==undefined) swipeFilter=filter;
  // If Firebase hasn't returned any users yet, show nothing — not the empty state
  if(S.fbReady && allUsers.length===0){
    const empty=document.getElementById('swipeEmpty');
    if(empty) empty.style.display='none';
    return;
  }
  let users=allUsers.filter(u=>u.uid!==S.user?.uid);
  if(swipeFilter!=='all') users=users.filter(u=>u.interests?.some(i=>i.toLowerCase().includes(swipeFilter)));
  // Filter out blocked users and users who blocked me
  users=users.filter(u=>!swipeSkipped.has(u.uid)&&!chattedWith.has(u.uid)&&!blockedUsers.has(u.uid)&&!blockedByUsers.has(u.uid));
  swipeQueue=users; buildSwipeStack();
}

function buildSwipeStack(){
  const stack=document.getElementById('swipeStack');
  const empty=document.getElementById('swipeEmpty');
  if(!stack) return;
  stack.innerHTML='';
  if(!swipeQueue.length){
    // Only show empty state if users have already loaded (allUsers is populated)
    // This prevents showing it on first render before Firebase data arrives
    if(empty) empty.style.display = (allUsers.length > 0 || swipeHadUsers) ? '' : 'none';
    return;
  }
  swipeHadUsers=true;
  if(empty) empty.style.display='none';
  swipeQueue.slice(0,3).forEach(u=>stack.insertBefore(buildCard(u),stack.firstChild));
  attachDrag(stack.lastElementChild,swipeQueue[0]);
}

function buildCard(u){
  const av=avColor(u.uid),ini=initials(u.name),ms=calcMatch(u),status=S.fbReady?getFriendStatus(u.uid):'none',priv=u.isPrivate;
  let btns='';
  if(status==='friends') btns=`<button class="cb-btn cb-btn-chat" data-uid="${u.uid}" data-action="chat">💬 Open Chat</button>`;
  else if(status==='requested') btns=`<button class="cb-btn cb-btn-req" disabled>✓ Request Sent</button>`;
  else if(priv) btns=`<button class="cb-btn cb-btn-chat" data-uid="${u.uid}" data-action="msgReq">💬 Message + Request</button><button class="cb-btn cb-btn-req" data-uid="${u.uid}" data-action="req">🤝 Request Only</button>`;
  else btns=`<button class="cb-btn cb-btn-chat" data-uid="${u.uid}" data-action="chat">💬 Start Chatting</button>`;
  const privNote=priv?`<div class="cb-note">🔒 Private — message goes as a request. Chat unlocks when accepted.</div>`:'';
  const card=document.createElement('div'); card.className='swipe-card'; card.dataset.uid=u.uid;
  card.innerHTML=`<div class="card-inner">
    <div class="card-face card-front">
      <div class="cf-top">
        <div class="cf-av-row">
          <div class="av ${av} cf-av">${ini}${u.online?'<div class="cf-ondot"></div>':''}</div>
          <div><div class="cf-name">${esc(u.name)}</div><div class="cf-handle">${esc(u.handle||'')}</div></div>
          <div style="margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:6px">
            <div class="cf-match">⚡ ${ms}%</div>${priv?'<div class="cf-priv-badge">🔒 Private</div>':''}
          </div>
        </div>
        <div class="cf-loc">📍 ${esc(u.location||'Earth')}</div>
        <div class="cf-bio">${esc(u.bio||'')}</div>
        <div class="cf-tags">${(u.interests||[]).map((t,i)=>`<span class="tag ${tagColor(i)}">${esc(t)}</span>`).join('')}</div>
      </div>
      <div class="cf-bottom"><div class="cf-tap-hint">👆 Tap to connect · swipe to skip</div></div>
    </div>
    <div class="card-face card-back">
      <div class="cb-av ${av}">${ini}</div>
      <div class="cb-name">${esc(u.name)}</div>
      <div class="cb-bio">${esc(u.bio||'')}</div>
      <div class="cb-divider"></div>
      <div class="cb-btns">${btns}<button class="cb-btn cb-btn-back" data-action="flip">← Back</button></div>
      ${privNote}
    </div>
  </div>`;
  card.querySelector('.card-front').addEventListener('click',()=>card.classList.add('flipped'));
  card.querySelector('[data-action="flip"]').addEventListener('click',e=>{ e.stopPropagation(); card.classList.remove('flipped'); });
  card.querySelectorAll('[data-action]:not([data-action="flip"])').forEach(btn=>btn.addEventListener('click',e=>{ e.stopPropagation(); handleCardAction(btn.dataset.action,btn.dataset.uid); }));
  return card;
}

async function handleCardAction(action,uid){
  if(action==='chat'||action==='msgReq'){ openChat(uid); skipTopCard(); }
  else if(action==='req'){ await window.sendFriendRequest(uid,null); skipTopCard(); }
}

async function skipTopCard(animate=false){
  swipeCount++;
  if(swipeCount%AD_EVERY===0){
    if(animate){ const top=document.getElementById('swipeStack')?.lastElementChild; if(top){ top.style.transition='transform .35s ease'; top.style.transform='translateX(-120vw) rotate(-25deg)'; await new Promise(r=>setTimeout(r,350)); } }
    swipeQueue.shift(); buildSwipeStack(); await showAd(); return;
  }
  if(animate){ const top=document.getElementById('swipeStack')?.lastElementChild; if(top){ top.style.transition='transform .35s ease'; top.style.transform='translateX(-120vw) rotate(-25deg)'; setTimeout(()=>{ swipeQueue.shift(); buildSwipeStack(); },350); return; } }
  swipeQueue.shift(); buildSwipeStack();
}

function attachDrag(card,user){
  if(!card||!user) return;
  let sx=0,cx=0,drag=false;
  const onStart=e=>{ if(card.classList.contains('flipped')) return; drag=true; sx=e.type==='touchstart'?e.touches[0].clientX:e.clientX; card.style.transition='none'; };
  const onMove=e=>{ if(!drag) return; cx=(e.type==='touchmove'?e.touches[0].clientX:e.clientX)-sx; card.style.transform=`translateX(${cx}px) rotate(${cx*.07}deg)`; const nope=document.getElementById('swipeLabelNope'); if(nope) nope.style.opacity=Math.abs(cx)>40?Math.min((Math.abs(cx)-40)/60,1):0; };
  const onEnd=()=>{ if(!drag) return; drag=false; const nope=document.getElementById('swipeLabelNope'); if(nope) nope.style.opacity=0; card.style.transition=''; if(Math.abs(cx)>100){ const dir=cx>0?1:-1; card.style.transform=`translateX(${dir*120}vw) rotate(${dir*25}deg)`; swipeSkipped.add(user.uid); setTimeout(()=>{ swipeQueue.shift(); buildSwipeStack(); },350); }else{ card.style.transform=''; } cx=0; };
  card.addEventListener('mousedown',onStart); card.addEventListener('touchstart',onStart,{passive:true});
  window.addEventListener('mousemove',onMove); window.addEventListener('touchmove',onMove,{passive:true});
  window.addEventListener('mouseup',onEnd); window.addEventListener('touchend',onEnd);
}

function calcMatch(user){
  if(!S.profile?.interests) return Math.floor(70+Math.random()*25);
  const mine=S.profile.interests.map(i=>i.toLowerCase()), theirs=(user.interests||[]).map(i=>i.toLowerCase());
  return Math.min(99,60+Math.min(mine.filter(i=>theirs.includes(i)).length*15,40)+Math.floor(Math.random()*15));
}

// ══════════════════════════════
//  FRIEND REQUESTS
// ══════════════════════════════
let myFriends=new Set(),sentRequests=new Set(),incomingRequests=[],sentRequestsList=[];
let blockedUsers=new Set(), blockedByUsers=new Set(); // uids I blocked / uids who blocked me

async function loadFriendData(){
  if(!S.fbReady||!S.user) return;
  const uid=S.user.uid, ref=collection(S.db,'friendRequests');
  // Load blocks: documents I created blocking others
  onSnapshot(query(collection(S.db,'blocks'),where('blockerUid','==',uid)),snap=>{
    blockedUsers=new Set();
    snap.forEach(d=>blockedUsers.add(d.data().blockedUid));
    renderDiscover(); renderChatList(); renderBlockedList();
  });
  // Load blocks where I am the blocked person
  onSnapshot(query(collection(S.db,'blocks'),where('blockedUid','==',uid)),snap=>{
    blockedByUsers=new Set();
    snap.forEach(d=>blockedByUsers.add(d.data().blockerUid));
    renderDiscover(); renderChatList();
  });
  onSnapshot(query(ref,where('toUid','==',uid)),snap=>{
    incomingRequests=[]; myFriends=new Set();
    snap.forEach(d=>{ const r={id:d.id,...d.data()}; incomingRequests.push(r); if(r.status==='accepted') myFriends.add(r.fromUid); });
    updateReqBadge(); renderDiscover(); renderChatList();
    if(document.getElementById('reqTabIncoming')?.classList.contains('active')) renderReqList('incoming');
  });
  onSnapshot(query(ref,where('fromUid','==',uid)),snap=>{
    sentRequestsList=[]; sentRequests=new Set();
    snap.forEach(d=>{ const r={id:d.id,...d.data()}; sentRequestsList.push(r); if(r.status==='pending') sentRequests.add(r.toUid); if(r.status==='accepted') myFriends.add(r.toUid); });
    if(document.getElementById('reqTabSent')?.classList.contains('active')) renderReqList('sent');
  });
}

function updateReqBadge(){ const p=incomingRequests.filter(r=>r.status==='pending').length,b=document.getElementById('reqBadge'); if(!b) return; p>0?(b.textContent=p,b.classList.remove('hidden')):b.classList.add('hidden'); }
function getFriendStatus(uid){ if(myFriends.has(uid)) return 'friends'; if(sentRequests.has(uid)) return 'requested'; if(incomingRequests.find(r=>r.fromUid===uid&&r.status==='pending')) return 'incoming'; return 'none'; }

window.sendFriendRequest=async function(uid,e){
  if(e) e.stopPropagation();
  if(!S.fbReady){ toast('Connect Firebase to use this feature','err'); return; }
  try{
    const ex=await getDocs(query(collection(S.db,'friendRequests'),where('fromUid','==',S.user.uid),where('toUid','==',uid)));
    if(!ex.empty){ toast('Request already sent!'); return; }
    await addDoc(collection(S.db,'friendRequests'),{fromUid:S.user.uid,toUid:uid,fromName:S.profile.name,fromHandle:S.profile.handle,fromBio:S.profile.bio||'',status:'pending',createdAt:serverTimestamp()});
    toast('Friend request sent! 🤝');
  }catch(e){ toast('Failed','err'); }
};

async function acceptRequest(rid,fromUid){ try{ await updateDoc(doc(S.db,'friendRequests',rid),{status:'accepted'}); toast('Friend accepted! 🎉'); setTimeout(()=>openChat(fromUid),400); }catch(e){ toast('Error','err'); } }
async function declineRequest(rid){ try{ await updateDoc(doc(S.db,'friendRequests',rid),{status:'declined'}); toast('Declined'); }catch(e){ toast('Error','err'); } }
async function cancelRequest(rid){ try{ await deleteDoc(doc(S.db,'friendRequests',rid)); toast('Cancelled'); }catch(e){ toast('Error','err'); } }

window.showReqTab=(tab)=>{ document.getElementById('reqTabIncoming').classList.toggle('active',tab==='incoming'); document.getElementById('reqTabSent').classList.toggle('active',tab==='sent'); renderReqList(tab); };
function showRequestsPanel(){ document.getElementById('discPanel').classList.add('hidden'); document.getElementById('chatPanel').classList.remove('active'); document.getElementById('requestsPanel').classList.remove('hidden'); document.querySelectorAll('.sb-menu-item').forEach(i=>i.classList.remove('active')); document.querySelector('.sb-nav-item[data-view="requests"]')?.classList.add('active'); renderReqList('incoming'); }
function renderReqList(tab){
  const list=document.getElementById('reqList'); if(!list) return; list.innerHTML='';
  const items=tab==='incoming'?incomingRequests.filter(r=>r.status==='pending'):sentRequestsList.filter(r=>r.status==='pending');
  if(!items.length){ list.innerHTML=`<div class="empty" style="padding:40px 0"><div class="empty-ico">${tab==='incoming'?'📭':'📤'}</div><h3>${tab==='incoming'?'No incoming requests':'No sent requests'}</h3></div>`; return; }
  items.forEach(r=>{
    const user=tab==='incoming'?allUsers.find(u=>u.uid===r.fromUid)||{name:r.fromName,handle:r.fromHandle,bio:r.fromBio,uid:r.fromUid}:allUsers.find(u=>u.uid===r.toUid)||{name:'User',handle:'',uid:r.toUid};
    const card=document.createElement('div'); card.className='req-card';
    card.innerHTML=`<div class="req-card-hd"><div class="av av-sm ${avColor(user.uid)}">${initials(user.name||'?')}</div><div class="req-card-info"><div class="req-card-name">${esc(user.name||'Unknown')}</div><div class="req-card-handle">${esc(user.handle||'')}</div></div><span class="req-status-badge pending">Pending</span></div><div class="req-card-bio">${esc(user.bio||r.fromBio||'')}</div><div class="req-card-acts">${tab==='incoming'?`<button class="btn-accept" data-id="${r.id}">Accept ✓</button><button class="btn-decline" data-id="${r.id}">Decline</button>`:`<button class="btn-cancel-req" data-id="${r.id}">Cancel</button>`}</div>`;
    if(tab==='incoming'){ card.querySelector('.btn-accept').onclick=()=>acceptRequest(r.id,r.fromUid); card.querySelector('.btn-decline').onclick=()=>declineRequest(r.id); }
    else card.querySelector('.btn-cancel-req').onclick=()=>cancelRequest(r.id);
    list.appendChild(card);
  });
}

// ══════════════════════════════
//  CHAT LIST
// ══════════════════════════════
function renderChatList(){
  const list=document.getElementById('chatList'); list.innerHTML='';
  if(!S.fbReady){ const users=allUsers.slice(0,4); if(!users.length){ list.innerHTML='<div style="padding:20px;text-align:center;color:var(--t3);font-size:13px">No chats yet.<br>Discover people to connect!</div>'; return; } users.forEach(u=>addChatItem(list,u)); return; }
  const users=allUsers.filter(u=>chattedWith.has(u.uid)&&!blockedUsers.has(u.uid)&&!blockedByUsers.has(u.uid));
  if(!users.length){ list.innerHTML=`<div style="padding:24px 16px;text-align:center;color:var(--t3);font-size:13px;line-height:1.7">No chats yet 💬<br><span style="font-size:12px">Go to <strong style="color:var(--t2)">Discover</strong> to find people</span></div>`; return; }
  users.forEach(u=>addChatItem(list,u));
}
function addChatItem(list,u){
  const item=document.createElement('div'); item.className='sb-menu-item'; item.dataset.uid=u.uid;
  const isFriend=S.fbReady&&getFriendStatus(u.uid)==='friends';
  item.innerHTML=`<div class="av av-sm ${avColor(u.uid)}" style="flex-shrink:0;position:relative">${initials(u.name)}${u.online?'<div class="ondot"></div>':''}</div><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(u.name)}${isFriend?' ✓':''}</div><div style="font-size:11px;color:var(--t3);margin-top:1px">${u.online?'🟢 Online':'Last seen recently'}</div></div>`;
  item.onclick=()=>{ openChat(u.uid); closeSidebar(); };
  list.appendChild(item);
}

// ══════════════════════════════
//  OPEN CHAT
// ══════════════════════════════
window.startChat=(uid,e)=>{ if(e) e.stopPropagation(); openChat(uid); };
async function openChat(uid){
  if(S.fbReady){ const user=allUsers.find(u=>u.uid===uid); if(user?.isPrivate&&getFriendStatus(uid)!=='friends'){ toast('Send a friend request to chat 🔒','err'); return; } }
  S.chatId=uid;
  const user=allUsers.find(u=>u.uid===uid)||DEMO_USERS.find(u=>u.uid===uid); if(!user) return;
  S.chatUser=user; markChattedWith(uid);
  document.getElementById('discPanel').classList.add('hidden');
  document.getElementById('chatPanel').classList.add('active');
  document.body.classList.add('chat-open');
  const av=avColor(uid),chAv=document.getElementById('chAv'); chAv.className=`av ${av}`; chAv.textContent=initials(user.name);
  document.getElementById('chName').textContent=user.name;
  document.getElementById('chStatus').textContent=user.online?'🟢 Online now':'⚪ Last seen recently';
  updateProfPanel(user);
  // Show/hide block button and chat input based on block state
  const isBlocked=blockedUsers.has(uid)||blockedByUsers.has(uid);
  const inpArea=document.querySelector('.chat-inp-area');
  const blockBtn=document.getElementById('btnBlockUser');
  // Remove old blocked banner if any
  document.getElementById('chatBlockedBanner')?.remove();
  if(isBlocked){
    if(inpArea) inpArea.style.display='none';
    const banner=document.createElement('div');
    banner.id='chatBlockedBanner'; banner.className='chat-blocked-banner';
    banner.innerHTML=blockedUsers.has(uid)
      ? '<div class="blocked-ico">🚫</div><div>You have blocked this user.<br><small style="opacity:.7">Unblock them in Settings to chat again.</small></div>'
      : '<div class="blocked-ico">🚫</div><div>You can\'t send messages to this user.</div>';
    document.getElementById('msgsContainer').after(banner);
  } else {
    if(inpArea) inpArea.style.display='';
    if(blockBtn) blockBtn.style.display=blockedByUsers.has(uid)?'none':'';
  }
  if(S.unsubMsgs){S.unsubMsgs();S.unsubMsgs=null;}
  if(!S.fbReady){ renderDemoMessages(uid); return; }
  const roomId=[S.user.uid,uid].sort().join('_');
  const q=query(collection(S.db,'chats',roomId,'messages'),orderBy('createdAt','asc'));
  const container=document.getElementById('msgsContainer');
  container.innerHTML='<div style="text-align:center;padding:20px;color:var(--t3);font-size:12px">Loading...</div>';
  S.unsubMsgs=onSnapshot(q,snap=>{
    container.innerHTML='';
    if(snap.empty){ container.innerHTML=`<div class="empty"><div class="empty-ico">💬</div><h3>Start the conversation</h3><p>Say hey to ${esc(user.name)}!</p></div>`; return; }
    let lastDate='';
    snap.forEach(d=>{ const msg=d.data(); const ds=msg.createdAt?.toDate?msg.createdAt.toDate().toDateString():'Today'; if(ds!==lastDate){ lastDate=ds; const div=document.createElement('div'); div.className='ddiv'; div.innerHTML=`<span>${ds===new Date().toDateString()?'Today':ds}</span>`; container.appendChild(div); } appendMessage(msg,container); });
    container.scrollTop=container.scrollHeight;
  });
}

function appendMessage(msg,container){
  const isSent=msg.senderId===(S.user?.uid||S.profile?.uid);
  const g=document.createElement('div'); g.className=`mg ${isSent?'sent':'recv'}`;
  if(msg.type==='image') g.innerHTML=`<div class="msg-img" onclick="openLightbox('${msg.imageUrl}')"><img src="${msg.imageUrl}" alt="Photo" loading="lazy"/></div><div class="mt">${fmtTime(msg.createdAt)}</div>`;
  else g.innerHTML=`<div class="mb">${esc(msg.text)}</div><div class="mt">${fmtTime(msg.createdAt)}</div>`;
  container.appendChild(g);
}

// ══════════════════════════════
//  SEND MESSAGE + IMAGE UPLOAD
// ══════════════════════════════
async function sendMsg(text,images=[]){
  if(!S.chatId) return;
  const uid=S.chatId,myUid=S.user?.uid||S.profile?.uid;
  if(!S.fbReady){ if(!DEMO_MSGS[uid]) DEMO_MSGS[uid]=[]; if(text.trim()) DEMO_MSGS[uid].push({senderId:'me',text:text.trim(),createdAt:new Date(),type:'text'}); images.forEach(url=>DEMO_MSGS[uid].push({senderId:'me',imageUrl:url,createdAt:new Date(),type:'image'})); renderDemoMessages(uid); simulateReply(uid); return; }
  const roomId=[myUid,uid].sort().join('_'), msgsRef=collection(S.db,'chats',roomId,'messages');
  try{
    if(text.trim()) await addDoc(msgsRef,{senderId:myUid,text:text.trim(),type:'text',createdAt:serverTimestamp()});
    for(const img of images){ const url=await uploadImage(img); if(url) await addDoc(msgsRef,{senderId:myUid,imageUrl:url,type:'image',createdAt:serverTimestamp()}); }
  }catch(e){ toast('Failed to send: '+e.message,'err'); }
}

function showUploadUI(){ document.getElementById('uploadProg').classList.add('active'); }
function hideUploadUI(){ document.getElementById('uploadProg').classList.remove('active'); document.getElementById('uploadFill').style.width='0%'; document.getElementById('uploadPct').textContent='0%'; }
function setUploadProgress(p){ document.getElementById('uploadFill').style.width=p+'%'; document.getElementById('uploadPct').textContent=p+'%'; }
async function uploadImage(dataUrl){
  showUploadUI();
  try{ const c=await compressImage(dataUrl,800,.75); for(let p=10;p<=90;p+=20){setUploadProgress(p);await new Promise(r=>setTimeout(r,60));} setUploadProgress(100); await new Promise(r=>setTimeout(r,200)); hideUploadUI(); return c; }
  catch(e){ hideUploadUI(); return dataUrl; }
}
function compressImage(dataUrl,maxW,q){ return new Promise(res=>{ const img=new Image(); img.onload=()=>{ const c=document.createElement('canvas'); let w=img.width,h=img.height; if(w>maxW){h=Math.round(h*maxW/w);w=maxW;} c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h); res(c.toDataURL('image/jpeg',q)); }; img.onerror=()=>res(dataUrl); img.src=dataUrl; }); }

// ══════════════════════════════
//  CHAT INPUT
// ══════════════════════════════
function initChatInput(){
  const ta=document.getElementById('chatInput');
  ta.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSend();} });
  ta.addEventListener('input',()=>{ ta.style.height='auto'; ta.style.height=Math.min(ta.scrollHeight,110)+'px'; });
  document.getElementById('sendBtn').onclick=handleSend;
  document.getElementById('attachBtn').onclick=()=>document.getElementById('imgInput').click();
  document.getElementById('imgInput').addEventListener('change',e=>{ Array.from(e.target.files).forEach(f=>{ const r=new FileReader(); r.onload=ev=>{S.pendingImgs.push(ev.target.result);renderPreviews();}; r.readAsDataURL(f); }); e.target.value=''; });
}
function handleSend(){ const ta=document.getElementById('chatInput'),text=ta.value; if(!text.trim()&&!S.pendingImgs?.length) return; if(!S.chatId){toast('Select a chat first!','err');return;} sendMsg(text,[...(S.pendingImgs||[])]); ta.value='';ta.style.height='auto';S.pendingImgs=[];renderPreviews(); }
function renderPreviews(){ const strip=document.getElementById('imgPrevStrip'); strip.innerHTML=''; (S.pendingImgs||[]).forEach((img,i)=>{ const t=document.createElement('div'); t.className='prev-thumb'; t.innerHTML=`<img src="${img}"/><button class="prev-rm" onclick="removePreview(${i})">✕</button>`; strip.appendChild(t); }); }
window.removePreview=i=>{S.pendingImgs?.splice(i,1);renderPreviews();};

// ══════════════════════════════
//  PROFILE PANEL
// ══════════════════════════════
function toggleProfPanel(){ document.getElementById('profPanel').classList.toggle('active'); }
function updateProfPanel(u){ const av=avColor(u.uid); document.getElementById('ppAv').className=`av av-lg ${av}`; document.getElementById('ppAv').textContent=initials(u.name); document.getElementById('ppName').textContent=u.name; document.getElementById('ppHandle').textContent=u.handle||'@user'; document.getElementById('ppBio').textContent=u.bio||''; document.getElementById('ppLoc').textContent='📍 '+(u.location||'Earth'); document.getElementById('ppTags').innerHTML=(u.interests||[]).map((t,i)=>`<span class="tag ${tagColor(i)}">${esc(t)}</span>`).join(''); document.getElementById('ppMatch').textContent=`⚡ ${calcMatch(u)}% match with you`; }

// ══════════════════════════════
//  SETTINGS
// ══════════════════════════════
function openSettings(){ if(S.profile){ document.getElementById('set-name').value=S.profile.name||''; document.getElementById('set-bio').value=S.profile.bio||''; document.getElementById('set-private').checked=S.profile.isPrivate||false; } renderBlockedList(); document.getElementById('settingsModal').classList.add('active'); }
async function saveSettings(){ const name=document.getElementById('set-name').value.trim(),bio=document.getElementById('set-bio').value.trim(),priv=document.getElementById('set-private').checked; if(!name){toast('Name cannot be empty','err');return;} S.profile.name=name;S.profile.bio=bio;S.profile.isPrivate=priv;S.profile.handle='@'+name.toLowerCase().replace(/\s+/g,'.'); if(S.fbReady&&S.user) await updateDoc(doc(S.db,'users',S.user.uid),{name,bio,isPrivate:priv,handle:S.profile.handle}).catch(()=>{}); updateSidebarProfile(); document.getElementById('settingsModal').classList.remove('active'); toast(priv?'Profile updated! 🔒 Private':'Profile updated! 🌐 Public'); }

// ══════════════════════════════
//  BLOCK / UNBLOCK
// ══════════════════════════════
function promptBlock(uid){
  if(!uid||!S.fbReady){ toast('Connect Firebase to use this feature','err'); return; }
  const user=allUsers.find(u=>u.uid===uid)||{name:'this user',handle:''};
  document.getElementById('blockModalText').innerHTML=
    `Are you sure you want to block <strong style="color:var(--t1)">${esc(user.name)}</strong>?`;
  document.getElementById('blockModal').classList.add('active');
  document.getElementById('confirmBlockBtn').onclick=()=>blockUser(uid);
}

async function blockUser(uid){
  if(!S.fbReady||!S.user) return;
  try{
    document.getElementById('blockModal').classList.remove('active');
    toast('Blocking user...');
    const myUid=S.user.uid;
    // 1. Write block document
    await addDoc(collection(S.db,'blocks'),{blockerUid:myUid,blockedUid:uid,createdAt:serverTimestamp()});
    // 2. Delete chat messages from both sides
    const roomId=[myUid,uid].sort().join('_');
    try{
      const msgs=await getDocs(collection(S.db,'chats',roomId,'messages'));
      const dels=msgs.docs.map(d=>deleteDoc(d.ref));
      await Promise.all(dels);
    }catch(e){}
    // 3. Remove from chattedWith for both users
    try{
      await updateDoc(doc(S.db,'users',myUid),{chattedWith: (await getDoc(doc(S.db,'users',myUid))).data()?.chattedWith?.filter(id=>id!==uid)||[]});
      await updateDoc(doc(S.db,'users',uid),{chattedWith: (await getDoc(doc(S.db,'users',uid))).data()?.chattedWith?.filter(id=>id!==myUid)||[]});
    }catch(e){}
    // 4. Remove from friend requests
    try{
      const reqs=await getDocs(query(collection(S.db,'friendRequests'),where('fromUid','in',[myUid,uid]),where('toUid','in',[myUid,uid])));
      await Promise.all(reqs.docs.map(d=>deleteDoc(d.ref)));
    }catch(e){}
    // 5. Update local state
    blockedUsers.add(uid);
    chattedWith.delete(uid);
    // 6. Close chat panel
    if(S.chatId===uid){
      S.chatId=null;
      if(S.unsubMsgs){S.unsubMsgs();S.unsubMsgs=null;}
      document.getElementById('chatPanel').classList.remove('active');
      showDiscover();
    }
    toast('User blocked. They won\'t appear in your Discover. 🚫');
    renderChatList(); renderBlockedList();
  }catch(e){ toast('Failed to block: '+e.message,'err'); }
}

async function unblockUser(uid){
  if(!S.fbReady||!S.user) return;
  try{
    const myUid=S.user.uid;
    // Remove block doc
    const snap=await getDocs(query(collection(S.db,'blocks'),where('blockerUid','==',myUid),where('blockedUid','==',uid)));
    await Promise.all(snap.docs.map(d=>deleteDoc(d.ref)));
    blockedUsers.delete(uid);
    toast('User unblocked! 💜');
    renderBlockedList(); renderDiscover();
  }catch(e){ toast('Failed to unblock','err'); }
}

async function unblockAndChat(uid){
  await unblockUser(uid);
  // Add directly to chattedWith (skip discover)
  await markChattedWith(uid);
  setTimeout(()=>openChat(uid),400);
  document.getElementById('settingsModal').classList.remove('active');
}

function renderBlockedList(){
  const list=document.getElementById('blockedList'); if(!list) return;
  const count=document.getElementById('blockedCount');
  if(!blockedUsers.size){
    list.innerHTML='<div style="text-align:center;padding:20px;color:var(--t3);font-size:13px">No blocked users ✦</div>';
    if(count) count.textContent='0 blocked';
    return;
  }
  if(count) count.textContent=blockedUsers.size+' blocked';
  list.innerHTML='';
  blockedUsers.forEach(uid=>{
    const user=allUsers.find(u=>u.uid===uid)||{name:'Unknown User',handle:'',uid};
    const card=document.createElement('div'); card.className='blocked-card';
    card.innerHTML=`
      <div class="av av-sm ${avColor(uid)}">${initials(user.name)}</div>
      <div class="blocked-card-info">
        <div class="blocked-card-name">${esc(user.name)}</div>
        <div class="blocked-card-handle">${esc(user.handle||'')}</div>
      </div>
      <div class="blocked-card-acts">
        <button class="btn-blocked-chat" data-uid="${uid}">💬 Add</button>
        <button class="btn-unblock" data-uid="${uid}">Unblock</button>
      </div>`;
    card.querySelector('.btn-unblock').onclick=()=>unblockUser(uid);
    card.querySelector('.btn-blocked-chat').onclick=()=>unblockAndChat(uid);
    list.appendChild(card);
  });
}

// ══════════════════════════════
//  LIGHTBOX
// ══════════════════════════════
window.openLightbox=src=>{ document.getElementById('lbImg').src=src; document.getElementById('lightbox').classList.add('active'); };

// ══════════════════════════════
//  DEMO DATA
// ══════════════════════════════
const DEMO_USERS=[
  {uid:'du1',name:'Aanya Sharma',handle:'@aanya.s',bio:'Designer by day, dreamer by night. Typography, lo-fi beats, and midnight chai ✨',interests:['Design','Music','Books'],location:'Mumbai, IN',online:true},
  {uid:'du2',name:'Rohan Dev',handle:'@rohan.dev',bio:'Full stack dev. JavaScript, sarcasm, occasionally touching grass 🌿',interests:['Coding','Gaming','Music'],location:'Bangalore, IN',online:true},
  {uid:'du3',name:'Zara Khan',handle:'@zarakhan',bio:'Poet with a camera. Manifesting my solo trip to Japan 🗾',interests:['Photography','Poetry','Travel'],location:'Delhi, IN',online:false},
  {uid:'du4',name:'Kabir Mehta',handle:'@kabir.m',bio:'Economics student. Hot takes about markets, cold takes about life.',interests:['Finance','Memes','Reading'],location:'Pune, IN',online:true},
  {uid:'du5',name:'Priya Nair',handle:'@priya.creates',bio:'Content creator who actually touches grass. Slow living advocate 🌸',interests:['Mental Health','Yoga','Cooking'],location:'Chennai, IN',online:true},
];
const DEMO_MSGS={
  'du1':[{senderId:'du1',text:'omg hey!! finally someone who gets it 😭',createdAt:new Date(Date.now()-3600000),type:'text'},{senderId:'me',text:'RIGHT?? like this app actually lets us vibe without being judged lol',createdAt:new Date(Date.now()-3500000),type:'text'}],
  'du2':[{senderId:'du2',text:'bro you built this app? thats actually insane 👀',createdAt:new Date(Date.now()-86400000),type:'text'},{senderId:'me',text:'haha ai assisted but learned a ton in the process',createdAt:new Date(Date.now()-86300000),type:'text'}],
};
function renderDemoMessages(uid){ const container=document.getElementById('msgsContainer'); container.innerHTML=''; const msgs=DEMO_MSGS[uid]||[]; if(!msgs.length){container.innerHTML=`<div class="empty"><div class="empty-ico">💬</div><h3>Start the conversation</h3></div>`;return;} const dd=document.createElement('div');dd.className='ddiv';dd.innerHTML='<span>Today</span>';container.appendChild(dd); msgs.forEach(m=>appendMessage(m,container)); container.scrollTop=container.scrollHeight; }
function simulateReply(uid){ setTimeout(()=>{ const tg=document.createElement('div');tg.className='mg recv';tg.id='typingInd';tg.innerHTML='<div class="typing"><div class="td"></div><div class="td"></div><div class="td"></div></div>';document.getElementById('msgsContainer')?.appendChild(tg);document.getElementById('msgsContainer').scrollTop=99999; },700); setTimeout(()=>{ document.getElementById('typingInd')?.remove(); const replies=['omg yes exactly!! 😭','hahaha no way 💀','okay but why is this so relatable','we literally have the same brain cell','okay you get it fr fr 🔥']; const r=replies[Math.floor(Math.random()*replies.length)]; if(!DEMO_MSGS[uid]) DEMO_MSGS[uid]=[]; DEMO_MSGS[uid].push({senderId:uid,text:r,createdAt:new Date(),type:'text'}); renderDemoMessages(uid); },2400); }