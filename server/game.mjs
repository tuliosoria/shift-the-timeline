import { randomBytes, randomUUID } from 'node:crypto';
import {inferTopic} from '../public/question-topics.js';
export const CONFIG = Object.freeze({minPlayers:3,maxPlayers:4,rounds:3,maxQuestions:4,roomLifetimeHours:6});
export const RECOVERY_DELAY_MS=120_000;
const TTL=CONFIG.roomLifetimeHours*60*60*1000;
const TOPICS=['alibi','motive','clue','relationship'];
export class DomainError extends Error { constructor(message,status=400){super(message);this.status=status;} }
function fail(message,status=400){throw new DomainError(message,status);}
function text(value,label,max){if(typeof value!=='string'||!value.trim()||value.trim().length>max)fail(`${label}: enter between 1 and ${max} characters.`);return value.trim();}
function requestId(value){if(typeof value!=='string'||!/^[\w-]{16,100}$/.test(value))fail('Invalid request identifier.');return value;}
const CORRELATION_FIELDS=new Set(['id','type','round','expectedPhase','sources','relation','text','expectedVersion']);
function correlate(room,player,action,caseData){
  if(Object.keys(action).some(key=>!CORRELATION_FIELDS.has(key)))fail('Unexpected correlation field.');
  if(!Number.isInteger(action.round)||!['investigation','accusation'].includes(action.expectedPhase))fail('Invalid correlation context.');
  if(!['investigation','accusation'].includes(room.phase))fail('Correlations are unavailable in this phase.');
  if(action.round!==room.round||action.expectedPhase!==room.phase)fail('The round or phase has changed. Review your hypothesis before sharing.',409);
  if(!['related','supports','contradicts'].includes(action.relation))fail('Invalid correlation relation.');
  if(!Array.isArray(action.sources)||action.sources.length!==2)fail('Choose exactly two public sources.');
  const sources=action.sources.map(value=>{
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==2||!Object.hasOwn(value,'kind')||!Object.hasOwn(value,'id')||typeof value.id!=='string')fail('Invalid public source.');
    const valid=value.kind==='case'?['victim','place','method','prediction'].includes(value.id)
      :value.kind==='suspect'?caseData.suspects.some(s=>s.id===value.id)
      :value.kind==='clue'?room.board.some(entry=>entry.type==='clue'&&entry.id===value.id):false;
    if(!valid)fail('Public source not found in this room.');
    return {kind:value.kind,id:value.id};
  });
  if(sources[0].kind===sources[1].kind&&sources[0].id===sources[1].id)fail('Choose two different public sources.');
  const hypothesis=text(action.text,'Hypothesis',300);
  if(room.board.length>=60)fail('Board full: limit of 60 records.');
  room.board.push({id:randomUUID(),type:'correlation',sources,relation:action.relation,text:hypothesis,by:player.name,round:room.round});
}
const publicSuspect=({id,name,role,initials,color,profile})=>({id,name,role,initials,color,profile});
export class GameService {
  constructor({caseData,catalog,now=Date.now}={}){if(!caseData||!catalog)throw new Error("Case data is required");this.caseData=caseData;this.catalog=catalog;this.rooms=new Map();this.entries=new Map();this.now=now;}
  cases(){return this.catalog;}
  prune(){for(const [code,room] of this.rooms)if(this.now()-room.touchedAt>TTL)this.rooms.delete(code);for(const [id,entry] of this.entries)if(!this.rooms.has(entry.code))this.entries.delete(id);}
  room(code){this.prune();if(typeof code!=='string')fail('Invalid room code.');const room=this.rooms.get(code.toUpperCase());if(!room)fail('Room not found or expired.',404);return room;}
  player(room,token){const player=room.players.find(p=>p.token===token);if(!player)fail('Your session is not valid for this room.',401);return player;}
  entry(key,fingerprint,create){requestId(key);this.prune();const prior=this.entries.get(key);if(prior){if(prior.fingerprint!==fingerprint)fail('Request identifier reused with different data.',409);return this.entryView(prior);}if(this.entries.size>=1200)fail('Server busy. Please try again later.',503);const value=create();this.entries.set(key,{...value,fingerprint});return this.entryView(value);}
  entryView(value){const room=this.room(value.code),p=this.player(room,value.token);this.initializeActivity(room);p.lastSeenAt=this.now();room.touchedAt=this.now();return {code:room.code,token:p.token,playerId:p.id,state:this.snapshot(room,p)};}
  create(name,caseId,key){name=text(name,'Name',24);if(caseId!==this.caseData.id)fail('This case is not available yet.');return this.entry(key,JSON.stringify(['create',name,caseId]),()=>{if(this.rooms.size>=200)fail('Server busy. Please try again later.',503);let code;do{code=Array.from(randomBytes(8),b=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b%32]).join('');}while(this.rooms.has(code));const player=this.newPlayer(name);const room={code,caseId,hostId:player.id,players:[player],phase:'lobby',round:0,board:[],createdAt:this.now(),touchedAt:this.now(),version:1};this.rooms.set(code,room);return {code,token:player.token};});}
  join(code,name,key){name=text(name,'Name',24);code=text(code,'Code',8).toUpperCase();return this.entry(key,JSON.stringify(['join',code,name]),()=>{const room=this.room(code);if(room.phase!=='lobby')fail('This game has already started. Reconnect using your original tab.');if(room.players.length>=CONFIG.maxPlayers)fail('Room full: maximum of 4 agents.');if(room.players.some(p=>p.name.toLocaleLowerCase()===name.toLocaleLowerCase()))fail('That name is already in use in this room.');const p=this.newPlayer(name);this.initializeActivity(room);room.players.push(p);room.version++;room.touchedAt=this.now();return {code,token:p.token};});}
  newPlayer(name){return {id:randomUUID(),name,token:randomBytes(32).toString('hex'),lastSeenAt:this.now(),interviews:[],vote:null,requests:new Map()};}
  view(code,token){const room=this.room(code),p=this.player(room,token);return this.snapshot(room,p);}
  initializeActivity(room){for(const p of room.players)if(!Number.isFinite(p.lastSeenAt))p.lastSeenAt=room.touchedAt;if(room.phase==='accusation'&&!Number.isFinite(room.accusationStartedAt))room.accusationStartedAt=room.touchedAt;}
  lastSeen(room,player){return Number.isFinite(player.lastSeenAt)?player.lastSeenAt:room.touchedAt;}
  hostRecoverable(room){const host=room.players.find(p=>p.id===room.hostId);return room.phase!=='reveal'&&!!host&&this.now()-this.lastSeen(room,host)>=RECOVERY_DELAY_MS;}
  canFinalizeAccusations(room,player){
    if(room.phase!=='accusation'||room.hostId!==player.id||!player.vote)return false;
    const missing=room.players.filter(p=>!p.vote),started=Number.isFinite(room.accusationStartedAt)?room.accusationStartedAt:room.touchedAt;
    return missing.length>0&&missing.every(p=>this.now()-Math.max(this.lastSeen(room,p),started)>=RECOVERY_DELAY_MS);
  }
  snapshot(room,me){const current=p=>p.interviews.find(i=>i.round===room.round);return {code:room.code,version:room.version,phase:room.phase,round:room.round,hostRecoverable:this.hostRecoverable(room),canFinalizeAccusations:this.canFinalizeAccusations(room,me),remainingHours:room.phase==='lobby'?24:room.phase==='investigation'?24-(room.round-1)*8:0,config:CONFIG,case:{id:this.caseData.id,title:this.caseData.title,victim:this.caseData.victim,place:this.caseData.place,method:this.caseData.method,prediction:this.caseData.prediction},suspects:this.caseData.suspects.map(publicSuspect),players:room.players.map(p=>({id:p.id,name:p.name,host:p.id===room.hostId,ready:!!current(p)?.closed,selectedSuspectId:current(p)?.suspectId??null,voteSubmitted:!!p.vote})),me:{id:me.id,name:me.name,host:me.id===room.hostId,interviews:structuredClone(me.interviews),vote:me.vote},board:structuredClone(room.board),...(room.phase==='reveal'?{result:this.result(room)}:{})};}
  result(room){const correct=room.players.filter(p=>p.vote===this.caseData.culpritId).length;return {outcome:correct===room.players.length?'complete':correct>0?'partial':'defeat',correct,total:room.players.length,abstentions:room.players.filter(p=>!p.vote).length,innocentArrests:new Set(room.players.filter(p=>p.vote&&p.vote!==this.caseData.culpritId).map(p=>p.vote)).size,culpritId:this.caseData.culpritId,solution:structuredClone(this.caseData.solution),votes:room.players.map(p=>({playerId:p.id,suspectId:p.vote,correct:p.vote===this.caseData.culpritId}))};}
  act(code,token,action){if(!action||typeof action!=='object'||Array.isArray(action))fail('Invalid action.');requestId(action.id);const room=this.room(code),player=this.player(room,token),fingerprint=JSON.stringify(action);const prior=player.requests.get(action.id);if(prior){if(prior!==fingerprint)fail('Request identifier reused with different data.',409);return this.snapshot(room,player);}const host=()=>{if(player.id!==room.hostId)fail('Only the host can do this.',403);};const phase=want=>{if(room.phase!==want)fail('Action unavailable in this phase.');};const round=()=>{phase('investigation');if(action.round!==room.round)fail('The round has changed. Refresh the room.',409);};const interview=()=>{round();const i=player.interviews.find(i=>i.round===room.round);if(!i)fail('Choose a suspect first.');if(i.closed)fail('Interview already closed.');return i;};const suspect=id=>{const s=this.caseData.suspects.find(s=>s.id===id);if(!s)fail('Invalid suspect.');return s;};
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
      case 'select':round();suspect(action.suspectId);if(player.interviews.some(i=>i.round===room.round))fail('You have already chosen a person for this round.');player.interviews.push({round:room.round,suspectId:action.suspectId,opening:suspect(action.suspectId).opening,messages:[],closed:false});break;
      case 'ask':{const i=interview();if(i.messages.length>=CONFIG.maxQuestions)fail('Limit of 4 questions for this interview.');const question=text(action.question,'Question',300);if(action.topic!==undefined&&!TOPICS.includes(action.topic))fail('Invalid question topic.');const topic=action.topic??inferTopic(question);if(i.messages.some(m=>m.topic===topic))fail('This topic is already covered. Review the earlier answer; no question used.',409);i.messages.push({id:randomUUID(),question,topic,answer:suspect(i.suspectId).responses[topic]});break;}
      case 'end':interview().closed=true;if(room.players.every(p=>p.interviews.find(i=>i.round===room.round)?.closed))this.nextRound(room);break;
      case 'advance':host();round();if(action.confirmed!==true)fail('Confirm that unfinished interviews will be lost.');for(const p of room.players){const i=p.interviews.find(i=>i.round===room.round);if(i)i.closed=true;}this.nextRound(room);break;
      case 'share':{if(!['investigation','accusation'].includes(room.phase))fail('Sharing is unavailable in this phase.');let found;for(const i of player.interviews){const message=i.messages.find(m=>m.id===action.messageId);if(message){found={i,message};break;}}if(!found)fail('Answer not found in your interviews.');if(room.board.some(n=>n.messageId===action.messageId))break;if(room.board.length>=60)fail('Board full: limit of 60 records.');room.board.push({id:randomUUID(),type:'clue',messageId:found.message.id,text:found.message.answer,source:suspect(found.i.suspectId).name,by:player.name,round:found.i.round});break;}
      case 'note':if(!['investigation','accusation'].includes(room.phase))fail('Notes are unavailable in this phase.');if(action.round!==undefined||action.expectedPhase!==undefined){if(!Number.isInteger(action.round)||!['investigation','accusation'].includes(action.expectedPhase))fail('Invalid note context.');if(action.round!==room.round||action.expectedPhase!==room.phase)fail('The round or phase changed. Review your note.',409);}if(room.board.length>=60)fail('Board full: limit of 60 records.');room.board.push({id:randomUUID(),type:'note',text:text(action.text,'Note',500),by:player.name,round:room.round});break;
      case 'correlate':correlate(room,player,action,this.caseData);break;
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
