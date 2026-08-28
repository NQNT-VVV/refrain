import { $, $$, el, store, toast, connect, clock, sfx, backdrop, copy } from '/js/common.js';

/** replaceChildren() convertirait un null en texte « null » : on filtre d'abord. */
const setChildren = (host, ...nodes) => host.replaceChildren(...nodes.flat().filter(Boolean));

backdrop();

const socket = connect();
const audio = $('#hostAudio');

let state = null;
let code = null;
let selectedCat = null;
let picked = [];
let rafId = null;
let audioTimer = null;
let lastPhase = null;

/** Echantillon silencieux : leve le blocage autoplay sur un geste utilisateur. */
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
/* Session animateur                                                  */
/* ------------------------------------------------------------------ */

socket.on('connect', async () => {
  await clock.sync(socket);
  const saved = store.get('bt.host');
  if (saved?.code && saved?.hostToken) {
    const res = await socket.call('host:resume', saved);
    if (res.ok) return onRoom(res.code, saved.hostToken, res.state);
  }
  const res = await socket.call('host:create');
  if (!res.ok) return toast(res.error, 'err');
  store.set('bt.host', { code: res.code, hostToken: res.hostToken });
  onRoom(res.code, res.hostToken, res.state);
});

socket.on('state', (next) => { state = next; render(); });
socket.on('audio', onAudioCue);

function onRoom(roomCode, hostToken, initial) {
  code = roomCode;
  const joinUrl = `${location.origin}/j/${code}`;
  $('#code').textContent = code;
  $('#joinLink').textContent = `${location.host}/j/${code}`;
  $('#joinHint').textContent = 'Code a saisir sur ' + location.host;
  $('#openScreen').href = `/screen?code=${code}`;
  fetch(`/api/qr?text=${encodeURIComponent(joinUrl)}`).then((r) => r.text()).then((svg) => { $('#qrMini').innerHTML = svg; }).catch(() => {});
  $('#copyJoin').onclick = () => copy(joinUrl).then(() => toast('Lien copie !', 'ok'));
  state = initial;
  render();
}

/* ------------------------------------------------------------------ */
/* Catalogue et selection des morceaux                                */
/* ------------------------------------------------------------------ */

fetch('/api/catalog').then((r) => r.json()).then(({ categories }) => {
  $('#cats').replaceChildren(...categories.map((c) => el('button', {
    class: 'cat', type: 'button', 'aria-pressed': 'false', 'data-id': c.id,
    style: { '--c': c.accent },
    onClick: () => chooseCategory(c),
  },
    el('span', { class: 'check' }, '✅'),
    el('span', { class: 'em' }, c.emoji),
    el('span', { class: 't' }, c.title),
    el('span', { class: 's' }, c.subtitle))));
}).catch(() => toast('Impossible de charger les listes.', 'err'));

async function chooseCategory(cat) {
  const btn = $(`.cat[data-id="${cat.id}"]`);
  const previous = btn.querySelector('.s').textContent;
  btn.querySelector('.s').textContent = 'Chargement des extraits…';
  const res = await socket.call('host:playlist', { type: 'catalog', id: cat.id }, 60000);
  btn.querySelector('.s').textContent = previous;
  if (!res.ok) return toast(res.error, 'err');
  selectedCat = cat.id;
  markSelected();
  toast(`${cat.emoji} ${cat.title} — ${res.playlist.total} titres prets`, 'ok');
}

function markSelected() {
  $$('.cat').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === selectedCat)));
}

/* Recherche libre ------------------------------------------------- */

