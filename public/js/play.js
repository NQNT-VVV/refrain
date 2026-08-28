import { $, el, store, toast, connect, clock, sfx, confetti, backdrop, copy } from '/js/common.js';

backdrop();

const params = new URLSearchParams(location.search);
const CODE = (params.get('code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
if (!CODE) location.replace('/');

const SESSION_KEY = `bt.player.${CODE}`;
const socket = connect();

let state = null;
let me = null;              // { playerId, name, avatar }
let lastPhase = null;
let lastRoundIndex = -1;
let rafId = null;

$('#codeLabel').textContent = CODE;
$('#joinBtn').disabled = true;   // reactive des que la connexion est etablie

/* ------------------------------------------------------------------ */
/* Connexion                                                          */
/* ------------------------------------------------------------------ */

socket.on('connect', async () => {
  $('#connLost').classList.remove('on');
  await clock.sync(socket);
  const saved = store.get(SESSION_KEY);
  if (saved?.token) {
    const res = await socket.call('player:resume', { code: CODE, ...saved });
    if (res.ok) return onJoined(res);
    store.del(SESSION_KEY);
  }
  if (me) return;                       // deja en jeu : ne pas revenir a l'accueil
  showPanel('pJoin');
  // Ne jamais ecraser ce que le joueur est en train de taper
  if (!$('#pseudo').value) $('#pseudo').value = store.get('bt.lastName', '') || '';
  $('#joinBtn').disabled = false;
});

socket.on('disconnect', () => { if (me) $('#connLost').classList.add('on'); });
socket.on('state', (next) => { state = next; render(); });
socket.on('kicked', () => { store.del(SESSION_KEY); toast('Tu as ete retire de la partie.', 'err'); setTimeout(() => location.replace('/'), 1600); });

$('#joinForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  sfx.unlock();
  const name = $('#pseudo').value.trim();
  if (!name) return $('#pseudo').focus();
  $('#joinBtn').disabled = true;
  const res = await socket.call('player:join', { code: CODE, name });
  $('#joinBtn').disabled = false;
  if (!res.ok) return toast(res.error, 'err');
  store.set('bt.lastName', name);
  onJoined(res);
});

function onJoined(res) {
  me = { playerId: res.playerId, name: res.name, avatar: res.avatar };
  store.set(SESSION_KEY, { playerId: res.playerId, token: res.token || store.get(SESSION_KEY)?.token });
  $('#topbar').hidden = false;
  $('#myName').textContent = res.name;
  $('#myAvatar').textContent = res.avatar;
  state = res.state;
  render();
}

/* ------------------------------------------------------------------ */
/* Rendu                                                              */
/* ------------------------------------------------------------------ */

const PANELS = ['pJoin', 'pLobby', 'pCountdown', 'pInput', 'pBuzzer', 'pReveal', 'pScores', 'pEnd'];
function showPanel(id) {
  for (const p of PANELS) $(`#${p}`).classList.toggle('on', p === id);
}

function myRow() {
  return state?.players?.find((p) => p.id === me?.playerId) || null;
}

function render() {
  if (!state || !me) return;
  const mine = myRow();
  if (mine) {
    $('#myScore').textContent = mine.score;
    $('#myName').textContent = mine.name;
    $('#myAvatar').textContent = mine.avatar;
    const pos = state.players.findIndex((p) => p.id === me.playerId) + 1;
    $('#myRank').textContent = state.phase === 'lobby' ? 'Pret' : `${pos}${pos === 1 ? 're' : 'e'} sur ${state.players.length}`;
  }

  const phaseChanged = state.phase !== lastPhase;
  const roundChanged = (state.round?.index ?? -1) !== lastRoundIndex;

  switch (state.phase) {
    case 'lobby':     renderLobby(); break;
    case 'countdown': renderCountdown(roundChanged); break;
    case 'playing':   renderPlaying(roundChanged); break;
    case 'buzzed':    renderBuzzed(); break;
    case 'reveal':    renderReveal(phaseChanged); break;
    case 'scores':    renderScores(); break;
    case 'ended':     renderEnd(phaseChanged); break;
  }

  lastPhase = state.phase;
  lastRoundIndex = state.round?.index ?? -1;
  updateTimer();
}

function renderLobby() {
  showPanel('pLobby');
  $('#timer').hidden = true;
  const roster = $('#roster');
  roster.replaceChildren(...state.players.map((p) => el('span', {
    class: `who ${p.connected ? '' : 'off'} ${p.id === me.playerId ? 'self' : ''}`,
  }, p.avatar, ' ', p.name)));
  $('#actions').replaceChildren(el('p', { class: 'hint', style: { textAlign: 'center' } },
    state.playlist ? `Liste choisie : ${state.playlist.emoji} ${state.playlist.title}` : 'L\'animateur choisit la liste…'));
}

function renderCountdown(roundChanged) {
  showPanel('pCountdown');
  $('#timer').hidden = true;
  $('#cdRound').textContent = (state.round.index + 1);
  $('#actions').replaceChildren();
  if (roundChanged) resetAnswerForm();
}

function renderPlaying(roundChanged) {
  $('#timer').hidden = false;
  if (state.settings.mode === 'buzzer') {
    showPanel('pBuzzer');
    $('#bzRound').textContent = state.round.index + 1;
    const locked = state.round.lockedOut.includes(me.playerId);
    $('#buzzBtn').disabled = locked;
    $('#buzzBtn').textContent = locked ? 'BLOQUE' : 'BUZZ';
    $('#buzzState').replaceChildren(el('p', { class: 'muted' },
      locked ? 'Tu as deja tente ta chance sur cette manche.' : 'Sois le premier a appuyer, puis annonce ta reponse a voix haute.'));
    $('#actions').replaceChildren();
  } else {
    showPanel('pInput');
    $('#inRound').textContent = state.round.index + 1;
    if (roundChanged) resetAnswerForm();
    syncAnswerFlags();
    renderLiveMini();
    $('#actions').replaceChildren();
  }
}

/** Aperçu en direct de la progression des autres, sans reveler la reponse. */
function renderLiveMini() {
  const host = $('#liveMini');
  const rows = state.players.filter((p) => p.connected).slice(0, 6);
  host.replaceChildren(
    el('div', { class: 'head' }, 'Qui a deja trouve ?'),
    ...rows.map((p) => {
      const a = p.answered;
      const done = a && a.titleOk && (!state.settings.guessArtist || a.artistOk);
      const part = a && (a.titleOk || a.artistOk);
      return el('div', { class: `lm ${done ? 'done' : part ? 'part' : ''} ${p.id === me.playerId ? 'self' : ''}` },
        el('span', {}, p.avatar),
        el('span', { class: 'nm ellipsis' }, p.name),
        el('span', { class: 'mk' }, `${a?.titleOk ? '🎵' : '·'}${state.settings.guessArtist ? (a?.artistOk ? '🎤' : '·') : ''}`),
        el('span', { class: 'sc' }, String(p.score)));
    }),
  );
}

function renderBuzzed() {
  showPanel('pBuzzer');
  $('#timer').hidden = true;
  const buzz = state.round.buzz;
  const isMe = buzz?.playerId === me.playerId;
  $('#buzzBtn').disabled = true;
  $('#buzzBtn').textContent = isMe ? 'A TOI !' : '…';
  $('#buzzState').replaceChildren(
    el('div', { class: 'who' }, isMe ? '🔔 A toi de repondre !' : `${buzz?.avatar || ''} ${buzz?.name || 'Quelqu\'un'} a buzze`),
    el('p', { class: 'muted', style: { marginTop: '6px' } },
      isMe ? 'Annonce le titre et l\'artiste a voix haute.' : 'L\'animateur valide ou non sa reponse.'),
  );
}

function renderReveal(phaseChanged) {
  showPanel('pReveal');
  $('#timer').hidden = true;
  const t = state.round.track;
  const result = state.round.results?.find((r) => r.playerId === me.playerId);

  $('#revealTrack').replaceChildren(
    t.cover ? el('img', { src: t.cover, alt: '' }) : el('div', { class: 'avatar lg' }, '🎵'),
    el('div', { class: 'grow' },
      el('div', { class: 't' }, t.title),
      el('div', { class: 'a' }, t.artist),
      t.album ? el('div', { class: 'faint', style: { fontSize: '12px', marginTop: '3px' } }, t.album) : null),
  );

  const yes = (ok) => ok ? 'yes' : 'no';
  $('#verdict').replaceChildren(
    el('div', { class: `v ${yes(result?.titleOk)}` }, el('b', {}, 'Titre'), el('span', {}, result?.titleOk ? '✅' : '❌')),
    state.settings.guessArtist
      ? el('div', { class: `v ${yes(result?.artistOk)}` }, el('b', {}, 'Artiste'), el('span', {}, result?.artistOk ? '✅' : '❌'))
      : el('div', { class: 'v' }, el('b', {}, 'Artiste'), el('span', { class: 'faint' }, '—')),
  );

  const gained = result?.gained || 0;
  const gainNode = $('#gain');
  gainNode.className = `gain ${gained > 0 ? 'plus' : 'zero'}`;
  gainNode.textContent = gained > 0 ? `+${gained}` : '+0';
  if (phaseChanged) {
    gainNode.classList.add('pop-in');
    setTimeout(() => gainNode.classList.remove('pop-in'), 500);
    if (gained > 0) { sfx.unlock(); sfx.good(); navigator.vibrate?.([18, 60, 18]); }
    else { sfx.unlock(); sfx.bad(); }
  }

  renderBoard($('#revealBoard'), state.players.slice(0, 5));
  $('#actions').replaceChildren(el('p', { class: 'hint', style: { textAlign: 'center' } },
    `Manche ${state.round.index + 1} / ${state.round.total}`));
}

function renderScores() {
  showPanel('pScores');
  $('#timer').hidden = true;
  renderBoard($('#scoreBoard'), state.players);
  $('#actions').replaceChildren();
}

function renderEnd(phaseChanged) {
  showPanel('pEnd');
  $('#timer').hidden = true;
  const board = state.podium || state.players;
  const pos = board.findIndex((p) => p.id === me.playerId) + 1;
  const medals = ['🥇', '🥈', '🥉'];
  $('#endMedal').textContent = medals[pos - 1] || '🎉';
  $('#endPos').textContent = pos ? `${pos}${pos === 1 ? 're' : 'e'} place` : 'Partie terminee';
  $('#endLine').textContent = pos === 1 ? 'Personne ne t\'arrete.' : `${myRow()?.score ?? 0} points au compteur.`;
  renderBoard($('#endBoard'), board);
  $('#actions').replaceChildren(
    el('button', { class: 'btn block', onClick: () => copy(location.origin + '/j/' + CODE).then(() => toast('Lien copie', 'ok')) }, '🔗 Copier le lien de la partie'),
  );
  if (phaseChanged) {
    sfx.unlock(); sfx.win();
    if (pos <= 3) {
      const canvas = el('canvas', { style: { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '50', width: '100%', height: '100%' } });
      document.body.append(canvas);
      confetti(canvas);
      setTimeout(() => canvas.remove(), 5600);
    }
  }
}

function renderBoard(host, rows) {
  host.replaceChildren(...rows.map((p, i) => el('div', {
    class: `r ${p.id === me.playerId ? 'self' : ''} ${i < 3 ? `top${i + 1}` : ''}`,
  },
    el('span', { class: 'pos' }, String(i + 1)),
    el('span', {}, p.avatar),
    el('span', { class: 'nm ellipsis' }, p.name),
    p.lastGain > 0 ? el('span', { class: 'delta' }, `+${p.lastGain}`) : null,
    el('span', { class: 'sc' }, String(p.score)),
  )));
}

/* ------------------------------------------------------------------ */
/* Formulaire de reponse                                              */
/* ------------------------------------------------------------------ */

function resetAnswerForm() {
  for (const id of ['fTitle', 'fArtist']) {
    const input = $(`#${id}`);
    input.value = '';
    input.readOnly = false;
  }
  $('#gTitle').classList.remove('found');
  $('#gArtist').classList.remove('found');
  $('#sendBtn').disabled = false;
  $('#answerHint').textContent = 'Tu peux corriger et revalider autant que tu veux : plus tu trouves tot, plus tu marques.';
}

/** Verrouille les champs deja trouves (survit a un rafraichissement de page). */
function syncAnswerFlags() {
  const badge = myRow()?.answered;
  applyFlags(badge?.titleOk, badge?.artistOk);
}

function applyFlags(titleOk, artistOk) {
  $('#gTitle').classList.toggle('found', !!titleOk);
  $('#fTitle').readOnly = !!titleOk;
  const artistDone = !state.settings.guessArtist || !!artistOk;
  $('#gArtist').classList.toggle('found', !!artistOk);
  $('#fArtist').readOnly = !!artistOk;
  $('#gArtist').style.display = state.settings.guessArtist ? '' : 'none';
  if (titleOk && artistDone) {
    $('#sendBtn').disabled = true;
    $('#answerHint').textContent = '🎯 Tout trouve ! Repose-toi une seconde.';
  }
}

$('#answerForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state || state.phase !== 'playing') return;
  sfx.unlock();
  const title = $('#fTitle').value.trim();
  const artist = $('#fArtist').value.trim();
  if (!title && !artist) return;

  const before = { title: $('#gTitle').classList.contains('found'), artist: $('#gArtist').classList.contains('found') };
  $('#sendBtn').disabled = true;
  const res = await socket.call('player:answer', { title, artist });
  $('#sendBtn').disabled = false;
  if (!res.ok) return toast(res.error, 'err');

  applyFlags(res.titleOk, res.artistOk);
  const gotTitle = res.titleOk && !before.title;
  const gotArtist = res.artistOk && !before.artist;
  if (gotTitle && gotArtist) { sfx.great(); toast('🎯 Titre + artiste !', 'ok'); navigator.vibrate?.([20, 50, 20, 50, 30]); }
  else if (gotTitle) { sfx.good(); toast('✅ Titre trouve !', 'ok'); navigator.vibrate?.(45); }
  else if (gotArtist) { sfx.good(); toast('✅ Artiste trouve !', 'ok'); navigator.vibrate?.(45); }
  else { sfx.bad(); $('#answerHint').textContent = 'Pas encore… reessaie, le chrono tourne.'; navigator.vibrate?.(90); }
});

