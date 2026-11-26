/* ======================= STATE ======================= */
const store={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},
  set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
const LESSON_BY_KEY=new Map(LESSONS.map(l=>[l.key,l]));
const LESSON_ALIASES=new Map([['review:結合韻','review:介音']]);
// v1 indices predate the curriculum reorder: ORDER retains the old symbol/audio order.
const V1_LESSONS=[
  ...UNITS.filter(u=>u.kind==='sym').sort((a,b)=>ORDER.indexOf(a.sy[0])-ORDER.indexOf(b.sy[0])),
  ...UNITS.filter(u=>u.kind!=='sym'),
].flatMap(u=>u.lessons.map(id=>LESSONS[id]));
const emptyProgress=()=>({v:2,stars:{},acc:{},sym:{}});
const isRecord=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const countValue=v=>Number.isSafeInteger(v)&&v>=0;
function readProgress(raw){
  const out=emptyProgress();
  if(!isRecord(raw)||(raw.v!==undefined&&raw.v!==2))return out;
  const legacy=raw.v===undefined;
  const keyOf=k=>{
    if(legacy)return /^(0|[1-9]\d*)$/.test(k)?V1_LESSONS[Number(k)]?.key:null;
    const key=LESSON_ALIASES.get(k)||k;return LESSON_BY_KEY.has(key)?key:null;
  };
  for(const [id,n] of Object.entries(isRecord(raw.stars)?raw.stars:{})){
    const key=keyOf(id);if(key&&Number.isInteger(n)&&n>0&&n<=3)out.stars[key]=Math.max(out.stars[key]||0,n);
  }
  for(const [id,r] of Object.entries(isRecord(raw.acc)?raw.acc:{})){
    const key=keyOf(id);
    if(key&&isRecord(r)&&['m','n','t'].every(k=>countValue(r[k]))&&
       (!out.acc[key]||r.t>out.acc[key].t||r.t===out.acc[key].t&&id===key))out.acc[key]={m:r.m,n:r.n,t:r.t};
  }
  // v1 has no per-symbol history; do not invent attempts from lesson completion.
  if(!legacy)for(const [s,r] of Object.entries(isRecord(raw.sym)?raw.sym:{})){
    if(Object.hasOwn(SYM,s)&&isRecord(r)&&['ok','ng','t'].every(k=>countValue(r[k])))out.sym[s]={ok:r.ok,ng:r.ng,t:r.t};
  }
  // daily task (3-4): only the date it was last finished
  if(!legacy&&isRecord(raw.daily)&&/^\d{4}-\d{2}-\d{2}$/.test(raw.daily.d))out.daily={d:raw.daily.d};
  return out;
}
let P=readProgress(store.get('zy-progress',null));
store.set('zy-progress',P); // persist migration, fresh starts, and repaired saves immediately
let S=store.get('zy-settings',{rate:0.8,unlockAll:false});
const save=()=>{store.set('zy-progress',P);store.set('zy-settings',S)};
const starsOf=l=>l?P.stars[l.key]||0:0;
/* 3-3 spaced review: which learned symbols are due. Score = smoothed error rate + up to 0.5 for time since
   last practice (full after 7 days). A symbol never practiced on its own counts as half-learned (0.6). */
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
function dueScore(s,now=Date.now()){const r=P.sym[s];if(!r)return .6;
  return (r.ng+1)/(r.ok+r.ng+2)+Math.min((now-r.t)/864e5/7,1)*.5}
function dueSymbols(n){
  const L=[...learned()];
  return L.map(s=>[s,dueScore(s)+Math.random()*.05]).sort((a,b)=>b[1]-a[1]).slice(0,n).map(x=>x[0])}
const dailyDone=()=>!!P.daily&&P.daily.d===today();
const totalStars=()=>Object.values(P.stars).reduce((a,b)=>a+b,0);
const unlocked=id=>S.unlockAll||id===0||starsOf(LESSONS[id-1])>0||starsOf(LESSONS[id])>0;
const currentId=()=>{for(const l of LESSONS) if(!starsOf(l)) return l.id; return -1};
const learned=()=>{const set=new Set();LESSONS.forEach(l=>{if(l.type==='sym'&&starsOf(l))set.add(l.s)});return set};
function recordPractice(symbols,ok){
  const t=Date.now();
  for(const s of new Set(symbols)){
    if(!Object.hasOwn(SYM,s))continue;
    const r=P.sym[s]||(P.sym[s]={ok:0,ng:0,t:0});r[ok?'ok':'ng']++;r.t=t;
  }
  store.set('zy-progress',P); // keep attempts even when the lesson is left unfinished
}
const INITIALS=new Set(UNITS.filter(u=>u.kind==='sym'&&u.tag==='聲母').flatMap(u=>[...u.sy]));
const FINALS=new Set(UNITS.filter(u=>u.kind==='sym'&&['韻母','介音'].includes(u.tag)).flatMap(u=>[...u.sy]));
function simpleSymbols(zy){
  const sy=[...zy.replace(/[ˊˇˋ˙]/g,'')];
  // A single symbol or consonant + vowel/medial. Skip future three-part/complex items.
  const single=sy.length===1&&Object.hasOwn(SYM,sy[0]);
  const pair=sy.length===2&&INITIALS.has(sy[0])&&FINALS.has(sy[1]);
  return single||pair?sy:[];
}

/* ======================= UTIL ======================= */
const $=s=>document.querySelector(s);
const h=(html)=>{const t=document.createElement('template');t.innerHTML=html.trim();return t.content.firstElementChild};
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]]}return a};
const pick=a=>a[Math.random()*a.length|0];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const cssv=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const wordText=s=>SYM[s].w.map(x=>x[0]).join('');
/* Example-word picture (roadmap 4-1): inline SVG sized by the parent font-size; emoji if a picture is missing. */
const pic=s=>ART[s]?`<svg viewBox="0 0 100 100" width="1em" height="1em" aria-hidden="true" focusable="false" style="display:block">${ART[s]}</svg>`:SYM[s].e;

// Zhuyin column beside a character
function zc(zy,{hl=null,blank=null}={}){
  let tone='';const last=zy.slice(-1);
  if('ˊˇˋ˙'.includes(last)){tone=last;zy=zy.slice(0,-1)}
  const ls=[...zy].map(c=>blank&&c===blank?'<span class="blank">?</span>':hl&&c===hl?`<span class="hl">${c}</span>`:`<span>${c}</span>`).join('');
  return `<span class="zc">${tone==='˙'?'<span class="dot">˙</span>':''}<span class="ls">${ls}</span>${tone&&tone!=='˙'?`<span class="tn">${tone}</span>`:'<span class="tn" style="visibility:hidden">ˋ</span>'}</span>`;
}
const wz=(ch,zy,o)=>`<span class="wz"><span class="ch">${ch}</span>${zc(zy,o)}</span>`;
const wordHTML=(s,o)=>`<span class="wd">${SYM[s].w.map(([c,z])=>wz(c,z,o)).join('')}</span>`;

/* Only the top modal handles keys/focus. Nested dialogs temporarily inert their
   siblings, restoring each previous inert value when released. */
const MODALS=[];
const focusableSelector='button,a[href],input,select,textarea,[tabindex]';
function modalTargets(root){
  return [...root.querySelectorAll(focusableSelector)].filter(el=>{
    const style=getComputedStyle(el);
    return !el.disabled&&el.tabIndex>=0&&!el.closest('[inert]')&&el.getClientRects().length&&style.visibility!=='hidden'&&style.opacity!=='0';
  });
}
function focusModal(entry){(modalTargets(entry.root)[0]||entry.dialog).focus()}
function modalKey(e){
  const entry=MODALS[MODALS.length-1];if(!entry||!entry.root.isConnected)return;
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();entry.onEscape();return}
  if(e.key!=='Tab')return;
  const targets=modalTargets(entry.root),i=targets.indexOf(document.activeElement);
  if(!targets.length){e.preventDefault();entry.dialog.focus()}
  else if(e.shiftKey&&i<=0){e.preventDefault();targets[targets.length-1].focus()}
  else if(!e.shiftKey&&(i<0||i===targets.length-1)){e.preventDefault();targets[0].focus()}
}
function modalFocus(e){
  const entry=MODALS[MODALS.length-1];
  if(entry&&entry.root.isConnected&&!entry.root.contains(e.target))focusModal(entry);
}
function holdModal(root,{dialog=root,opener=document.activeElement,onEscape,initial}={}){
  const entry={root,dialog,opener,onEscape,blocked:[]};
  dialog.setAttribute('aria-modal','true');dialog.setAttribute('tabindex','-1');
  for(let branch=root;branch.parentElement;branch=branch.parentElement){
    const parent=branch.parentElement;
    for(const sibling of parent.children)if(sibling!==branch&&!['SCRIPT','STYLE','LINK'].includes(sibling.tagName)){
      entry.blocked.push([sibling,sibling.inert]);sibling.inert=true;
    }
    if(parent===document.body)break;
  }
  if(!MODALS.length){document.addEventListener('keydown',modalKey,true);document.addEventListener('focusin',modalFocus,true)}
  MODALS.push(entry);
  if(initial)initial.focus({preventScroll:true});else focusModal(entry);
  return ()=>{
    const index=MODALS.indexOf(entry);if(index<0)return;
    // Releasing a lesson also releases any exit question still inside it.
    while(MODALS.length>index){const old=MODALS.pop();old.blocked.forEach(([el,inert])=>{el.inert=inert})}
    if(!MODALS.length){document.removeEventListener('keydown',modalKey,true);document.removeEventListener('focusin',modalFocus,true)}
    const target=typeof opener==='function'?opener():opener;
    if(target&&target.isConnected&&!target.closest('[inert]'))target.focus();
    else if(MODALS.length)focusModal(MODALS[MODALS.length-1]);
    else $('#'+(tab==='path'?'tabPath':'tabChart')).focus({preventScroll:true});
  };
}

