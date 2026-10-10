(()=>{'use strict';
const $=id=>document.getElementById(id);
const HERO_EMOJIS=['🦉','🦋','🦁','🦄','🐯','🦌','🦊','🐰','🐻','🐱'];
const PORTAL_COLORS=[[.65,.49,1],[.33,.9,1],[1,.78,.32]];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const rnd=(a,b)=>a+Math.random()*(b-a);
const inviteUrl=code=>new URL('/?room='+encodeURIComponent(code),location.href).href;
const mix=(a,b,t)=>a+(b-a)*t;
let HEROES=[],chosen=0,socket=null,clientId='',roomCode='',snapshot=null,playing=false;
let playerVisuals=new Map(),quizOpen=false,quizResolved=false,events=[],lastMsg='',lastMsgTimer;
let gl,softCtx=null,softStatic=null,program,bufferStatic,bufferDynamic,staticCount=0,loc={},canvas=$('world'),lastFrame=0,cam={x:12,y:15,z:26};
let canvasW=1,canvasH=1,dpr=1,vertexTemp=[],camVP=null;
const keyHeld=new Set(),touchHeld=new Set();let lastInput='';
const keys={w:'up',arrowup:'up',s:'down',arrowdown:'down',a:'left',arrowleft:'left',d:'right',arrowright:'right'};
const notice=(message)=>{$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(lastMsgTimer);lastMsgTimer=setTimeout(()=>$('toast').classList.remove('show'),3600)};
const err=(message)=>{$('home-error').textContent=message};
const safeText=(s)=>String(s==null?'':s);
const add=(x,y,z)=>[x,y,z], c=(hex)=>{let s=hex.replace('#','');return [parseInt(s.slice(0,2),16)/255,parseInt(s.slice(2,4),16)/255,parseInt(s.slice(4,6),16)/255]};
function initHome(){
  fetch('/api/heroes').then(r=>r.json()).then(heroes=>{HEROES=heroes;drawHeroMenu()}).catch(()=>err('Tidak dapat mengambil senarai hero. Jalankan node server.js.'));
  const invited=(new URLSearchParams(location.search).get('room')||'').trim().toUpperCase();
  if(/^[A-HJ-NP-Z2-9]{5}$/.test(invited)){$('room-code').value=invited;$('invitation-hint').classList.remove('hidden')}
  $('create').addEventListener('click',()=>connect(''));
  $('join').addEventListener('click',()=>{const code=$('room-code').value.trim().toUpperCase();if(code.length!==5){err('Masukkan kod bilik 5 aksara.');return}connect(code)});
  $('room-code').addEventListener('keyup',e=>{if(e.key==='Enter')$('join').click()});
  $('leave').onclick=returnHome;$('victory-home').onclick=returnHome;
  $('copy-room').onclick=async()=>{try{await navigator.clipboard.writeText(roomCode);notice('Kod '+roomCode+' disalin!')}catch{notice('Kod bilik: '+roomCode)}};
  $('share-invite').onclick=shareInvitation;
  $('close-quiz').onclick=closeQuiz;
  $('attack').onclick=attack;$('skill').onclick=skill;$('interact').onclick=interact;
  document.querySelectorAll('.dpad-btn').forEach(btn=>{
    const k=btn.dataset.key;
    const down=e=>{e.preventDefault();btn.setPointerCapture?.(e.pointerId);touchHeld.add(k);btn.classList.add('held');updateMovement()};
    const up=e=>{e.preventDefault();touchHeld.delete(k);btn.classList.remove('held');updateMovement()};
    btn.addEventListener('pointerdown',down);['pointerup','pointercancel','lostpointercapture'].forEach(s=>btn.addEventListener(s,up));
  });
  window.addEventListener('keydown',e=>{
    if(!playing||e.target?.tagName==='INPUT')return;
    const key=e.key.toLowerCase();
    if(quizOpen){if(!quizResolved && ['1','2','3','4'].includes(key))document.querySelectorAll('#answers button')[+key-1]?.click();return}
    if(keys[key]){e.preventDefault();keyHeld.add(keys[key]);updateMovement()}
    if(e.repeat)return;
    if(key==='j'||key===' '){e.preventDefault();attack()}
    if(key==='k')skill();if(key==='e')interact();
  });
  window.addEventListener('keyup',e=>{const key=e.key.toLowerCase();if(keys[key]){keyHeld.delete(keys[key]);updateMovement()}});
  window.addEventListener('blur',()=>{keyHeld.clear();touchHeld.clear();updateMovement()});
}
function drawHeroMenu(){
  const grid=$('hero-grid');grid.innerHTML='';
  HEROES.forEach((h,i)=>{
    const btn=document.createElement('button');btn.className='hero-card'+(chosen===i?' selected':'');btn.setAttribute('aria-label','Pilih '+h.name);
    const avatar=document.createElement('div');avatar.className='portrait';avatar.style.setProperty('--hc',h.color);avatar.textContent=h.icon;
    const name=document.createElement('div');name.className='hero-name';name.textContent=h.name;btn.append(avatar,name);
    btn.onclick=()=>{chosen=i;drawHeroMenu()};grid.appendChild(btn);
  });
  const h=HEROES[chosen];if(!h)return;
  $('hero-detail').innerHTML='';
  const top=document.createElement('div');top.className='detail-top';
  const avatar=document.createElement('div');avatar.className='detail-icon';avatar.style.setProperty('--hc',h.color);avatar.textContent=h.icon;
  const detail=document.createElement('div');
  for(const [className,str] of [['detail-name',h.name],['detail-role',h.role],['detail-skill','✨ '+h.skill]]){const el=document.createElement('div');el.className=className;el.textContent=str;detail.appendChild(el)}top.append(avatar,detail);$('hero-detail').appendChild(top);
  const stats=document.createElement('div');stats.className='stats';stats.innerHTML=`<span>💪 Kekuatan <strong>${h.str}/10</strong></span><span>💨 Agility <strong>${h.agi}/10</strong></span><span>⚡ Kuasa <strong>${h.power}/10</strong></span>`;$('hero-detail').appendChild(stats);
}
async function shareInvitation(){
  if(!roomCode)return;
  const url=inviteUrl(roomCode);
  if(navigator.share){try{await navigator.share({title:'Alam Hikmah 3D — Jom main bersama!',text:'Saya jemput awak main Alam Hikmah 3D. Pilih hero dan sertai bilik '+roomCode+'!',url});return}catch(e){if(e.name==='AbortError')return}}
  try{await navigator.clipboard.writeText(url);notice('🔗 Pautan jemputan disalin! Tampal dalam WhatsApp.')}
  catch{window.prompt('Salin pautan ini dan kongsi kepada rakan:',url)}
}
function connect(code){
  if(!HEROES.length){err('Hero belum dimuatkan.');return}
  if(socket&&socket.readyState<=1)socket.close();
  err('Sedang berhubung ke dunia 3D…');
  const proto=location.protocol==='https:'?'wss:':'ws:';
  const ws=new WebSocket(proto+'//'+location.host+'/ws');socket=ws;
  ws.onopen=()=>{if(ws!==socket)return;ws.send(JSON.stringify({type:'join',room:code,hero:chosen}))};
  ws.onmessage=e=>{if(ws!==socket)return;try{onMessage(JSON.parse(e.data))}catch(x){console.warn('Bad packet',x)}};
  ws.onerror=()=>{if(!playing)err('Tidak dapat sambung ke pelayan. Periksa sambungan internet / Wi-Fi.')};
  ws.onclose=()=>{if(ws!==socket)return;if(playing){notice('Sambungan terputus. Buka semula bilik untuk sambung.');setTimeout(()=>{if(socket===ws) returnHome()},2100)}};
}
function send(type,rest={}){if(socket?.readyState===1)socket.send(JSON.stringify({type,...rest}))}
// Application heartbeat: online free hosts may sleep after 15 minutes of inbound inactivity.
setInterval(()=>{if(socket?.readyState===1)send('ping',{at:Date.now()})},30000);
function onMessage(data){
  switch(data.type){
    case 'error':err(data.text);notice(data.text);return;
    case 'joined':
      roomCode=data.room;clientId=data.id;playing=true;
      history.replaceState(null,'',inviteUrl(roomCode));quizOpen=false;quizResolved=false;playerVisuals=new Map();snapshot=null;events=[];
      $('home').classList.add('hidden');$('game').classList.remove('hidden');$('room-display').textContent=roomCode;
      $('my-icon').textContent=HEROES[chosen].icon;$('my-name').textContent=HEROES[chosen].name;
      if(!gl)setup3D();resize();window.addEventListener('resize',resize);lastFrame=performance.now();requestAnimationFrame(frame);
      notice('Selamat datang! Kod bilik '+roomCode+' · Jemput ahli keluarga anda.');break;
    case 'state': snapshot=data;drawHud();break;
    case 'event': notice(data.text);break;
    case 'question': openQuiz(data);break;
    case 'answerResult': showAnswerResult(data);break;
    case 'effect': addEffect(data);break;
    case 'skillEffect': addEffect({...data,kind:'skill'});break;
    case 'victory': showVictory(data);break;
  }
}
function returnHome(){
  const old=socket;socket=null;if(old&&old.readyState<2)old.close();
  playing=false;quizOpen=false;quizResolved=false;keyHeld.clear();touchHeld.clear();lastInput='';
  $('quiz-modal').classList.add('hidden');$('victory-modal').classList.add('hidden');$('game').classList.add('hidden');$('home').classList.remove('hidden');err('');
  history.replaceState(null,'',location.pathname);
}
function drawHud(){
  if(!snapshot)return;
  const p=snapshot.players.find(p=>p.id===clientId);if(!p)return;
  $('my-level').textContent='LEVEL '+p.level;$('my-stars').textContent='⭐ '+p.stars;
  $('hp-text').textContent=p.hp+'/'+p.max;$('hp-bar').style.width=(100*p.hp/p.max)+'%';
  const needed=100+p.level*65;
  $('xp-text').textContent=p.xp+'/'+needed;$('xp-bar').style.width=(100*p.xp/needed)+'%';
  $('respawn-tip').classList.toggle('hidden',p.hp>0);
  $('player-count').textContent=snapshot.players.length+'/10';$('score-count').textContent=snapshot.players.length+'/10';
  $('progress').textContent=snapshot.seals.filter(Boolean).length+'/3';
  const names=['Gerbang Akhlak','Gerbang Iman','Gerbang Hikmah'];
  $('portal-list').innerHTML='';names.forEach((name,i)=>{const row=document.createElement('div');row.className='portal-item'+(snapshot.seals[i]?' done':'');row.innerHTML=`<span class="dot">${snapshot.seals[i]?'✅':'🔒'}</span>`;row.append(document.createTextNode(name+' · '+(snapshot.progress?.[i]||0)+'/3'));$('portal-list').appendChild(row)});
  const boss=snapshot.boss;
  $('boss-hp').textContent=boss.shield?'🔒 KEBAL':boss.hp+'/'+boss.max;
  $('boss-bar').style.width=(100*boss.hp/boss.max)+'%';
  const list=$('scoreboard');list.innerHTML='';
  [...snapshot.players].sort((a,b)=>b.stars-a.stars).forEach(p=>{
    const row=document.createElement('div');row.className='score-row';
    const ico=document.createElement('span');ico.textContent=HERO_EMOJIS[p.hero];const who=document.createElement('b');who.textContent=p.name+(p.id===clientId?' (anda)':'');const score=document.createElement('em');score.textContent=p.stars+' ⭐';row.append(ico,who,score);list.appendChild(row)
  });
  $('skill-label').textContent=p.skillReady?p.skillReady+'s':'SKILL';$('skill').disabled=p.skillReady>0||p.hp<=0;
  $('attack').disabled=p.hp<=0;
}
function movementVector(){
  const all=new Set([...keyHeld,...touchHeld]);let dx=(all.has('right')?1:0)-(all.has('left')?1:0),dz=(all.has('down')?1:0)-(all.has('up')?1:0);
  const n=Math.hypot(dx,dz);if(n>1){dx/=n;dz/=n}return {dx,dz};
}
function updateMovement(){const m=movementVector(),s=m.dx+','+m.dz;if(s!==lastInput){lastInput=s;send('move',m)}}
function attack(){if(playing&&!quizOpen)send('attack')}
function skill(){if(playing&&!quizOpen)send('skill')}
function interact(){if(playing&&!quizOpen)send('interact')}
function openQuiz(q){quizOpen=true;quizResolved=false;send('move',{dx:0,dz:0});
  $('quiz-modal').classList.remove('hidden');$('category').textContent=q.subject.toUpperCase();$('portal-name').textContent=q.portalName;
  $('question').textContent=q.question;
  $('portal-name').textContent=q.portalName+' · Cabaran '+q.stage+'/'+q.stagesTotal;$('answer-feedback').classList.add('hidden');$('close-quiz').classList.add('hidden');
  const answers=$('answers');answers.innerHTML='';q.answers.forEach((a,i)=>{
    const b=document.createElement('button');b.textContent=(i+1)+'. '+a;b.onclick=()=>{if(quizResolved)return;quizResolved=true;send('answer',{choice:i});b.classList.add('chosen');[...answers.children].forEach(el=>el.disabled=true)};answers.appendChild(b);
  });
}
function showAnswerResult(r){
  const buttons=[...$('answers').children];buttons.forEach((b,i)=>{b.disabled=true;if(i===r.correctChoice)b.classList.add('correct');if(b.classList.contains('chosen')&&!r.correct)b.classList.add('wrong')});
  const fb=$('answer-feedback');fb.classList.remove('hidden');fb.textContent=(r.correct?'✅ BETUL! ':'💡 BELAJAR LAGI: ')+r.explanation+' · '+(r.reward||'');$('close-quiz').classList.remove('hidden');
}
function closeQuiz(){quizOpen=false;$('quiz-modal').classList.add('hidden');lastInput='';updateMovement();if(snapshot?.seals.every(Boolean))notice('3 Gerbang selesai! Pergi ke istana di utara dan kalahkan Raja Kabus.')}
function showVictory(data){$('victory-modal').classList.remove('hidden');const list=$('victory-scores');list.innerHTML='';data.players.sort((a,b)=>b.stars-a.stars).forEach(p=>{const row=document.createElement('div');row.className='victory-row';const name=document.createElement('span');name.textContent=p.name+' · Level '+p.level;const score=document.createElement('b');score.textContent=p.stars+' ⭐ | '+p.kills+' ⚔️';row.append(name,score);list.appendChild(row)})}
function addEffect(d){if(events.length>60)events.shift();events.push({x:d.x,z:d.z,kind:d.kind,start:performance.now(),value:d.value})}
// --------------- Custom dependency-free WebGL voxel renderer ---------------
const VERT=`attribute vec3 aPosition;attribute vec3 aColor;uniform mat4 uVP;uniform mat4 uView;varying vec3 vColor;varying float vFog;void main(){vec4 world=vec4(aPosition,1.0);gl_Position=uVP*world;vec4 eye=uView*world;vFog=clamp((-eye.z-12.0)/72.0,0.0,0.65);vColor=aColor;}`;
const FRAG=`precision mediump float;varying vec3 vColor;varying float vFog;void main(){gl_FragColor=vec4(mix(vColor,vec3(0.64,0.82,0.88),vFog),1.0);}`;
function shader(kind,source){const obj=gl.createShader(kind);gl.shaderSource(obj,source);gl.compileShader(obj);if(!gl.getShaderParameter(obj,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(obj));return obj}
function setup3D(){
  gl=canvas.getContext('webgl',{antialias:true,alpha:false,powerPreference:'default'}) || canvas.getContext('experimental-webgl');
  if(!gl){softCtx=canvas.getContext('2d');if(softCtx){softStatic=new Mesh();makeLandscape(softStatic);notice('Mod 3D alternatif diaktifkan.')}return}
  program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,VERT));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,FRAG));gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
  loc.pos=gl.getAttribLocation(program,'aPosition');loc.color=gl.getAttribLocation(program,'aColor');loc.vp=gl.getUniformLocation(program,'uVP');loc.view=gl.getUniformLocation(program,'uView');
  bufferStatic=gl.createBuffer();bufferDynamic=gl.createBuffer();gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.clearColor(.59,.79,.9,1);
  const b=new Mesh();makeLandscape(b);gl.bindBuffer(gl.ARRAY_BUFFER,bufferStatic);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(b.arr),gl.STATIC_DRAW);staticCount=b.arr.length/6;
}
class Mesh{
  constructor(){this.arr=[]}
  box(x,y,z,w,h,d,col,rot=0,ox=x,oz=z){
    const X=w/2,Y=h/2,Z=d/2;
    const local=[[-X,-Y,-Z],[X,-Y,-Z],[X,Y,-Z],[-X,Y,-Z],[-X,-Y,Z],[X,-Y,Z],[X,Y,Z],[-X,Y,Z]];
    const sin=Math.sin(rot),cos=Math.cos(rot);
    const pts=local.map(([a,b,c])=>{
      const dx=x+a-ox,dz=z+c-oz;
      return [ox+dx*cos+dz*sin,y+b,oz-dx*sin+dz*cos]
    });
    const faces=[[[0,1,2,3],.82],[[5,4,7,6],.77],[[1,5,6,2],.72],[[4,0,3,7],.64],[[3,2,6,7],1.13],[[4,5,1,0],.52]];
    for(const [idx,bright] of faces){for(const i of [0,1,2,0,2,3]){const p=pts[idx[i]];this.arr.push(p[0],p[1],p[2],clamp(col[0]*bright,0,1),clamp(col[1]*bright,0,1),clamp(col[2]*bright,0,1))}}
  }
}
function groundObject(b,x,z){
  const rand=(n)=>{const v=Math.sin(n*112.7+x*78.233+z*28.17)*15828.23;return v-Math.floor(v)};
  const pick=rand(2);
  if(pick<.32){ // geometric oak trees
    const height=2.7+rand(6)*1.8;
    b.box(x,height/2,z,.66,height,.66,[.41,.31,.23]);
    const dark=[.18,.45,.31],light=[.28,.58,.35];
    b.box(x,height+.2,z,2.7,1.6,2.7,dark);b.box(x,height+1.05,z,2.1,1.1,2.1,light);
    b.box(x-.7,height-.25,z+.5,1.5,.8,1.6,[.21,.54,.34]);
  } else if(pick<.57){
    b.box(x,.35,z,1.4,.7,1.15,[.41,.54,.49]);b.box(x-.2,.6,z,.9,.24,1.1,[.59,.69,.6]);
  } else if(pick<.88){
    b.box(x,.35,z,.8,.7,.8,[.20,.62,.33]);b.box(x+.38,.24,z+.26,.65,.48,.7,[.27,.68,.38]);
  } else {b.box(x,.14,z,.4,.28,.4,[1,.83,.42])}
}
function makeLandscape(b){
  b.box(0,-.66,-2,58,1.2,55,[.22,.58,.39]);
  // Path leading from village to castle, three heroic arenas
  for(let z=-22;z<19;z+=2.6){b.box(0,-.02,z,6.5,.15,2.4,[.64,.65,.58]);b.box(-3.4,.05,z,.35,.23,1.8,[.84,.83,.62]);b.box(3.4,.05,z,.35,.23,1.8,[.84,.83,.62])}
  for(let x=-16;x<=16;x+=2.5){b.box(x,-.03,-7,2.2,.17,3.7,[.69,.70,.61])}
  // glowing little grass floor checkerboards
  for(let z=-25;z<23;z+=4)for(let x=-26;x<28;x+=4)if((Math.round(x/4)+Math.round(z/4))%2===0)b.box(x,-.052,z,3.9,.045,3.9,[.23,.61,.41]);
  // border stones and forest stands
  for(let z=-23;z<20;z+=4){groundObject(b,-25+rnd(-1,1),z);groundObject(b,25+rnd(-1,1),z)}
  for(let x=-23;x<25;x+=4){groundObject(b,x,-25);groundObject(b,x,20)}
  for(const [x,z] of [[-20,9],[-15,13],[17,13],[20,6],[-19,1],[16,-14],[-15,-17],[10,8],[-10,8],[8,-13]])groundObject(b,x,z);
  // Blue river and stepping stones to differentiate world's biomes
  for(let i=0;i<12;i++)b.box(-16+i*.8,-.05,14+i*.3,1.3,.12,3.2,[.24,.58,.78]);
  for(let i=0;i<5;i++)b.box(-13+i*1.1,.07,13.5+i*.1,.7,.22,.8,[.85,.78,.64]);
  // spawn village with timber roofs
  for(const [x,z,color] of [[-17,16,[.92,.62,.42]],[15,16,[.76,.54,.8]]]){
    b.box(x,1.6,z,4,3,3.5,[.92,.82,.64]);b.box(x,3.5,z,4.7,1.1,4,[.41,.32,.54]);
    b.box(x,2,z+1.78,1.0,1.3,.2,color);b.box(x-1.3,2.4,z+1.78,.6,.7,.2,[.4,.8,.91]);
  }
  // portal bases: do not block players (3D decorative only)
  for(const [i,q] of [[0,[-16,-7]],[1,[16,-7]],[2,[0,4]]]){
    const [x,z]=q,col=PORTAL_COLORS[i];
    b.box(x,.2,z,7,.35,5,[.43,.50,.67]);
    for(const dx of [-2.3,2.3]){b.box(x+dx,2.3,z,.95,4.3,1.1,[.64,.73,.83]);b.box(x+dx,4.6,z,1.4,.4,1.45,col)}
    b.box(x,4.45,z,5.5,.75,1.4,[.72,.81,.92]);b.box(x,4.9,z,4.7,.4,1.65,col);
    b.box(x,.58,z,1.7,.9,1.7,col);
  }
  // castle at northern end
  for(const x of [-10,10]){
    b.box(x,4,-24,4.7,8,5,[.28,.32,.46]);b.box(x,8.4,-24,5.6,.9,5.7,[.44,.40,.58]);
    for(const bx of [-1.7,-.5,.7,1.9])b.box(x+bx,9,-24,.55,.8,1,[.49,.45,.62]);
  }
  b.box(0,2,-26,16,4,3,[.33,.32,.49]);b.box(0,4.5,-26,18,1.1,3.6,[.43,.40,.57]);
  b.box(0,6.5,-27,5,3.7,4.7,[.33,.35,.52]);b.box(0,9,-27,6,.8,5.3,[.47,.44,.63]);
  b.box(0,1.5,-24.3,4,3.2,.7,[.11,.15,.31]);
  // castle banner torches
  for(const x of [-7.5,7.5]){b.box(x,4.7,-23,1.2,2,.35,[.51,.25,.4]);b.box(x,5.3,-22.8,.75,.55,.4,[1,.71,.23])}
}
function human(b,p,pose,transparent=false){
  const h=HEROES[p.hero]||HEROES[0],color=c(h.color);const skin=[.97,.75,.53],hair=[.26,.21,.28];
  const ang=p.angle??Math.PI;const x=p.x,z=p.z,yy=.1+Math.sin(pose*6.5+p.hero)*.055;
  const add=(dx,dy,dz,w,H,d,col)=>b.box(x+dx,yy+dy,z+dz,w,H,d,col,ang,x,z);
  // Skin + oversized head, classic block-avatar silhouette.
  add(0,1.55,0,1.03,1.2,.69,color);
  add(0,2.55,0,1.13,1.05,.98,skin);
  add(0,3.12,-.05,1.19,.27,1.02,hair);
  add(-.18,2.65,-.51,.09,.10,.05,[.11,.19,.24]);add(.18,2.65,-.51,.09,.10,.05,[.11,.19,.24]);
  add(-.22,2.39,-.51,.24,.055,.06,[.56,.28,.28]);
  const stride=Math.sin(pose*9)*.12;
  add(-.76,1.53,-stride,.37,1.05,.54,skin);add(.76,1.53,stride,.37,1.05,.54,skin);
  add(-.29,.49,stride,.40,.9,.55,[.29,.39,.55]);add(.29,.49,-stride,.40,.9,.55,[.29,.39,.55]);
  add(-.29,.11,-.19,.48,.22,.73,[.20,.27,.39]);add(.29,.11,-.19,.48,.22,.73,[.20,.27,.39]);
  // signature costume accessory for differentiating 10 heroes
  if([0,6,9].includes(p.hero)){add(0,2.95,-.03,1.32,.23,1.1,color);add(0,3.2,0,.3,.35,.35,[1,.84,.39])}
  else if([2,4,8].includes(p.hero)){add(0,1.68,-.38,.65,.75,.18,[.93,.76,.27]);add(-.89,1.3,-.4,.19,.96,.20,[.54,.64,.78])}
  else{add(0,1.3,-.42,.6,.25,.15,[1,.84,.46]);add(0,3.12,0,.3,.5,.45,color)}
  if(p.shield>2){b.box(x,1.7,z,2.0,3.5,2.0,[.38,.88,.94])}
}
function npc(b,m,ts){
  const x=m.x,z=m.z,hop=Math.sin(ts*3+m.id)*.1;
  b.box(x,.6+hop,z,1.12,1.14,1.05,[.35,.26,.63]);
  b.box(x,1.42+hop,z,.95,.75,.92,[.47,.32,.78]);
  b.box(x-.22,1.53+hop,z-.48,.17,.18,.14,[1,.42,.71]);b.box(x+.22,1.53+hop,z-.48,.17,.18,.14,[1,.42,.71]);
  b.box(x-.67,.62+hop,z,.35,.8,.53,[.26,.18,.44]);b.box(x+.67,.62+hop,z,.35,.8,.53,[.26,.18,.44]);
  b.box(x,2.05+hop,z,.45,.42,.55,[.57,.40,.87]);
  health3D(b,x,2.55,z,m.hp/m.max,[.87,.36,.57]);
}
function health3D(b,x,y,z,fraction,color){b.box(x,y,z,1.65,.14,.12,[.15,.2,.26]);if(fraction>0)b.box(x-(1-fraction)*.825,y,z-.02,1.63*fraction,.16,.17,color)}
function boss(b,obj,time){
  const x=obj.x,z=obj.z;const a=.06*Math.sin(time*1.8);
  b.box(x,1.55,z,3.7,3,2.4,[.31,.23,.50]);b.box(x,3.7+a,z,2.4,2.3,2,[.25,.17,.42]);
  b.box(x,5.15+a,z,3,.58,2.2,[.42,.28,.6]);
  b.box(x-1.18,3.85+a,z-.5,.45,.38,.5,[1,.35,.56]);b.box(x+1.18,3.85+a,z-.5,.45,.38,.5,[1,.35,.56]);
  for(const offset of [-1,1]){b.box(x+offset*2.15,2.2,z,1.25,2.1,1.4,[.24,.19,.40]);b.box(x+offset*.75,5.85+a,z,.7,1.1,.7,[.56,.36,.76])}
  b.box(x,1.8,z-1.4,.8,1,.5,[.81,.45,.98]);health3D(b,x,6.8,z,Math.max(0,obj.hp/obj.max),[.95,.25,.52]);
  if(obj.shield){b.box(x,3.25,z,4.75,.17,4.5,[.36,.83,.99]);b.box(x,5.6,z,3.4,.15,3.3,[.39,.82,1])}
}
function portalDynamic(b,portal,i,done,secs){
  const color=PORTAL_COLORS[i],x=portal.x,z=portal.z;
  // animated floating crystal above each portal
  const y=3.1+Math.sin(secs*2+i*2)*.27;
  if(done){b.box(x,y,z,.92,1.0,.92,[.35,.95,.57]);b.box(x,y+1,z,.22,.52,.22,[1,.94,.52])}
  else{b.box(x,y,z,1.24,1.55,1.24,color);b.box(x,y+1.05,z,.38,.5,.38,[1,.95,.8]);b.box(x,y-1.04,z,.62,.24,.62,[1,.96,.62])}
}
function effects3D(b,time){
  events=events.filter(e=>time-e.start<1200);
  for(const e of events){
    const t=(time-e.start)/1000,kind=e.kind;
    const col=kind==='hurt'?[1,.25,.4]:kind==='skill'?[.45,.95,1]:[1,.88,.30];
    const n=kind==='skill'?14:8;
    for(let j=0;j<n;j++){
      const a=j*Math.PI*2/n+e.x,dist=(kind==='skill'?5:2.2)*t;
      b.box(e.x+Math.cos(a)*dist,1.1+Math.sin(j*3.5+t*6)*.25+t*1.5,e.z+Math.sin(a)*dist,.21,.25,.21,col)
    }
  }
}
const identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2),nf=1/(near-far);return [f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0]}
function lookAt(eye,target){
  let z=[eye[0]-target[0],eye[1]-target[1],eye[2]-target[2]];let n=Math.hypot(...z)||1;z=z.map(v=>v/n);
  let x=[z[2],0,-z[0]];n=Math.hypot(...x)||1;x=x.map(v=>v/n);
  const y=[z[1]*x[2]-z[2]*x[1],z[2]*x[0]-z[0]*x[2],z[0]*x[1]-z[1]*x[0]];
  return [x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-(x[0]*eye[0]+x[1]*eye[1]+x[2]*eye[2]),-(y[0]*eye[0]+y[1]*eye[1]+y[2]*eye[2]),-(z[0]*eye[0]+z[1]*eye[1]+z[2]*eye[2]),1]
}
function mult(a,b){const out=new Array(16).fill(0);for(let col=0;col<4;col++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)out[col*4+row]+=a[k*4+row]*b[col*4+k];return out}
function pointVP(p){
  if(!camVP)return null;const [x,y,z]=p,m=camVP;
  const w=m[3]*x+m[7]*y+m[11]*z+m[15];if(w<=.1)return null;
  const px=(m[0]*x+m[4]*y+m[8]*z+m[12])/w,py=(m[1]*x+m[5]*y+m[9]*z+m[13])/w;
  if(Math.abs(px)>1.1||Math.abs(py)>1.1)return null;
  return [(px*.5+.5)*canvasW,(-py*.5+.5)*canvasH];
}
function resize(){if(!gl&&!softCtx)return;const r=canvas.getBoundingClientRect();canvasW=r.width||innerWidth;canvasH=r.height||innerHeight;dpr=Math.min(1.7,devicePixelRatio||1);canvas.width=Math.round(canvasW*dpr);canvas.height=Math.round(canvasH*dpr);if(gl)gl.viewport(0,0,canvas.width,canvas.height);if(softCtx)softCtx.setTransform(dpr,0,0,dpr,0,0)}
function bindAndDraw(buffer,n){
  gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  gl.enableVertexAttribArray(loc.pos);gl.vertexAttribPointer(loc.pos,3,gl.FLOAT,false,24,0);
  gl.enableVertexAttribArray(loc.color);gl.vertexAttribPointer(loc.color,3,gl.FLOAT,false,24,12);
  gl.drawArrays(gl.TRIANGLES,0,n);
}
function updateLabelPositions(){
  const layer=$('labels');layer.innerHTML='';
  if(!snapshot)return;
  snapshot.players.forEach(p=>{
    const vis=playerVisuals.get(p.id);if(!vis)return;
    const pos=pointVP([vis.x,3.6,vis.z]);if(!pos)return;
    const tag=document.createElement('div');tag.className='name-tag'+(p.id===clientId?' mine':'');
    tag.style.left=pos[0]+'px';tag.style.top=pos[1]+'px';tag.textContent=HERO_EMOJIS[p.hero]+' '+p.name;
    const bar=document.createElement('small');const fill=document.createElement('b');fill.style.width=(100*p.hp/p.max)+'%';bar.appendChild(fill);tag.appendChild(bar);layer.appendChild(tag)
  })
}
let lastLabels=0;
// Perspective-correct 3D fallback for restricted browsers with WebGL turned off.
// Back-to-front flat-shaded voxel polygons; WebGL stays the primary renderer.
function renderSoftware(staticArr,dynamicArr,mvp){
  const cx=softCtx; if(!cx)return;
  const sky=cx.createLinearGradient(0,0,0,canvasH);sky.addColorStop(0,'#6cafd8');sky.addColorStop(.60,'#b7dfde');sky.addColorStop(1,'#bbdcaa');
  cx.fillStyle=sky;cx.fillRect(0,0,canvasW,canvasH);
  const faces=[];
  const collect=(arr)=>{
    // Mesh emits 2 triangles (6 packed vertices) for each planar box face.
    for(let i=0;i<arr.length;i+=36){
      const projected=[];let distanceSum=0,behind=false;
      for(const k of [0,1,2,5]){
        const o=i+k*6;
        const x=arr[o],y=arr[o+1],z=arr[o+2];
        const w=mvp[3]*x+mvp[7]*y+mvp[11]*z+mvp[15];
        if(w<.2){behind=true;break}
        const px=(mvp[0]*x+mvp[4]*y+mvp[8]*z+mvp[12])/w;
        const py=(mvp[1]*x+mvp[5]*y+mvp[9]*z+mvp[13])/w;
        projected.push([(px*.5+.5)*canvasW,(-py*.5+.5)*canvasH]);
        distanceSum+=w;
      }
      if(behind)continue;
      // Screen-space backface culling for simpler, faster voxel drawing.
      const [a,b,cc,d]=projected;
      const cross=(b[0]-a[0])*(cc[1]-a[1])-(b[1]-a[1])*(cc[0]-a[0]);
      if(cross>0)continue;
      const fog=clamp((distanceSum/4-12)/90,0,.52);
      const rgb=[0,1,2].map(j=>Math.round(255*mix(arr[i+3+j],[.64,.82,.88][j],fog)));
      faces.push({points:projected,depth:distanceSum,fill:`rgb(${rgb.join(',')})`});
    }
  };
  collect(staticArr);collect(dynamicArr);
  faces.sort((a,b)=>b.depth-a.depth);
  for(const f of faces){
    const ps=f.points;
    cx.beginPath();cx.moveTo(ps[0][0],ps[0][1]);for(let j=1;j<4;j++)cx.lineTo(ps[j][0],ps[j][1]);cx.closePath();
    cx.fillStyle=f.fill;cx.fill();
  }
}
function frame(ms){
  if(!playing)return;
  const dt=Math.min((ms-lastFrame)/1000,.1);lastFrame=ms;
  if((gl||softCtx)&&snapshot){
    const self=snapshot.players.find(p=>p.id===clientId);
    if(self){
      for(const p of snapshot.players){
        let vis=playerVisuals.get(p.id);if(!vis){vis={x:p.x,z:p.z};playerVisuals.set(p.id,vis)}
        // account for world snapshot smoothing and visually minimize teleport jitter
        vis.x=mix(vis.x,p.x,Math.min(1,dt*12));vis.z=mix(vis.z,p.z,Math.min(1,dt*12));
      }
      const me=playerVisuals.get(clientId),goal={x:me.x+11,y:16,z:me.z+20};
      cam.x=mix(cam.x,goal.x,Math.min(1,dt*4.8));cam.y=mix(cam.y,goal.y,Math.min(1,dt*4.8));cam.z=mix(cam.z,goal.z,Math.min(1,dt*4.8));
      const target=[cam.x-11,.75,cam.z-20-2];
      const view=lookAt([cam.x,cam.y,cam.z],target);
      camVP=mult(perspective(Math.PI/3.45,canvasW/canvasH,.1,125),view);
      if(gl){gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniformMatrix4fv(loc.vp,false,new Float32Array(camVP));gl.uniformMatrix4fv(loc.view,false,new Float32Array(view));bindAndDraw(bufferStatic,staticCount)}
      const d=new Mesh();
      snapshot.players.forEach(p=>{const vis=playerVisuals.get(p.id);if(vis&&p.hp>0)human(d,{...p,x:vis.x,z:vis.z},ms/1000)});
      snapshot.mobs.forEach(m=>npc(d,m,ms/1000));boss(d,snapshot.boss,ms/1000);
      const portals=[{x:-16,z:-7},{x:16,z:-7},{x:0,z:4}];
      portals.forEach((p,i)=>portalDynamic(d,p,i,snapshot.seals[i],ms/1000));
      effects3D(d,ms);
      if(gl){gl.bindBuffer(gl.ARRAY_BUFFER,bufferDynamic);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(d.arr),gl.DYNAMIC_DRAW);bindAndDraw(bufferDynamic,d.arr.length/6)}else if(softCtx){renderSoftware(softStatic.arr,d.arr,camVP)}
      if(ms-lastLabels>150){updateLabelPositions();lastLabels=ms}
    }
  }
  requestAnimationFrame(frame);
}
initHome();
})();
