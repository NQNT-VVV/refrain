/**
 * Raccordement Podium : identite par cookie signe, rattachement au join, et
 * boucle complete de la musique du jour.
 *
 * Le serveur doit tourner avec le secret de test :
 *   PORT=3011 METRICS_PORT=9475 PODIUM_SSO_SECRET=devsecret npm start
 *   URL=http://localhost:3011 npm run test:podium
 */
import crypto from 'node:crypto';
import { io } from 'socket.io-client';

const URL = process.env.URL || 'http://localhost:3000';
const SECRET = process.env.PODIUM_SSO_SECRET || 'devsecret';
const fails = [];
const check = (label, cond, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!cond) fails.push(label);
};

function cookie(payload, secret = SECRET) {
  const body = Buffer.from(JSON.stringify({ v: 1, ...payload })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `nqnt_id=${body}.${sig}`;
}
const soon = Math.floor(Date.now() / 1000) + 3600;
const VALID = cookie({ pid: 'u_test1', pseudo: 'Testeur', avatar: '🦊', exp: soon });
const FORGED = cookie({ pid: 'u_evil', pseudo: 'Evil', avatar: '😈', exp: soon }, 'wrong');
const EXPIRED = cookie({ pid: 'u_old', pseudo: 'Perime', avatar: '🐢', exp: soon - 7200 });

async function get(path, headers = {}) {
  const res = await fetch(`${URL}${path}`, { headers });
  return { status: res.status, json: await res.json(), setCookie: res.headers.get('set-cookie') || '' };
}
async function post(path, body, headers = {}) {
  const res = await fetch(`${URL}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, json: await res.json() };
}

console.log('\n=== Identite ===');
const anon = await get('/api/podium/me');
check('sans cookie : pas d\'identite', anon.status === 200 && !anon.json.pid);
const me = await get('/api/podium/me', { Cookie: VALID });
if (!me.json.pid) {
  console.log('  ! le serveur ne reconnait pas le cookie : demarre-le avec PODIUM_SSO_SECRET=devsecret');
}
check('cookie valide reconnu', me.json.pid === 'u_test1' && me.json.pseudo === 'Testeur');
check('cookie mal signe ignore', !(await get('/api/podium/me', { Cookie: FORGED })).json.pid);
check('cookie expire ignore', !(await get('/api/podium/me', { Cookie: EXPIRED })).json.pid);

console.log('\n=== Rattachement au join ===');
const mk = (extra) => io(URL, { transports: ['websocket'], extraHeaders: extra });
const ready = (s) => new Promise((r) => s.on('connect', r));
const call = (s, ev, p) => new Promise((res) => s.emit(ev, p, res));
const host = mk({}); await ready(host);
const created = await call(host, 'host:create');
const p1 = mk({ Cookie: VALID }); await ready(p1);
const j1 = await call(p1, 'player:join', { code: created.code, name: 'Testeur' });
const p2 = mk({}); await ready(p2);
const j2 = await call(p2, 'player:join', { code: created.code, name: 'Anonyme' });
check('deux joueurs entres', j1.ok && j2.ok);
const st = await call(host, 'host:resume', { code: created.code, hostToken: created.hostToken });
check('l\'identifiant Podium ne fuit pas dans l\'etat', !JSON.stringify(st).includes('podiumPid') && !JSON.stringify(st).includes('u_test1'));
for (const s of [host, p1, p2]) s.close();

console.log('\n=== Musique du jour ===');
const first = await get('/api/daily');
const jar = first.setCookie.split(';')[0];
check('cookie anonyme pose', /^refrain_daily=[a-f0-9]{32}$/.test(jar), jar.slice(0, 22));
check('extrait present, reponse absente', Boolean(first.json.preview) && first.json.track === null && first.json.stage === 0);
const miss = await post('/api/daily/guess', { title: 'zzzz rien' }, { Cookie: jar });
check('mauvaise reponse : etape 1, 2 s', miss.json.result === 'miss' && miss.json.stage === 1 && miss.json.unlocked === 2);
const skip = await post('/api/daily/skip', {}, { Cookie: jar });
check('passe : etape 2, 4 s', skip.json.result === 'skipped' && skip.json.stage === 2 && skip.json.unlocked === 4);
let last = skip;
for (let i = 0; i < 4; i++) last = await post('/api/daily/skip', {}, { Cookie: jar });
check('six etapes : echec et revelation', last.json.failed && last.json.finished && last.json.score === 0 && Boolean(last.json.track?.title), last.json.track?.title);
const after = await post('/api/daily/guess', { title: 'encore' }, { Cookie: jar });
check('partie finie : plus de tentative', after.json.result === 'finished' && after.json.attempts.length === 6);

const other = await get('/api/daily', { Cookie: VALID });
check('joueur Podium reconnu sur la musique du jour', other.json.identity?.pid === 'u_test1');
const win = await post('/api/daily/guess', { title: `${last.json.track.title} — ${last.json.track.artist}` }, { Cookie: VALID });
check('bonne reponse « Titre — Artiste » du premier coup : 60 points', win.json.result === 'ok' && win.json.solved && win.json.score === 60);
const replay = await post('/api/daily/guess', { title: last.json.track.title }, { Cookie: VALID });
check('une seule partie par jour et par compte', replay.json.result === 'finished');

console.log(fails.length ? `\n❌ ${fails.length} echec(s) : ${fails.join(', ')}` : '\n✅ Tous les tests passent');
process.exit(fails.length ? 1 : 0);
