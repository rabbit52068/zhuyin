const { chromium } = require('playwright');
const OUT=require('path').join(__dirname,'out/');require('fs').mkdirSync(OUT,{recursive:true});
(async()=>{
  const b=await chromium.launch(); const pg=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
  await pg.addInitScript(()=>{window.Audio=undefined; // these tests check speech synthesis, so turn recorded clips off (tests/voice.js covers clips)
    window.__said=[];Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[],cancel(){},
    speak(u){window.__said.push(u.text);setTimeout(()=>u.onend&&u.onend(),120)}},configurable:true});try{localStorage.clear()}catch(e){}});
  await pg.goto('file://'+process.argv[2]); await pg.waitForTimeout(600);
  const ok=(name,cond,extra='')=>console.log((cond?'PASS ':'FAIL ')+name+(extra?'  '+extra:''));
  // 1-8
  const nw=await pg.evaluate(()=>document.querySelector('.node.cur').getBoundingClientRect().width); ok('1-8 node width 92',nw===92,nw);
  await pg.screenshot({path:OUT+'s1-map.png'});
  // 1-1 intro + listen prompts spoken
  await pg.click('.node.cur'); await pg.waitForTimeout(1500);
  let said=await pg.evaluate(()=>window.__said.slice()); ok('1-1 intro spoken',said[0]==='這是新朋友！'&&said.includes('玻'),JSON.stringify(said));
  await pg.evaluate(()=>{window.__said=[]}); await pg.click('text=我記住了'); await pg.waitForTimeout(900);
  said=await pg.evaluate(()=>window.__said.slice()); ok('1-1 listen prompt then sound',said[0]==='聽一聽，是哪一個注音？'&&said[1]==='玻',JSON.stringify(said));
  // 1-2 first miss: glow + think cat + encouragement
  const s=await pg.evaluate(()=>LS.steps[LS.i].s);
  await pg.evaluate(()=>{window.__said=[]});
  await pg.evaluate(s=>[...document.querySelectorAll('.opt')].find(x=>x.textContent.trim()!==s).click(),s);
  await pg.waitForTimeout(100);
  const think=await pg.evaluate(()=>document.querySelector('#stage .prompt svg').innerHTML.includes('r="5"'));
  await pg.waitForTimeout(700);
  const st1=await pg.evaluate(s=>({glow:[...document.querySelectorAll('.opt')].find(x=>x.textContent.trim()===s).classList.contains('glow'),m:LS.mistakes,said:window.__said.slice()}),s);
  ok('1-2 think face on miss',think); ok('1-2 right option glows',st1.glow); ok('1-2 encouragement spoken',['再想想看','沒關係，再試一次','慢慢來，你可以的'].includes(st1.said[0]),JSON.stringify(st1.said));
  await pg.screenshot({path:OUT+'s1-miss.png'});
  // 1-3 second miss: answer shown
  await pg.evaluate(s=>{const w=[...document.querySelectorAll('.opt')].filter(x=>x.textContent.trim()!==s);w[w.length-1].click()},s);
  await pg.waitForTimeout(900);
  const st2=await pg.evaluate(()=>({fb:document.querySelector('#fb').classList.contains('show'),txt:document.querySelector('#fbTxt').textContent,ok:!!document.querySelector('.opt.ok'),m:LS.mistakes}));
  ok('1-3 answer shown after 2 misses',st2.fb&&st2.ok&&st2.txt.startsWith('答案在這裡'),JSON.stringify(st2));
  // 1-5 trace: two bad tries pass without mistakes
  await pg.evaluate(()=>{const t=LS.steps.findIndex(x=>x.t==='trace');LS.i=t;showStep()}); await pg.waitForTimeout(400);
  const m0=await pg.evaluate(()=>LS.mistakes);
  const box=await pg.locator('.trace canvas.u').boundingBox();
  for(let k=0;k<2;k++){await pg.mouse.move(box.x+10,box.y+10);await pg.mouse.down();await pg.mouse.move(box.x+40,box.y+15,{steps:4});await pg.mouse.up();await pg.click('text=寫好了');await pg.waitForTimeout(900)}
  const st3=await pg.evaluate(()=>({fb:document.querySelector('#fb').classList.contains('show'),txt:document.querySelector('#fbTxt').textContent,m:LS.mistakes}));
  ok('1-5 trace passes after 2 tries, no mistakes added',st3.fb&&st3.m===m0,JSON.stringify(st3)+' m0='+m0);
  // 1-6 exit confirmation
  await pg.click('#xBtn'); await pg.waitForTimeout(150);
  const ask=await pg.evaluate(()=>!!document.querySelector('.ask')); await pg.screenshot({path:OUT+'s1-ask.png'});
  await pg.click('#askStay'); const gone=await pg.evaluate(()=>!document.querySelector('.ask')&&!!LS);
  ok('1-6 exit asks, stay keeps lesson',ask&&gone);
  // 1-4 finish: 3 stars despite mistakes, record kept
  const st4=await pg.evaluate(()=>{finish();return {stars:P.stars[0],acc:P.acc[0],on:document.querySelectorAll('.bigstars i.on').length,h:document.querySelector('.result h2').textContent}});
  ok('1-4 3 stars for finishing, mistakes recorded',st4.stars===3&&st4.on===3&&st4.acc&&st4.acc.m>=2,JSON.stringify(st4));
  await pg.click('#doneBtn'); await pg.waitForTimeout(200);
  // 1-7 parent gate
  await pg.click('#setBtn'); await pg.waitForTimeout(100);
  const q=await pg.evaluate(()=>document.querySelector('.gate-q')?.textContent); 
  const ans=q?eval(q.replace('＋','+').replace('＝ ？','')):null;
  await pg.evaluate(a=>[...document.querySelectorAll('.gate-o')].find(x=>+x.textContent!==a).click(),ans);
  const blocked=await pg.evaluate(()=>!document.querySelector('.box[aria-label="家長設定"]'));
  await pg.click('#setBtn'); await pg.waitForTimeout(100);
  const q2=await pg.evaluate(()=>document.querySelector('.gate-q').textContent); const a2=eval(q2.replace('＋','+').replace('＝ ？',''));
  await pg.screenshot({path:OUT+'s1-gate.png'});
  await pg.evaluate(a=>[...document.querySelectorAll('.gate-o')].find(x=>+x.textContent===a).click(),a2);
  const opened=await pg.evaluate(()=>({open:!!document.querySelector('.box[aria-label="家長設定"]'),rec:document.querySelector('.rec-list')?.textContent}));
  ok('1-7 gate blocks wrong answer, opens on right',blocked&&opened.open,q+' | '+JSON.stringify(opened));
  await pg.screenshot({path:OUT+'s1-settings.png'});
  console.log('errors',JSON.stringify(errs)); await b.close();
})();
