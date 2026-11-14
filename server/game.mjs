import {caseForRoom} from './case-loader.mjs';
import { randomBytes, randomUUID } from 'node:crypto';
import {interviewOpening} from '../public/case-presentation.js';
import {inferTopic} from '../public/question-topics.js';
import {resolveCanonical,deductionView} from './deductions.mjs';
export const CONFIG = Object.freeze({minPlayers:3,maxPlayers:4,rounds:4,maxQuestions:3,hoursPerRound:6,roomLifetimeHours:6});
// Story clock: turn n starts clockStart + (n-1) × hoursPerRound; the crime is 24h after clockStart. STORY_CLOCK is the default start's times.
const DEFAULT_CLOCK_START='20:00';
export function storyTime(clockStart,round){const [h,m]=clockStart.split(':').map(Number);return `${String((h+(round-1)*CONFIG.hoursPerRound)%24).padStart(2,'0')}:${String(m).padStart(2,'0')}`;}
export const STORY_CLOCK=Object.freeze([1,2,3,4].map(round=>storyTime(DEFAULT_CLOCK_START,round)));
export const RECOVERY_DELAY_MS=120_000;
const TTL=CONFIG.roomLifetimeHours*60*60*1000;
const ASK_FIELDS=new Set(['id','type','question','round']);
export class DomainError extends Error { constructor(message,status=400){super(message);this.status=status;} }
function fail(message,status=400){throw new DomainError(message,status);}
function text(value,label,max){if(typeof value!=='string'||!value.trim()||value.trim().length>max)fail(`${label}: enter between 1 and ${max} characters.`);return value.trim();}
function requestId(value){if(typeof value!=='string'||!/^[\w-]{16,100}$/.test(value))fail('Invalid request identifier.');return value;}
const publicSuspect=({id,name,role,initials,color,profile})=>({id,name,role,initials,color,profile});
export class GameService {
  constructor({caseData,catalog,registry,now=Date.now,deferAnswers=false}={}){this.deferAnswers=deferAnswers;if(!caseData||!catalog)throw new Error("Case data is required");this.caseData=caseData;this.catalog=catalog;this.registry=registry;this.rooms=new Map();this.entries=new Map();this.now=now;}
  cases(){return this.catalog;}
  roomCase(room){const data=caseForRoom(this,room);if(!data)fail('Case version unavailable.',503);return data;}
  prune(){for(const [code,room] of this.rooms)if(this.now()-room.touchedAt>TTL)this.rooms.delete(code);for(const [id,entry] of this.entries)if(!this.rooms.has(entry.code))this.entries.delete(id);}
  room(code){this.prune();if(typeof code!=='string')fail('Invalid room code.');const room=this.rooms.get(code.toUpperCase());if(!room)fail('Room not found or expired.',404);return room;}
  player(room,token){const player=room.players.find(p=>p.token===token);if(!player)fail('Your session is not valid for this room.',401);return player;}
  entry(key,fingerprint,create){requestId(key);this.prune();const prior=this.entries.get(key);if(prior){if(prior.fingerprint!==fingerprint)fail('Request identifier reused with different data.',409);return this.entryView(prior);}if(this.entries.size>=1200)fail('Server busy. Please try again later.',503);const value=create();this.entries.set(key,{...value,fingerprint});return this.entryView(value);}
  entryView(value){const room=this.room(value.code),p=this.player(room,value.token);this.initializeActivity(room);p.lastSeenAt=this.now();room.touchedAt=this.now();return {code:room.code,token:p.token,playerId:p.id,state:this.snapshot(room,p)};}
  create(name,caseId,key){name=text(name,'Name',24);const selected=this.registry?.current.get(caseId)??(caseId===this.caseData.id?this.caseData:null);if(!selected||!this.catalog.some(c=>c.id===caseId&&c.available))fail('This case is not available yet.');return this.entry(key,JSON.stringify(['create',name,caseId]),()=>{if(this.rooms.size>=200)fail('Server busy. Please try again later.',503);let code;do{code=Array.from(randomBytes(8),b=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b%32]).join('');}while(this.rooms.has(code));const player=this.newPlayer(name);const room={code,caseId,caseVersion:selected.version,hostId:player.id,players:[player],phase:'lobby',round:0,createdAt:this.now(),touchedAt:this.now(),version:1};this.rooms.set(code,room);return {code,token:player.token};});}
  join(code,name,key){name=text(name,'Name',24);code=text(code,'Code',8).toUpperCase();return this.entry(key,JSON.stringify(['join',code,name]),()=>{const room=this.room(code);if(room.phase!=='lobby')fail('This game has already started. Reconnect using your original tab.');if(room.players.length>=CONFIG.maxPlayers)fail('Room full: maximum of 4 agents.');if(room.players.some(p=>p.name.toLocaleLowerCase()===name.toLocaleLowerCase()))fail('That name is already in use in this room.');const p=this.newPlayer(name);this.initializeActivity(room);room.players.push(p);room.version++;room.touchedAt=this.now();return {code,token:p.token};});}
  newPlayer(name){return {id:randomUUID(),name,token:randomBytes(32).toString('hex'),lastSeenAt:this.now(),interviews:[],deductions:[],vote:null,requests:new Map()};}
  view(code,token){const room=this.room(code),p=this.player(room,token);return this.snapshot(room,p);}
  initializeActivity(room){for(const p of room.players)if(!Number.isFinite(p.lastSeenAt))p.lastSeenAt=room.touchedAt;if(room.phase==='accusation'&&!Number.isFinite(room.accusationStartedAt))room.accusationStartedAt=room.touchedAt;}
  lastSeen(room,player){return Number.isFinite(player.lastSeenAt)?player.lastSeenAt:room.touchedAt;}
  hostRecoverable(room){const host=room.players.find(p=>p.id===room.hostId);return room.phase!=='reveal'&&!!host&&this.now()-this.lastSeen(room,host)>=RECOVERY_DELAY_MS;}
  canFinalizeAccusations(room,player){
    if(room.phase!=='accusation'||room.hostId!==player.id||!player.vote)return false;
    const missing=room.players.filter(p=>!p.vote),started=Number.isFinite(room.accusationStartedAt)?room.accusationStartedAt:room.touchedAt;
    return missing.length>0&&missing.every(p=>this.now()-Math.max(this.lastSeen(room,p),started)>=RECOVERY_DELAY_MS);
  }
  snapshot(room,me){const caseData=this.roomCase(room);const current=p=>p.interviews.find(i=>i.round===room.round);return {code:room.code,version:room.version,phase:room.phase,round:room.round,hostRecoverable:this.hostRecoverable(room),canFinalizeAccusations:this.canFinalizeAccusations(room,me),clock:{turn:room.round,time:room.round>=1&&room.round<=CONFIG.rounds?storyTime(caseData.clockStart??DEFAULT_CLOCK_START,room.round):null,hoursLeft:room.phase==='investigation'?24-(room.round-1)*CONFIG.hoursPerRound:0,crimeAt:caseData.clockStart??DEFAULT_CLOCK_START},config:CONFIG,case:{id:caseData.id,title:caseData.title,victim:caseData.victim,place:caseData.place,method:caseData.method,prediction:caseData.prediction},suspects:caseData.suspects.map(publicSuspect),players:room.players.map(p=>({id:p.id,name:p.name,host:p.id===room.hostId,ready:!!current(p)?.closed,selectedSuspectId:current(p)?.suspectId??null,voteSubmitted:!!p.vote})),me:{id:me.id,name:me.name,host:me.id===room.hostId,interviews:me.interviews.map(i=>({round:i.round,suspectId:i.suspectId,opening:i.opening,closed:i.closed,messages:i.messages.map(m=>({id:m.id,question:m.question,status:m.status,reply:m.status==='pending'?null:m.reply,unlocked:[...m.unlocked]}))})),deductions:deductionView(caseData,me),vote:me.vote},deductionTotal:(caseData.deductions??[]).length,...(room.phase==='reveal'?{result:this.result(room)}:{})};}
  result(room){const caseData=this.roomCase(room);const correct=room.players.filter(p=>p.vote===caseData.culpritId).length;return {outcome:correct===room.players.length?'complete':correct>0?'partial':'defeat',correct,total:room.players.length,abstentions:room.players.filter(p=>!p.vote).length,innocentArrests:new Set(room.players.filter(p=>p.vote&&p.vote!==caseData.culpritId).map(p=>p.vote)).size,culpritId:caseData.culpritId,solution:structuredClone(caseData.solution),votes:room.players.map(p=>({playerId:p.id,suspectId:p.vote,correct:p.vote===caseData.culpritId}))};}
  act(code,token,action){if(!action||typeof action!=='object'||Array.isArray(action))fail('Invalid action.');requestId(action.id);const room=this.room(code),caseData=this.roomCase(room),player=this.player(room,token),fingerprint=JSON.stringify(action);const prior=player.requests.get(action.id);if(prior){if(prior!==fingerprint)fail('Request identifier reused with different data.',409);return this.snapshot(room,player);}const host=()=>{if(player.id!==room.hostId)fail('Only the host can do this.',403);};const phase=want=>{if(room.phase!==want)fail('Action unavailable in this phase.');};const round=()=>{phase('investigation');if(action.round!==room.round)fail('The round has changed. Refresh the room.',409);};const interview=()=>{round();const i=player.interviews.find(i=>i.round===room.round);if(!i)fail('Choose a suspect first.');if(i.closed)fail('Interview already closed.');return i;};const suspect=id=>{const s=caseData.suspects.find(s=>s.id===id);if(!s)fail('Invalid suspect.');return s;};
    switch(action.type){
      case 'heartbeat':if(room.phase==='reveal')fail('This game has finished.');break;
      case 'claimHost':
        if(action.confirmed!==true)fail('Confirm that you want to become the host.');
        if(player.id===room.hostId||!this.hostRecoverable(room))fail('The host is still active or this game has finished.',409);
        room.hostId=player.id;break;
      case 'finalizeAccusations':
        host();phase('accusation');
        if(action.confirmed!==true)fail('Confirm that absent players will have no accusation recorded.');
        if(!this.canFinalizeAccusations(room,player))fail('Submit your accusation first and wait until every missing voter has been inactive for 120 seconds in this phase.',409);
        room.phase='reveal';break;
      case 'start':host();phase('lobby');if(room.players.length<CONFIG.minPlayers)fail('At least 3 players are required.');room.phase='investigation';room.round=1;break;
      case 'select':round();suspect(action.suspectId);if(player.interviews.some(i=>i.round===room.round))fail('You have already chosen a person for this round.');player.interviews.push({round:room.round,suspectId:action.suspectId,opening:interviewOpening(caseData,suspect(action.suspectId)),messages:[],closed:false});break;
      case 'ask':{
        if(Object.keys(action).some(key=>!ASK_FIELDS.has(key)))fail('Unexpected question field.');
        const i=interview();
        if(i.messages.at(-1)?.status==='pending')fail('Wait for the answer before asking again.',409);
        const question=text(action.question,'Question',300),topic=inferTopic(question);
        const message={id:randomUUID(),question,topic,answer:suspect(i.suspectId).responses[topic],status:'pending',reply:null,unlocked:[]};
        i.messages.push(message);
        if(!this.deferAnswers)resolveCanonical(caseData,player,i,message);
        if(i.messages.length>=CONFIG.maxQuestions)i.closed=true;
        if(room.players.every(p=>p.interviews.find(x=>x.round===room.round)?.closed))this.nextRound(room);
        break;}
      case 'advance':host();round();if(action.confirmed!==true)fail('Confirm that unfinished interviews will be lost.');for(const p of room.players){const i=p.interviews.find(i=>i.round===room.round);if(i)i.closed=true;}this.nextRound(room);break;
      case 'vote':phase('accusation');suspect(action.suspectId);if(player.vote)fail('Your accusation has already been recorded.');player.vote=action.suspectId;if(room.players.every(p=>p.vote))room.phase='reveal';break;
      default:fail('Unknown action.');
    }
    this.initializeActivity(room);player.lastSeenAt=this.now();room.version++;
    // Heartbeats prove presence without growing the per-player command map or extending room life.
    if(action.type!=='heartbeat'){player.requests.set(action.id,fingerprint);room.touchedAt=this.now();}
    return this.snapshot(room,player);
  }
  nextRound(room){if(room.round===CONFIG.rounds){room.phase='accusation';room.accusationStartedAt=this.now();}else room.round++;}
}
