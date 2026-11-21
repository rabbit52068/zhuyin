/* ======================= STATE ======================= */
const store={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},
  set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
let P=store.get('zy-progress',{stars:{}});
P.acc=P.acc||{}; // per-lesson record for parents: {m: mistakes, n: questions, t: time}
let S=store.get('zy-settings',{rate:0.8,unlockAll:false});
const save=()=>{store.set('zy-progress',P);store.set('zy-settings',S)};
const totalStars=()=>Object.values(P.stars).reduce((a,b)=>a+b,0);
const unlocked=id=>S.unlockAll||id===0||P.stars[id-1]>0||P.stars[id]>0;
const currentId=()=>{for(const l of LESSONS) if(!P.stars[l.id]) return l.id; return -1};
const learned=()=>{const set=new Set();LESSONS.forEach(l=>{if(l.type==='sym'&&P.stars[l.id])set.add(l.s)});return set};

/* ======================= UTIL ======================= */
const $=s=>document.querySelector(s);
const h=(html)=>{const t=document.createElement('template');t.innerHTML=html.trim();return t.content.firstElementChild};
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]]}return a};
const pick=a=>a[Math.random()*a.length|0];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const cssv=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const wordText=s=>SYM[s].w.map(x=>x[0]).join('');

// Zhuyin column beside a character
function zc(zy,{hl=null,blank=null}={}){
  let tone='';const last=zy.slice(-1);
  if('ˊˇˋ˙'.includes(last)){tone=last;zy=zy.slice(0,-1)}
  const ls=[...zy].map(c=>blank&&c===blank?'<span class="blank">?</span>':hl&&c===hl?`<span class="hl">${c}</span>`:`<span>${c}</span>`).join('');
  return `<span class="zc">${tone==='˙'?'<span class="dot">˙</span>':''}<span class="ls">${ls}</span>${tone&&tone!=='˙'?`<span class="tn">${tone}</span>`:'<span class="tn" style="visibility:hidden">ˋ</span>'}</span>`;
}
const wz=(ch,zy,o)=>`<span class="wz"><span class="ch">${ch}</span>${zc(zy,o)}</span>`;
const wordHTML=(s,o)=>`<span class="wd">${SYM[s].w.map(([c,z])=>wz(c,z,o)).join('')}</span>`;

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
function speak(text,{rate}={}){
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
const saySym=s=>speak(SYM[s].say,{rate:Math.min(S.rate,.75)});
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
  $('#starCount').textContent=totalStars();
  $('#tabPath').setAttribute('aria-selected',tab==='path');
  $('#tabChart').setAttribute('aria-selected',tab==='chart');
  const m=$('#main'); m.innerHTML='';
  tab==='path'?renderPath(m):renderChart(m);
}
function renderPath(m){
  const cur=currentId();
  const curL=cur>=0?LESSONS[cur]:null;
  const msg = !curL ? '全部學完了！你是注音小達人！' :
    curL.type==='sym' ? `今天來認識 <span class="zy" style="font-size:1.3em;color:var(--sky)">${curL.s}</span> 吧！` :
    curL.type==='review' ? '來玩複習遊戲，把學過的注音找出來！' : curL.type==='blend' ? '把兩個注音拼在一起，會變成一個字喔！' : '一起來聽聽四個聲調！';
  m.appendChild(h(`<div class="hello">${catSVG('happy')}<p>${msg}<span class="sub">橘子老師陪你一起學注音</span></p></div>`));
  let n=0;
  UNITS.forEach((u,ui)=>{
    const big=u.kind==='sym'?u.sy:u.big;
    const sec=h(`<section class="unit" style="--c:var(--${u.c});--cd:var(--${u.c}-d)">
      <div class="unit-head"><div class="t"><small>第 ${ui+1} 站・${u.tag}</small><b>${u.name}</b></div><span class="big">${big}</span></div>
      <div class="nodes"></div></section>`);
    const nodes=sec.querySelector('.nodes');
    u.lessons.forEach((id,k)=>{
      const L=LESSONS[id], open=unlocked(id), st=P.stars[id]||0, x=OFFS[n++%OFFS.length];
      const label = L.type==='sym'?L.s : L.type==='review'?'🎈' : L.type==='blend'?(L.set[0][0]+L.set[0][1]) : '<span style="font-family:var(--f-ui);font-size:1.6rem">ˊˇˋ</span>';
      const w=h(`<div class="node-wrap" style="--x:${x}"></div>`);
      const b=h(`<button class="node ${open?'':'lock'} ${L.type==='review'?'review':''} ${id===cur?'cur':''}" aria-label="${open?'開始':'尚未解鎖'}"></button>`);
      if(L.type==='blend') b.style.fontSize='1.6rem';
      b.innerHTML = open ? label : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
      if(open){b.onclick=()=>startLesson(id)} else b.onclick=()=>{sfx.no()};
      w.appendChild(b);
      if(st) w.appendChild(h(`<div class="stars">${[1,2,3].map(i=>`<i class="${i<=st?'on':''}">★</i>`).join('')}</div>`));
      if(id===cur){
        w.classList.add('has-tip');w.appendChild(h(`<div class="start-tip">開始！</div>`));
        const c=h(`<div class="side-cat ${x>0?'l':'r'}">${catSVG('happy')}</div>`); w.appendChild(c);
      }
      nodes.appendChild(w);
    });
    m.appendChild(sec);
  });
  requestAnimationFrame(()=>{const c=m.querySelector('.node.cur');if(c&&!renderPath.scrolled){renderPath.scrolled=1;c.scrollIntoView({block:'center'})}});
}

