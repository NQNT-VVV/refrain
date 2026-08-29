/** Mode artiste : pas de question sur l'artiste, et les feat sont optionnels. */
import { io } from 'socket.io-client';
const U = process.env.TARGET || 'http://localhost:3000';
const VALD = '5175734';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const call = (s, ev, p, t = 90000) => new Promise((res) => { s.emit(ev, p, res); setTimeout(() => res({ ok:false, error:'delai depasse' }), t); });
const mk = () => io(U, { transports: ['websocket'] });
const ready = (s) => new Promise(r => s.on('connect', r));
const fails = [];
const check = (l, c, x = '') => { console.log(`${c ? '  ✓' : '  ✗'} ${l}${x ? ' — ' + x : ''}`); if (!c) fails.push(l); };

const host = mk(); await ready(host);
let st = null; host.on('state', s => { st = s; });
const { code } = await call(host, 'host:create');
const screen = mk(); await ready(screen); await call(screen, 'screen:join', { code });
const p = mk(); await ready(p);
let you = null; p.on('you', v => { you = v; });
await call(p, 'player:join', { code, name: 'Camille' });

const avec = await call(host, 'host:playlist', { type: 'artist', artistId: VALD, mode: 'random', featurings: true });
check('liste avec featurings', avec.ok, avec.ok ? `${avec.playlist.total} titres` : avec.error);
const sans = await call(host, 'host:playlist', { type: 'artist', artistId: VALD, mode: 'random', featurings: false });
check('liste sans featurings', sans.ok, sans.ok ? `${sans.playlist.total} titres` : sans.error);
check('refuser les featurings reduit la liste', sans.playlist.total < avec.playlist.total,
  `${sans.playlist.total} < ${avec.playlist.total}`);

await sleep(300);
check('l\'etat annonce que l\'artiste n\'est pas demande', st.playlist.askArtist === false, String(st.playlist.askArtist));

await call(host, 'host:settings', { mode: 'input', rounds: 3, clip: 5, revealDelay: 2, guessArtist: true });
await call(host, 'host:start');
for (let i = 0; i < 60 && st?.phase !== 'playing'; i++) await sleep(200);
check('la manche ne demande pas l\'artiste', st.round.askArtist === false, String(st.round.askArtist));

// Le titre seul doit suffire a marquer
const track = st.round.track;
const res = await call(p, 'player:answer', { title: track.title, artist: '' });
check('le titre seul est accepte', res.ok && res.titleOk, JSON.stringify({ t: res.titleOk }));
await sleep(600);
check('le joueur est marque comme ayant tout trouve', you?.answered?.titleOk === true);

// Mode « vrai fan » : bien moins connu que les classiques
const hits = await call(host, 'host:playlist', { type: 'artist', artistId: VALD, mode: 'hits', featurings: false });
const deep = await call(host, 'host:playlist', { type: 'artist', artistId: VALD, mode: 'deep', featurings: false });
check('les classiques sont moins nombreux que les raretes', hits.playlist.total < deep.playlist.total,
  `${hits.playlist.total} vs ${deep.playlist.total}`);

console.log(fails.length ? `\n❌ ${fails.join(' | ')}` : '\n✅ Mode artiste conforme');
[host, screen, p].forEach(s => s.close());
process.exit(fails.length ? 1 : 0);
