const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();const pg=await b.newPage();
  await pg.addInitScript(()=>{window.Audio=undefined; // these tests check speech synthesis, so turn recorded clips off (tests/voice.js covers clips)
    Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[],cancel(){},speak(u){setTimeout(()=>u.onend&&u.onend(),50)}},configurable:true})});
  await pg.goto('file://'+process.argv[2]);await pg.waitForTimeout(500);
  console.log(process.argv[2].split('/').pop(), await pg.evaluate(async()=>{
    for(const id in LESSONS){startLesson(id);const s=LS.steps.find(x=>x.t==='bubbles');if(s){LS.i=LS.steps.indexOf(s);showStep();await new Promise(r=>setTimeout(r,50));
      const bs=[...document.querySelectorAll('.bub')];const R=bs.filter(b=>b.textContent===s.s),W=bs.filter(b=>b.textContent!==s.s);
      R.forEach(b=>b.click());const m0=LS.mistakes;W.forEach(b=>b.click());return `lesson ${id}: mistakes after finding all ${m0}, after ${W.length} extra wrong taps ${LS.mistakes}`}quitLesson()}return 'none'}));
  // 5-5: bubbles rise at one shared speed and never overlap (74 px bubbles, sampled for 6 s)
  const gap=await pg.evaluate(async()=>{
    if(LS)quitLesson();
    for(const id in LESSONS){startLesson(id);const i=LS.steps.findIndex(x=>x.t==='bubbles');if(i>=0){LS.i=i;showStep();break}quitLesson()}
    let min=1e9,moved=false,y0=null;
    for(let k=0;k<12;k++){await new Promise(r=>setTimeout(r,500));
      const c=[...document.querySelectorAll('.bub')].map(e=>{const r=e.getBoundingClientRect();return[r.left+r.width/2,r.top+r.height/2]});
      if(y0===null)y0=c[0][1];else if(Math.abs(c[0][1]-y0)>5)moved=true;
      for(let a=0;a<c.length;a++)for(let b=a+1;b<c.length;b++)min=Math.min(min,Math.hypot(c[a][0]-c[b][0],c[a][1]-c[b][1]))}
    return {min,moved}});
  console.log((gap.min>=76&&gap.moved?'PASS':'FAIL')+' bubbles rise without overlapping: '+JSON.stringify(gap));
  await b.close()})();