/* ======================= HOME: CHART ======================= */
function renderChart(m){
  const L=learned();
  const groups=[['聲母','21 個',ORDER.slice(0,21)],['韻母','13 個',ORDER.slice(21,34)],['介音','3 個',ORDER.slice(34)]];
  const wrap=h(`<div class="chart"></div>`);
  groups.forEach(([t,n,arr])=>{
    wrap.appendChild(h(`<h2>${t}<small>${n}</small></h2>`));
    const g=h(`<div class="grid"></div>`);
    arr.forEach(s=>{const b=h(`<button class="tile ${L.has(s)?'done':''}" aria-label="${s} ${wordText(s)}"><span class="s">${s}</span><span class="e">${SYM[s].e}</span></button>`);
      b.onclick=async()=>{b.classList.add('cat-bounce');setTimeout(()=>b.classList.remove('cat-bounce'),600);await saySym(s);await wait(150);speak(wordText(s))};
      g.appendChild(b)});
    wrap.appendChild(g);
  });
  wrap.appendChild(h(`<p class="note">點一下注音，聽它怎麼唸，再聽一個例詞。綠色的是已經學過的注音。</p>`));
  if(!hasZh) wrap.appendChild(h(`<div class="warn">這台裝置好像沒有中文語音。可以到系統設定加入「中文（台灣）」語音，或改用 Chrome、Edge、Safari 開啟，就能聽到發音。</div>`));
  m.appendChild(wrap);
}

