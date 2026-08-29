/** La pause fige le chrono et le son, et la reprise repart exactement de la. */
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
const screen = mk(); await ready(screen);
const cues = []; screen.on('audio', c => cues.push(c.action));
await call(screen, 'screen:join', { code });
const p = mk(); await ready(p); await call(p, 'player:join', { code, name: 'Camille' });
await call(host, 'host:playlist', { type: 'catalog', id: 'rock' });
await call(host, 'host:settings', { mode: 'input', rounds: 3, clip: 8, revealDelay: 2, autoNext: false });

const idle = await call(host, 'host:pause');
check('pas de pause hors manche', !idle.ok);

await call(host, 'host:start');
for (let i = 0; i < 60 && st?.phase !== 'playing'; i++) await sleep(200);
const endBefore = st.round.endAt;

await sleep(1500);
const paused = await call(host, 'host:pause');
await sleep(200);
check('mise en pause acceptee', paused.ok && paused.paused === true);
check('phase = paused', st.phase === 'paused', st.phase);
check('drapeau paused diffuse', st.paused === true);
check('le son est mis en pause', cues.at(-1) === 'pause', cues.at(-1));

const refused = await call(p, 'player:answer', { title: st.round.track?.title || 'x', artist: '' });
check('les reponses sont refusees en pause', !refused.ok, refused.error || '');

await sleep(2000);
check('toujours en pause apres 2 s', st.phase === 'paused', st.phase);

const resumed = await call(host, 'host:pause');
await sleep(200);
check('reprise acceptee', resumed.ok && resumed.paused === false);
check('phase = playing', st.phase === 'playing', st.phase);
check('le son reprend', cues.at(-1) === 'resume', cues.at(-1));
const shift = st.round.endAt - endBefore;
check('la fin de manche est decalee du temps de pause', shift >= 1900 && shift <= 3000, `${shift} ms`);

// La manche doit se terminer d'elle-meme apres le temps restant
for (let i = 0; i < 80 && st?.phase === 'playing'; i++) await sleep(200);
check('la manche se termine normalement apres reprise', st.phase === 'reveal', st.phase);

// Pause pendant un buzz
await call(host, 'host:settings', { mode: 'buzzer', buzzDelay: 0, buzzAnswerTime: 6 });
await call(host, 'host:next');
for (let i = 0; i < 60 && st?.phase !== 'playing'; i++) await sleep(200);
await call(p, 'player:buzz');
await sleep(200);
check('buzz pris', st.phase === 'buzzed', st.phase);
const deadlineBefore = st.round.answerDeadline;
await call(host, 'host:pause');
await sleep(1500);
check('pause pendant un buzz', st.phase === 'paused', st.phase);
await call(host, 'host:pause');
await sleep(200);
check('retour a la phase buzz', st.phase === 'buzzed', st.phase);
check('le temps de reponse est decale', st.round.answerDeadline - deadlineBefore >= 1300, `${st.round.answerDeadline - deadlineBefore} ms`);

console.log(fails.length ? `\n❌ ${fails.join(' | ')}` : '\n✅ Pause conforme');
[host, screen, p].forEach(s => s.close());
process.exit(fails.length ? 1 : 0);
