import { $, el, store, toast, connect, clock, sfx, confetti, backdrop } from '/js/common.js';

backdrop();

const socket = connect();
const audio = $('#audio');
const params = new URLSearchParams(location.search);

let code = (params.get('code') || location.hash.slice(1) || store.get('bt.screen.code', '') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
let state = null;
let joined = false;
let lastPhase = null;
let lastRound = -1;
let rafId = null;
let audioTimer = null;
let fadeTimer = null;

const RING = 2 * Math.PI * 47;


/** Echantillon silencieux : sert uniquement a lever le blocage autoplay. */
const SILENCE = 'data:audio/wav;base64,UklGRsAIAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YZwIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

function unlockAudioElement() {
  try {
    audio.src = SILENCE;
    audio.muted = true;
    const p = audio.play();
    const finish = () => { try { audio.pause(); audio.currentTime = 0; } catch {} audio.muted = false; };
    if (p && typeof p.then === 'function') p.then(finish, finish);
    else finish();
  } catch { audio.muted = false; }
}

/* ------------------------------------------------------------------ */
/* Barriere : code + deblocage du son (un seul geste utilisateur)      */
/* ------------------------------------------------------------------ */
$('#gateCode').value = code;
if (code) {
  $('#gateTitle').textContent = `Partie ${code}`;
  $('#gateText').textContent = 'Un clic pour autoriser le son et lancer l\'affichage.';
  $('#gateBtn').textContent = '🔊 Activer le son et demarrer';
}

$('#gateForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const value = $('#gateCode').value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  if (value.length !== 4) return $('#gateCode').focus();
  code = value;

  // Le geste utilisateur debloque a la fois WebAudio et l'element <audio>.
  // Sans source, play() peut rester en attente indefiniment : on passe donc
  // par un echantillon silencieux et on n'attend surtout pas la promesse.
  sfx.unlock();
  unlockAudioElement();

  const res = await socket.call('screen:join', { code });
  if (!res.ok) return toast(res.error, 'err');
  store.set('bt.screen.code', code);
  history.replaceState(null, '', `?code=${code}`);
  joined = true;
  $('#gate').classList.add('off');
  $('#audioPill').textContent = '🔊 son actif';
  state = res.state;
  paintStatic();
  render();
});

$('#gateCode').addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
});

socket.on('connect', async () => {
  await clock.sync(socket);
  if (joined && code) socket.call('screen:join', { code });
});
socket.on('state', (next) => { state = next; render(); });
socket.on('audio', onAudioCue);

/* ------------------------------------------------------------------ */
/* Lecture audio                                                      */
/* ------------------------------------------------------------------ */

function clearAudioTimers() {
  clearTimeout(audioTimer); audioTimer = null;
  clearInterval(fadeTimer); fadeTimer = null;
}

function targetVolume() { return Number($('#vol').value) / 100; }

function fadeTo(value, ms = 450, done) {
  clearInterval(fadeTimer);
  const from = audio.volume;
  const steps = Math.max(1, Math.round(ms / 40));
  let i = 0;
  fadeTimer = setInterval(() => {
    i++;
    audio.volume = Math.max(0, Math.min(1, from + (value - from) * (i / steps)));
    if (i >= steps) { clearInterval(fadeTimer); fadeTimer = null; done?.(); }
  }, 40);
}

function onAudioCue(msg) {
  if (!msg) return;
  if (msg.action === 'play') {
    clearAudioTimers();
    audio.src = msg.preview;
    audio.currentTime = 0;
    audio.volume = 0;
    audio.load();
    const wait = Math.max(0, msg.startAt - clock.now());
    audioTimer = setTimeout(() => {
      audio.currentTime = 0;
      audio.play().then(() => fadeTo(targetVolume(), 400)).catch(() => {
        toast('Le navigateur bloque la lecture — clique une fois sur la page.', 'err');
      });
    }, wait);
  } else if (msg.action === 'pause') {
    fadeTo(0, 180, () => audio.pause());
  } else if (msg.action === 'resume') {
    audio.play().then(() => fadeTo(targetVolume(), 250)).catch(() => {});
  } else if (msg.action === 'stop') {
    clearAudioTimers();
    fadeTo(0, 420, () => { audio.pause(); audio.currentTime = 0; });
  }
}

$('#vol').addEventListener('input', () => {
  if (!audio.paused) audio.volume = targetVolume();
  $('#audioPill').textContent = targetVolume() === 0 ? '🔇 son coupe' : '🔊 son actif';
});

$('#fsBtn').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
});

/* ------------------------------------------------------------------ */
/* Rendu                                                              */
/* ------------------------------------------------------------------ */