/* ======================= LESSON ENGINE ======================= */
let LS=null; // {lesson, steps, i, mistakes, layer}
function distractors(target,n,poolHint){
  const L=[...learned()].filter(s=>s!==target);
  let pool=shuffle([...new Set([...(poolHint||[]).filter(s=>s!==target),...L])]);
  if(pool.length<n) pool=pool.concat(shuffle(ORDER.filter(s=>s!==target&&!pool.includes(s))));
  return pool.slice(0,n);
}
function buildSteps(L){
  const u=UNITS[L.ui];
  if(L.type==='sym'){const s=L.s, peers=[...u.sy];
    return [{t:'intro',s},{t:'listen',s,peers},{t:'trace',s},{t:'picture',s,peers},{t:'listen',s,peers},{t:'trace',s}];}
  if(L.type==='review'){const sy=[...u.sy];const a=shuffle(sy);
    return [{t:'bubbles',s:a[0],peers:sy},{t:'picture',s:a[1],peers:sy},{t:'listen',s:a[2],peers:sy},{t:'picture',s:a[0],peers:sy},{t:'bubbles',s:a[1],peers:sy},{t:'listen',s:a[3%a.length],peers:sy},{t:'trace',s:pick(sy)}];}
  if(L.type==='blend'){const set=shuffle(L.set);
    return [{t:'blendDemo',it:set[0]},{t:'blendDemo',it:set[1]},{t:'blendPick',it:set[2],set},{t:'blendBuild',it:set[3],set},{t:'blendPick',it:set[4],set},{t:'blendBuild',it:set[5],set}];}
  if(L.type==='tone'){const set=L.set;
    return [{t:'toneDemo',set},...shuffle([0,1,2,3]).map(k=>({t:'tonePick',set,k}))];}
}
function startLesson(id){
  const L=LESSONS[id];
  const layer=h(`<div class="layer" role="dialog" aria-label="課程"><div class="col">
     <div class="lbar"><button class="iconbtn" id="xBtn" aria-label="離開課程"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button><div class="prog"><i></i></div></div>
     <div class="stage" id="stage"></div></div>
     <div class="fb" id="fb"><div class="in"><div class="msg">${catSVG('happy')}<span id="fbTxt"></span></div><button class="btn go" id="fbGo">繼續</button></div></div></div>`);
  document.body.appendChild(layer);
  document.body.style.overflow='hidden';
  LS={L,steps:buildSteps(L),i:0,mistakes:0,layer};
  layer.querySelector('#xBtn').onclick=askQuit;
  layer.querySelector('#fbGo').onclick=()=>{if(!LS||!LS.fbAt||Date.now()-LS.fbAt<400)return;LS.fbAt=0;next()};
  showStep();
}
/* STEP changes on every step switch and on quit; delayed speech checks it so an old step never talks over a new one (0-2). */
let STEP=0;
const live=t=>!!LS&&t===STEP;
function later(ms,fn){const t=STEP;setTimeout(()=>{if(live(t))fn()},ms)}
function stopVoice(){STEP++;try{speechSynthesis.cancel()}catch(e){}}
function askQuit(){
  if(!LS||LS.layer.querySelector('.ask'))return;
  if(LS.done)return quitLesson();
  const t=STEP;
  const ask=h(`<div class="ask" role="alertdialog" aria-label="要離開嗎？"><div class="box">${catSVG('think')}
    <p>要離開嗎？</p>
    <div class="row"><button class="btn go" id="askStay"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>繼續玩</button>
    <button class="btn ghost" id="askLeave"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4H6v16h8M10 12h10M17 8l4 4-4 4"/></svg>離開</button></div></div></div>`);
  LS.layer.appendChild(ask);
  const stay=ask.querySelector('#askStay');stay.focus({preventScroll:true});
  stay.onclick=()=>ask.remove();
  ask.querySelector('#askLeave').onclick=quitLesson;
  ask.onkeydown=e=>{if(e.key==='Escape')ask.remove()};
  speak('要離開嗎',{rate:1});
}
function quitLesson(){stopVoice();LS.layer.remove();LS=null;document.body.style.overflow='';render()}
function setProg(){LS.layer.querySelector('.prog i').style.width=(LS.i/LS.steps.length*100)+'%'}
function showStep(){
  setProg(); stopVoice();
  const st=LS.steps[LS.i], stage=LS.layer.querySelector('#stage');
  stage.innerHTML=''; stage.scrollTop=0;
  const fb=LS.layer.querySelector('#fb');fb.classList.remove('show');fb.inert=true;LS.fbAt=0;LS.demo=false;
  stage.setAttribute('tabindex','-1');stage.focus({preventScroll:true});
  STEPS[st.t](stage,st);
}
async function correct(text){
  /* LS.demo: the game showed the answer after two misses (1-3), so no win sound and a calmer line */
  if(!LS.demo) sfx.ok();
  const p=LS.demo?'答案在這裡！'+(text?text.replace(/^對！/,''):'下次一定可以！'):(text||pick(PRAISE));
  LS.layer.querySelector('#fbTxt').textContent=p;
  const fb=LS.layer.querySelector('#fb');fb.inert=false;fb.classList.add('show');LS.fbAt=Date.now();
  LS.layer.querySelector('#fbGo').focus({preventScroll:true});
  later(350,()=>speak(p.replace('！',''),{rate:1}));
}
const ENCOURAGE=['再想想看！','沒關係，再試一次！','慢慢來，你可以的！'];
function catMood(mood){const c=LS&&LS.layer.querySelector('#stage .prompt svg');if(c)c.outerHTML=catSVG(mood)}
/* A miss: thinking face and a kind line. count=false for tracing, which never costs a mistake (1-5).
   Resolves true if the step is still on screen, so callers can replay the sound after the line. */