let searchTimer;
$('#q').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 420); });
$('#qBtn').addEventListener('click', runSearch);
$('#q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } });

async function runSearch() {
  const q = $('#q').value.trim();
  if (q.length < 2) return $('#results').replaceChildren();
  $('#results').replaceChildren(el('p', { class: 'faint', style: { padding: '10px' } }, 'Recherche…'));
  try {
    const { tracks } = await (await fetch(`/api/search?q=${encodeURIComponent(q)}`)).json();
    if (!tracks?.length) return $('#results').replaceChildren(el('p', { class: 'faint', style: { padding: '10px' } }, 'Aucun extrait jouable pour cette recherche.'));
    $('#results').replaceChildren(...tracks.map((t) => el('div', { class: 'tres' },
      t.cover ? el('img', { src: t.cover, alt: '', loading: 'lazy' }) : el('div', { class: 'avatar' }, '🎵'),
      el('div', { class: 'grow' }, el('div', { class: 't ellipsis' }, t.title), el('div', { class: 'a ellipsis' }, t.artist)),
      el('button', { class: 'btn xs', onClick: (e) => addPick(t, e.currentTarget) }, '+ Ajouter'))));
  } catch { toast('Recherche indisponible.', 'err'); }
}

async function addPick(track, btn) {
  const res = await socket.call('host:custom', { action: 'add', track });
  if (!res.ok) return toast(res.error, 'err');
  picked = res.tracks;
  renderPicked();
  if (btn) { btn.textContent = '✓ Ajoute'; btn.disabled = true; }
}

function renderPicked() {
  $('#pickCount').textContent = picked.length;
  $('#picked').replaceChildren(...picked.map((t) => el('span', { class: 'p' },
    `${t.title} — ${t.artist}`,
    el('button', { title: 'Retirer', onClick: async () => {
      const res = await socket.call('host:custom', { action: 'remove', id: t.id });
      if (res.ok) { picked = res.tracks; renderPicked(); }
    } }, '✕'))));
}

$('#clearPick').addEventListener('click', async () => {
  const res = await socket.call('host:custom', { action: 'clear' });
  if (res.ok) { picked = res.tracks; renderPicked(); }
});

$('#usePick').addEventListener('click', async () => {
  const res = await socket.call('host:playlist', { type: 'custom' }, 30000);
  if (!res.ok) return toast(res.error, 'err');
  selectedCat = null; markSelected();
  toast(`Ta selection est prete (${res.playlist.total} titres)`, 'ok');
});

$('#dzBtn').addEventListener('click', async () => {
  const value = $('#dzUrl').value.trim();
  if (!value) return;
  $('#dzBtn').disabled = true;
  const res = await socket.call('host:playlist', { type: 'deezer', id: value }, 60000);
  $('#dzBtn').disabled = false;
  if (!res.ok) return toast(res.error, 'err');
  selectedCat = null; markSelected();
  toast(`« ${res.playlist.title} » importee — ${res.playlist.total} titres`, 'ok');
});

/* Onglets ---------------------------------------------------------- */
$$('.tabs button').forEach((tab) => tab.addEventListener('click', () => {
  $$('.tabs button').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
  $$('.tabpanel').forEach((p) => p.classList.toggle('on', p.id === tab.dataset.tab));
}));

/* ------------------------------------------------------------------ */
/* Reglages                                                           */
/* ------------------------------------------------------------------ */

let settingsTimer;
function pushSettings(patch) {
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => socket.call('host:settings', patch), 160);
}

const MODE_NOTES = {
  input: 'Tout le monde tape titre + artiste. Correction automatique, bonus de rapidite.',
  buzzer: 'Le premier qui buzze coupe la musique et repond a voix haute. Tu valides ou non.',
};

