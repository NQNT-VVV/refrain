/**
 * Playlist de la semaine : cinq morceaux, une tentative par compte et par
 * semaine, score cumule, rien d'envoye sans compte. Verifie aussi que
 * `/api/daily` a garde sa forme.
 *
 * Le serveur doit tourner avec le secret de test :
 *   PODIUM_SSO_SECRET=devsecret npm start
 *   URL=http://localhost:3000 npm run test:weekly
 */
import crypto from 'node:crypto';

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
const ACCOUNT = cookie({ pid: `u_weekly_${crypto.randomBytes(3).toString('hex')}`, pseudo: 'Hebdo', avatar: '📀', exp: soon });

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

const NO_TITLE = (s) => !('track' in s) && !('title' in s) && !('artist' in s);

console.log('\n=== Playlist de la semaine, en anonyme ===');
const first = await get('/api/weekly');
const jar = first.setCookie.split(';')[0];
check('reponse 200 et cookie anonyme pose', first.status === 200 && /^refrain_daily=[a-f0-9]{32}$/.test(jar));
const s0 = first.json;
check('cle de semaine ISO', /^\d{4}-W\d{2}$/.test(s0.weekKey), s0.weekKey);
check('cinq morceaux, on commence au premier', s0.tracksTotal === 5 && s0.trackIndex === 0 && s0.stage === 0 && s0.totalScore === 0);
check('extrait present, aucun titre revele', Boolean(s0.preview) && s0.revealed.length === 0 && NO_TITLE(s0));
check('paliers d\'ecoute', JSON.stringify(s0.unlockSeconds) === '[1,2,4,7,11,16]' && s0.unlocked === 1 && s0.maxStages === 6);

// Morceau 1 : une mauvaise reponse puis cinq passes -> rate, on passe au 2.
const miss = await post('/api/weekly/guess', { title: 'zzzz rien du tout' }, { Cookie: jar });
check('mauvaise reponse : etape 1, 2 s, morceau inchange', miss.json.result === 'miss' && miss.json.stage === 1 && miss.json.unlocked === 2 && miss.json.trackIndex === 0 && !miss.json.roundEnded);
let cur = miss;
for (let i = 0; i < 5; i++) cur = await post('/api/weekly/skip', {}, { Cookie: jar });
check('six echecs : morceau 1 rate et revele, morceau 2 en cours', cur.json.roundEnded && cur.json.trackIndex === 1 && cur.json.stage === 0 && cur.json.attempts.length === 0
  && cur.json.revealed.length === 1 && cur.json.revealed[0].solved === false && cur.json.revealed[0].points === 0 && Boolean(cur.json.revealed[0].title), cur.json.revealed[0]?.title);
check('le morceau 2 a un extrait different', Boolean(cur.json.preview) && cur.json.preview !== s0.preview);
check('le morceau en cours n\'est pas revele', cur.json.revealed.every((r) => r.index === 0));

// Morceau 2 : trois passes, puis on pourrait trouver — on ne connait pas le titre en anonyme, donc six passes.
for (let i = 0; i < 6; i++) cur = await post('/api/weekly/skip', {}, { Cookie: jar });
check('morceau 2 rate, morceau 3 en cours', cur.json.trackIndex === 2 && cur.json.revealed.length === 2);
// Morceaux 3, 4, 5 : six passes chacun.
for (let t = 0; t < 3; t++) for (let i = 0; i < 6; i++) cur = await post('/api/weekly/skip', {}, { Cookie: jar });
check('cinq morceaux joues : partie finie, score 0', cur.json.finished && cur.json.revealed.length === 5 && cur.json.totalScore === 0 && cur.json.trackIndex === 4);
const titles = new Set(cur.json.revealed.map((r) => r.id));
check('cinq morceaux distincts', titles.size === 5, [...cur.json.revealed.map((r) => r.title)].join(' | '));
const after = await post('/api/weekly/guess', { title: cur.json.revealed[0].title }, { Cookie: jar });
check('partie finie : plus de tentative', after.json.result === 'finished' && after.json.finished);
const again = await get('/api/weekly', { Cookie: jar });
check('l\'etat fini est stable au rechargement', again.json.finished && again.json.totalScore === 0 && again.json.revealed.length === 5);