/* ======================= MASCOT (original orange cat 「橘子老師」) ======================= */
function catSVG(mood='happy'){
  const eyes = mood==='happy'
   ? '<path d="M33 52q5-7 10 0M57 52q5-7 10 0" stroke="#3A2414" stroke-width="4" fill="none" stroke-linecap="round"/>'
   : mood==='think'
   ? '<circle cx="38" cy="51" r="5" fill="#3A2414"/><circle cx="62" cy="51" r="5" fill="#3A2414"/><circle cx="39.5" cy="49" r="1.8" fill="#fff"/><circle cx="63.5" cy="49" r="1.8" fill="#fff"/>'
   : '<path d="M31 50l12 4M69 50l-12 4" stroke="#3A2414" stroke-width="4" stroke-linecap="round"/><circle cx="38" cy="56" r="4" fill="#3A2414"/><circle cx="62" cy="56" r="4" fill="#3A2414"/>';
  const mouth = mood==='happy'
   ? '<path d="M42 64q8 10 16 0" fill="#E9546B" stroke="#3A2414" stroke-width="3" stroke-linejoin="round"/>'
   : '<path d="M44 66q6 4 12 0" stroke="#3A2414" stroke-width="3" fill="none" stroke-linecap="round"/>';
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
   <path d="M18 40L22 8L44 26Z" fill="var(--cat)" stroke="var(--cat-d)" stroke-width="3" stroke-linejoin="round"/>
   <path d="M82 40L78 8L56 26Z" fill="var(--cat)" stroke="var(--cat-d)" stroke-width="3" stroke-linejoin="round"/>
   <path d="M24 30L25 15L37 25Z" fill="#FFB8C2"/><path d="M76 30L75 15L63 25Z" fill="#FFB8C2"/>
   <ellipse cx="50" cy="56" rx="38" ry="34" fill="var(--cat)" stroke="var(--cat-d)" stroke-width="3"/>
   <path d="M38 24q4 6 0 12M50 22q4 7 0 14M62 24q4 6 0 12" stroke="var(--cat-d)" stroke-width="3.5" fill="none" stroke-linecap="round"/>
   <ellipse cx="50" cy="68" rx="20" ry="15" fill="var(--cat-belly)"/>
   ${eyes}
   <path d="M46 60h8l-4 4z" fill="#E9546B"/>${mouth}
   <circle cx="27" cy="63" r="5" fill="#FF8FA0" opacity=".55"/><circle cx="73" cy="63" r="5" fill="#FF8FA0" opacity=".55"/>
   <path d="M8 58l14 2M9 67l13-2M92 58l-14 2M91 67l-13-2" stroke="var(--cat-d)" stroke-width="2.2" stroke-linecap="round"/>
  </svg>`;
}
const SPK='<svg viewBox="0 0 24 24"><path d="M4 9h3.5L13 4.5v15L7.5 15H4z"/><path d="M16 8.5a5 5 0 0 1 0 7" stroke="currentColor" fill="none" stroke-width="2.2" stroke-linecap="round" style="stroke:var(--on-color)"/><path d="M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke-width="2.2" stroke-linecap="round" style="stroke:var(--on-color)"/></svg>';

/* ======================= AUDIO ======================= */
let voice=null, hasZh=true;
function pickVoice(){
  if(!('speechSynthesis' in window)){hasZh=false;return}
  const vs=speechSynthesis.getVoices(); if(!vs.length) return;
  voice = vs.find(v=>/zh[-_]TW/i.test(v.lang)) || vs.find(v=>/zh[-_]HK/i.test(v.lang)&&/Mandarin|國語/i.test(v.name)) || vs.find(v=>/^zh/i.test(v.lang)) || null;
  hasZh=!!voice;
}
if('speechSynthesis' in window){pickVoice();speechSynthesis.onvoiceschanged=pickVoice}
/* Recorded clips (7-1). clips.js maps a line key to a file in audio/. A line with no clip, or a clip
   that fails to play, falls back to speech synthesis, so the game works with zero clips. */
const CLIP_MAP=typeof CLIPS==='object'&&CLIPS?CLIPS:{};
const HAS_CLIPS=Object.keys(CLIP_MAP).length>0;
const clipKey=t=>String(t).replace(/[！？，。、「」：\s!?,.:]/g,'');
const AU=HAS_CLIPS&&typeof Audio==='function'?new Audio():null;
let auFin=null; // ends the clip that is playing now
function stopClip(){if(auFin)auFin(true);if(AU){try{AU.pause()}catch(e){}}}
/* iOS plays audio from a timer only if the same element first played during a tap */
if(AU){const unlock=()=>{removeEventListener('pointerdown',unlock,true);
  const n=400,b=new Uint8Array(44+n),v=new DataView(b.buffer),w=(o,s)=>[...s].forEach((c,i)=>b[o+i]=c.charCodeAt(0));
  w(0,'RIFF');v.setUint32(4,36+n,true);w(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
  v.setUint32(24,8000,true);v.setUint32(28,8000,true);v.setUint16(32,1,true);v.setUint16(34,8,true);w(36,'data');v.setUint32(40,n,true);b.fill(128,44);
  if(!auFin){AU.src=URL.createObjectURL(new Blob([b],{type:'audio/wav'}));AU.play().catch(()=>{})}};
  addEventListener('pointerdown',unlock,true)}
/* Clips play at natural speed; only the parent's "slow" setting slows them. rate 1 marks a prompt line. */
function playClip(file,rate){
  return new Promise(res=>{
    stopClip();
    let done=false;const fin=ok=>{if(done)return;done=true;if(auFin===fin)auFin=null;AU.onended=AU.onerror=null;res(ok)};
    auFin=fin;
    AU.onended=()=>fin(true);AU.onerror=()=>fin(false);
    AU.src='audio/'+file;AU.preservesPitch=true;AU.playbackRate=(rate!==1&&S.rate<.7)?.8:1;
    setTimeout(()=>fin(true),10000);
    AU.play().catch(()=>fin(false));
  });
}
/* key: clip lookup key (default: the text without punctuation). Symbol sounds use 'sym:ㄅ'. */
async function speak(text,{rate,key}={}){
  key=key||clipKey(text);
  if(window.__keys)window.__keys.push(key); // test hook: which lines the game asks for
  const f=CLIP_MAP[key];
  if(f&&AU){try{speechSynthesis.cancel()}catch(e){}if(await playClip(f,rate))return}
  stopClip();return tts(text,{rate});
}
function tts(text,{rate}={}){
  return new Promise(res=>{
    if(!('speechSynthesis' in window)) return res();
    try{
      speechSynthesis.cancel();
      const u=new SpeechSynthesisUtterance(text);
      u.lang=voice?voice.lang:'zh-TW'; if(voice)u.voice=voice;
      u.rate=rate||S.rate; u.pitch=1.1;
      let done=false;const fin=()=>{if(!done){done=true;res()}};
      u.onend=fin;u.onerror=fin;setTimeout(fin,2500+text.length*500);
      speechSynthesis.speak(u);
    }catch(e){res()}
  });
}
const saySym=s=>speak(SYM[s].say,{rate:Math.min(S.rate,.75),key:'sym:'+s});
/* Tap to hear on-screen text (#7): a speaker icon in front of the text; tapping the icon or the text plays
   it. items are voiceSeq items (strings, or functions that return a promise). A new tap cancels the last one. */
/* AUD: one token for every speech sequence (automatic prompts, taps, speaker buttons). Starting a new
   sequence bumps it, so older sequences stop at their next await. It is separate from STEP, which owns
   lesson state, so interrupting speech never cancels gameplay. */
let AUD=0;
const GAP=500; // pause between clips in one sequence (owner's choice, 2026-11-22)
function hush(){AUD++;stopClip();try{speechSynthesis.cancel()}catch(e){}}
async function sayTap(items){const g=++AUD;
  for(const it of items){if(g!==AUD)return;await (typeof it==='string'?speak(it,{rate:1}):it());if(g!==AUD)return;await wait(GAP)}}
/* a single sound the child asked for (speaker, example, letter): stops any sequence that is talking */
const tap=fn=>()=>{AUD++;return fn()};
const READABLE=new WeakMap();
function readSentence(el){const items=READABLE.get(el);if(items)sayTap(typeof items==='function'?items():items)}
// Delegate text clicks so the plain text itself has no interactive role/listener.
// Only the native play button is a keyboard stop and announces the action.
function readTextClick(e){
  const el=e.target.closest('.readable');
  if(el&&!e.target.closest('button,a,input,select,textarea'))readSentence(el);
}
function readable(el,items){
  READABLE.set(el,items);
  if(!el.querySelector(':scope>.say'))el.insertAdjacentHTML('afterbegin',`<button class="say" type="button" aria-label="唸給我聽">${SPK.replace('<svg','<svg aria-hidden="true" focusable="false"')}</button>`);
  el.classList.add('readable');
  el.querySelector(':scope>.say').onclick=e=>{e.stopPropagation();readSentence(el)};
  return el}
let AC=null;
function tone(seq){
  try{AC=AC||new (window.AudioContext||window.webkitAudioContext)();
    let t=AC.currentTime;
    seq.forEach(([f,d,type='sine',vol=.18])=>{const o=AC.createOscillator(),g=AC.createGain();o.type=type;o.frequency.value=f;
      g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(g).connect(AC.destination);o.start(t);o.stop(t+d);t+=d*.7});
  }catch(e){}
}
const sfx={ok:()=>tone([[660,.12],[880,.12],[1320,.25]]),no:()=>tone([[220,.18,'triangle',.2],[180,.22,'triangle',.2]]),
  pop:()=>tone([[900,.06,'sine',.15],[1400,.08,'sine',.1]]),win:()=>tone([[523,.15],[659,.15],[784,.15],[1047,.4]])};

/* ======================= HOME: PATH ======================= */
const OFFS=[0,45,70,45,0,-45,-70,-45];
let tab='path';
function render(){
  hush(); // the old view's speech must not continue on the new one
  $('#starCount').textContent=totalStars();
  $('#tabPath').setAttribute('aria-selected',tab==='path');
  $('#tabChart').setAttribute('aria-selected',tab==='chart');
  $('#tabPath').tabIndex=tab==='path'?0:-1;$('#tabChart').tabIndex=tab==='chart'?0:-1;
  const m=$('#main');m.setAttribute('aria-labelledby',tab==='path'?'tabPath':'tabChart');m.innerHTML='';
  tab==='path'?renderPath(m):renderChart(m);
}
function renderPath(m){
  const cur=currentId();
  const curL=cur>=0?LESSONS[cur]:null;
  const msg = !curL ? '全部學完了！你是注音小達人！' :
    curL.type==='sym' ? `今天來認識 <span class="zy" style="font-size:1.3em;color:var(--sky)">${curL.s}</span>！` :
    curL.type==='review' ? '來玩複習遊戲，把學過的注音找出來！' : curL.type==='blend' ? '把兩個注音拼在一起，會變成一個字喔！' : '一起來聽聽四個聲調！';
  const hello=h(`<div class="hello">${catSVG('happy')}<p>${msg}<span class="sub">橘子老師陪你一起學注音</span></p></div>`);
  readable(hello.querySelector('p'),[...(curL&&curL.type==='sym'?['今天來認識',()=>saySym(curL.s)]:[msg]),'橘子老師陪你一起學注音']);
  m.appendChild(hello);
  if(learned().size>=3){ // 3-4 daily task: find 3 symbols the child needs most (3-3)
    const done=dailyDone();
    const card=h(`<div class="daily ${done?'done':''}"><div class="dt"><b>今日任務</b><p>${done?'今天的任務完成了！':'橘子老師想找三個注音，你可以幫忙嗎？'}</p></div>
      <button class="btn ${done?'ghost':'go'}" id="dailyGo">${done?'再玩一次':'開始'}</button></div>`);
    readable(card.querySelector('p'),[done?'今天的任務完成了！':'橘子老師想找三個注音，你可以幫忙嗎？']);
    card.querySelector('#dailyGo').onclick=e=>startLesson(dailyLesson(),e.currentTarget);
    m.appendChild(card);
  }
  let n=0;
  UNITS.forEach((u,ui)=>{
    const big=u.kind==='sym'?u.sy:u.big;
    const sec=h(`<section class="unit" style="--c:var(--${u.c});--cd:var(--${u.c}-d)">
      <div class="unit-head"><div class="t"><small>第 ${ui+1} 站・${u.tag}</small><b>${u.name}</b></div><span class="big">${big}</span></div>
      <div class="nodes"></div></section>`);
    const nodes=sec.querySelector('.nodes');
    u.lessons.forEach((id,k)=>{
      const L=LESSONS[id], open=unlocked(id), st=starsOf(L), x=OFFS[n++%OFFS.length];
      const label = L.type==='sym'?L.s : L.type==='review'?'🎈' : L.type==='blend'?(L.set[0][0]+L.set[0][1]) : '<span style="font-family:var(--f-ui);font-size:1.6rem">ˊˇˋ</span>';
      const w=h(`<div class="node-wrap" style="--x:${x}"></div>`);
      const name=nodeName(L), status=open?`${name}，${st?st+' 顆星':'還沒完成'}`:`尚未解鎖：${name}`;
      const b=h(`<button class="node ${open?'':'lock'} ${L.type==='review'?'review':''} ${id===cur?'cur':''}" data-lesson-key="${L.key}" aria-label="${status}" aria-disabled="${!open}"></button>`);
      if(L.type==='blend') b.style.fontSize='1.6rem';
      b.innerHTML = open ? label : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
      if(open){b.onclick=()=>startLesson(id,b)} else b.onclick=()=>{sfx.no()};
      w.appendChild(b);
      if(st) w.appendChild(h(`<div class="stars" aria-hidden="true">${[1,2,3].map(i=>`<i class="${i<=st?'on':''}">★</i>`).join('')}</div>`));
      if(id===cur){
        w.classList.add('has-tip');w.appendChild(h(`<div class="start-tip">開始！</div>`));
        const c=h(`<div class="side-cat ${x>0?'l':'r'}">${catSVG('happy')}</div>`); w.appendChild(c);
      }
      nodes.appendChild(w);
    });
    m.appendChild(sec);
  });
  // an open daily task (3-4) is the first thing to see; otherwise scroll to the current lesson
  requestAnimationFrame(()=>{const c=m.querySelector('.node.cur'),d=m.querySelector('.daily:not(.done)');
    if(renderPath.scrolled)return;renderPath.scrolled=1;if(d)scrollTo(0,0);else if(c)c.scrollIntoView({block:'center'})});
}

/* ======================= HOME: CHART ======================= */
function renderChart(m){
  const L=learned();
  const groups=new Map();
  UNITS.filter(u=>u.kind==='sym').forEach(u=>{
    if(!groups.has(u.tag))groups.set(u.tag,[]);groups.get(u.tag).push(...u.sy);
  });
  const wrap=h(`<div class="chart"></div>`);
  groups.forEach((arr,t)=>{
    wrap.appendChild(h(`<h2>${t}<small>${arr.length} 個</small></h2>`));
    const g=h(`<div class="grid"></div>`);
    arr.forEach(s=>{const b=h(`<button class="tile ${L.has(s)?'done':''}" aria-label="${s} ${wordText(s)}${L.has(s)?' 已學會':' 還沒學'}"><span class="s">${s}</span><span class="e">${pic(s)}</span></button>`);
      b.onclick=async()=>{b.classList.add('cat-bounce');setTimeout(()=>b.classList.remove('cat-bounce'),600);const g=++AUD;await saySym(s);if(g!==AUD)return;await wait(GAP);if(g===AUD)speak(wordText(s))};
      g.appendChild(b)});
    wrap.appendChild(g);
  });
  const note=h(`<p class="note">點一下注音，聽它怎麼唸，再聽一個例詞。綠色的是已經學過的注音。</p>`);
  wrap.appendChild(readable(note,['點一下注音，聽它怎麼唸，再聽一個例詞。綠色的是已經學過的注音。']));
  if(!hasZh&&!HAS_CLIPS) wrap.appendChild(h(`<div class="warn">這台裝置好像沒有中文語音。可以到系統設定加入「中文（台灣）」語音，或改用 Chrome、Edge、Safari 開啟，就能聽到發音。</div>`));
  m.appendChild(wrap);
}

/* ======================= LESSON ENGINE ======================= */
let LS=null; // {lesson, steps, i, mistakes, layer}
function distractors(target,n,poolHint,allowed=ORDER){
  const valid=new Set(ORDER.filter(s=>allowed.includes(s))),seen=new Set([target]),out=[];
  // Preserve priority when selecting; optionRow separately randomizes button positions.
  for(const pool of [CONFUSE[target]||[],[...learned()],poolHint||[],ORDER]){
    for(const s of shuffle([...new Set(pool)])){
      if(out.length>=n)return out;
      if(valid.has(s)&&!seen.has(s)){seen.add(s);out.push(s)}
    }
  }
  return out;
}
function dailyLesson(){return {key:'daily',type:'daily',syms:dueSymbols(3)}}
function buildSteps(L){
  if(L.type==='daily'){const peers=[...learned()];
    return L.syms.map((s,i)=>({t:['listen','bubbles','picture'][i%3],s,peers}));}
  const u=UNITS[L.ui];
  if(L.type==='sym'){const s=L.s, peers=[...u.sy];
    return [{t:'intro',s},{t:'listen',s,peers},{t:'trace',s},{t:'picture',s,peers},{t:'listenPic',s,peers},{t:'trace',s}];}
  if(L.type==='review'){const sy=[...u.sy];const a=shuffle(sy);
    return [{t:'bubbles',s:a[0],peers:sy},{t:'picture',s:a[1],peers:sy},{t:'listen',s:a[2],peers:sy},{t:'match',syms:a.slice(0,3),peers:sy},{t:'bubbles',s:a[1],peers:sy},{t:'listen',s:a[3%a.length],peers:sy},{t:'trace',s:pick(sy)}];}
  if(L.type==='blend'){const set=shuffle(L.set);
    return [{t:'blendDemo',it:set[0]},{t:'blendDemo',it:set[1]},{t:'blendPick',it:set[2],set},{t:'blendBuild',it:set[3],set},{t:'blendPick',it:set[4],set},{t:'blendBuild',it:set[5],set}];}
  if(L.type==='tone'){const set=L.set;
    return [{t:'toneDemo',set},...shuffle([0,1,2,3]).map(k=>({t:'tonePick',set,k}))];}
}
function startLesson(id,opener=document.activeElement){
  const L=typeof id==='object'?id:LESSONS[id];
  const layer=h(`<div class="layer" role="dialog" aria-label="課程"><div class="lesson-content"><div class="col">
     <div class="lbar"><button class="iconbtn" id="xBtn" aria-label="離開課程"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button><div class="prog"><i></i></div></div>
     <div class="stage" id="stage"></div>
     <div class="shelf" id="shelf" aria-hidden="true"></div></div>
     <div class="fb" id="fb"><div class="in"><div class="msg">${catSVG('happy')}<span id="fbTxt"></span></div><button class="btn go" id="fbGo">繼續</button></div></div></div></div>`);
  /* 4-5: stickers already earned fill the empty space on tall screens; the current symbol is left out, and review lessons show none, so no picture gives away an answer */
  layer.querySelector('#shelf').innerHTML=L.type!=='sym'?'':[...learned()].filter(s=>s!==L.s).slice(-6).map(s=>`<span class="stk" style="font-size:2.6rem">${pic(s)}</span>`).join('');
  document.body.appendChild(layer);
  document.body.style.overflow='hidden';
  LS={L,steps:buildSteps(L),i:0,mistakes:0,layer};
  layer.querySelector('#xBtn').onclick=askQuit;
  layer.querySelector('#fbGo').onclick=()=>{if(!LS||!LS.fbAt||Date.now()-LS.fbAt<400)return;LS.fbAt=0;next()};
  LS.releaseModal=holdModal(layer,{onEscape:askQuit,initial:layer.querySelector('#xBtn'),opener:()=>
    opener&&opener!==document.body&&opener.isConnected?opener:[...document.querySelectorAll('.node')].find(b=>b.dataset.lessonKey===L.key)});
  showStep();
}
/* STEP changes on every step switch and on quit; delayed speech checks it so an old step never talks over a new one (0-2). */
let STEP=0;
const live=t=>!!LS&&t===STEP;
function later(ms,fn){const t=STEP;setTimeout(()=>{if(live(t))fn()},ms)}
/* delayed speech: skipped if the step changed or any newer speech started meanwhile (a tap wins);
   fn gets the new audio generation for sayAll */
function laterSay(ms,fn){const t=STEP,g=AUD;setTimeout(()=>{if(live(t)&&g===AUD)fn(++AUD)},ms)}
function stopVoice(){STEP++;hush()}
function askQuit(){
  if(!LS||LS.layer.querySelector('.ask'))return;
  if(LS.done)return quitLesson();
  const t=STEP;
  const ask=h(`<div class="ask" role="alertdialog" aria-label="要離開嗎？"><div class="box">${catSVG('think')}
    <p>要離開嗎？</p>
    <div class="row"><button class="btn go" id="askStay"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>繼續玩</button>
    <button class="btn ghost" id="askLeave"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4H6v16h8M10 12h10M17 8l4 4-4 4"/></svg>離開</button></div></div></div>`);
  LS.layer.appendChild(ask);
  const stay=ask.querySelector('#askStay');
  const close=()=>{hush();ask.remove();release()};
  const release=holdModal(ask,{opener:LS.layer.querySelector('#xBtn'),onEscape:close,initial:stay});
  stay.onclick=close;
  ask.querySelector('#askLeave').onclick=quitLesson;
  hush();speak('要離開嗎',{rate:1});
}
function quitLesson(){const release=LS.releaseModal;stopVoice();LS.layer.remove();LS=null;document.body.style.overflow='';render();if(release)release()}
function setProg(){LS.layer.querySelector('.prog i').style.width=(LS.i/LS.steps.length*100)+'%'}
function showStep(){
  setProg(); stopVoice(); tickPlay();
  const st=LS.steps[LS.i], stage=LS.layer.querySelector('#stage');
  LS.layer.dataset.step=st.t;stage.dataset.step=st.t;
  stage.innerHTML=''; stage.scrollTop=0;
  const fb=LS.layer.querySelector('#fb');fb.classList.remove('show');fb.inert=true;LS.fbAt=0;LS.demo=false;
  stage.setAttribute('tabindex','-1');stage.focus({preventScroll:true});
  STEPS[st.t](stage,st);
}
/* say: what to speak, as voiceSeq items (default: the text). Split lines reuse clips for symbols and characters. */
async function correct(text,say){
  /* LS.demo: the game showed the answer after two misses (1-3), so no win sound and a calmer line */
  if(!LS.demo) sfx.ok();
  if(!text&&!LS.demo)text=pick(PRAISE);
  say=say||[text||'下次一定可以！'];
  if(LS.demo)say=['答案在這裡！',...say.filter(x=>x!=='對！').map(x=>typeof x==='string'?x.replace(/^對！/,''):x)];
  const p=LS.demo?'答案在這裡！'+(text?text.replace(/^對！/,''):'下次一定可以！'):text;
  LS.layer.querySelector('#fbTxt').textContent=p;
  const fb=LS.layer.querySelector('#fb');fb.inert=false;fb.classList.add('show');LS.fbAt=Date.now();
  LS.layer.querySelector('#fbGo').focus({preventScroll:true});
  /* the answer owns a new audio generation now, so older replays are dropped. After two misses the answer
     comes later (correct.since = that miss's generation): if the child started other speech meanwhile, stay quiet. */
  const fresh=correct.since==null||AUD===correct.since;correct.since=null;
  if(!fresh)return; // leave the newer speech alone (do not even bump AUD)
  const t=STEP,g=++AUD;
  setTimeout(()=>{if(live(t)&&g===AUD)sayAll(say,t,g)},350);
}
const ENCOURAGE=['再想想看！','沒關係，再試一次！','慢慢來，你可以的！'];
function catMood(mood){const c=LS&&LS.layer.querySelector('#stage .prompt svg');if(c)c.outerHTML=catSVG(mood)}
/* A miss: thinking face and a kind line. count=false for tracing, which never costs a mistake (1-5).
   Resolves true if the step is still on screen (gameplay). The promise's .g is this miss's audio generation:
   callers replay a sound only if AUD===p.g afterwards, i.e. nothing newer started talking. */
