'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {setTimeout:wait}=require('node:timers/promises');
const PORT=36413, ROOT='http://127.0.0.1:'+PORT, URL='ws://127.0.0.1:'+PORT+'/ws';
let server;const sockets=[];
function open(){return new Promise((resolve,reject)=>{const ws=new WebSocket(URL);sockets.push(ws);ws.addEventListener('open',()=>resolve(ws),{once:true});ws.addEventListener('error',reject,{once:true})})}
function waitFor(ws,type,timeout=5000){return new Promise((resolve,reject)=>{
  let timer;
  const on=e=>{let d;try{d=JSON.parse(e.data)}catch{return}if(d.type===type){cleanup();resolve(d)}};
  const cleanup=()=>{clearTimeout(timer);ws.removeEventListener('message',on)};
  timer=setTimeout(()=>{cleanup();reject(Error('Timeout waiting for '+type))},timeout);
  ws.addEventListener('message',on);
})}
async function join(room='',hero=0){const ws=await open();const ready=waitFor(ws,room?'joined':'joined',3000);ws.send(JSON.stringify({type:'join',room,hero}));return {ws,msg:await ready}}
function send(ws,type,fields={}){ws.send(JSON.stringify({type,...fields}))}
async function boot(){server=spawn(process.execPath,['server.js'],{cwd:require('node:path').resolve(__dirname,'..'),env:{...process.env,PORT:String(PORT)},stdio:'ignore'});
  for(let i=0;i<60;i++){try{let r=await fetch(ROOT+'/health');if(r.ok)return}catch{}await wait(80)}throw Error('server did not boot')}
test('Alam Hikmah 3D websocket integration – room, 10 pemain, kuiz',async(t)=>{
 await boot();t.after(async()=>{for(const ws of sockets){try{ws.close()}catch{}}server.kill()});
 const r=await fetch(ROOT+'/health');assert.equal(r.status,200);
 const a=await join('',0);const room=a.msg.room;assert.equal(room.length,5);assert.equal(a.msg.heroes.length,10);
 const players=[a];for(let i=1;i<10;i++)players.push(await join(room,i));
 const p10=await open(),rejection=waitFor(p10,'error',3000);send(p10,'join',{room,hero:0});
 const err=await rejection;assert.match(err.text,/penuh/i);
 let state=await waitFor(a.ws,'state');assert.equal(state.players.length,10);
 assert.deepEqual(state.seals,[false,false,false]);assert.equal(state.boss.shield,true);
 const denied=await fetch(ROOT+'/data/questions.json');assert.equal(denied.status,404);
 const missing=await open(),miss=waitFor(missing,'error');send(missing,'join',{room:'XXXXX',hero:5});assert.match((await miss).text,/tidak dijumpai/);
 // New room with just one hero; walk to nearby Knowledge Portal (-0,4).
 const b=await join('',0);
 await wait(200);const last=await waitFor(b.ws,'state');let me=last.players.find(p=>p.id===b.msg.id);
 const dx=(0-me.x),dz=(4-me.z),norm=Math.hypot(dx,dz);
 send(b.ws,'move',{dx:dx/norm,dz:dz/norm});
 await wait(2250);
 send(b.ws,'move',{dx:0,dz:0});
 const question=waitFor(b.ws,'question',5000);send(b.ws,'interact');
 const q=await question;
 assert.equal(q.answers.length,4);
 assert.equal(Object.hasOwn(q,'correct'),false);
 const source=require('../data/questions.json').find(item=>item.id===q.id);
 assert.equal(source.question,q.question);
 const correctIndex=q.answers.indexOf(source.choices[source.correct]);assert.ok(correctIndex>=0);
 const result=waitFor(b.ws,'answerResult',3000);send(b.ws,'answer',{choice:correctIndex});
 assert.equal((await result).correct,true);
 // Snapshot reflects team seal after correct answer.
 await wait(200);let snap=await waitFor(b.ws,'state');assert.equal(snap.progress[2],1);assert.equal(snap.seals[2],false);
 // Each gate requires THREE distinct subject categories, not only one trivial quiz.
 const seen=[q.subject];
 for(let stage=1;stage<3;stage++){
   const waiting=waitFor(b.ws,'question',4000);send(b.ws,'interact');const next=await waiting;seen.push(next.subject);
   const src=require('../data/questions.json').find(x=>x.id===next.id);
   const correct=next.answers.indexOf(src.choices[src.correct]);
   const res=waitFor(b.ws,'answerResult',4000);send(b.ws,'answer',{choice:correct});assert.equal((await res).correct,true);
   await wait(110);
 }
 assert.deepEqual(seen,['Jawi','Feqah','Bahasa Arab']);
 let found=false;
 for(let n=0;n<8;n++){snap=await waitFor(b.ws,'state');if(snap.progress[2]===3){found=true;break}}
 assert.ok(found,'progress eventually shows 3 of 3');assert.equal(snap.seals[2],true);
 console.log('✔ 10 pemain, had 11, kuiz 3 subjek sah, ganjaran dan gerbang dikongsi');
},{timeout:30000});