console.log('\n=== Avec un compte Podium : score cumule et une seule tentative ===');
const playlist = cur.json.revealed;   // la meme pour tout le monde cette semaine
const a0 = await get('/api/weekly', { Cookie: ACCOUNT });
check('compte reconnu, playlist vierge', a0.json.identity?.pseudo === 'Hebdo' && a0.json.trackIndex === 0 && a0.json.revealed.length === 0);
check('meme extrait que l\'anonyme pour le morceau 1', a0.json.preview.split('?')[0] === s0.preview.split('?')[0]);
// Morceau 1 trouve du premier coup (60), morceau 2 apres deux passes (40), morceau 3 apres un echec (50), 4 et 5 rates.
let a = await post('/api/weekly/guess', { title: `${playlist[0].title} — ${playlist[0].artist}` }, { Cookie: ACCOUNT });
check('« Titre — Artiste » du premier coup : 60 points, morceau suivant', a.json.result === 'ok' && a.json.roundEnded && a.json.totalScore === 60 && a.json.trackIndex === 1 && a.json.revealed[0].solved && a.json.revealed[0].points === 60);
await post('/api/weekly/skip', {}, { Cookie: ACCOUNT });
await post('/api/weekly/skip', {}, { Cookie: ACCOUNT });
a = await post('/api/weekly/guess', { title: playlist[1].title }, { Cookie: ACCOUNT });
check('trouve a la troisieme ecoute : +40, total 100', a.json.result === 'ok' && a.json.totalScore === 100 && a.json.trackIndex === 2 && a.json.revealed[1].attempts === 3);
await post('/api/weekly/guess', { title: 'pas du tout ca' }, { Cookie: ACCOUNT });
a = await post('/api/weekly/guess', { title: playlist[2].title }, { Cookie: ACCOUNT });
check('trouve a la deuxieme ecoute : +50, total 150', a.json.totalScore === 150 && a.json.trackIndex === 3);
for (let i = 0; i < 6; i++) a = await post('/api/weekly/skip', {}, { Cookie: ACCOUNT });
check('morceau 4 rate : total inchange', a.json.totalScore === 150 && a.json.trackIndex === 4 && !a.json.finished);
for (let i = 0; i < 5; i++) a = await post('/api/weekly/skip', {}, { Cookie: ACCOUNT });
a = await post('/api/weekly/guess', { title: playlist[4].title }, { Cookie: ACCOUNT });
check('trouve a la sixieme ecoute : +10, partie finie a 160', a.json.result === 'ok' && a.json.finished && a.json.totalScore === 160 && a.json.revealed.length === 5);
check('quatre morceaux trouves sur cinq', a.json.revealed.filter((r) => r.solved).length === 4);
const replay = await post('/api/weekly/guess', { title: playlist[0].title }, { Cookie: ACCOUNT });
check('une seule tentative par compte et par semaine', replay.json.result === 'finished' && replay.json.totalScore === 160);

console.log('\n=== La musique du jour n\'a pas change de forme ===');
const d = await get('/api/daily');
const keys = ['dateKey', 'challengeId', 'stage', 'maxStages', 'unlockSeconds', 'unlocked', 'preview', 'attempts', 'solved', 'failed', 'finished', 'score', 'identity', 'hubUrl', 'track'];
check('toutes les cles historiques presentes', keys.every((k) => k in d.json), keys.filter((k) => !(k in d.json)).join(','));
check('aucune cle du moteur ne fuit', !('trackIndex' in d.json) && !('revealed' in d.json) && !('totalScore' in d.json) && !('mode' in d.json) && !('periodKey' in d.json));
check('cle du jour AAAA-MM-JJ, reponse cachee', /^\d{4}-\d{2}-\d{2}$/.test(d.json.dateKey) && d.json.track === null && d.json.solved === false && d.json.failed === false);
const dj = d.setCookie.split(';')[0];
let dd = await post('/api/daily/guess', { title: 'zzz' }, { Cookie: dj });
check('daily : mauvaise reponse -> result miss, stage 1', dd.json.result === 'miss' && dd.json.stage === 1 && dd.json.attempts.length === 1);
for (let i = 0; i < 5; i++) dd = await post('/api/daily/skip', {}, { Cookie: dj });
check('daily : six etapes -> failed, track revele, six tentatives conservees', dd.json.failed && dd.json.finished && dd.json.score === 0 && Boolean(dd.json.track?.title) && dd.json.attempts.length === 6 && dd.json.result === 'skipped');

console.log(fails.length ? `\n❌ ${fails.length} echec(s) : ${fails.join(', ')}` : '\n✅ Tous les tests passent');
process.exit(fails.length ? 1 : 0);
