const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_, res) => res.json({ ok: true, game: 'The Last Alibi' }));

const rooms = new Map();
const MAX_PLAYERS = 8;
const MIN_PLAYERS = 5;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const names = ['The Collector', 'The Archivist', 'The Night Owl', 'The Fixer', 'The Heir', 'The Witness', 'The Insider', 'The Stranger'];
const clues = [
  { title: 'A Stained Glove', body: 'A black glove was found near the west staircase. The stain is fresh, but the glove is two sizes too large.', tag: 'PHYSICAL EVIDENCE' },
  { title: 'The Stopped Clock', body: 'The study clock stopped at 11:47 PM. Someone insists the blackout happened closer to midnight.', tag: 'TIMELINE' },
  { title: 'A Missing Key', body: 'The brass key to the archive is missing. Three guests had a reason to visit the east corridor tonight.', tag: 'ACCESS' },
  { title: 'The Torn Note', body: 'A torn note reads: “If the file leaves this house, we all lose everything.” The handwriting is impossible to identify.', tag: 'MOTIVE' },
  { title: 'A Smudged Footprint', body: 'A muddy footprint leads toward the conservatory, then abruptly stops at a dry patch of carpet.', tag: 'MOVEMENT' },
  { title: 'The Unsent Message', body: 'A phone notification preview says: “Don’t trust the person who keeps asking questions.” The sender is hidden.', tag: 'DIGITAL TRACE' },
  { title: 'The Empty Glass', body: 'One glass was wiped clean while the others were left untouched. Whoever held it was careful—or in a hurry.', tag: 'ODD DETAIL' }
];
const secrets = [
  'You heard footsteps near the archive just before the blackout. You did not see who it was.',
  'You owe the host a large favour, and you would do almost anything to keep it secret.',
  'You saw someone leave the east corridor, but you only remember their shoes.',
  'You were in the dining room during the blackout. At least, that is what you plan to say.',
  'You know the Obsidian File contains information that could ruin one guest.',
  'You found a tiny piece of black fabric near the study door. You kept it in your pocket.',
  'You received an anonymous message warning you not to trust the most confident player.',
  'You were the last person to speak to the host before the gathering began.'
];
function code() { let c; do { c = Array.from({length:5}, () => CODE_CHARS[Math.floor(Math.random()*CODE_CHARS.length)]).join(''); } while (rooms.has(c)); return c; }
function publicRoom(room) {
  return { code: room.code, hostId: room.hostId, phase: room.phase, players: room.players.map(p => ({ id:p.id, name:p.name, connected:p.connected, isHost:p.id===room.hostId, voted: !!room.votes[p.id] })), clues: room.revealedClues, chat: room.chat.slice(-80), round: room.round, votesCount: Object.keys(room.votes).length, minPlayers: MIN_PLAYERS, maxPlayers: MAX_PLAYERS, result: room.result };
}
function emitRoom(room) { io.to(room.code).emit('room:update', publicRoom(room)); }
function sendPrivate(player, room) { io.to(player.id).emit('game:private', { role: player.role, secret: player.secret, abilityUsed: player.abilityUsed, personalClue: player.personalClue, abilityResult: player.abilityResult, canInspect: player.role === 'detective' && !player.abilityUsed && room.phase === 'investigate' }); }
function addChat(room, player, message, kind='chat') {
  const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`, playerId: player?.id || 'system', name: player?.name || 'THE HOUSE', message: String(message).slice(0,240), kind, time: new Date().toISOString() };
  room.chat.push(item); if (room.chat.length > 160) room.chat.shift();
}
function playerById(room,id) { return room.players.find(p => p.id === id); }
function startGame(room) {
  if (room.players.length < MIN_PLAYERS) return false;
  room.phase = 'investigate'; room.round = 1; room.revealedClues = []; room.votes = {}; room.result = null;
  const shuffled = [...room.players].sort(() => Math.random() - 0.5);
  shuffled.forEach((p,i) => { p.role = i===0 ? 'thief' : (i===1 && room.players.length>=6 ? 'accomplice' : (i===(room.players.length>=6?2:1) ? 'detective' : 'guest')); p.secret = secrets[Math.floor(Math.random()*secrets.length)]; p.personalClue = clues[Math.floor(Math.random()*clues.length)]; p.abilityUsed = false; p.abilityResult = null; });
  // Ensure role allocation is unique and predictable for every supported player count.
  const roles = ['thief']; if (room.players.length >= 6) roles.push('accomplice'); roles.push('detective');
  const roleOrder = [...room.players].sort(() => Math.random() - 0.5);
  roleOrder.forEach((p,i) => { p.role = roles[i] || 'guest'; });
  addChat(room, null, 'The lights go out. The Obsidian File is gone. Find the thief before the final bell.', 'system');
  room.players.forEach(p => sendPrivate(p,room)); emitRoom(room); return true;
}
function finishGame(room) {
  const tally = {};
  Object.values(room.votes).forEach(id => { tally[id] = (tally[id]||0)+1; });
  const max = Math.max(0,...Object.values(tally));
  const leaders = Object.keys(tally).filter(id=>tally[id]===max);
  const thief = room.players.find(p=>p.role==='thief');
  const caught = leaders.length===1 && leaders[0]===thief?.id && max > room.players.length/2;
  room.phase = 'reveal';
  room.result = { caught, thiefId: thief?.id, thiefName: thief?.name, accompliceNames: room.players.filter(p=>p.role==='accomplice').map(p=>p.name), tally: room.players.map(p=>({id:p.id,name:p.name,votes:tally[p.id]||0,role:p.role})).sort((a,b)=>b.votes-a.votes), winners: caught ? 'The investigators exposed the thief!' : 'The thief escaped with the Obsidian File!', reveal: room.players.map(p=>({id:p.id,name:p.name,role:p.role,secret:p.secret})) };
  addChat(room,null,room.result.winners,'system'); emitRoom(room);
}

io.on('connection', socket => {
  socket.on('room:create', ({name}, cb=()=>{}) => {
    const playerName = String(name||'').trim().slice(0,20); if (!playerName) return cb({error:'Enter a nickname first.'});
    const roomCode = code(); const p = { id:socket.id, name:playerName, connected:true, role:null, secret:null, personalClue:null, abilityUsed:false, abilityResult:null };
    const room = { code:roomCode, hostId:socket.id, players:[p], phase:'lobby', revealedClues:[], chat:[], votes:{}, round:0, result:null };
    rooms.set(roomCode,room); socket.join(roomCode); addChat(room,null,`${playerName} opened the case file. Waiting for the rest of the suspects.`, 'system'); cb({ok:true,code:roomCode,id:socket.id,room:publicRoom(room)}); emitRoom(room);
  });
  socket.on('room:join', ({code:rawCode,name}, cb=()=>{}) => {
    const roomCode = String(rawCode||'').trim().toUpperCase(); const room = rooms.get(roomCode); const playerName = String(name||'').trim().slice(0,20);
    if (!playerName) return cb({error:'Enter a nickname first.'}); if (!room) return cb({error:'That room code does not exist.'}); if (room.phase!=='lobby') return cb({error:'This case has already started. Create a new room.'}); if (room.players.length>=MAX_PLAYERS) return cb({error:'This room is full (8 players max).'}); if (room.players.some(p=>p.name.toLowerCase()===playerName.toLowerCase())) return cb({error:'That nickname is already taken in this room.'});
    const p = { id:socket.id, name:playerName, connected:true, role:null, secret:null, personalClue:null, abilityUsed:false, abilityResult:null }; room.players.push(p); socket.join(roomCode); addChat(room,null,`${playerName} entered the mansion.`, 'system'); cb({ok:true,code:roomCode,id:socket.id,room:publicRoom(room)}); emitRoom(room);
  });
  socket.on('room:rejoin', ({code:rawCode,name}, cb=()=>{}) => { const room=rooms.get(String(rawCode||'').toUpperCase()); if(!room) return cb({error:'Room not found.'}); const p=room.players.find(x=>x.name.toLowerCase()===String(name||'').toLowerCase()); if(!p) return cb({error:'Nickname not found in this room.'}); const oldId=p.id; p.id=socket.id; p.connected=true; if(room.hostId===oldId) room.hostId=socket.id; if(room.votes[oldId]) { room.votes[socket.id]=room.votes[oldId]; delete room.votes[oldId]; } socket.join(room.code); sendPrivate(p,room); cb({ok:true,code:room.code,id:socket.id,room:publicRoom(room)}); emitRoom(room); });
  socket.on('game:start', (_, cb=()=>{}) => { const room=[...rooms.values()].find(r=>r.players.some(p=>p.id===socket.id)); if(!room) return cb({error:'Room not found.'}); if(room.hostId!==socket.id) return cb({error:'Only the host can start the case.'}); if(room.phase!=='lobby') return cb({error:'The case has already started.'}); if(!startGame(room)) return cb({error:`You need at least ${MIN_PLAYERS} players to begin.`}); cb({ok:true}); });
  socket.on('clue:reveal', (_, cb=()=>{}) => { const room=[...rooms.values()].find(r=>r.players.some(p=>p.id===socket.id)); if(!room) return cb({error:'Room not found.'}); if(room.hostId!==socket.id) return cb({error:'Only the host can reveal evidence.'}); if(room.phase!=='investigate') return cb({error:'Evidence can only be revealed during investigation.'}); if(room.revealedClues.length>=3) return cb({error:'All evidence has been revealed.'}); const pool=clues.filter(c=>!room.revealedClues.some(x=>x.title===c.title)); const clue=pool[Math.floor(Math.random()*pool.length)]; room.revealedClues.push({...clue, number:room.revealedClues.length+1}); addChat(room,null,`Evidence ${room.revealedClues.length} revealed: ${clue.title}.`, 'system'); room.players.forEach(p=>sendPrivate(p,room)); emitRoom(room); cb({ok:true}); });
  socket.on('game:openVote', (_, cb=()=>{}) => { const room=[...rooms.values()].find(r=>r.players.some(p=>p.id===socket.id)); if(!room) return cb({error:'Room not found.'}); if(room.hostId!==socket.id) return cb({error:'Only the host can call the final vote.'}); if(room.phase!=='investigate') return cb({error:'Voting is not available now.'}); if(room.revealedClues.length<1) return cb({error:'Reveal at least one clue before voting.'}); room.phase='vote'; room.votes={}; addChat(room,null,'The final bell rings. Submit your accusation in secret.', 'system'); room.players.forEach(p=>sendPrivate(p,room)); emitRoom(room); cb({ok:true}); });
  socket.on('vote:submit', ({targetId}, cb=()=>{}) => { const room=[...rooms.values()].find(r=>r.players.some(p=>p.id===socket.id)); if(!room) return cb({error:'Room not found.'}); if(room.phase!=='vote') return cb({error:'Voting is closed.'}); if(room.votes[socket.id]) return cb({error:'You have already voted.'}); if(!playerById(room,targetId)) return cb({error:'Choose a player in this room.'}); if(targetId===socket.id) return cb({error:'You cannot accuse yourself.'}); room.votes[socket.id]=targetId; addChat(room,playerById(room,socket.id), 'has submitted an accusation.', 'vote'); if(Object.keys(room.votes).length===room.players.length) finishGame(room); else emitRoom(room); cb({ok:true}); });
  socket.on('game:reveal', (_, cb=()=>{}) => { const room=[...rooms.values()].find(r=>r.players.some(p=>p.id===socket.id)); if(!room) return cb({error:'Room not found.'}); if(room.hostId!==socket.id) return cb({error:'Only the host can reveal the verdict.'}); if(room.phase!=='vote') return cb({error:'The verdict cannot be revealed now.'}); if(Object.keys(room.votes).length<Math.ceil(room.players.length/2)) return cb({error:'Wait until at least half the players have voted.'}); finishGame(room); cb({ok:true}); });
  socket.on('detective:inspect', ({targetId}, cb=()=>{}) => { const room=[...rooms.values()].find(r=>r.players.some(p=>p.id===socket.id)); if(!room) return cb({error:'Room not found.'}); const p=playerById(room,socket.id); const target=playerById(room,targetId); if(room.phase!=='investigate'||!p||p.role!=='detective'||p.abilityUsed) return cb({error:'Your detective ability is unavailable.'}); if(!target||target.id===p.id) return cb({error:'Choose another player.'}); p.abilityUsed=true; p.abilityResult=`Your instinct says ${target.name} is ${target.role==='thief'||target.role==='accomplice'?'hiding something important':'probably not the mastermind'}—but instincts are not proof.`; sendPrivate(p,room); cb({ok:true}); });
  socket.on('chat:send', ({message}, cb=()=>{}) => { const room=[...rooms.values()].find(r=>r.players.some(p=>p.id===socket.id)); if(!room) return cb({error:'Room not found.'}); const p=playerById(room,socket.id); const msg=String(message||'').trim().slice(0,240); if(!p||!msg) return cb({error:'Write a message first.'}); if(room.phase==='reveal') return cb({error:'The case is closed. Start a new room to play again.'}); addChat(room,p,msg); emitRoom(room); cb({ok:true}); });
  socket.on('game:again', (_, cb=()=>{}) => { const room=[...rooms.values()].find(r=>r.players.some(p=>p.id===socket.id)); if(!room) return cb({error:'Room not found.'}); if(room.hostId!==socket.id) return cb({error:'Only the host can start a new case.'}); room.phase='lobby'; room.revealedClues=[]; room.votes={}; room.result=null; room.round=0; room.chat=[]; room.players.forEach(p=>{p.role=null;p.secret=null;p.personalClue=null;p.abilityUsed=false;p.abilityResult=null;}); addChat(room,null,'A new case file is open. Roles will be reassigned when the host starts.', 'system'); emitRoom(room); cb({ok:true}); });
  socket.on('disconnect', () => { const room=[...rooms.values()].find(r=>r.players.some(p=>p.id===socket.id)); if(!room) return; const p=playerById(room,socket.id); if(p) p.connected=false; if(room.hostId===socket.id) { const next=room.players.find(x=>x.connected); if(next) room.hostId=next.id; } emitRoom(room); setTimeout(()=>{ const current=rooms.get(room.code); if(current && current.players.every(x=>!x.connected)) rooms.delete(room.code); }, 120000); });
});

server.listen(PORT, () => console.log(`The Last Alibi is running at http://localhost:${PORT}`));
