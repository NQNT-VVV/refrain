/** Verifie qu'on peut repondre a chaque manche, pas seulement a la premiere. */
import { io } from 'socket.io-client';
const U = 'http://localhost:3000';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const call = (s, ev, p) => new Promise((res) => s.emit(ev, p, res));
const mk = () => io(U, { transports: ['websocket'] });
const ready = (s) => new Promise(r => s.on('connect', r));

const host = mk(); await ready(host);
let hostState = null; host.on('state', s => { hostState = s; });
const { code } = await call(host, 'host:create');
const screen = mk(); await ready(screen); await call(screen, 'screen:join', { code });
await call(host, 'host:playlist', { type: 'catalog', id: 'rock' });
await call(host, 'host:settings', { mode: 'input', rounds: 3, clip: 6, revealDelay: 2 });

const p = mk(); await ready(p);
let you = null; p.on('you', (v) => { you = v; });
const joined = await call(p, 'player:join', { code, name: 'Camille' });
if (joined.you) you = joined.you;

await call(host, 'host:start');
const results = [];
for (let round = 1; round <= 3; round++) {
  // attend la phase de lecture
  for (let i = 0; i < 60 && hostState?.phase !== 'playing'; i++) await sleep(200);
  const badgeAuDebut = you?.answered;
  const track = hostState.round.track;
  const res = await call(p, 'player:answer', { title: track.title, artist: track.artist });
  results.push({
    manche: round,
    badgeAuDebut: badgeAuDebut ? `titre:${badgeAuDebut.titleOk} artiste:${badgeAuDebut.artistOk}` : 'vide',
    accepte: Boolean(res?.ok && res.titleOk),
  });
  for (let i = 0; i < 60 && hostState?.phase === 'playing'; i++) await sleep(200);
  await sleep(1200);
}
console.table(results);
const ok = results.every(r => r.accepte) && results.every(r => r.badgeAuDebut === 'vide');
console.log(ok ? '✅ chaque manche accepte une reponse' : '❌ blocage detecte');
[host, screen, p].forEach(s => s.close());
process.exit(ok ? 0 : 1);
