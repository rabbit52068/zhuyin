const { chromium } = require('playwright');
const OUT=require('path').join(__dirname,'out/');require('fs').mkdirSync(OUT,{recursive:true});
const file='file://'+process.argv[2];
(async()=>{
  const b=await chromium.launch(); const pg=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e))); pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  await pg.addInitScript(()=>{window.Audio=undefined; // these tests check speech synthesis, so turn recorded clips off (tests/voice.js covers clips)
    window.__said=[];const mock={speaking:false,getVoices:()=>[],cancel(){window.__said.push({cancel:1,t:performance.now()})},
    speak(u){window.__said.push({text:u.text,t:performance.now()});setTimeout(()=>u.onend&&u.onend(),250)},onvoiceschanged:null};
    Object.defineProperty(window,'speechSynthesis',{value:mock,configurable:true});try{localStorage.clear()}catch(e){}});
  await pg.goto(file); await pg.waitForTimeout(800);
  const meta=await pg.evaluate(()=>({cs:document.characterSet,vp:!!document.querySelector('meta[name=viewport]'),lang:document.documentElement.lang,mode:document.compatMode}));
  console.log('head',JSON.stringify(meta));
  await pg.screenshot({path:OUT+'map.png'});
  // tip vs unit header overlap
  const ov=await pg.evaluate(()=>{const t=document.querySelector('.start-tip'),h=t&&t.closest('.unit').querySelector('.unit-head');if(!t)return 'no tip';const a=t.getBoundingClientRect(),c=h.getBoundingClientRect();return a.top<c.bottom?'OVERLAP '+(c.bottom-a.top).toFixed(0)+'px':'clear '+(a.top-c.bottom).toFixed(0)+'px'});
  console.log('start-tip',ov);
  await pg.click('.node.cur'); await pg.waitForTimeout(100);
  await pg.screenshot({path:OUT+'intro.png'});
  // 0-5 speaker not over symbol
  const sp=await pg.evaluate(()=>{const s=document.querySelector('.bigcard .s').getBoundingClientRect(),b=document.querySelector('.cardrow .speak').getBoundingClientRect();return (b.top<s.bottom&&b.left<s.right&&b.right>s.left)?'OVERLAP':'clear'});
  console.log('speaker',sp);
  // 0-2: leave intro after 100ms; intro's delayed lines must not play later
  const t0=await pg.evaluate(()=>performance.now());
  await pg.click('text=我記住了'); await pg.waitForTimeout(2500);
  const said=await pg.evaluate(t=>window.__said.filter(x=>x.text&&x.t>t).map(x=>x.text),t0);
  const step=await pg.evaluate(()=>LS.steps[LS.i].t);
  console.log('step now',step,'| spoken after leaving intro:',JSON.stringify(said));
  // 0-4: answer right, then hammer Enter / taps
  const runRight=async()=>{const st=await pg.evaluate(()=>LS.steps[LS.i]);return st};
  const st=await runRight(); console.log('step obj',JSON.stringify(st));
  if(['listen','listenPic','picture'].includes(st.t)){
    const i0=await pg.evaluate(()=>LS.i);
    await pg.evaluate(s=>[...document.querySelectorAll('.opt')].find(b=>b.textContent.trim()===s).click(),st.s);
    for(let k=0;k<6;k++) await pg.keyboard.press('Enter');          // immediately: should be ignored (<400ms)
    const i1=await pg.evaluate(()=>LS.i);
    await pg.waitForTimeout(500); await pg.keyboard.press('Enter'); await pg.keyboard.press('Enter'); await pg.keyboard.press('Enter');
    await pg.waitForTimeout(200);
    const i2=await pg.evaluate(()=>LS.i);
    console.log('enter spam: i',i0,'->',i1,'(fast) ->',i2,'(after 500ms, 3x Enter) expect +1 total');
  }
  // 0-3 bubbles: render a bubbles step directly
  const bub=await pg.evaluate(async()=>{const s=LS.steps.find(x=>x.t==='bubbles');if(!s)return'no bubbles step';
    LS.i=LS.steps.indexOf(s);showStep();await new Promise(r=>setTimeout(r,50));
    const bs=[...document.querySelectorAll('.bub')];const right=bs.filter(b=>b.textContent===s.s),wrongs=bs.filter(b=>b.textContent!==s.s);
    right.forEach(b=>b.click());const m0=LS.mistakes;wrongs.forEach(b=>b.click());right[0].click();return `mistakes before ${m0}, after extra taps ${LS.mistakes}`});
  console.log('bubbles',bub);
  // trace screenshot
  await pg.evaluate(()=>{const s=LS.steps.find(x=>x.t==='trace');if(s){LS.i=LS.steps.indexOf(s);showStep()}});
  await pg.waitForTimeout(1600); await pg.screenshot({path:OUT+'trace.png'});
  // finish twice
  const fin=await pg.evaluate(()=>{try{finish();finish();return 'ok, done='+LS.done}catch(e){return 'ERR '+e}});
  console.log('finish x2',fin);
  await pg.evaluate(()=>quitLesson());
  console.log('errors',JSON.stringify(errs));
  await b.close();
})();