function wrong({count=true}={}){
  if(count)LS.mistakes++;
  sfx.no();catMood('think');
  const t=STEP;
  return new Promise(r=>setTimeout(async()=>{
    if(live(t))await speak(pick(ENCOURAGE).replace(/！/g,''),{rate:1});
    if(live(t))catMood('happy');
    r(live(t));
  },250));
}
/* Read the question aloud, then play its sounds, one after another (1-1). Strings are spoken; functions return a promise. */
function voiceSeq(items){const t=STEP;(async()=>{await wait(300);
  for(const it of items){if(!live(t))return;await (typeof it==='string'?speak(it,{rate:1}):it());if(!live(t))return;await wait(200)}})()}
function next(){
  if(!LS||LS.done)return;
  LS.i++;
  if(LS.i>=LS.steps.length) return finish();
  showStep();
}
function finish(){
  if(LS.done)return; LS.done=true;
  setProg();
  const stars=3, perfect=LS.mistakes===0; // finishing earns all 3 stars (1-4)
  const id=LS.L.id;
  P.stars[id]=3; P.acc[id]={m:LS.mistakes,n:LS.steps.length,t:Date.now()}; save();
  const col=LS.layer.querySelector('.col');
  const fb=LS.layer.querySelector('#fb');fb.classList.remove('show');fb.inert=true;
  col.querySelector('.stage').outerHTML=`<div class="result">${catSVG('happy').replace('<svg','<svg class="big cat-bounce"')}
     <h2>${perfect?'完美過關！':'完成了！你好棒！'}</h2>
     <div class="bigstars">${[1,2,3].map(i=>`<i class="${i<=stars?'on':''}" style="animation-delay:${.2+i*.25}s">★</i>`).join('')}</div>
     <p>${LS.L.type==='sym'?`你學會了 <span class="zy" style="font-size:1.5em;color:var(--sky)">${LS.L.s}</span>`:'又往前走了一站'}</p>
     <button class="btn go" id="doneBtn" style="margin-top:10px">回到地圖</button></div>`;
  const done=col.querySelector('#doneBtn');done.onclick=quitLesson;done.focus({preventScroll:true});
  sfx.win(); confetti();
  later(400,()=>speak(perfect?'完美過關':'完成了，你好棒',{rate:1}));
}

/* ---------- step renderers ---------- */
function speakerBtn(fn,sm){const b=h(`<button class="speak ${sm?'sm':''}" aria-label="再聽一次">${SPK}</button>`);
  b.play=()=>{b.classList.remove('playing');void b.offsetWidth;b.classList.add('playing');return fn()};
  b.onclick=()=>{b.play()};return b}