$$('#modeSeg button').forEach((b) => b.addEventListener('click', () => {
  $$('#modeSeg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  $('#modeNote').textContent = MODE_NOTES[b.dataset.mode];
  pushSettings({ mode: b.dataset.mode });
}));

$$('.seg [data-target]').forEach((b) => b.addEventListener('click', () => {
  $$('.seg [data-target]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  if (b.dataset.target === 'host') { sfx.unlock(); unlockAudioElement(); }
  socket.call('host:audioTarget', { target: b.dataset.target });
}));

const sliders = [
  ['rounds', 'roundsVal', (v) => v, 'rounds'],
  ['clip', 'clipVal', (v) => `${v} s`, 'clip'],
  ['bonus', 'bonusVal', (v) => v, 'speedBonus'],
  ['reveal', 'revealVal', (v) => `${v} s`, 'revealDelay'],
];
for (const [id, out, fmt, key] of sliders) {
  $(`#${id}`).addEventListener('input', (e) => {
    $(`#${out}`).textContent = fmt(e.target.value);
    pushSettings({ [key]: Number(e.target.value) });
  });
}
$('#guessArtist').addEventListener('change', (e) => pushSettings({ guessArtist: e.target.checked }));
$('#autoNext').addEventListener('change', (e) => pushSettings({ autoNext: e.target.checked }));
$('#blurToggle').addEventListener('change', (e) => {
  $('#secret').classList.toggle('blur', e.target.checked);
  store.set('bt.host.blur', e.target.checked);
});
$('#blurToggle').checked = store.get('bt.host.blur', false);
$('#secret').classList.toggle('blur', $('#blurToggle').checked);

/* ------------------------------------------------------------------ */
/* Audio (quand la regie fait aussi la sortie son)                     */
/* ------------------------------------------------------------------ */

function onAudioCue(msg) {
  if (!msg) return;
  if (msg.action === 'play') {
    clearTimeout(audioTimer);
    audio.src = msg.preview;
    audio.currentTime = 0;
    audio.load();
    audioTimer = setTimeout(() => {
      audio.currentTime = 0;
      audio.play().catch(() => toast('Clique une fois sur la page pour autoriser le son.', 'err'));
    }, Math.max(0, msg.startAt - clock.now()));
  } else if (msg.action === 'pause') { audio.pause(); }
  else if (msg.action === 'resume') { audio.play().catch(() => {}); }
  else if (msg.action === 'stop') { clearTimeout(audioTimer); audio.pause(); audio.currentTime = 0; }
}

/* ------------------------------------------------------------------ */
/* Rendu                                                              */
/* ------------------------------------------------------------------ */

const PHASE_LABEL = {
  lobby: 'Salon', countdown: 'Depart…', playing: 'En ecoute',
  buzzed: 'Buzz !', reveal: 'Reponse', scores: 'Classement', ended: 'Termine',
};

function render() {
  if (!state) return;
  const inGame = state.phase !== 'lobby' && state.phase !== 'ended';

  $('#phasePill').textContent = PHASE_LABEL[state.phase] || state.phase;
  $('#screenPill').textContent = state.screenOnline > 0
    ? `📺 ${state.screenOnline} ecran${state.screenOnline > 1 ? 's' : ''} connecte${state.screenOnline > 1 ? 's' : ''}`
    : '📺 aucun ecran';
  $('#screenPill').className = `pill ${state.screenOnline > 0 ? 'ok' : ''}`;

  syncControlsFromState();
  renderPlayers();
  renderLive(inGame);
  renderControls();

  const slot = inGame ? $('#slotLive') : $('#slotLobby');
  const card = $('#playersCard');
  if (card.parentElement !== slot) slot.append(card);
  card.classList.toggle('bare', inGame);
  $('#players').classList.toggle('wide', inGame);

  $('#setupPanel').classList.toggle('hidden', inGame);
  $('#settingsPanel').classList.toggle('hidden', inGame);
  $('#livePanel').classList.toggle('hidden', !inGame);

  if (state.phase !== lastPhase) {
    if (state.phase === 'buzzed') { sfx.unlock(); sfx.buzz(); }
    lastPhase = state.phase;
  }
  tick();
}

/** Reflete l'etat serveur dans les controles sans ecraser une saisie en cours. */
function syncControlsFromState() {
  const s = state.settings;
  if (document.activeElement !== $('#rounds')) { $('#rounds').value = s.rounds; $('#roundsVal').textContent = s.rounds; }
  if (document.activeElement !== $('#clip')) { $('#clip').value = s.clip; $('#clipVal').textContent = `${s.clip} s`; }
  if (document.activeElement !== $('#bonus')) { $('#bonus').value = s.speedBonus; $('#bonusVal').textContent = s.speedBonus; }
  if (document.activeElement !== $('#reveal')) { $('#reveal').value = s.revealDelay; $('#revealVal').textContent = `${s.revealDelay} s`; }
  $('#guessArtist').checked = s.guessArtist;
  $('#autoNext').checked = s.autoNext;
  $$('#modeSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === s.mode)));
  $('#modeNote').textContent = MODE_NOTES[s.mode];
  $$('.seg [data-target]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.target === state.audioTarget)));
  if (state.playlist && state.playlist.id !== selectedCat && $(`.cat[data-id="${state.playlist.id}"]`)) {
    selectedCat = state.playlist.id; markSelected();
  }
  if (state.customCount !== undefined && state.customCount !== picked.length && state.phase === 'lobby') {
    $('#pickCount').textContent = state.customCount;
  }
}

function renderPlayers() {
  const list = $('#players');
  $('#pCount').textContent = state.players.length;
  $('#noPlayers').hidden = state.players.length > 0;

  const answers = new Map((state.round?.answers || []).map((a) => [a.playerId, a]));
  setChildren(list, ...state.players.map((p) => {
    const a = answers.get(p.id);
    const done = a && a.titleOk && (!state.settings.guessArtist || a.artistOk);
    const part = a && (a.titleOk || a.artistOk);
    const guess = a && (a.title || a.artist) ? `${a.title || '—'} · ${a.artist || '—'}` : null;
    return el('div', { class: `pcard ${p.connected ? '' : 'off'} ${done ? 'done' : part ? 'part' : ''}` },
      el('span', {}, p.avatar),
      el('div', { class: 'grow' },
        el('div', { class: 'nm ellipsis' }, p.name),
        guess ? el('div', { class: 'guess ellipsis' }, `${a.titleOk ? '🎵' : ''}${a.artistOk ? '🎤' : ''} ${guess}`) : null),
      el('div', { class: 'tools' },
        el('button', { class: 'btn xs', title: 'Retirer un point', onClick: () => socket.call('host:award', { playerId: p.id, delta: -1 }) }, '−'),
        el('button', { class: 'btn xs', title: 'Donner un point', onClick: () => socket.call('host:award', { playerId: p.id, delta: 1 }) }, '+'),
        el('button', { class: 'btn xs danger', title: 'Exclure', onClick: () => confirm(`Retirer ${p.name} de la partie ?`) && socket.call('host:kick', { playerId: p.id }) }, '✕')),
      p.lastGain > 0 ? el('span', { class: 'sc', style: { color: 'var(--green)' } }, `+${p.lastGain}`) : null,
      el('span', { class: 'sc' }, String(p.score)));
  }));
}

function renderLive(inGame) {
  if (!inGame || !state.round) return;
  $('#liveRound').textContent = state.round.index + 1;
  $('#liveTotal').textContent = state.round.total;

  const t = state.round.track;
  if (t) {
    $('#npCover').src = t.cover || 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
    $('#npTitle').textContent = t.title;
    $('#npArtist').textContent = t.artist;
    $('#npAlbum').textContent = t.album || '';
  }

  const alert = $('#buzzAlert');
  if (state.phase === 'buzzed' && state.round.buzz) {
    alert.replaceChildren(el('div', { class: 'buzz-alert' },
      el('span', { class: 'av' }, state.round.buzz.avatar),
      el('div', { class: 'grow' },
        el('div', { class: 'nm' }, state.round.buzz.name),
        el('div', { class: 'muted', style: { fontSize: '13px' } }, 'a buzze — ecoute sa reponse puis tranche.')),
    ));
  } else {
    alert.replaceChildren();
  }

  $('#upnext').replaceChildren(...(state.upcoming || []).map((u, i) => el('div', { class: 'u' },
    el('b', {}, `Manche ${state.round.index + 2 + i} :`), `${u.title} — ${u.artist}`)));
}

function renderControls() {
  const host = $('#controls');
  const B = (label, opts = {}) => el('button', { class: `btn ${opts.kind || ''}`, onClick: opts.onClick, disabled: opts.disabled }, label);

  if (state.phase === 'lobby') {
    const ready = state.playlist && state.players.some((p) => p.connected);
    const why = !state.playlist ? 'Choisis une liste de morceaux' : !state.players.some((p) => p.connected) ? 'Attends au moins un joueur' : '';
    setChildren(host,
      el('div', { class: 'grow muted', style: { fontSize: '13.5px' } },
        state.playlist ? `${state.playlist.emoji} ${state.playlist.title} · ${state.settings.rounds} manches · ${state.settings.clip} s` : 'Aucune liste selectionnee'),
      why ? el('span', { class: 'pill' }, why) : null,
      el('button', { class: 'btn primary lg', disabled: !ready, onClick: async () => {
        sfx.unlock();
        if (state.audioTarget === 'host') unlockAudioElement();
        const res = await socket.call('host:start');
        if (!res.ok) toast(res.error, 'err');
      } }, '▶ Lancer la partie'),
    );
    return;
  }

  if (state.phase === 'buzzed') {
    setChildren(host,
      el('div', { class: 'grow muted', style: { fontSize: '13.5px' } }, `Reponse attendue : ${state.round.track?.title} — ${state.round.track?.artist}`),
      B('❌ Mauvaise reponse', { kind: 'danger lg', onClick: () => socket.call('host:judge', { ok: false }) }),
      B(`✅ Bonne reponse (+${state.settings.buzzerPoints})`, { kind: 'good lg', onClick: () => socket.call('host:judge', { ok: true }) }),
    );
    return;
  }

  if (state.phase === 'ended') {
    setChildren(host,
      el('div', { class: 'grow muted', style: { fontSize: '13.5px' } }, `Partie terminee — ${state.players[0]?.name || '—'} gagne avec ${state.players[0]?.score ?? 0} points`),
      B('↩ Nouvelle partie', { kind: 'primary lg', onClick: () => socket.call('host:lobby') }),
    );
    return;
  }

  const isReveal = state.phase === 'reveal' || state.phase === 'scores';
  setChildren(host,
    el('div', { class: 'grow muted', style: { fontSize: '13.5px' } }, `Manche ${state.round.index + 1} / ${state.round.total}`),
    B('↩ Retour au salon', { kind: 'sm', onClick: () => confirm('Arreter la partie et revenir au salon ?') && socket.call('host:lobby') }),
    !isReveal ? B('👁 Reveler maintenant', { onClick: () => socket.call('host:reveal') }) : null,
    B(state.round.index + 1 >= state.round.total ? '🏁 Terminer' : '⏭ Manche suivante', { kind: 'primary', onClick: () => socket.call('host:next') }),
  );
}

/* Chrono de la regie ---------------------------------------------- */
function tick() {
  cancelAnimationFrame(rafId);
  const fill = $('#liveFill');
  if (!state?.round || state.phase !== 'playing') { fill.style.transform = 'scaleX(1)'; return; }
  const { startAt, endAt } = state.round;
  const step = () => {
    const ratio = Math.max(0, Math.min(1, (endAt - clock.now()) / (endAt - startAt)));
    fill.style.transform = `scaleX(${ratio})`;
    rafId = requestAnimationFrame(step);
  };
  rafId = requestAnimationFrame(step);
}

/* Raccourcis clavier ---------------------------------------------- */
document.addEventListener('keydown', (e) => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  if (!state) return;
  if (e.code === 'Space') { e.preventDefault(); if (state.phase === 'lobby') $('#controls .primary')?.click(); else socket.call('host:next'); }
  if (e.key === 'r' && state.phase === 'playing') socket.call('host:reveal');
  if (state.phase === 'buzzed') {
    if (e.key === 'o' || e.key === 'Enter') socket.call('host:judge', { ok: true });
    if (e.key === 'n' || e.key === 'Escape') socket.call('host:judge', { ok: false });
  }
});
