/**
 * Montee en charge : simule une partie a plusieurs milliers de joueurs.
 *
 *   PLAYERS=2000 node test/load.mjs
 *
 * On mesure ce qui casse en premier a cette echelle : le volume diffuse a
 * chaque joueur, et le nombre de messages recus par manche.
 */
import { io } from 'socket.io-client';

const URL = process.env.TARGET || 'http://localhost:3000';
const PLAYERS = Number(process.env.PLAYERS) || 500;
const BATCH = Number(process.env.BATCH) || 100;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = (s, ev, p) => new Promise((res) => s.emit(ev, p, res));
const mk = () => io(URL, { transports: ['websocket'], reconnection: false });
const ready = (s) => new Promise((res, rej) => { s.on('connect', res); s.on('connect_error', rej); });
const kb = (n) => `${(n / 1024).toFixed(1)} Ko`;

console.log(`\n=== Montee en charge : ${PLAYERS} joueurs ===\n`);

const host = mk(); await ready(host);
let hostState = null;
host.on('state', (s) => { hostState = s; });

const { code } = await call(host, 'host:create');
const screen = mk(); await ready(screen);
await call(screen, 'screen:join', { code });

const pl = await call(host, 'host:playlist', { type: 'catalog', id: 'rock' }, 60000);
if (!pl.ok) { console.error('playlist indisponible :', pl.error); process.exit(1); }
await call(host, 'host:settings', { mode: 'input', rounds: 2, clip: 10, revealDelay: 3 });

/* ------------------------------------------------------------------ */
/* Arrivee des joueurs                                                 */
/* ------------------------------------------------------------------ */

const players = [];
let joinErrors = 0;
const t0 = Date.now();

for (let start = 0; start < PLAYERS; start += BATCH) {
  const size = Math.min(BATCH, PLAYERS - start);
  await Promise.all(Array.from({ length: size }, async (_, i) => {
    const n = start + i;
    try {
      const s = mk();
      await ready(s);
      const res = await call(s, 'player:join', { code, name: `Joueur ${n}` });
      if (!res.ok) { joinErrors += 1; s.close(); return; }
      players.push({ s, playerId: res.playerId });
    } catch { joinErrors += 1; }
  }));
  process.stdout.write(`\r  connexion : ${players.length}/${PLAYERS}`);
}
const joinMs = Date.now() - t0;
console.log(`\n  ${players.length} joueurs connectes en ${(joinMs / 1000).toFixed(1)} s (${joinErrors} echecs)`);

// On instrumente un joueur temoin : c'est son debit qui compte, pas celui du serveur.
const witness = players[Math.floor(players.length / 2)];
const seen = { state: 0, you: 0, stateBytes: 0, youBytes: 0, maxState: 0 };
witness.s.on('state', (p) => {
  const size = JSON.stringify(p).length;
  seen.state += 1; seen.stateBytes += size;
  seen.maxState = Math.max(seen.maxState, size);
});
witness.s.on('you', (p) => { seen.you += 1; seen.youBytes += JSON.stringify(p).length; });

/* ------------------------------------------------------------------ */
/* Une manche, tout le monde repond                                     */
/* ------------------------------------------------------------------ */

await call(host, 'host:start');
await sleep(3800);
if (hostState?.phase !== 'playing') console.log('  ⚠️ phase inattendue :', hostState?.phase);

const track = hostState?.round?.track;
console.log(`  manche en cours : ${track?.title} — ${track?.artist}`);

const answerStart = Date.now();
let answered = 0;
// La moitie trouve, l'autre se trompe : le cas realiste.
await Promise.all(players.map(async ({ s }, i) => {
  await sleep((i % 40) * 25);          // arrivee etalee, comme de vrais doigts
  const good = i % 2 === 0;
  const res = await call(s, 'player:answer', {
    title: good ? track.title : 'nimporte quoi',
    artist: good ? track.artist : '',
  });
  if (res?.ok) answered += 1;
}));
console.log(`  ${answered} reponses traitees en ${((Date.now() - answerStart) / 1000).toFixed(1)} s`);

await sleep(9000);

/* ------------------------------------------------------------------ */

const health = await (await fetch(`${URL}/api/health`)).json();
console.log(`\n  phase finale : ${hostState?.phase}`);
console.log(`  joueurs vus par le serveur : ${hostState?.counts?.players} (${hostState?.counts?.connected} connectes)`);
console.log(`  classement diffuse : ${hostState?.leaderboard?.length} lignes`);
console.log('\n  --- ce que recoit UN joueur ---');
console.log(`  messages « state » : ${seen.state}  (${kb(seen.stateBytes)} au total, ${kb(seen.maxState)} au plus gros)`);
console.log(`  messages « you »   : ${seen.you}  (${kb(seen.youBytes)})`);
console.log(`\n  extrapolation pour ${players.length} joueurs : ${kb(seen.stateBytes * players.length)} diffuses`);
console.log(`  salons actifs : ${health.rooms} | uptime ${health.uptime}s`);

const failures = [];
if (players.length < PLAYERS) failures.push(`${PLAYERS - players.length} joueurs n'ont pas pu se connecter`);
if (seen.maxState > 40 * 1024) failures.push(`charge « state » trop grosse : ${kb(seen.maxState)}`);
if (hostState?.counts?.players !== players.length) failures.push('compteur de joueurs incoherent');
if (answered < players.length * 0.98) failures.push(`${players.length - answered} reponses perdues`);

console.log(failures.length ? `\n❌ ${failures.join(' | ')}` : '\n✅ Montee en charge tenue');
[host, screen, ...players.map((p) => p.s)].forEach((s) => s.close());
process.exit(failures.length ? 1 : 0);