function paintStatic() {
  $('#codeMini').textContent = code;
  $('#codeBig').textContent = code;
  const host = location.host;
  $('#joinUrl').textContent = `${host}/j/${code}`;
  const url = `${location.origin}/j/${code}`;
  fetch(`/api/qr?text=${encodeURIComponent(url)}`)
    .then((r) => r.text())
    .then((svg) => { $('#qr').innerHTML = svg; })
    .catch(() => { $('#qr').textContent = url; });

  const eq = $('#eq');
  eq.replaceChildren(...Array.from({ length: 26 }, (_, i) => el('i', {
    style: { animationDelay: `${-(i * 0.13) % 1}s`, animationDuration: `${0.7 + (i % 5) * 0.13}s` },
  })));
}

const SCENES = ['sLobby', 'sCountdown', 'sPlaying', 'sBuzzed', 'sReveal', 'sScores', 'sEnd'];
function scene(id) { for (const s of SCENES) $(`#${s}`).classList.toggle('on', s === id); }

function render() {
  if (!state || !joined) return;
  const phaseChanged = state.phase !== lastPhase;
  const roundChanged = (state.round?.index ?? -1) !== lastRound;

  if (state.playlist) {
    $('#plEmoji').textContent = state.playlist.emoji;
    $('#plTitle').textContent = state.playlist.title;
    document.documentElement.style.setProperty('--accent', state.playlist.accent || '#8b5cf6');
  }

  const inGame = ['countdown', 'playing', 'buzzed', 'reveal', 'scores'].includes(state.phase);
  $('#roundPill').hidden = !inGame;
  if (inGame && state.round) {
    $('#roundNo').textContent = state.round.index + 1;
    $('#roundTotal').textContent = state.round.total;
    renderDots(state.round.index, state.round.total);
  } else {
    $('#dots').replaceChildren();
  }

  switch (state.phase) {
    case 'lobby':     renderLobby(); break;
    case 'countdown': scene('sCountdown'); $('#cdSub').textContent = `Manche ${state.round.index + 1}`; break;
    case 'playing':   renderPlaying(); break;
    case 'buzzed':    renderBuzzed(phaseChanged); break;
    case 'reveal':    renderReveal(phaseChanged); break;
    case 'scores':    renderScores(); break;
    case 'ended':     renderEnd(phaseChanged); break;
  }

  lastPhase = state.phase;
  lastRound = state.round?.index ?? -1;
  loop();
}

function renderDots(index, total) {
  const host = $('#dots');
  if (host.children.length !== total) {
    host.replaceChildren(...Array.from({ length: total }, () => el('i')));
  }
  [...host.children].forEach((d, i) => {
    d.className = i < index ? 'done' : i === index ? 'now' : '';
  });
}

function renderLobby() {
  scene('sLobby');
  const players = state.players;
  $('#lobbyPlayers').replaceChildren(...players.map((p) => el('span', { class: `who ${p.connected ? '' : 'off'}` }, p.avatar, ' ', p.name)));
  $('#lobbyHint').textContent = players.length === 0
    ? 'En attente des joueurs…'
    : state.playlist
      ? `${players.length} joueur${players.length > 1 ? 's' : ''} • ${state.playlist.emoji} ${state.playlist.title} • ${state.settings.rounds} manches`
      : `${players.length} joueur${players.length > 1 ? 's' : ''} • l'animateur choisit la liste`;
}

function renderPlaying() {
  scene('sPlaying');
  $('#sPlaying').classList.remove('paused');
  const list = $('#sideList');
  const rows = state.players.slice(0, 12);
  list.replaceChildren(...rows.map((p) => {
    const a = p.answered;
    const done = a && a.titleOk && (!state.settings.guessArtist || a.artistOk);
    const part = a && (a.titleOk || a.artistOk);
    const marks = state.settings.mode === 'buzzer'
      ? (state.round.lockedOut.includes(p.id) ? '⛔' : '')
      : `${a?.titleOk ? '🎵' : ''}${a?.artistOk ? '🎤' : ''}`;
    return el('div', { class: `prow ${done ? 'done' : part ? 'part' : ''} ${p.connected ? '' : 'off'}` },
      el('span', { class: 'av' }, p.avatar),
      el('span', { class: 'nm' }, p.name),
      el('span', { class: 'marks' }, marks),
      el('span', { class: 'sc' }, String(p.score)));
  }));
  $('#sideTitle').textContent = state.settings.mode === 'buzzer' ? 'Au buzzer' : 'Qui a trouve ?';
}

