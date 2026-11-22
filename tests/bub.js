const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();const pg=await b.newPage();
  await pg.addInitScript(()=>{window.Audio=undefined; // these tests check speech synthesis, so turn recorded clips off (tests/voice.js covers clips)
    Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[],cancel(){},speak(u){setTimeout(()=>u.onend&&u.onend(),50)}},configurable:true})});
  await pg.goto('file://'+process.argv[2]);await pg.waitForTimeout(500);
  console.log(process.argv[2].split('/').pop(), await pg.evaluate(async()=>{
    for(const id in LESSONS){startLesson(id);const s=LS.steps.find(x=>x.t==='bubbles');if(s){LS.i=LS.steps.indexOf(s);showStep();await new Promise(r=>setTimeout(r,50));
      const bs=[...document.querySelectorAll('.bub')];const R=bs.filter(b=>b.textContent===s.s),W=bs.filter(b=>b.textContent!==s.s);
      R.forEach(b=>b.click());const m0=LS.mistakes;W.forEach(b=>b.click());return `lesson ${id}: mistakes after finding all ${m0}, after ${W.length} extra wrong taps ${LS.mistakes}`}quitLesson()}return 'none'}));
  await b.close()})();
