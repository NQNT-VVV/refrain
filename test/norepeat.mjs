/** Verifie que deux parties d'affilee ne rejouent pas les memes morceaux. */
import { io } from 'socket.io-client';
const U = process.env.TARGET || 'http://localhost:3000';
const CAT = process.env.CAT || 'disney';   // la liste la plus courte : le pire cas
const GAMES = 3;
const ROUNDS = 12;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const call = (s, ev, p) => new Promise((res) => s.emit(ev, p, res));
const mk = () => io(U, { transports: ['websocket'] });
const ready = (s) => new Promise(r => s.on('connect', r));

const host = mk(); await ready(host);
let hostState = null; host.on('state', s => { hostState = s; });
const { code } = await call(host, 'host:create');
const screen = mk(); await ready(screen); await call(screen, 'screen:join', { code });
const pl = await call(host, 'host:playlist', { type: 'catalog', id: CAT }, 60000);
console.log(`liste « ${CAT} » : ${pl.playlist.total} titres au vivier\n`);
await call(host, 'host:settings', { mode: 'input', rounds: ROUNDS, clip: 5, revealDelay: 2, autoNext: false });

const p = mk(); await ready(p);
await call(p, 'player:join', { code, name: 'Camille' });

const parties = [];
for (let g = 1; g <= GAMES; g++) {
  await call(host, 'host:start');
  const titres = [];
  for (let r = 0; r < ROUNDS; r++) {
    for (let i = 0; i < 50 && !hostState?.round?.track; i++) await sleep(100);
    const t = hostState.round.track;
    titres.push(t.id);
    await call(host, 'host:next');
    await sleep(250);
  }
  parties.push(titres);
  await call(host, 'host:lobby');
  await sleep(300);
  console.log(`partie ${g} : ${titres.length} morceaux`);
}

let total = 0;
for (let a = 0; a < parties.length; a++) {
  for (let b = a + 1; b < parties.length; b++) {
    const commun = parties[a].filter(id => parties[b].includes(id));
    console.log(`  parties ${a + 1} et ${b + 1} : ${commun.length} morceau(x) en commun`);
    total += commun.length;
  }
}
const uniques = new Set(parties.flat()).size;
console.log(`\n${uniques} morceaux distincts sur ${parties.flat().length} joues`);
console.log(total === 0 ? '✅ aucune repetition entre parties' : `❌ ${total} repetitions`);
[host, screen, p].forEach(s => s.close());
process.exit(total === 0 ? 0 : 1);
