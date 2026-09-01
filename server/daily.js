'use strict';

/**
 * « Musique du jour » : un morceau, six ecoutes de plus en plus longues, une
 * seule partie par jour et par joueur. Le mode solo de Refrain, joue en dehors
 * de toute soiree.
 *
 * Le morceau est le meme pour tout le monde : il est tire d'un vivier stable
 * (quelques listes du catalogue, triees par identifiant) a partir d'une graine.
 * La graine vient du defi publie par Podium quand le hub est branche — c'est
 * elle qui synchronise tous les serveurs — et se rabat sur la date sinon.
 *
 * Aucune socket : trois routes HTTP suffisent, l'etat de chaque partie vit en
 * memoire et disparait avec le jour.
 */

const crypto = require('crypto');
const catalog = require('./catalog');
const deezer = require('./deezer');
const { matchTitle, matchArtist } = require('./match');
const podium = require('./integrations/podium');

const GAME_SLUG = 'refrain';
const MODE = 'daily';

/** Secondes d'ecoute debloquees a chaque etape. */
const UNLOCK_SECONDS = [1, 2, 4, 7, 11, 16];
const MAX_STAGES = UNLOCK_SECONDS.length;
/** Points selon l'etape de la bonne reponse ; echec = 0. */
const SCORES = [60, 50, 40, 30, 20, 10];

/**
 * Listes larges et connues : la musique du jour doit rester trouvable par
 * quelqu'un qui n'a pas grandi avec une seule decennie.
 */
const POOL_CATEGORIES = ['top', 'hymnes', 'fr', '80s', '90s', '2000s', '2010s', 'rock', 'rapfr'];

/** Une URL d'extrait Deezer expire en moins d'une heure : on la renouvelle avant. */
const PREVIEW_TTL_MS = 30 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Date, graine, tirage                                               */
/* ------------------------------------------------------------------ */

const dateFormat = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
});

/** Jour courant a Paris, au format AAAA-MM-JJ. */
function todayKey(now = Date.now()) {
  return dateFormat.format(new Date(now));
}