function prompt(text,mood='happy'){return h(`<div class="prompt">${catSVG(mood)}<span>${text}</span></div>`)}
function optionRow(items,target,onRight,{wide=false,label=null,render=null}={}){
  const row=h(`<div class="opts"></div>`);let done=false,miss=0,tb=null;
  const win=b=>{done=true;b.classList.remove('glow');b.classList.add('ok');row.querySelectorAll('.opt').forEach(o=>{if(o!==b)o.classList.add('dim')})};
  shuffle(items).forEach(it=>{
    const b=h(`<button class="opt ${wide?'wide':''}"></button>`);
    b.innerHTML=render?render(it):it;
    if(it===target)tb=b;
    b.onclick=async()=>{if(done)return;
      if(it===target){win(b);onRight&&onRight();return}
      b.classList.remove('no');void b.offsetWidth;b.classList.add('no');miss++;
      if(miss>=2){win(tb);const ok=await wrong();if(ok){LS.demo=true;onRight&&onRight()}return} // 1-3: show the answer, move on
      tb.classList.add('glow'); // 1-2: hint the right one
      if(await wrong())label&&label()};
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
  const ex=h(`<button class="example" aria-label="聽例詞"><span class="em">${SYM[s].e}</span>${wordHTML(s,{hl:s})}</button>`);
  ex.onclick=()=>speak(wordText(s));
  stage.append(ex);
  stage.append(h(`<p class="hint">「${s}」就在「${wordText(s)}」裡面，紅色的就是它</p>`));
  const go=h(`<button class="btn go">我記住了</button>`);go.onclick=next;stage.append(go);
  voiceSeq(['這是新朋友！',()=>sp.play(),`${SYM[s].say}，${wordText(s)}的${SYM[s].say}`]);
 },
 listen(stage,{s,peers}){
  stage.append(prompt('聽一聽，是哪一個注音？'));
  const sp=speakerBtn(()=>saySym(s));stage.append(sp);
  stage.append(optionRow([s,...distractors(s,2,peers)],s,()=>correct(),{label:()=>later(400,()=>saySym(s))}));
  voiceSeq(['聽一聽，是哪一個注音？',()=>sp.play()]);
 },
 picture(stage,{s,peers}){
  stage.append(prompt(`「${wordText(s)}」少了哪一個注音？`));
  const ex=h(`<button class="example" aria-label="聽例詞"><span class="em" style="font-size:4rem">${SYM[s].e}</span>${wordHTML(s,{blank:s})}</button>`);
  ex.onclick=()=>speak(wordText(s));stage.append(ex);
  stage.append(optionRow([s,...distractors(s,2,peers)],s,()=>{ex.innerHTML=`<span class="em" style="font-size:4rem">${SYM[s].e}</span>${wordHTML(s,{hl:s})}`;correct()}));
  voiceSeq([`${wordText(s)}，少了哪一個注音？`]);
 },
 trace(stage,{s}){
  stage.append(prompt(`沿著藍色的字，寫寫看「${s}」`,'happy'));
  const box=h(`<div class="trace"><div class="cross"></div><canvas class="g"></canvas><canvas class="u"></canvas></div>`);
  stage.append(box);
  const hint=h(`<p class="hint"></p>`);stage.append(hint);
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
  function redraw(){uc.clearRect(0,0,W,W);uc.lineCap='round';uc.lineJoin='round';uc.lineWidth=lw();uc.strokeStyle=passed?cssv('--leaf'):cssv('--ink-stroke');
    strokes.forEach(st=>{uc.beginPath();st.forEach((p,i)=>i?uc.lineTo(p.x,p.y):uc.moveTo(p.x,p.y));if(st.length===1)uc.lineTo(st[0].x+.1,st[0].y);uc.stroke()})}
  const pt=e=>{const r=u.getBoundingClientRect();return{x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*W/r.height}};
  u.addEventListener('pointerdown',e=>{if(passed)return;u.setPointerCapture(e.pointerId);cur=[pt(e)];strokes.push(cur);redraw()});
  u.addEventListener('pointermove',e=>{if(!cur)return;cur.push(pt(e));redraw()});
  const end=()=>{cur=null};u.addEventListener('pointerup',end);u.addEventListener('pointercancel',end);
  clr.onclick=()=>{if(passed)return;strokes=[];redraw();hint.textContent=''};
  ok.onclick=()=>{if(passed)return;
    if(!strokes.length){hint.textContent='先用手指沿著藍色的字畫畫看';return}
    const {cov,prec}=traceScore(s,strokes,W,lw());
    if(cov>=.45&&prec>=.5){passed=true;redraw();hint.textContent='';correct(cov>.75?'寫得好漂亮！':'寫得很好！')}
    else if(++fails>=2){passed=true;redraw();hint.textContent='';correct('很努力喔！我們繼續！')}
    else{wrong({count:false});hint.textContent=cov<.45?'還有一些地方沒有寫到，再試一次！':'要沿著藍色的字寫喔，再試一次！';setTimeout(()=>{strokes=[];redraw()},700)}
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
  const cells=shuffle([...Array(9).keys()]).slice(0,items.length);
  items.forEach((it,i)=>{const c=cells[i], cx=(c%3)*33+17+(Math.random()*8-4), cy=Math.floor(c/3)*31+18+(Math.random()*8-4);
    const b=h(`<button class="bub" style="left:${cx}%;top:${cy}%;--d:${(2+Math.random()*2).toFixed(2)}s;--dx:${(Math.random()*20-10)|0}px;--dy:${(Math.random()*20-10)|0}px">${it}</button>`);
    b.onclick=()=>{if(got>=need||b.classList.contains('pop'))return;
      if(it===s){sfx.pop();b.classList.add('pop');got++;tg.querySelector('.count').textContent=`${got} / ${need}`;
        if(got===need){pond.classList.add('done');later(300,()=>correct('全部找到了！'))}}
      else{b.classList.remove('no');void b.offsetWidth;b.classList.add('no');
        if(++miss>=2)pond.querySelectorAll('.bub').forEach(x=>{if(x.textContent===s&&!x.classList.contains('pop'))x.classList.add('glow')});
        wrong().then(ok=>{if(ok)later(300,()=>saySym(s))})}};
    pond.appendChild(b)});
  voiceSeq(['把所有的這個注音戳破！',()=>saySym(s)]);
 },
 blendDemo(stage,{it:[a,b,ch]}){
  stage.append(prompt('兩個注音拼在一起，會變成什麼？','happy'));
  const bl=h(`<div class="blend"><button class="p a">${a}</button><span class="op">＋</span><button class="p b">${b}</button></div>`);
  bl.querySelector('.a').onclick=()=>saySym(a);bl.querySelector('.b').onclick=()=>saySym(b);
  stage.append(bl);
  const res=h(`<button class="res" aria-label="聽">${wz(ch,a+b)}</button>`);res.onclick=()=>speak(ch);stage.append(res);
  const go=h(`<button class="btn">拼拼看！</button>`);stage.append(go);
  voiceSeq(['兩個注音拼在一起，會變成什麼？']);
  let played=false;
  go.onclick=async()=>{
    if(played){next();return}
    played=true;go.disabled=true;const t=STEP;
    await saySym(a);if(!live(t))return;await wait(200);await saySym(b);if(!live(t))return;await wait(200);
    bl.classList.add('go');res.classList.add('show');sfx.pop();await wait(500);if(!live(t))return;await speak(ch,{rate:.7});
    go.textContent='繼續';go.disabled=false;go.classList.add('go');
  };
 },
 blendPick(stage,{it:[a,b,ch],set}){
  stage.append(prompt('聽一聽，是哪一個拼音？'));
  const sp=speakerBtn(()=>speak(ch,{rate:.7}));stage.append(sp);
  const others=shuffle(set.filter(x=>x[2]!==ch&&x[0]+x[1]!==a+b)).slice(0,2).map(x=>x[0]+x[1]);
  stage.append(optionRow([a+b,...others],a+b,()=>{correct(`對！${a}${b}，${ch}`)},{wide:true,label:()=>later(400,()=>speak(ch,{rate:.7}))}));
  voiceSeq(['聽一聽，是哪一個拼音？',()=>sp.play()]);
 },
 blendBuild(stage,{it:[a,b,ch]}){
  stage.append(prompt(`「${ch}」前面要放哪一個注音？`));
  const bl=h(`<div class="blend"><span class="p a"><span class="blank" style="font-size:1.6rem">?</span></span><span class="op">＋</span><span class="p b">${b}</span></div>`);
  stage.append(bl);
  const sp=speakerBtn(()=>speak(ch,{rate:.7}),true);stage.append(sp);
  const opts=[a,...distractors(a,2,['ㄅ','ㄆ','ㄇ','ㄈ','ㄉ','ㄊ','ㄍ','ㄎ','ㄏ','ㄓ'])];
  stage.append(optionRow(opts,a,async()=>{bl.querySelector('.a').textContent=a;correct(`${a}${b}，${ch}`)},{label:()=>later(400,()=>speak(ch,{rate:.7}))}));
  voiceSeq([`${ch}，前面要放哪一個注音？`]);
 },
 toneDemo(stage,{set}){
  stage.append(prompt('同一個拼音，有四種唱法，點點看！','happy'));
  const paths=['M4 8h36','M4 26L40 6','M4 8Q22 34 40 6','M4 6L40 26'];
  const g=h(`<div class="tones"></div>`);
  set.forEach(([ch,zy],k)=>{const b=h(`<button class="tcard"><span>${wz(ch,zy)}</span><span><svg viewBox="0 0 44 32"><path d="${paths[k]}"/></svg><small>${TONE_NAME[k]}</small></span></button>`);
    b.onclick=()=>speak(ch,{rate:.7});g.appendChild(b)});
  stage.append(g);
  const go=h(`<button class="btn go">我聽完了</button>`);go.onclick=next;stage.append(go);
  voiceSeq(['同一個拼音，有四種唱法',...set.map(([ch])=>()=>speak(ch,{rate:.7}))]);
 },
 tonePick(stage,{set,k}){
  const [ch,zy]=set[k];
  stage.append(prompt('聽一聽，是第幾聲？'));
  const sp=speakerBtn(()=>speak(ch,{rate:.7}));stage.append(sp);
  const base=set[0][1];
  stage.append(optionRow([0,1,2,3],k,()=>correct(`對！「${ch}」是${TONE_NAME[k]}`),
    {wide:true,render:i=>`<span>${zc(base+TONES[i]).replace('class="zc"','class="zc" style="font-size:1.7rem"')}<span class="lab">${TONE_NAME[i]}</span></span>`,
     label:()=>later(400,()=>speak(ch,{rate:.7}))}));
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
function lessonName(L){const u=UNITS[L.ui];
  return L.type==='sym'?`認識 ${L.s}`:L.type==='review'?`複習・${u.name}`:L.type==='blend'?`拼音 ${u.lessons.indexOf(L.id)+1}`:`聲調 ${u.lessons.indexOf(L.id)+1}`}
function recordHTML(){
  const rows=Object.entries(P.acc).sort((a,b)=>b[1].t-a[1].t).slice(0,5);
  if(!rows.length)return '<div class="set"><span>最近的課<small>還沒有紀錄</small></span></div>';
  return `<div class="set rec"><span>最近的課<small>每課都給 3 顆星；這裡記錄答錯幾次</small></span></div><ul class="rec-list">${
    rows.map(([id,r])=>`<li><span>${lessonName(LESSONS[id])}</span><b>${r.m?`答錯 ${r.m} 次`:'全對'}</b></li>`).join('')}</ul>`}
/* 1-7: a sum a 4-year-old cannot do keeps settings for grown-ups */
function parentGate(then){
  const a=11+(Math.random()*8|0),b=3+(Math.random()*6|0),ans=a+b;
  const opts=shuffle([ans,ans+1+(Math.random()*3|0),ans-1-(Math.random()*3|0)]);
  const sh=h(`<div class="sheet"><div class="box" role="dialog" aria-label="家長確認">
    <h3>家長確認</h3><p class="gate-q">${a} ＋ ${b} ＝ ？</p>
    <div class="row">${opts.map(o=>`<button class="btn ghost gate-o">${o}</button>`).join('')}</div>
    <button class="btn wide" id="gateX">取消</button></div></div>`);
  sh.querySelectorAll('.gate-o').forEach(btn=>btn.onclick=()=>{sh.remove();if(+btn.textContent===ans)then()});
  sh.querySelector('#gateX').onclick=()=>sh.remove();sh.onclick=e=>{if(e.target===sh)sh.remove()};
  document.body.appendChild(sh);sh.querySelector('.gate-o').focus({preventScroll:true});
}
function openSettings(){
  let armed=false;
  const sh=h(`<div class="sheet"><div class="box" role="dialog" aria-label="家長設定">
    <h3>家長設定</h3>
    <div class="set"><span>發音速度<small>給剛開始學的孩子用「慢」</small></span><div class="seg" id="rate">
      <button data-v="0.6">慢</button><button data-v="0.8">中</button><button data-v="1">快</button></div></div>
    <div class="set"><span>全部解鎖<small>可以直接跳到任何一課</small></span><button class="sw" role="switch" id="ul" aria-label="全部解鎖"></button></div>
    ${recordHTML()}
    <div class="set"><span>清除學習紀錄<small>星星和進度會回到一開始</small></span><button class="btn ghost" id="rst" style="min-width:0;padding:10px 14px;font-size:.95rem">清除</button></div>
    ${hasZh?'':'<div class="warn">沒有找到中文語音：請在系統設定加入「中文（台灣）」語音，或改用 Chrome、Edge、Safari。</div>'}
    <button class="btn wide" id="cls">好了</button></div></div>`);
  const sync=()=>{sh.querySelectorAll('#rate button').forEach(b=>b.setAttribute('aria-pressed',+b.dataset.v===S.rate));sh.querySelector('#ul').setAttribute('aria-checked',!!S.unlockAll)};
  sh.querySelectorAll('#rate button').forEach(b=>b.onclick=()=>{S.rate=+b.dataset.v;save();sync();speak('注音小學堂')});
  sh.querySelector('#ul').onclick=()=>{S.unlockAll=!S.unlockAll;save();sync()};
  const rst=sh.querySelector('#rst');
  rst.onclick=()=>{if(!armed){armed=true;rst.textContent='再按一次確定';rst.style.color='var(--coral-d)';return}
    P={stars:{},acc:{}};save();rst.textContent='已清除';renderPath.scrolled=0};
  const close=()=>{sh.remove();render()};
  sh.querySelector('#cls').onclick=close;sh.onclick=e=>{if(e.target===sh)close()};
  sync();document.body.appendChild(sh);
}

/* ======================= BOOT ======================= */
document.querySelector('.cat-mini').outerHTML=catSVG('happy').replace('<svg','<svg class="cat-mini"');
$('#tabPath').onclick=()=>{tab='path';renderPath.scrolled=0;render();scrollTo(0,0)};
$('#tabChart').onclick=()=>{tab='chart';render();scrollTo(0,0)};
$('#setBtn').onclick=()=>parentGate(openSettings);
render();