// Entree sur un champ = valider directement
for (const id of ['fTitle', 'fArtist']) {
  $(`#${id}`).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('#answerForm').requestSubmit(); }
  });
}

$('#buzzBtn').addEventListener('click', async () => {
  sfx.unlock();
  $('#buzzBtn').disabled = true;
  const res = await socket.call('player:buzz');
  if (res.ok && res.accepted) { sfx.buzz(); navigator.vibrate?.([30, 40, 60]); }
  else $('#buzzBtn').disabled = false;
});

/* ------------------------------------------------------------------ */
/* Chrono                                                             */
/* ------------------------------------------------------------------ */

function updateTimer() {
  cancelAnimationFrame(rafId);
  const bar = $('#timerFill');
  const wrap = $('#timer');
  if (!state?.round || (state.phase !== 'playing' && state.phase !== 'countdown')) {
    bar.style.transform = 'scaleX(1)';
    wrap.classList.remove('warn');
    return;
  }
  const { startAt, endAt } = state.round;
  const step = () => {
    const now = clock.now();
    if (state.phase === 'countdown') {
      const left = Math.max(0, startAt - now);
      const n = Math.ceil(left / 1000);
      const node = $('#cdNumber');
      if (node.textContent !== String(n || 'GO')) {
        node.textContent = n > 0 ? String(n) : 'GO';
        node.style.animation = 'none'; void node.offsetWidth; node.style.animation = '';
        sfx.unlock(); n > 0 ? sfx.tick() : sfx.go();
      }
      bar.style.transform = 'scaleX(1)';
    } else {
      const total = endAt - startAt;
      const ratio = Math.max(0, Math.min(1, (endAt - now) / total));
      bar.style.transform = `scaleX(${ratio})`;
      wrap.classList.toggle('warn', ratio < 0.28);
    }
    rafId = requestAnimationFrame(step);
  };
  rafId = requestAnimationFrame(step);
}

// Garde l'ecran allume pendant la partie quand le navigateur le permet
let wakeLock = null;
async function keepAwake() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* non supporte */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(); });
keepAwake();