/** PRNG mulberry32, seme par le hachage de la graine : rapide et stable. */
function rngFrom(seed) {
  const digest = crypto.createHash('sha256').update(String(seed)).digest();
  let a = digest.readUInt32LE(0);
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let poolPromise = null;

/** Vivier trie par identifiant : le meme tableau quel que soit l'ordre de chargement. */
async function loadPool() {
  if (poolPromise) return poolPromise;
  poolPromise = (async () => {
    const lists = await Promise.all(POOL_CATEGORIES.map((id) => catalog.buildCategory(id).catch(() => [])));
    const byId = new Map();
    for (const track of lists.flat()) {
      if (track && track.preview && track.title && track.artist) byId.set(String(track.id), track);
    }
    const pool = [...byId.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    if (pool.length < 20) {
      poolPromise = null;   // on reessaiera : Deezer etait sans doute indisponible
      throw new Error('Vivier trop petit pour la musique du jour (Deezer indisponible ?).');
    }
    return pool;
  })();
  return poolPromise;
}

/* ------------------------------------------------------------------ */
/* Le morceau du jour                                                 */
/* ------------------------------------------------------------------ */

/** { dateKey, seed, challengeId, track, previewAt } — un seul par jour. */
let current = null;
let currentPromise = null;

/** Defi « daily » publie par Podium pour aujourd'hui, ou null. */
async function todaysChallenge() {
  const list = await podium.activeChallenges(GAME_SLUG);
  return list.find((c) => c.kind === 'mode' && c.mode === MODE) || null;
}

async function resolveCurrent() {
  const dateKey = todayKey();
  if (current && current.dateKey === dateKey) return current;
  if (currentPromise) return currentPromise;

  currentPromise = (async () => {
    const challenge = await todaysChallenge();
    const seed = challenge?.seed || dateKey;
    const challengeId = challenge?.id || null;

    // Le tirage est memorise sur disque : si le vivier bouge en cours de
    // journee (cache expire, top mis a jour), tout le monde garde le meme titre.
    const cacheKey = `daily_${dateKey}_${crypto.createHash('sha1').update(seed).digest('hex').slice(0, 10)}`;
    let track = deezer.readCache(cacheKey, 36 * 60 * 60 * 1000);
    if (!track) {
      const pool = await loadPool();
      track = pool[Math.floor(rngFrom(seed)() * pool.length)];
      deezer.writeCache(cacheKey, track);
    }

    current = { dateKey, seed, challengeId, track: { ...track }, previewAt: 0 };
    return current;
  })().finally(() => { currentPromise = null; });

  return currentPromise;
}

/** L'URL d'extrait, re-resolue si elle date. */
async function freshPreview(day) {
  if (Date.now() - day.previewAt < PREVIEW_TTL_MS) return day.track.preview;
  try {
    const url = await deezer.freshPreview(day.track.id);
    if (url) day.track.preview = url;
  } catch { /* l'ancienne URL vaut mieux que rien */ }
  day.previewAt = Date.now();
  return day.track.preview;
}

/* ------------------------------------------------------------------ */
/* Parties                                                            */
/* ------------------------------------------------------------------ */

/** cle `${dateKey}:${who}` -> partie. `who` = `p:<pid>` ou `a:<anonId>`. */
const runs = new Map();
let lastSweep = 0;

function sweep(dateKey) {
  const now = Date.now();
  if (now - lastSweep < 60 * 60 * 1000) return;
  lastSweep = now;
  for (const key of runs.keys()) if (!key.startsWith(`${dateKey}:`)) runs.delete(key);
}

function getRun(dateKey, who) {
  sweep(dateKey);
  const key = `${dateKey}:${who}`;
  let run = runs.get(key);
  if (!run) {
    run = { stage: 0, attempts: [], solved: false, failed: false, score: 0, startedAt: Date.now(), finishedAt: null, reported: false };
    runs.set(key, run);
  }
  return run;
}

const finished = (run) => run.solved || run.failed;

/**
 * Le titre propose est-il le bon ? On accepte le titre seul, et aussi une
 * saisie « Titre — Artiste » telle que la propose l'autocompletion.
 */
function isCorrect(guess, track) {
  const text = String(guess || '').slice(0, 120);
  if (matchTitle(text, track.title)) return true;
  const parts = text.split(/\s+[—–-]\s+/);
  if (parts.length >= 2) {
    const [a, b] = parts;
    if (matchTitle(a, track.title) || matchTitle(b, track.title)) return true;
    // « Artiste — Titre » ou l'inverse : les deux moities doivent coller.
    if (matchArtist(a, track.artist, track.contributors) && matchTitle(parts.slice(1).join(' '), track.title)) return true;
  }
  return false;
}

function settle(run, solvedAt) {
  run.finishedAt = Date.now();
  if (solvedAt !== null) {
    run.solved = true;
    run.score = SCORES[solvedAt] ?? 0;
  } else {
    run.failed = true;
    run.score = 0;
  }
}

/** Ce que voit le client. La reponse ne part qu'une fois la partie finie. */
function view(day, run, identity, preview) {
  const done = finished(run);
  return {
    dateKey: day.dateKey,
    challengeId: day.challengeId,
    stage: run.stage,
    maxStages: MAX_STAGES,
    unlockSeconds: UNLOCK_SECONDS,
    unlocked: UNLOCK_SECONDS[Math.min(run.stage, MAX_STAGES - 1)],
    preview,
    attempts: run.attempts,
    solved: run.solved,
    failed: run.failed,
    finished: done,
    score: run.score,
    identity: identity ? { pid: identity.pid, pseudo: identity.pseudo, avatar: identity.avatar } : null,
    hubUrl: podium.URL_BASE || null,
    track: done ? {
      id: day.track.id, title: day.track.title, artist: day.track.artist,
      album: day.track.album || '', cover: day.track.cover || '', link: day.track.link || '',
    } : null,
  };
}

/** Une partie finie et rattachee a un compte Podium remonte au hub, une fois. */
function report(day, run, identity) {
  if (run.reported || !identity || !podium.enabled()) return;
  run.reported = true;
  const payload = {
    matchId: `daily-${day.dateKey}-${identity.pid}`,
    mode: MODE,
    challengeId: day.challengeId,
    playedAt: run.finishedAt,
    durationS: Math.max(0, Math.round((run.finishedAt - run.startedAt) / 1000)),
    meta: { attempts: run.attempts.length, solved: run.solved },
    players: [{ pid: identity.pid, nickname: identity.pseudo, avatar: identity.avatar, score: run.score, rank: 1 }],
  };
  podium.postResults(GAME_SLUG, payload).catch((err) => console.warn(`[daily] envoi Podium : ${err.message}`));
}

/* ------------------------------------------------------------------ */
/* API                                                                */
/* ------------------------------------------------------------------ */

/** Etat de la partie du jour pour ce joueur. */
async function state(who, identity) {
  const day = await resolveCurrent();
  const run = getRun(day.dateKey, who);
  return view(day, run, identity, await freshPreview(day));
}

async function guess(who, identity, rawTitle) {
  const day = await resolveCurrent();
  const run = getRun(day.dateKey, who);
  if (finished(run)) return { ...view(day, run, identity, await freshPreview(day)), result: 'finished' };

  const text = String(rawTitle || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (text.length < 2) return { ...view(day, run, identity, await freshPreview(day)), result: 'empty' };

  const ok = isCorrect(text, day.track);
  run.attempts.push({ text, ok, skipped: false });
  if (ok) {
    settle(run, run.stage);
  } else {
    run.stage += 1;
    if (run.stage >= MAX_STAGES) settle(run, null);
  }
  if (finished(run)) report(day, run, identity);
  return { ...view(day, run, identity, await freshPreview(day)), result: ok ? 'ok' : 'miss' };
}

async function skip(who, identity) {
  const day = await resolveCurrent();
  const run = getRun(day.dateKey, who);
  if (!finished(run)) {
    run.attempts.push({ text: '', ok: false, skipped: true });
    run.stage += 1;
    if (run.stage >= MAX_STAGES) settle(run, null);
    if (finished(run)) report(day, run, identity);
  }
  return { ...view(day, run, identity, await freshPreview(day)), result: 'skipped' };
}

module.exports = {
  state, guess, skip, todayKey, isCorrect, rngFrom,
  UNLOCK_SECONDS, MAX_STAGES, SCORES, POOL_CATEGORIES,
};