function wrong({count=true}={}){
  if(count)LS.mistakes++;
  sfx.no();catMood('think');
  const t=STEP,g=++AUD;
  const p=new Promise(r=>setTimeout(async()=>{
    if(live(t)&&g===AUD)await speak(pick(ENCOURAGE).replace(/！/g,''),{rate:1});
    if(live(t))catMood('happy');
    r(live(t));
  },250));
  p.g=g;return p;
}
/* Read the question aloud, then play its sounds, one after another (1-1). Strings are spoken; functions return a promise. */
async function sayAll(items,t,g=AUD){
  const on=()=>live(t)&&g===AUD;
  for(const it of items){if(!on())return;await (typeof it==='string'?speak(it,{rate:1}):it());if(!on())return;await wait(GAP)}}
function voiceSeq(items){const t=STEP,g=++AUD;(async()=>{await wait(300);await sayAll(items,t,g)})()}
/* 3-6 break reminder: play time adds up between steps (gaps over 5 minutes are not play). After 15 minutes
   the cat suggests a rest before the next step; 「再玩一下」 asks again 10 minutes later. Parents can turn it off. */
const PLAY={ms:0,last:0,next:15*60e3};
function tickPlay(){const now=Date.now(),d=now-PLAY.last;if(PLAY.last&&d>0&&d<5*60e3)PLAY.ms+=d;PLAY.last=now}
function next(){
  if(!LS||LS.done)return;
  tickPlay();
  if(S.breakOff!==true&&PLAY.ms>=PLAY.next&&LS.i+1<LS.steps.length)return askBreak();
  LS.i++;
  if(LS.i>=LS.steps.length) return finish();
  showStep();
}
function askBreak(){
  if(!LS||LS.layer.querySelector('.ask'))return;
  const ask=h(`<div class="ask" role="alertdialog" aria-label="休息一下"><div class="box">${catSVG('happy')}
    <p>玩了好一陣子了，讓眼睛休息一下吧！</p>
    <div class="row"><button class="btn go" id="brkRest">休息一下</button><button class="btn ghost" id="brkMore">再玩一下</button></div></div></div>`);
  LS.layer.appendChild(ask);
  readable(ask.querySelector('p'),['玩了好一陣子了，讓眼睛休息一下吧！']);
  const more=ask.querySelector('#brkMore');
  const cont=()=>{hush();ask.remove();release();PLAY.next=PLAY.ms+10*60e3;PLAY.last=Date.now();LS.i++;if(LS.i>=LS.steps.length)return finish();showStep()};
  const release=holdModal(ask,{opener:LS.layer.querySelector('#xBtn'),onEscape:cont,initial:more});
  more.onclick=cont;
  ask.querySelector('#brkRest').onclick=()=>{PLAY.ms=0;PLAY.next=15*60e3;PLAY.last=0;release();quitLesson()};
  hush();speak('玩了好一陣子了，讓眼睛休息一下吧！',{rate:1});
}
function finish(){
  if(LS.done)return; LS.done=true;
  setProg();
  const stars=3, perfect=LS.mistakes===0; // finishing earns all 3 stars (1-4)
  const key=LS.L.key,daily=LS.L.type==='daily';
  if(daily)P.daily={d:today()}; // the daily task gives no stars; it never blocks or punishes anything
  else{P.stars[key]=3; P.acc[key]={m:LS.mistakes,n:LS.steps.length,t:Date.now()}}
  save();
  const col=LS.layer.querySelector('.col');
  const fb=LS.layer.querySelector('#fb');fb.classList.remove('show');fb.inert=true;
  col.querySelector('.stage').outerHTML=`<div class="result">${catSVG('happy').replace('<svg','<svg class="big cat-bounce"')}
     <h2>${perfect?'完美過關！':'完成了！你好棒！'}</h2>
     ${daily?'':`<div class="bigstars">${[1,2,3].map(i=>`<i class="${i<=stars?'on':''}" style="animation-delay:${.2+i*.25}s">★</i>`).join('')}</div>`}
     <p>${daily?'謝謝你幫忙找到注音！':LS.L.type==='sym'?`你學會了 <span class="zy" style="font-size:1.5em;color:var(--sky)">${LS.L.s}</span>`:'又往前走了一站'}</p>
     <button class="btn go" id="doneBtn" style="margin-top:10px">回到地圖</button></div>`;
  const title=perfect?'完美過關！':'完成了，你好棒！', more=daily?['謝謝你幫忙找到注音！']:LS.L.type==='sym'?['你學會了',()=>saySym(LS.L.s)]:['又往前走了一站'];
  readable(col.querySelector('.result h2'),[title]);readable(col.querySelector('.result p'),more);
  const done=col.querySelector('#doneBtn');done.onclick=quitLesson;done.focus({preventScroll:true});
  sfx.win(); confetti();
  laterSay(400,g=>sayAll([title,...more],STEP,g));
}