function renderBuzzed(phaseChanged) {
  scene('sBuzzed');
  $('#sPlaying').classList.add('paused');
  const buzz = state.round.buzz;
  $('#buzzAv').textContent = buzz?.avatar || '🔔';
  $('#buzzName').textContent = buzz?.name || '—';
  if (phaseChanged) { sfx.unlock(); sfx.buzz(); }
}

function renderReveal(phaseChanged) {
  scene('sReveal');
  const t = state.round.track;
  $('#revCover').src = t.cover || '';
  $('#revCover').style.visibility = t.cover ? 'visible' : 'hidden';
  $('#revTitle').textContent = t.title;
  $('#revArtist').textContent = t.artist;
  $('#revAlbum').textContent = t.album || '';

  const winners = (state.round.results || []).filter((r) => r.gained > 0);
  $('#scorers').replaceChildren(...(winners.length
    ? winners.slice(0, 10).map((r, i) => el('span', { class: 's', style: { animationDelay: `${i * 0.07}s` } },
        r.avatar, ' ', r.name, el('span', { class: 'pts' }, ` +${r.gained}`)))
    : [el('span', { class: 'none' }, 'Personne n\'a trouve… 😬')]));

  if (phaseChanged) {
    sfx.unlock();
    winners.length ? sfx.reveal() : sfx.bad();
    const cover = $('#revCover');
    cover.style.animation = 'none'; void cover.offsetWidth; cover.style.animation = '';
  }
}

function renderScores() {
  scene('sScores');
  const rows = state.players;
  const max = Math.max(1, ...rows.map((p) => p.score));
  $('#bars').replaceChildren(...rows.slice(0, 10).map((p, i) => el('div', { class: `bar ${i === 0 ? 'top1' : ''}` },
    el('span', { class: 'pos' }, String(i + 1)),
    el('span', { class: 'av' }, p.avatar),
    el('span', { class: 'nm' }, p.name),
    el('span', { class: 'track' }, el('span', { class: 'fill', style: { width: `${Math.round((p.score / max) * 100)}%` } })),
    el('span', { class: 'sc' }, String(p.score)))));
}

function renderEnd(phaseChanged) {
  scene('sEnd');
  const board = state.podium || state.players;
  const order = [1, 0, 2]; // 2e, 1er, 3e pour un vrai podium
  $('#podium').replaceChildren(...order.filter((i) => board[i]).map((i) => {
    const p = board[i];
    return el('div', { class: `step p${i + 1}`, style: { animationDelay: `${i * 0.18}s` } },
      el('span', { class: 'av' }, p.avatar),
      el('span', { class: 'nm' }, p.name),
      el('div', { class: 'block' }, el('span', { class: 'pts' }, String(p.score))));
  }));
  $('#rest').replaceChildren(...board.slice(3).map((p, i) => el('span', { class: 'r' }, `${i + 4}. ${p.avatar} ${p.name} — ${p.score}`)));
  if (phaseChanged) {
    sfx.unlock(); sfx.win();
    confetti($('#confettiCanvas'), { count: 220, duration: 8000 });
  }
}

/* ------------------------------------------------------------------ */
/* Animation du chrono                                                */
/* ------------------------------------------------------------------ */

function loop() {
  cancelAnimationFrame(rafId);
  if (!state?.round) return;
  const { startAt, endAt } = state.round;

  const step = () => {
    const now = clock.now();
    if (state.phase === 'countdown') {
      const left = Math.max(0, startAt - now);
      const n = Math.ceil(left / 1000);
      const node = $('#cdNum');
      const label = n > 0 ? String(n) : 'GO';
      if (node.textContent !== label) {
        node.textContent = label;
        node.style.animation = 'none'; void node.offsetWidth; node.style.animation = 'popIn .5s var(--ease)';
        sfx.unlock(); n > 0 ? sfx.tick() : sfx.go();
      }
    } else if (state.phase === 'playing') {
      const total = endAt - startAt;
      const ratio = Math.max(0, Math.min(1, (endAt - now) / total));
      $('#ringFg').style.strokeDashoffset = String(RING * (1 - ratio));
      const secs = Math.max(0, Math.ceil((endAt - now) / 1000));
      const badge = $('#secLeft');
      if (badge.textContent !== String(secs)) {
        badge.textContent = String(secs);
        if (secs <= 5 && secs > 0) { sfx.unlock(); sfx.tick(); }
      }
      badge.classList.toggle('warn', secs <= 5);
    }
    rafId = requestAnimationFrame(step);
  };
  rafId = requestAnimationFrame(step);
}

// Le curseur disparait apres 3 s d'inactivite (confort en projection)
let cursorTimer;
document.addEventListener('mousemove', () => {
  document.body.style.cursor = '';
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => { document.body.style.cursor = 'none'; }, 3000);
});
