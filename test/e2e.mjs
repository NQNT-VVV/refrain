import { io } from 'socket.io-client';

const URL = 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = (s, ev, p) => new Promise((res) => s.emit(ev, p, res));
const fails = [];
const check = (label, cond, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!cond) fails.push(label);
};

function mk() { return io(URL, { transports: ['websocket'] }); }
function ready(s) { return new Promise((r) => s.on('connect', r)); }

async function run(mode) {
  console.log(`\n=== Mode ${mode} ===`);
  const host = mk(); await ready(host);
  let hostState = null; host.on('state', (s) => { hostState = s; });

  const created = await call(host, 'host:create');
  check('salon cree', created.ok && /^[A-Z0-9]{4}$/.test(created.code), created.code);
  const code = created.code;

  const screen = mk(); await ready(screen);
  const audioCues = [];
  screen.on('audio', (m) => audioCues.push(m));
  let screenState = null; screen.on('state', (s) => { screenState = s; });
  check('ecran connecte', (await call(screen, 'screen:join', { code })).ok);

  const pl = await call(host, 'host:playlist', { type: 'catalog', id: 'rock' });
  check('playlist chargee', pl.ok && pl.playlist.total > 10, pl.ok ? `${pl.playlist.total} titres` : pl.error);

  // Le mode buzzer a besoin d'un extrait plus long : le buzzer reste ferme
  // les premieres secondes, il faut de la marge pour jouer la manche apres.
  const clip = mode === 'buzzer' ? 12 : 5;
  const st = await call(host, 'host:settings', {
    mode, rounds: 3, clip, revealDelay: 2, speedBonus: 2, buzzDelay: 2, buzzAnswerTime: 3,
  });
  check('reglages appliques',
    st.ok && st.settings.rounds === 3 && st.settings.clip === clip
    && st.settings.buzzDelay === 2 && st.settings.buzzAnswerTime === 3);

  const players = [];
  for (const name of ['Alice', 'Bob', 'Alice']) {
    const s = mk(); await ready(s);
    const res = await call(s, 'player:join', { code, name });
    players.push({ s, ...res });
  }
  check('3 joueurs connectes', players.every((p) => p.ok));
  check('pseudo duplique renomme', players[2].name === 'Alice 2', players[2].name);

  const notStarted = await call(host, 'host:start');
  check('demarrage accepte', notStarted.ok, notStarted.error || '');

  await sleep(300);
  check('etat = countdown', hostState?.phase === 'countdown', hostState?.phase);
  check('ordre audio envoye a l\'ecran', audioCues.some((c) => c.action === 'play' && c.preview?.startsWith('http')));
  check('l\'ecran ne connait pas le titre', !screenState?.round?.track);
  check('la regie connait le titre', !!hostState?.round?.track?.title, hostState?.round?.track?.title);

  await sleep(3400);
  check('etat = playing', hostState?.phase === 'playing', hostState?.phase);

  const track = hostState.round.track;

  if (mode === 'input') {
    // Alice trouve tout, Bob se trompe puis trouve le titre
    const a1 = await call(players[0].s, 'player:answer', { title: track.title, artist: track.artist });
    check('Alice : titre + artiste valides', a1.ok && a1.titleOk && a1.artistOk, JSON.stringify({ t: a1.titleOk, a: a1.artistOk }));
    const b1 = await call(players[1].s, 'player:answer', { title: 'nimportequoi', artist: 'xxxx' });
    check('Bob : mauvaise reponse rejetee', b1.ok && !b1.titleOk && !b1.artistOk);
    const b2 = await call(players[1].s, 'player:answer', { title: track.title, artist: '' });
    check('Bob : correction acceptee', b2.ok && b2.titleOk && !b2.artistOk);

    await sleep(5200);
    check('etat = reveal', hostState?.phase === 'reveal', hostState?.phase);
    const res = hostState.round.results;
    const alice = res.find((r) => r.name === 'Alice');
    const bob = res.find((r) => r.name === 'Bob');
    const alice2 = res.find((r) => r.name === 'Alice 2');
    check('Alice marque plus que Bob', alice.gained > bob.gained, `${alice.gained} vs ${bob.gained}`);
    check('Bob marque quand meme', bob.gained > 0, String(bob.gained));
    check('Alice 2 (muette) a 0', alice2.gained === 0);
    check('le titre est revele a l\'ecran', screenState?.round?.track?.title === track.title);
  } else {
    check('l\'ouverture du buzzer est annoncee dans l\'etat',
      typeof hostState.round.buzzOpensAt === 'number' && hostState.round.buzzOpensAt > hostState.round.startAt);

    const tooEarly = await call(players[1].s, 'player:buzz');
    check('buzz refuse avant l\'ouverture', tooEarly.ok && !tooEarly.accepted && tooEarly.reason === 'too_early', tooEarly.reason);

    await sleep(2300);
    const buzz = await call(players[1].s, 'player:buzz');
    check('buzz accepte apres le delai', buzz.ok && buzz.accepted, buzz.reason || '');
    await sleep(200);
    check('etat = buzzed', hostState?.phase === 'buzzed', hostState?.phase);
    check('musique mise en pause', audioCues.at(-1)?.action === 'pause');
    check('echeance de reponse annoncee', typeof hostState.round.answerDeadline === 'number');
    const late = await call(players[0].s, 'player:buzz');
    check('second buzz refuse', late.ok && !late.accepted && late.reason === 'taken', late.reason);

    // Sans arbitrage de l'animateur, la manche doit repartir d'elle-meme
    await sleep(3400);
    check('reprise automatique apres expiration', hostState?.phase === 'playing', hostState?.phase);
    check('musique relancee apres expiration', audioCues.at(-1)?.action === 'resume');
    check('echeance effacee', hostState.round.answerDeadline === null);
    const timedOut = await call(players[1].s, 'player:buzz');
    check('buzzeur expire exclu de la manche', timedOut.ok && !timedOut.accepted && timedOut.reason === 'locked_out', timedOut.reason);

    // Refus explicite de l'animateur
    const second = await call(players[2].s, 'player:buzz');
    check('un autre joueur peut buzzer', second.ok && second.accepted, second.reason || '');
    await sleep(150);
    await call(host, 'host:judge', { ok: false });
    await sleep(200);
    check('reprise apres mauvaise reponse', hostState?.phase === 'playing', hostState?.phase);
    check('musique relancee', audioCues.at(-1)?.action === 'resume');

    await call(players[0].s, 'player:buzz');
    await sleep(150);
    await call(host, 'host:judge', { ok: true });
    await sleep(250);
    check('etat = reveal apres validation', hostState?.phase === 'reveal', hostState?.phase);
    const alice = hostState.round.results.find((r) => r.name === 'Alice');
    check('points buzzer attribues', alice.gained === 5, String(alice.gained));
  }

  // Enchainement automatique jusqu'a la fin
  const deadline = Date.now() + 45000;
  while (hostState?.phase !== 'ended' && Date.now() < deadline) {
    if (hostState?.phase === 'playing' && mode === 'input') {
      const t = hostState.round.track;
      await call(players[0].s, 'player:answer', { title: t.title, artist: t.artist });
    }
    if (hostState?.phase === 'buzzed') await call(host, 'host:judge', { ok: true });
    if (hostState?.phase === 'playing' && mode === 'buzzer' && Date.now() >= hostState.round.buzzOpensAt) {
      await call(players[0].s, 'player:buzz');
    }
    await sleep(400);
  }
  check('partie terminee', hostState?.phase === 'ended', hostState?.phase);
  check('podium classe', Array.isArray(hostState?.podium) && hostState.podium[0].score >= hostState.podium[1].score);
  check('3 manches jouees', hostState?.podium?.length === 3);

  // Reconnexion joueur
  const revived = mk(); await ready(revived);
  const back = await call(revived, 'player:resume', { code, playerId: players[0].playerId, token: players[0].token });
  check('reconnexion joueur', back.ok && back.name === 'Alice', back.error || '');

  const lobby = await call(host, 'host:lobby');
  await sleep(150);
  check('retour au salon', lobby.ok && hostState?.phase === 'lobby' && hostState.players.every((p) => p.score === 0));

  [host, screen, revived, ...players.map((p) => p.s)].forEach((s) => s.close());
}

await run('input');
await run('buzzer');

console.log(fails.length ? `\n❌ ${fails.length} echec(s) : ${fails.join(' | ')}` : '\n✅ Tous les tests passent');
process.exit(fails.length ? 1 : 0);