/* ---------- step renderers ---------- */
function speakerBtn(fn,sm){const b=h(`<button class="speak ${sm?'sm':''}" aria-label="再聽一次">${SPK}</button>`);
  b.play=()=>{b.classList.remove('playing');void b.offsetWidth;b.classList.add('playing');return fn()};
  b.onclick=()=>{AUD++;b.play()};return b}
/* say: what the play icon reads (default: the text itself) */
function prompt(text,mood='happy',say){const el=h(`<div class="prompt">${catSVG(mood)}<span>${text}</span></div>`);
  readable(el.querySelector('span'),say||[text]);return el}
/* 4-4: the right answer flies to the end of the progress bar. Decoration only: not focusable, hidden from screen readers, skipped when reduced motion is on. */
function flyToProg(el){
  if(!LS||!el.animate||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const bar=LS.layer.querySelector('.prog'),r=el.getBoundingClientRect(),pr=bar.getBoundingClientRect();
  if(!r.width||!pr.width)return;
  const f=document.createElement('div');f.className='fly';f.setAttribute('aria-hidden','true');f.innerHTML=el.innerHTML;
  Object.assign(f.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});
  LS.layer.appendChild(f);
  const dx=pr.left+pr.width*Math.min(1,(LS.i+1)/LS.steps.length)-(r.left+r.width/2),dy=pr.top+pr.height/2-(r.top+r.height/2);
  const an=f.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${dx}px,${dy}px) scale(.2)`,opacity:.2}],{duration:600,easing:'cubic-bezier(.5,0,.8,.4)'});
  an.onfinish=an.oncancel=()=>f.remove();
}
function optionRow(items,target,onRight,{wide=false,label=null,render=null,symbols=[],cls=''}={}){
  const row=h(`<div class="opts"></div>`);let done=false,miss=0,tb=null;
  const win=b=>{done=true;b.classList.remove('glow');b.classList.add('ok');row.querySelectorAll('.opt').forEach(o=>{if(o!==b)o.classList.add('dim')})};
  shuffle(items).forEach(it=>{
    const b=h(`<button class="opt ${wide?'wide':''} ${cls}"></button>`);
    b.innerHTML=render?render(it):it;
    if(it===target)tb=b;
    b.onclick=async()=>{if(done)return;
      if(it===target){win(b);flyToProg(b);recordPractice(symbols,true);onRight&&onRight();return}
      b.classList.remove('no');void b.offsetWidth;b.classList.add('no');recordPractice(symbols,false);miss++;
      if(miss>=2){win(tb);const w=wrong();if(await w){LS.demo=true;correct.since=w.g;onRight&&onRight()}return} // 1-3: show the answer, move on
      tb.classList.add('glow'); // 1-2: hint the right one
      const w=wrong();if(await w&&AUD===w.g)label&&label()};
    row.appendChild(b)});
  return row;
}

const STEPS={
 intro(stage,{s}){
  stage.append(prompt('這是新朋友！點一下聽聽看','happy'));
  const card=h(`<div class="bigcard"><span class="s">${s}</span></div>`);
  const sp=speakerBtn(()=>saySym(s),true);
  card.querySelector('.s').onclick=()=>sp.click();
  const cr=h(`<div class="cardrow"></div>`);cr.append(card,sp);stage.append(cr);
  const ex=h(`<button class="example" aria-label="聽例詞"><span class="em">${pic(s)}</span>${wordHTML(s,{hl:s})}</button>`);
  ex.onclick=tap(()=>speak(wordText(s)));
  stage.append(ex);
  stage.append(readable(h(`<p class="hint">「${s}」就在「${wordText(s)}」裡面，紅色的就是它</p>`),[()=>saySym(s),`就在${wordText(s)}裡面，紅色的就是它`]));
  const go=h(`<button class="btn go">我記住了</button>`);go.onclick=next;stage.append(go);
  voiceSeq(['這是新朋友！點一下聽聽看',()=>sp.play(),()=>speak(wordText(s),{rate:1})]); // symbol, then its word: each part is a whole clip
 },
 listen(stage,{s,peers}){
  stage.append(prompt('聽一聽，是哪一個注音？'));
  const sp=speakerBtn(()=>saySym(s));stage.append(sp);
  stage.append(optionRow([s,...distractors(s,2,peers)],s,()=>correct(),{symbols:[s],label:()=>laterSay(400,()=>saySym(s))}));
  voiceSeq(['聽一聽，是哪一個注音？',()=>sp.play()]);
 },
 /* 5-6: the second listening question shows each choice with its example picture, so the sound, the letter and the word meet */
 listenPic(stage,{s,peers}){
  stage.append(prompt('聽一聽，是哪一個注音？'));
  const sp=speakerBtn(()=>saySym(s));stage.append(sp);
  stage.append(optionRow([s,...distractors(s,2,peers)],s,()=>correct(),{symbols:[s],cls:'withpic',render:it=>`<span class="zy1">${it}</span><span class="pic1" aria-hidden="true">${pic(it)}</span>`,label:()=>laterSay(400,()=>saySym(s))}));
  voiceSeq(['聽一聽，是哪一個注音？',()=>sp.play()]);
 },
 /* 5-7: match each symbol with the picture of its example word. Tapping a card plays its sound or word. */
 match(stage,{syms}){
  const text='把注音和圖片連在一起！';let left=null,right=null,found=0;
  stage.append(prompt(text));
  const grid=h(`<div class="match"></div>`);
  const L=h(`<div class="mcol"></div>`),R=h(`<div class="mcol"></div>`);grid.append(L,R);stage.append(grid);
  const cards=[];
  const mk=(side,s)=>{const b=h(`<button class="mc ${side}" aria-label="${side==='sym'?s:wordText(s)}">${side==='sym'?`<span class="zy1">${s}</span>`:`<span class="pic1" aria-hidden="true">${pic(s)}</span>`}</button>`);
    b.dataset.s=s;
    b.onclick=()=>{if(b.classList.contains('ok'))return;
      AUD++;(side==='sym'?saySym(s):speak(wordText(s)));
      const mine=side==='sym'?'left':'right';
      if(side==='sym'){left&&left.classList.remove('sel');left=b}else{right&&right.classList.remove('sel');right=b}
      b.classList.add('sel');
      if(left&&right){const a=left,c=right;left=right=null;
        if(a.dataset.s===c.dataset.s){[a,c].forEach(x=>{x.classList.remove('sel');x.classList.add('ok')});sfx.pop();recordPractice([a.dataset.s],true);found++;
          if(found===syms.length)later(500,()=>correct('全部配對成功！'))}
        else{[a,c].forEach(x=>{x.classList.remove('sel');x.classList.remove('no');void x.offsetWidth;x.classList.add('no')});recordPractice([a.dataset.s],false);wrong()}}};
    return b};
  syms.forEach(s=>L.append(mk('sym',s)));shuffle([...syms]).forEach(s=>R.append(mk('pic',s)));
  voiceSeq([text]);
 },
 picture(stage,{s,peers}){
  stage.append(prompt(`「${wordText(s)}」少了哪一個注音？`,'happy',[()=>speak(wordText(s),{rate:1}),'少了哪一個注音？']));
  const ex=h(`<button class="example" aria-label="聽例詞"><span class="em" style="font-size:4rem">${pic(s)}</span>${wordHTML(s,{blank:s})}</button>`);
  ex.onclick=tap(()=>speak(wordText(s)));stage.append(ex);
  stage.append(optionRow([s,...distractors(s,2,peers)],s,()=>{ex.innerHTML=`<span class="em" style="font-size:4rem">${pic(s)}</span>${wordHTML(s,{hl:s})}`;correct()},{symbols:[s]}));
  voiceSeq([()=>speak(wordText(s),{rate:1}),'少了哪一個注音？']);
 },
 trace(stage,{s}){
  stage.append(prompt(`沿著藍色的字，寫寫看「${s}」`,'happy',['沿著藍色的字，寫寫看',()=>saySym(s)]));
  const box=h(`<div class="trace"><div class="cross"></div><canvas class="g"></canvas><canvas class="u"></canvas></div>`);
  stage.append(box);
  const hint=h(`<p class="hint"></p>`);stage.append(hint);
  const setHint=t=>{hint.textContent=t;hint.classList.remove('readable');hint.onclick=null;if(t)readable(hint,[t])};
  const row=h(`<div class="row"></div>`);
  const clr=h(`<button class="btn ghost">擦掉</button>`), ok=h(`<button class="btn">寫好了</button>`);
  row.append(speakerBtn(()=>saySym(s),true),clr,ok);stage.append(row);
  const g=box.querySelector('.g'), u=box.querySelector('.u'), gc=g.getContext('2d'), uc=u.getContext('2d');
  let W=0, strokes=[], cur=null, passed=false, fails=0;
  const dpr=Math.max(1,window.devicePixelRatio||1);
  async function setup(){
    W=box.clientWidth; [g,u].forEach(c=>{c.width=c.height=W*dpr});
    gc.setTransform(dpr,0,0,dpr,0,0);uc.setTransform(dpr,0,0,dpr,0,0);
    try{await Promise.race([document.fonts.load(`700 80px "LXGW WenKai TC"`,s),wait(1500)])}catch(e){}
    gc.clearRect(0,0,W,W); drawGlyph(gc,s,W,cssv('--guide'),W*.035); drawGlyph(gc,s,W,cssv('--guide'));
    redraw();
  }
  const lw=()=>W*.085;
  /* 5-2: once the letter is done it turns into its picture (after a short pause so the child sees their writing first) */
  const alive=()=>box.append(h(`<div class="alive" aria-hidden="true" style="font-size:${(W*.62).toFixed(0)}px">${pic(s)}</div>`));
  function redraw(){uc.clearRect(0,0,W,W);uc.lineCap='round';uc.lineJoin='round';uc.lineWidth=lw();uc.strokeStyle=passed?cssv('--leaf'):cssv('--ink-stroke');
    strokes.forEach(st=>{uc.beginPath();st.forEach((p,i)=>i?uc.lineTo(p.x,p.y):uc.moveTo(p.x,p.y));if(st.length===1)uc.lineTo(st[0].x+.1,st[0].y);uc.stroke()})}
  const pt=e=>{const r=u.getBoundingClientRect();return{x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*W/r.height}};
  u.addEventListener('pointerdown',e=>{if(passed)return;u.setPointerCapture(e.pointerId);cur=[pt(e)];strokes.push(cur);redraw()});
  u.addEventListener('pointermove',e=>{if(!cur)return;cur.push(pt(e));redraw()});
  const end=()=>{cur=null};u.addEventListener('pointerup',end);u.addEventListener('pointercancel',end);
  clr.onclick=()=>{if(passed)return;strokes=[];redraw();setHint('')};
  ok.onclick=()=>{if(passed)return;
    if(!strokes.length){setHint('先用手指沿著藍色的字畫畫看');sayTap(['先用手指沿著藍色的字畫畫看']);return}
    const {cov,prec}=traceScore(s,strokes,W,lw());
    if(cov>=.45&&prec>=.5){recordPractice([s],true);passed=true;redraw();setHint('');alive();correct(cov>.75?'寫得好漂亮！':'寫得很好！')}
    else{
      recordPractice([s],false);
      if(++fails>=2){passed=true;redraw();setHint('');alive();correct('很努力喔！我們繼續！')}
      else{wrong({count:false});setHint(cov<.45?'還有一些地方沒有寫到，再試一次！':'要沿著藍色的字寫喔，再試一次！');setTimeout(()=>{strokes=[];redraw()},700)}
    }
  };
  requestAnimationFrame(setup);
  voiceSeq(['沿著藍色的字，寫寫看',()=>saySym(s)]);
 },
 bubbles(stage,{s,peers}){
  const need=3;let got=0,miss=0;
  stage.append(prompt('把所有的這個注音戳破！'));
  const tg=h(`<div class="target"><span class="zy">${s}</span><span class="count">0 / ${need}</span></div>`);
  tg.prepend(speakerBtn(()=>saySym(s),true));stage.append(tg);
  const pond=h(`<div class="pond"></div>`);stage.append(pond);
  const others=distractors(s,5,peers);
  const items=shuffle([s,s,s,...others.slice(0,5)]);
  /* 5-5: bubbles rise from the bottom at one shared speed, in three lanes with even spacing, so they never overlap.
     Reduced motion keeps them still on the old grid. */
  const still=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const W=pond.clientWidth||320,H=pond.clientHeight||300,L=H+90,V=26,lanes=[W*.17,W*.5,W*.83];
  const laneOf=items.map((_,i)=>i%3),laneN=[0,1,2].map(c=>laneOf.filter(x=>x===c).length),laneK=[0,0,0];
  const cells=shuffle([...Array(9).keys()]).slice(0,items.length);
  const moving=[];
  items.forEach((it,i)=>{const c=cells[i];let style;
    if(still){style=`left:${(c%3)*33+17+(Math.random()*8-4)}%;top:${Math.floor(c/3)*31+18+(Math.random()*8-4)}%;--dy:0px`}
    else{const ln=laneOf[i],k=laneK[ln]++;style=`left:${lanes[ln].toFixed(1)}px;top:0px;--dy:0px`;moving.push({i,ph:(k/laneN[ln])*L+(Math.random()*16-8)+ln*37})}
    const b=h(`<button class="bub" style="${style};--d:${(2+Math.random()*2).toFixed(2)}s;--dx:${(Math.random()*12-6)|0}px">${it}</button>`);
    b.onclick=()=>{if(got>=need||b.classList.contains('pop'))return;
      if(it===s){sfx.pop();b.classList.add('pop');got++;tg.querySelector('.count').textContent=`${got} / ${need}`;
        if(got===need){recordPractice([s],true);pond.classList.add('done');later(300,()=>correct('全部找到了！'))}}
      else{b.classList.remove('no');void b.offsetWidth;b.classList.add('no');
        if(++miss>=2)pond.querySelectorAll('.bub').forEach(x=>{if(x.textContent===s&&!x.classList.contains('pop'))x.classList.add('glow')});
        recordPractice([s],false);const w=wrong();w.then(ok=>{if(ok&&AUD===w.g)laterSay(300,()=>saySym(s))})}};
    pond.appendChild(b)});
  if(moving.length){const els=[...pond.querySelectorAll('.bub')],t0=performance.now(),t=STEP;
    const place=now=>{if(!pond.isConnected||!live(t))return;
      for(const m of moving){els[m.i].style.top=(H+45-((m.ph+V*(now-t0)/1000)%L)).toFixed(1)+'px'}
      requestAnimationFrame(place)};
    place(t0)}
  voiceSeq(['把所有的這個注音戳破！',()=>saySym(s)]);
 },
 blendDemo(stage,{it:[a,b,ch]}){
  stage.append(prompt('兩個注音拼在一起，會變成什麼？','happy'));
  const bl=h(`<div class="blend"><button class="p a">${a}</button><span class="op">＋</span><button class="p b">${b}</button></div>`);
  bl.querySelector('.a').onclick=tap(()=>saySym(a));bl.querySelector('.b').onclick=tap(()=>saySym(b));
  stage.append(bl);
  const res=h(`<button class="res" aria-label="聽">${wz(ch,a+b)}</button>`);res.onclick=tap(()=>speak(ch));stage.append(res);
  const go=h(`<button class="btn">拼拼看！</button>`);stage.append(go);
  voiceSeq(['兩個注音拼在一起，會變成什麼？']);
  let played=false;
  go.onclick=async()=>{
    if(played){next();return}
    played=true;go.disabled=true;const t=STEP,g=++AUD,say=f=>g===AUD?f():null; // speech stops if the child taps something else; the demo still finishes
    await say(()=>saySym(a));if(!live(t))return;await wait(GAP);await say(()=>saySym(b));if(!live(t))return;await wait(GAP);
    bl.classList.add('go');res.classList.add('show');sfx.pop();await wait(500);if(!live(t))return;await say(()=>speak(ch,{rate:.7}));
    go.textContent='繼續';go.disabled=false;go.classList.add('go');
  };
 },
 blendPick(stage,{it:[a,b,ch],set}){
  stage.append(prompt('聽一聽，是哪一個拼音？'));
  const sp=speakerBtn(()=>speak(ch,{rate:.7}));stage.append(sp);
  const others=shuffle(set.filter(x=>x[2]!==ch&&x[0]+x[1]!==a+b)).slice(0,2).map(x=>x[0]+x[1]);
  stage.append(optionRow([a+b,...others],a+b,()=>{correct(`對！${a}${b}，${ch}`,['對！',()=>saySym(a),()=>saySym(b),()=>speak(ch,{rate:.7})])},{symbols:simpleSymbols(a+b),wide:true,label:()=>laterSay(400,()=>speak(ch,{rate:.7}))}));
  voiceSeq(['聽一聽，是哪一個拼音？',()=>sp.play()]);
 },
 blendBuild(stage,{it:[a,b,ch]}){
  stage.append(prompt(`「${ch}」前面要放哪一個注音？`,'happy',[()=>speak(ch,{rate:.7}),'前面要放哪一個注音？']));
  const bl=h(`<div class="blend"><span class="p a"><span class="blank" style="font-size:1.6rem">?</span></span><span class="op">＋</span><span class="p b">${b}</span></div>`);
  stage.append(bl);
  const sp=speakerBtn(()=>speak(ch,{rate:.7}),true);stage.append(sp);
  const opts=[a,...distractors(a,2,['ㄅ','ㄆ','ㄇ','ㄈ','ㄉ','ㄊ','ㄍ','ㄎ','ㄏ','ㄓ'],[...INITIALS])];
  stage.append(optionRow(opts,a,async()=>{bl.querySelector('.a').textContent=a;correct(`${a}${b}，${ch}`,[()=>saySym(a),()=>saySym(b),()=>speak(ch,{rate:.7})])},{symbols:simpleSymbols(a),label:()=>laterSay(400,()=>speak(ch,{rate:.7}))}));
  voiceSeq([()=>speak(ch,{rate:.7}),'前面要放哪一個注音？']);
 },
 toneDemo(stage,{set}){
  stage.append(prompt('同一個拼音，有四種唱法，點點看！','happy'));
  const paths=['M4 8h36','M4 26L40 6','M4 8Q22 34 40 6','M4 6L40 26'];
  const g=h(`<div class="tones"></div>`);
  set.forEach(([ch,zy],k)=>{const b=h(`<button class="tcard"><span>${wz(ch,zy)}</span><span><svg viewBox="0 0 44 32"><path d="${paths[k]}"/></svg><small>${TONE_NAME[k]}</small></span></button>`);
    b.onclick=tap(()=>speak(ch,{rate:.7}));g.appendChild(b)});
  stage.append(g);
  const go=h(`<button class="btn go">我聽完了</button>`);go.onclick=next;stage.append(go);
  voiceSeq(['同一個拼音，有四種唱法，點點看！',...set.map(([ch])=>()=>speak(ch,{rate:.7}))]);
 },
 tonePick(stage,{set,k}){
  const [ch,zy]=set[k];
  stage.append(prompt('聽一聽，是第幾聲？'));
  const sp=speakerBtn(()=>speak(ch,{rate:.7}));stage.append(sp);
  const base=set[0][1];
  stage.append(optionRow([0,1,2,3],k,()=>correct(`對！「${ch}」是${TONE_NAME[k]}`),
    {symbols:simpleSymbols(zy),wide:true,render:i=>`<span>${zc(base+TONES[i]).replace('class="zc"','class="zc" style="font-size:1.7rem"')}<span class="lab">${TONE_NAME[i]}</span></span>`,
     label:()=>laterSay(400,()=>speak(ch,{rate:.7}))}));
  voiceSeq(['聽一聽，是第幾聲？',()=>sp.play()]);
 },
};

/* ---------- tracing ---------- */
const ZYFONT='"LXGW WenKai TC","BiauKai","DFKai-SB","Kaiti TC","STKaiti",serif';
function drawGlyph(c,sym,N,color,strokeW){
  c.save();c.font=`700 ${N*.7}px ${ZYFONT}`;c.textAlign='left';c.textBaseline='alphabetic';
  const m=c.measureText(sym);
  const w=m.actualBoundingBoxLeft+m.actualBoundingBoxRight, hh=m.actualBoundingBoxAscent+m.actualBoundingBoxDescent;
  const x=(N-w)/2+m.actualBoundingBoxLeft, y=(N-hh)/2+m.actualBoundingBoxAscent;
  if(strokeW){c.lineWidth=strokeW;c.strokeStyle=color;c.lineJoin='round';c.strokeText(sym,x,y)}
  else{c.fillStyle=color;c.fillText(sym,x,y)}
  c.restore();
}
function traceScore(sym,strokes,W,lw){
  const N=120,k=N/W,cv=document.createElement('canvas');cv.width=cv.height=N;const c=cv.getContext('2d',{willReadFrequently:true});
  drawGlyph(c,sym,N,'#000');const T=c.getImageData(0,0,N,N).data;
  c.clearRect(0,0,N,N);drawGlyph(c,sym,N,'#000');drawGlyph(c,sym,N,'#000',N*.13);const D=c.getImageData(0,0,N,N).data;
  c.clearRect(0,0,N,N);c.lineCap='round';c.lineJoin='round';c.lineWidth=lw*k*1.15;c.strokeStyle='#000';
  strokes.forEach(st=>{c.beginPath();st.forEach((p,i)=>i?c.lineTo(p.x*k,p.y*k):c.moveTo(p.x*k,p.y*k));if(st.length===1)c.lineTo(st[0].x*k+.1,st[0].y*k);c.stroke()});
  const U=c.getImageData(0,0,N,N).data;
  let t=0,tu=0,u=0,ud=0;
  for(let i=3;i<T.length;i+=4){const ti=T[i]>110,ui=U[i]>110;if(ti){t++;if(ui)tu++}if(ui){u++;if(D[i]>60)ud++}}
  return{cov:t?tu/t:0,prec:u?ud/u:0};
}

/* ---------- confetti ---------- */
function confetti(){
  const cv=$('#confetti');if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  cv.hidden=false;const c=cv.getContext('2d');cv.width=innerWidth;cv.height=innerHeight;
  const cols=['--sky','--leaf','--sun','--coral','--grape','--cat'].map(cssv);
  const ps=Array.from({length:140},()=>({x:innerWidth/2+(Math.random()-.5)*80,y:innerHeight*.35,vx:(Math.random()-.5)*14,vy:-Math.random()*14-4,r:Math.random()*6+4,c:pick(cols),a:Math.random()*6,va:(Math.random()-.5)*.3}));
  let f=0;(function tick(){c.clearRect(0,0,cv.width,cv.height);
    ps.forEach(p=>{p.vy+=.35;p.vx*=.99;p.x+=p.vx;p.y+=p.vy;p.a+=p.va;c.save();c.translate(p.x,p.y);c.rotate(p.a);c.fillStyle=p.c;c.fillRect(-p.r/2,-p.r/4,p.r,p.r/2);c.restore()});
    if(++f<150)requestAnimationFrame(tick);else{c.clearRect(0,0,cv.width,cv.height);cv.hidden=true}})();
}

/* ======================= SETTINGS ======================= */
function nodeName(L){const u=UNITS[L.ui];
  return L.type==='sym'?L.s:L.type==='review'?`複習：${u.name}`:`${u.name} 第 ${u.lessons.indexOf(L.id)+1} 組`}
function lessonName(L){const u=UNITS[L.ui];
  return L.type==='sym'?`認識 ${L.s}`:L.type==='review'?`複習・${u.name}`:L.type==='blend'?`拼音 ${u.lessons.indexOf(L.id)+1}`:`聲調 ${u.lessons.indexOf(L.id)+1}`}
function recordHTML(){
  const rows=Object.entries(P.acc).filter(([key])=>LESSON_BY_KEY.has(key)).sort((a,b)=>b[1].t-a[1].t).slice(0,5);
  if(!rows.length)return '<div class="set"><span>最近的課<small>還沒有紀錄</small></span></div>';
  return `<div class="set rec"><span>最近的課<small>每課都給 3 顆星；這裡記錄答錯幾次</small></span></div><ul class="rec-list">${
    rows.map(([key,r])=>`<li><span>${lessonName(LESSON_BY_KEY.get(key))}</span><b>${r.m?`答錯 ${r.m} 次`:'全對'}</b></li>`).join('')}</ul>`}

function progressReport(){
  const frequent=Object.entries(P.sym).map(([s,r])=>({s,...r,rate:r.ng/(r.ok+r.ng)}))
    .filter(r=>r.ok+r.ng>=3&&r.ng>0)
    .sort((a,b)=>b.rate-a.rate||b.ng-a.ng||ORDER.indexOf(a.s)-ORDER.indexOf(b.s)).slice(0,5);
  const times=[...Object.values(P.sym),...Object.values(P.acc)].map(r=>r.t)
    .filter(t=>t>0&&!Number.isNaN(new Date(t).getTime()));
  return{symbols:[...learned()],lessons:LESSONS.filter(l=>starsOf(l)>0).length,frequent,last:times.length?Math.max(...times):null};
}
function parentReportHTML(){
  const r=progressReport(),last=r.last?`<time datetime="${new Date(r.last).toISOString()}">${new Date(r.last).toLocaleDateString('zh-TW')}</time>`:'還沒有練習紀錄';
  return `<p id="reportCounts">學會的注音：${r.symbols.length} / ${ORDER.length}；完成課程：${r.lessons} / ${LESSONS.length}</p>
    <p id="reportSymbols">${r.symbols.length?r.symbols.join('、'):'還沒有完成注音課程。'}</p>
    <h5>常錯的注音</h5><p>列出練習至少 3 次且曾答錯的注音。</p>
    ${r.frequent.length?`<ol class="report-list" id="frequentSymbols">${r.frequent.map(it=>`<li data-symbol="${it.s}"><b class="zy">${it.s}</b><span>答對 ${it.ok} 次／答錯 ${it.ng} 次（${Math.round(it.rate*100)}%）</span></li>`).join('')}</ol>`:'<p id="reportEmpty">還沒有常錯的注音紀錄。</p>'}
    <p id="reportLast">上次練習：${last}</p><div id="recentRecords">${recordHTML()}</div>`;
}

function exportProgress(){return JSON.stringify({progress:P,settings:{rate:S.rate,unlockAll:S.unlockAll}},null,2)}
function parseProgressImport(text){
  let raw;try{raw=JSON.parse(text)}catch(e){throw Error('內容不是有效的 JSON。')}
  if(!isRecord(raw))throw Error('進度格式不正確。');
  const data=Object.hasOwn(raw,'progress')?raw.progress:raw;
  if(!isRecord(data)||(data.v!==undefined&&data.v!==2)||!isRecord(data.stars)||
     ['acc','sym'].some(k=>Object.hasOwn(data,k)&&!isRecord(data[k])))throw Error('進度格式不正確。');
  if(Object.values(data.stars).some(n=>!Number.isInteger(n)||n<1||n>3))throw Error('星星資料不正確。');
  for(const [field,keys] of [['acc',['m','n','t']],['sym',['ok','ng','t']]]){
    if(Object.values(data[field]||{}).some(r=>!isRecord(r)||keys.some(k=>!countValue(r[k]))))throw Error('練習資料不正確。');
  }
  const progress=readProgress(data);
  const hasEntries=['stars','acc','sym'].some(k=>Object.keys(data[k]||{}).length);
  if(hasEntries&&!['stars','acc','sym'].some(k=>Object.keys(progress[k]).length))throw Error('找不到可用的進度。');
  let settings=null;
  if(Object.hasOwn(raw,'settings')){
    const s=raw.settings;
    if(!isRecord(s)||![.6,.8,1].includes(s.rate)||typeof s.unlockAll!=='boolean')throw Error('設定格式不正確。');
    settings={rate:s.rate,unlockAll:s.unlockAll};
  }
  return{progress,settings};
}
function setupProgressTransfer(sh,onChange){
  const output=sh.querySelector('#exportText'),input=sh.querySelector('#importText');
  const status=sh.querySelector('#importStatus'),apply=sh.querySelector('#importApply');let pending=null;
  const clear=()=>{pending=null;apply.textContent='匯入';status.textContent=''};
  for(const [id,panelId,field] of [['exportBtn','exportPanel',output],['importBtn','importPanel',input]]){
    const button=sh.querySelector('#'+id),panel=sh.querySelector('#'+panelId);
    button.onclick=()=>{
      panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',!panel.hidden);
      if(!panel.hidden){if(id==='exportBtn'){output.value=exportProgress();sh.querySelector('#copyStatus').textContent=''}field.focus()}
      else button.focus();
    };
  }
  sh.querySelector('#copyProgress').onclick=async()=>{
    const message=sh.querySelector('#copyStatus');
    try{await navigator.clipboard.writeText(output.value);message.textContent='已複製。'}
    catch(e){output.focus();output.select();message.textContent='請複製已選取的文字。'}
  };
  input.oninput=clear;
  apply.onclick=()=>{
    try{
      const backup=parseProgressImport(input.value),before=exportProgress();
      if(!pending||pending.text!==input.value||pending.before!==before){
        pending={text:input.value,before};apply.textContent='再按一次確定';
        const after=Object.values(backup.progress.stars).reduce((a,b)=>a+b,0);
        status.textContent=`目前 ${totalStars()} 顆星 → 匯入後 ${after} 顆星。再按一次確定取代進度${backup.settings?'和設定':''}。`;return;
      }
      P=backup.progress;if(backup.settings)S=backup.settings;save();renderPath.scrolled=0;
      clear();status.textContent='已匯入進度。';onChange();
    }catch(e){clear();status.textContent=e.message}
  };
  return clear;
}
/* 1-7: a sum a 4-year-old cannot do keeps settings for grown-ups */
function parentGate(then,opener=document.activeElement){
  const a=11+(Math.random()*8|0),b=3+(Math.random()*6|0),ans=a+b;
  const opts=shuffle([ans,ans+1+(Math.random()*3|0),ans-1-(Math.random()*3|0)]);
  const sh=h(`<div class="sheet"><div class="box" role="dialog" aria-label="家長確認">
    <h3>家長確認</h3><p class="gate-q">${a} ＋ ${b} ＝ ？</p>
    <div class="row">${opts.map(o=>`<button class="btn ghost gate-o">${o}</button>`).join('')}</div>
    <button class="btn wide" id="gateX">取消</button></div></div>`);
  const close=()=>{sh.remove();release()};
  sh.querySelectorAll('.gate-o').forEach(btn=>btn.onclick=()=>{close();if(+btn.textContent===ans)then(opener)});
  sh.querySelector('#gateX').onclick=close;sh.onclick=e=>{if(e.target===sh)close()};
  document.body.appendChild(sh);
  const release=holdModal(sh,{dialog:sh.querySelector('.box'),opener,onEscape:close,initial:sh.querySelector('.gate-o')});
}
function openSettings(opener=document.activeElement){
  let armed=false;
  const sh=h(`<div class="sheet"><div class="box" role="dialog" aria-label="家長設定">
    <h3>家長設定</h3>
    <div class="set"><span>發音速度<small>給剛開始學的孩子用「慢」</small></span><div class="seg" id="rate">
      <button data-v="0.6">慢</button><button data-v="0.8">中</button><button data-v="1">快</button></div></div>
    <div class="set"><span>全部解鎖<small>可以直接跳到任何一課</small></span><button class="sw" role="switch" id="ul" aria-label="全部解鎖"></button></div>
    <div class="set"><span>休息提醒<small>玩 15 分鐘後，橘子老師提醒休息</small></span><button class="sw" role="switch" id="brk" aria-label="休息提醒"></button></div>
    <button class="btn ghost wide" id="reportBtn" aria-expanded="false" aria-controls="reportPanel">學習報告</button>
    <section class="parent-panel" id="reportPanel" hidden tabindex="0" aria-labelledby="reportHeading">
      <h4 id="reportHeading">學習報告</h4><div id="reportBody">${parentReportHTML()}</div></section>
    <div class="row"><button class="btn ghost" id="exportBtn" aria-expanded="false" aria-controls="exportPanel">匯出進度</button><button class="btn ghost" id="importBtn" aria-expanded="false" aria-controls="importPanel">匯入進度</button></div>
    <section class="parent-panel" id="exportPanel" hidden aria-labelledby="exportHeading">
      <h4 id="exportHeading">匯出進度</h4><label for="exportText">進度和設定</label>
      <textarea id="exportText" rows="7" readonly spellcheck="false"></textarea>
      <button class="btn" id="copyProgress">複製</button><p class="parent-status" id="copyStatus" role="status"></p></section>
    <section class="parent-panel" id="importPanel" hidden aria-labelledby="importHeading">
      <h4 id="importHeading">匯入進度</h4><label for="importText">貼上進度 JSON</label>
      <textarea id="importText" rows="7" spellcheck="false"></textarea><p>匯入會取代目前的進度。</p>
      <button class="btn" id="importApply">匯入</button><p class="parent-status" id="importStatus" role="status"></p></section>
    <div class="set"><span>清除學習紀錄<small>星星和進度會回到一開始</small></span><button class="btn ghost" id="rst" style="min-width:0;padding:10px 14px;font-size:.95rem">清除</button></div>
    ${hasZh||HAS_CLIPS?'':'<div class="warn">沒有找到中文語音：請在系統設定加入「中文（台灣）」語音，或改用 Chrome、Edge、Safari。</div>'}
    <p class="credit">注音發音：2017 © 教育部，國語注音符號手冊-開放部件（<a href="https://creativecommons.org/licenses/by/4.0/deed.zh_TW" target="_blank" rel="noopener">CC BY 4.0</a>）。題目與例詞：Microsoft Edge 語音合成（曉臻、曉雨）。</p>
    <button class="btn wide" id="cls">好了</button></div></div>`);
  const sync=()=>{sh.querySelectorAll('#rate button').forEach(b=>b.setAttribute('aria-pressed',+b.dataset.v===S.rate));sh.querySelector('#ul').setAttribute('aria-checked',!!S.unlockAll);sh.querySelector('#brk').setAttribute('aria-checked',S.breakOff!==true)};
  sh.querySelectorAll('#rate button').forEach(b=>b.onclick=()=>{S.rate=+b.dataset.v;save();sync();speak('注音小學堂')});
  sh.querySelector('#ul').onclick=()=>{S.unlockAll=!S.unlockAll;save();sync()};
  sh.querySelector('#brk').onclick=()=>{if(S.breakOff===true)delete S.breakOff;else S.breakOff=true;save();sync()};
  const rst=sh.querySelector('#rst');
  const reportPanel=sh.querySelector('#reportPanel'),reportButton=sh.querySelector('#reportBtn');
  reportButton.onclick=()=>{
    reportPanel.hidden=!reportPanel.hidden;reportButton.setAttribute('aria-expanded',!reportPanel.hidden);
    if(!reportPanel.hidden){sh.querySelector('#reportBody').innerHTML=parentReportHTML();reportPanel.focus()}
    else reportButton.focus();
  };
  const changed=()=>{sync();armed=false;rst.textContent='清除';rst.style.color='';sh.querySelector('#reportBody').innerHTML=parentReportHTML()};
  const clearImport=setupProgressTransfer(sh,changed);
  rst.onclick=()=>{if(!armed){armed=true;rst.textContent='再按一次確定';rst.style.color='var(--coral-d)';return}
    P=emptyProgress();save();clearImport();changed();rst.textContent='已清除';renderPath.scrolled=0};
  const close=()=>{sh.remove();render();release()};
  sh.querySelector('#cls').onclick=close;sh.onclick=e=>{if(e.target===sh)close()};
  sync();document.body.appendChild(sh);
  const release=holdModal(sh,{dialog:sh.querySelector('.box'),opener,onEscape:close});
}

function selectTab(value,focus=false){
  tab=value;if(tab==='path')renderPath.scrolled=0;
  render();scrollTo(0,0);if(focus)$('#'+(tab==='path'?'tabPath':'tabChart')).focus();
}
function tabKey(e){
  let value;
  if(e.key==='ArrowLeft'||e.key==='ArrowRight')value=e.currentTarget.id==='tabPath'?'chart':'path';
  else if(e.key==='Home')value='path';else if(e.key==='End')value='chart';else return;
  e.preventDefault();selectTab(value,true);
}

/* ======================= BOOT ======================= */
document.querySelector('.cat-mini').outerHTML=catSVG('happy').replace('<svg','<svg class="cat-mini"');
$('#tabPath').onclick=()=>selectTab('path');$('#tabChart').onclick=()=>selectTab('chart');
$('#tabPath').onkeydown=tabKey;$('#tabChart').onkeydown=tabKey;
$('#setBtn').onclick=()=>parentGate(openSettings,$('#setBtn'));
document.addEventListener('click',readTextClick);
render();

/* 7-6: offline use. Only on http(s); the file:// copy and sandboxed previews skip it quietly. */
if('serviceWorker' in navigator&&/^https?:/.test(location.protocol)){addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}))}
