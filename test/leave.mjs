/** Un joueur qui quitte doit disparaitre des compteurs, et pouvoir revenir. */
import { io } from 'socket.io-client';
const U = process.env.TARGET || 'http://localhost:3000';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const call = (s, ev, p) => new Promise((res) => s.emit(ev, p, res));
const mk = () => io(U, { transports: ['websocket'] });
const ready = (s) => new Promise(r => s.on('connect', r));
const fails = [];
const check = (l, c, x = '') => { console.log(`${c ? '  ✓' : '  ✗'} ${l}${x ? ' — ' + x : ''}`); if (!c) fails.push(l); };

const host = mk(); await ready(host);
let st = null; host.on('state', s => { st = s; });
const { code } = await call(host, 'host:create');

const a = mk(); await ready(a); await call(a, 'player:join', { code, name: 'Alice' });
const b = mk(); await ready(b); await call(b, 'player:join', { code, name: 'Bob' });
await sleep(400);
check('deux joueurs presents', st.counts.players === 2 && st.counts.connected === 2,
  `${st.counts.players}/${st.counts.connected}`);

await call(a, 'player:leave');
await sleep(400);
check('le partant disparait des compteurs', st.counts.players === 1 && st.counts.connected === 1,
  `${st.counts.players}/${st.counts.connected}`);
check('il ne reste que Bob', st.leaderboard.length === 1 && st.leaderboard[0].name === 'Bob');

// Il revient sous un nouveau pseudo
const back = await call(a, 'player:join', { code, name: 'Alice bis' });
await sleep(400);
check('il peut revenir', back.ok, back.error || '');
check('compteurs a jour au retour', st.counts.players === 2, String(st.counts.players));

// Quitter deux fois de suite ne casse rien
const twice = await call(b, 'player:leave');
const again = await call(b, 'player:leave');
check('quitter deux fois reste sans effet', twice.ok && again.ok);
await sleep(300);
check('compteur final coherent', st.counts.players === 1 && st.counts.connected === 1,
  `${st.counts.players}/${st.counts.connected}`);

console.log(fails.length ? `\n❌ ${fails.join(' | ')}` : '\n✅ Depart volontaire conforme');
[host, a, b].forEach(s => s.close());
process.exit(fails.length ? 1 : 0);
