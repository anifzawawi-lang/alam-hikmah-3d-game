'use strict';
/** Alam Hikmah 3D – single-process, authoritative, 10-player room server.
 * Zero external Node dependencies; Node 20+ required. */
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, 'public');
const HEROES = require('./data/heroes.json');
const QUESTIONS = require('./data/questions.json');
const PORTALS = [
  {x:-16,z:-7,name:'Gerbang Akhlak',subjects:['Akhlak','Hadis','Sirah / KAFA']},
  {x:16,z:-7,name:'Gerbang Iman',subjects:['Tauhid','Al-Quran','Tafsir']},
  {x:0,z:4,name:'Gerbang Hikmah',subjects:['Jawi','Feqah','Bahasa Arab']}
];
const rooms = new Map();
let idSeq=0;
const MAX_PLAYERS=10, MAX_ROOMS=60, TICK_MS=80;
const now=()=>Date.now(), rnd=(a,b)=>a+Math.random()*(b-a), clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const safeNum=v=>Number.isFinite(v)?v:0;
function send(conn,body){
  if(!conn || conn.closed || !conn.sock.writable || conn.sock.writableLength>512000)return;
  const payload=Buffer.from(JSON.stringify(body));
  const head=payload.length<126?Buffer.from([0x81,payload.length]):Buffer.from([0x81,126,(payload.length>>8)&255,payload.length&255]);
  conn.sock.write(Buffer.concat([head,payload]));
}
function rawFrame(sock,op,data=Buffer.alloc(0)){
  if(!sock.writable)return;
  let head=data.length<126?Buffer.from([0x80|op,data.length]):Buffer.from([0x80|op,126,(data.length>>8)&255,data.length&255]);
  sock.write(Buffer.concat([head,data]));
}
function broadcast(room,data){for(const p of room.players.values())send(p.conn,data)}
function event(room,text){broadcast(room,{type:'event',text})}
function makeRoom(){
  let code;
  do{code=[...Array(5)].map(()=> 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*32)]).join('')}while(rooms.has(code));
  const room={code,created:now(),players:new Map(),seals:[false,false,false],progress:[0,0,0],mobs:[],boss:{x:0,z:-21,hp:650,max:650,cd:0},elapsed:0,spawnAt:0,mobSeq:0,finished:false,questionUses:new Map()};
  for(let i=0;i<5;i++)spawnMob(room);
  rooms.set(code,room);return room;
}
function spawnMob(room){
  if(room.mobs.length>=16 || room.finished)return;
  const area=Math.random()<.6?0:1;
  const x=area?rnd(-22,22):rnd(-14,14);
  const z=area?rnd(-14,-3):rnd(-2,11);
  room.mobs.push({id:++room.mobSeq,x,z,hp:68,max:68,cd:0,slow:0});
}
function playerList(room){return [...room.players.values()];}
function spawnPlayer(conn,heroIdx,room){
  const hero=HEROES[heroIdx];const i=room.players.size;
  const max=120+hero.str*14;
  const p={id:`p${++idSeq}`,conn,hero:heroIdx,name:hero.name,x:-4+(i%5)*2,z:14+Math.floor(i/5)*2,
    dx:0,dz:0,angle:Math.PI,hp:max,max,shield:0,xp:0,level:1,stars:0,kills:0,
    lastAttack:0,lastSkill:0,pending:null,respawnAt:0};
  room.players.set(p.id,p);conn.player=p;conn.room=room;
  send(conn,{type:'joined',room:room.code,id:p.id,heroes:HEROES,portals:PORTALS,maxPlayers:MAX_PLAYERS});
  event(room,`${hero.icon} ${hero.name} masuk ke arena! (${room.players.size}/10)`);
}
function removePlayer(conn){
  const r=conn.room,p=conn.player;
  if(r&&p&&r.players.delete(p.id)){
    event(r,`${p.name} meninggalkan arena.`);
    if(r.players.size===0)rooms.delete(r.code);
  }
  conn.room=null;conn.player=null;
}
function handle(conn,data){
  if(!data||typeof data!=='object'||Array.isArray(data))return;
  const t=data.type;
  if(t==='join'){
    if(conn.player)return;
    const heroIdx=Number.isInteger(data.hero)?clamp(data.hero,0,9):0;
    let room;
    const code=String(data.room||'').trim().toUpperCase();
    if(code){room=rooms.get(code);if(!room){send(conn,{type:'error',text:'Kod bilik tidak dijumpai. Minta hos buat bilik dahulu.'});return}}
    else {if(rooms.size>=MAX_ROOMS){send(conn,{type:'error',text:'Semua bilik sedang digunakan. Sila cuba lagi nanti.'});return}room=makeRoom()}
    if(room.players.size>=MAX_PLAYERS){send(conn,{type:'error',text:'Bilik penuh (maksimum 10 pemain).'});return}
    if(room.finished){send(conn,{type:'error',text:'Misi bilik ini telah tamat. Cipta bilik baharu.'});return}
    spawnPlayer(conn,heroIdx,room);return;
  }
  const p=conn.player,r=conn.room;if(!p||!r)return;
  const ts=now();
  if(t==='move'){
    if(p.hp<=0)return;
    let dx=clamp(safeNum(data.dx),-1,1),dz=clamp(safeNum(data.dz),-1,1);
    const mag=Math.hypot(dx,dz);if(mag>1){dx/=mag;dz/=mag}
    p.dx=dx;p.dz=dz;
  }else if(t==='attack'){
    if(r.finished||p.hp<=0||ts-p.lastAttack<560)return;
    p.lastAttack=ts;
    const candidates=[...r.mobs];
    if(distance(p,r.boss)<3.5&&r.boss.hp>0)candidates.push({...r.boss,id:'boss'});
    const hits=candidates.filter(m=>distance(p,m)<3.5).sort((a,b)=>distance(p,a)-distance(p,b));
    if(hits[0])damage(r,p,hits[0],22+HEROES[p.hero].str*2+p.level*2);
    else send(conn,{type:'effect',x:p.x,z:p.z,kind:'miss'});
  }else if(t==='skill'){
    if(r.finished||p.hp<=0||ts-p.lastSkill<9000)return;
    p.lastSkill=ts;useSkill(r,p);
  }else if(t==='interact'){
    if(r.finished||p.hp<=0||p.pending)return;
    const idx=PORTALS.findIndex((portal,i)=>!r.seals[i] && distance(p,portal)<4.5);
    if(idx<0){send(conn,{type:'event',text:'Cari gerbang yang belum diselesaikan, kemudian tekan E / 📖.'});return}
    const stage=roomStage(r,idx);
    const subject=PORTALS[idx].subjects[stage];
    const filtered=QUESTIONS.filter(q=>q.subject===subject);
    const picked=filtered[Math.floor(Math.random()*filtered.length)];
    const choices=picked.choices.map((text,i)=>({text,valid:i===picked.correct}));
    for(let i=choices.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[choices[i],choices[j]]=[choices[j],choices[i]]}
    p.pending={id:picked.id,correct:choices.findIndex(c=>c.valid),portal:idx,stage,expires:ts+90000};p.dx=p.dz=0;
    send(conn,{type:'question',id:picked.id,subject:picked.subject,question:picked.question,answers:choices.map(c=>c.text),portal:idx,portalName:PORTALS[idx].name,stage:stage+1,stagesTotal:3});
  }else if(t==='answer'){
    if(!p.pending)return;
    const q=p.pending;p.pending=null;
    if(q.expires<ts){send(conn,{type:'answerResult',correct:false,explanation:'Masa tamat. Cuba semula di gerbang.'});return}
    const src=QUESTIONS.find(s=>s.id===q.id);
    const correct=data.choice===q.correct;
    if(correct){
      p.stars+=25;p.hp=Math.min(p.max,p.hp+45);gainXp(p,75);
      if(!r.seals[q.portal] && r.progress[q.portal]===q.stage){
        r.progress[q.portal]++;
        if(r.progress[q.portal]>=3){
          r.seals[q.portal]=true;
          event(r,`📚 ${p.name} berjaya membuka ${PORTALS[q.portal].name}! (${r.seals.filter(Boolean).length}/3 gerbang)`);
          if(r.seals.every(Boolean))event(r,'🏰 Semua 9 cabaran ilmu selesai! Serang Raja Kabus di istana utara!');
        }else{
          event(r,`✨ ${p.name} menjawab subjek ${src.subject}! ${PORTALS[q.portal].name} (${r.progress[q.portal]}/3).`);
        }
      }
    } else {p.stars+=2}
    send(conn,{type:'answerResult',correct,correctChoice:q.correct,explanation:src.explanation,reward:correct?'+75 XP, +25 ⭐, +45 HP':'Teruskan belajar! +2 ⭐'});
  }else if(t==='ping'){send(conn,{type:'pong',at:data.at||0})}
}
function roomStage(room,index){return Math.min(room.progress[index],2)}
function gainXp(p,xp){
  p.xp+=xp;const need=()=>100+p.level*65;
  while(p.xp>=need()) {p.xp-=need();p.level++;p.max+=20;p.hp=Math.min(p.max,p.hp+45);send(p.conn,{type:'event',text:`🌟 LEVEL ${p.level}! Kuasa hero meningkat.`})}
}
function damage(room,attacker,target,amount){
  if(target.id==='boss'){
    if(!room.seals.every(Boolean)){send(attacker.conn,{type:'event',text:'🛡️ Bos kebal! Buka ketiga-tiga Gerbang Ilmu dahulu.'});return}
    room.boss.hp=Math.max(0,room.boss.hp-amount);
    broadcast(room,{type:'effect',x:room.boss.x,z:room.boss.z,kind:'hit',value:Math.round(amount)});
    if(room.boss.hp===0){room.finished=true;event(room,'🏆 Raja Kabus telah ditewaskan! Seluruh pasukan MENANG!');broadcast(room,{type:'victory',players:playerList(room).map(p=>({name:p.name,stars:p.stars,kills:p.kills,level:p.level}))})}
    return;
  }
  const mob=room.mobs.find(m=>m.id===target.id);if(!mob)return;
  mob.hp-=amount;
  broadcast(room,{type:'effect',x:mob.x,z:mob.z,kind:'hit',value:Math.round(amount)});
  if(mob.hp<=0){room.mobs=room.mobs.filter(m=>m.id!==mob.id);attacker.kills++;attacker.stars+=5;gainXp(attacker,22)}
}
function useSkill(room,p){
  const hero=HEROES[p.hero],t=hero.type,targets=[...room.mobs];
  if(room.seals.every(Boolean)&&room.boss.hp>0)targets.push({...room.boss,id:'boss'});
  const nearby=(r)=>targets.filter(m=>distance(p,m)<r).sort((a,b)=>distance(p,a)-distance(p,b));
  const hit=(mob,dmg)=>damage(room,p,mob,dmg);
  let n=0,kind=t;
  switch(t){
    case 'chain': nearby(8).slice(0,4).forEach(m=>{hit(m,60);n++});p.hp=Math.min(p.max,p.hp+30);break;
    case 'dash': p.x=clamp(p.x+(p.dx||0)*4,-26,26);p.z=clamp(p.z+(p.dz||-1)*4,-25,19);nearby(4).forEach(m=>{hit(m,75);n++});break;
    case 'slam':nearby(5).forEach(m=>{hit(m,72);n++});break;
    case 'shield':p.hp=Math.min(p.max,p.hp+68);p.shield=Math.min(100,p.shield+90);for(const ally of room.players.values())if(distance(p,ally)<7)ally.hp=Math.min(ally.max,ally.hp+20);break;
    case 'spin': nearby(5.5).forEach(m=>{hit(m,69);n++});break;
    case 'heal':for(const ally of room.players.values())if(distance(p,ally)<10)ally.hp=Math.min(ally.max,ally.hp+90);nearby(4.5).forEach(m=>{hit(m,25);n++});break;
    case 'freeze':nearby(8).forEach(m=>{hit(m,45);if(m.id!=='boss'){const actual=room.mobs.find(a=>a.id===m.id);if(actual)actual.slow=5}n++});break;
    case 'arrows':nearby(11).slice(0,3).forEach(m=>{hit(m,85);n++});break;
    case 'crusher':nearby(5).forEach(m=>{hit(m,110);n++});break;
    case 'meteor':nearby(9).slice(0,5).forEach(m=>{hit(m,80);n++});break;
  }
  broadcast(room,{type:'skillEffect',x:p.x,z:p.z,kind,hero:p.hero});
  send(p.conn,{type:'event',text:`✨ ${hero.skill}! ${n?'Sasaran '+n+' terkena.':'Kuasa khas diaktifkan.'}`});
}
function tick(){
  const dt=TICK_MS/1000,ts=now();
  for(const room of rooms.values()){
    if(!room.players.size)continue;
    room.elapsed+=dt;
    if(!room.finished){
      if(room.elapsed>room.spawnAt){room.spawnAt=room.elapsed+2.4+rnd(0,2);spawnMob(room)}
      for(const p of room.players.values()){
        if(p.hp<=0){if(p.respawnAt && ts>p.respawnAt){p.hp=Math.round(p.max*.75);p.shield=0;p.x=rnd(-4,4);p.z=15;p.respawnAt=0;send(p.conn,{type:'event',text:'💚 Anda muncul semula. Teruskan misi!'})}continue}
        const speed=(3.2+HEROES[p.hero].agi*.22)*dt;
        if(!p.pending){p.x=clamp(p.x+p.dx*speed,-26,26);p.z=clamp(p.z+p.dz*speed,-25,20)}
        if(p.dx||p.dz)p.angle=Math.atan2(p.dx,-p.dz);
      }
      for(const mob of room.mobs){
        mob.cd-=dt;mob.slow=Math.max(0,mob.slow-dt);
        const candidates=playerList(room).filter(p=>p.hp>0);
        if(!candidates.length)continue;
        const p=candidates.reduce((a,b)=>distance(a,mob)<distance(b,mob)?a:b);
        const d=distance(mob,p);
        if(d>1.8 && d<25){const speed=(mob.slow>0?0.32:1.45)*dt;mob.x+=(p.x-mob.x)/d*speed;mob.z+=(p.z-mob.z)/d*speed}
        if(d<2.15 && mob.cd<=0){mob.cd=1.9;hurt(p,11);broadcast(room,{type:'effect',x:p.x,z:p.z,kind:'hurt',value:11})}
      }
      if(room.seals.every(Boolean)&&room.boss.hp>0){
        room.boss.cd-=dt;
        const close=playerList(room).filter(p=>p.hp>0&&distance(p,room.boss)<6.5);
        if(close.length && room.boss.cd<=0){room.boss.cd=3.4;for(const p of close)hurt(p,23);broadcast(room,{type:'skillEffect',x:room.boss.x,z:room.boss.z,kind:'boss'})}
      }
    }
    const snapshot={type:'state',code:room.code,elapsed:Math.round(room.elapsed),seals:room.seals,progress:room.progress,finished:room.finished,
      boss:{...room.boss,shield:!room.seals.every(Boolean)},
      mobs:room.mobs.map(m=>({id:m.id,x:+m.x.toFixed(2),z:+m.z.toFixed(2),hp:Math.max(0,Math.ceil(m.hp)),max:m.max,slow:m.slow>0})),
      players:playerList(room).map(p=>({id:p.id,name:p.name,hero:p.hero,x:+p.x.toFixed(2),z:+p.z.toFixed(2),angle:+p.angle.toFixed(2),hp:Math.ceil(p.hp),max:p.max,shield:p.shield,stars:p.stars,level:p.level,xp:p.xp,kills:p.kills,skillReady:Math.max(0,Math.ceil((p.lastSkill+9000-ts)/1000))}))};
    broadcast(room,snapshot);
  }
}
function hurt(p,amt){
  if(p.hp<=0||p.pending)return; // Kuiz ialah zon selamat: hero dilindungi semasa berfikir.
  const used=Math.min(p.shield,amt);p.shield-=used;p.hp=Math.max(0,p.hp-(amt-used));
  if(p.hp===0){p.respawnAt=now()+4300;p.dx=p.dz=0;send(p.conn,{type:'event',text:'💫 Hero berehat sebentar dan akan muncul semula.'})}
}
const contentType={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url||'/',`http://localhost`);
  if(url.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({ok:true,rooms:rooms.size,players:[...rooms.values()].reduce((n,r)=>n+r.players.size,0)}));return}
  if(url.pathname==='/api/heroes'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(HEROES));return}
  const raw=url.pathname==='/'?'/index.html':url.pathname;
  let file;
  try{file=path.resolve(ROOT,'.'+decodeURIComponent(raw))}catch{res.writeHead(400).end();return}
  if(!file.startsWith(ROOT+path.sep)){res.writeHead(403).end();return}
  fs.readFile(file,(err,body)=>{
    if(err){res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');return}
    res.writeHead(200,{'Content-Type':contentType[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(body);
  });
});
server.on('upgrade',(req,sock,head)=>{
  if(req.url!=='/ws'||req.headers.upgrade?.toLowerCase()!=='websocket'||req.headers['sec-websocket-version']!=='13') {sock.destroy();return}
  const key=req.headers['sec-websocket-key'];
  if(typeof key!=='string'||Buffer.from(key,'base64').length!==16){sock.destroy();return}
  const accept=crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
  const conn={sock,buf:Buffer.alloc(0),closed:false,player:null,room:null,count:0,lastSec:0};
  const cleanup=()=>{if(conn.closed)return;conn.closed=true;removePlayer(conn)};
  sock.on('data',chunk=>{
    if(conn.closed)return;
    conn.buf=Buffer.concat([conn.buf,chunk]);if(conn.buf.length>131072){sock.destroy();return}
    while(conn.buf.length>=2){
      const first=conn.buf[0],second=conn.buf[1],opcode=first&15;
      if((first&0x80)===0 || !(second&0x80)){sock.destroy();return} // no fragmented/unmasked client frames
      let len=second&127,offset=2;
      if(len===126){if(conn.buf.length<4)return;len=conn.buf.readUInt16BE(2);offset=4}
      else if(len===127){sock.destroy();return}
      if(len>8192){sock.destroy();return}
      if(conn.buf.length<offset+4+len)return;
      const mask=conn.buf.subarray(offset,offset+4),data=Buffer.from(conn.buf.subarray(offset+4,offset+4+len));
      conn.buf=conn.buf.subarray(offset+4+len);
      for(let i=0;i<data.length;i++)data[i]^=mask[i%4];
      if(opcode===8){cleanup();sock.end();return}
      if(opcode===9){rawFrame(sock,10,data);continue}
      if(opcode!==1)continue;
      const sec=Math.floor(now()/1000);if(conn.lastSec!==sec){conn.lastSec=sec;conn.count=0}
      if(++conn.count>65)continue;
      try{handle(conn,JSON.parse(data.toString('utf8')))}catch(err){/* bad client message intentionally ignored */}
    }
  });
  if(head?.length)sock.emit('data',head);
  sock.on('error',cleanup);sock.on('close',cleanup);sock.on('end',cleanup);
});
setInterval(tick,TICK_MS).unref();
const PORT=Number(process.env.PORT)||3000;
server.listen(PORT,'0.0.0.0',()=>console.log(`🎮 ALAM HIKMAH 3D berjalan: http://localhost:${PORT}`));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
