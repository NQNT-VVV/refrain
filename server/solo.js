'use strict';

/**
 * Moteur des modes solo : « musique du jour » et « playlist de la semaine ».
 *
 * Une edition par periode (un jour, une semaine) : un ou plusieurs morceaux
 * tires d'un vivier stable a partir d'une graine — celle du defi publie par
 * Podium quand le hub est branche, la cle de periode sinon. Chaque morceau se
 * joue en six ecoutes de plus en plus longues ; les morceaux s'enchainent ; le
 * score s'additionne. Une seule partie par periode et par joueur.
 *
 * Aucune socket : l'etat de chaque partie vit en memoire et disparait avec la
 * periode. Le titre d'un morceau ne quitte le serveur qu'une fois ce morceau
 * termine.
 */

const crypto = require('crypto');
const catalog = require('./catalog');
const deezer = require('./deezer');
const { matchTitle, matchArtist } = require('./match');
const podium = require('./integrations/podium');

const GAME_SLUG = 'refrain';

/** Secondes d'ecoute debloquees a chaque etape. */
const UNLOCK_SECONDS = [1, 2, 4, 7, 11, 16];
const MAX_STAGES = UNLOCK_SECONDS.length;
/** Points selon l'etape de la bonne reponse ; echec = 0. */
const SCORES = [60, 50, 40, 30, 20, 10];

/**
 * Listes larges et connues : un morceau du jour doit rester trouvable par
 * quelqu'un qui n'a pas grandi avec une seule decennie.
 */
const POOL_CATEGORIES = ['top', 'hymnes', 'fr', '80s', '90s', '2000s', '2010s', 'rock', 'rapfr'];

/** Une URL d'extrait Deezer expire en moins d'une heure : on la renouvelle avant. */
const PREVIEW_TTL_MS = 30 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Calendrier, graine, tirage                                         */
/* ------------------------------------------------------------------ */

const dateFormat = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
});

/** Jour courant a Paris, au format AAAA-MM-JJ. */
function todayKey(now = Date.now()) {
  return dateFormat.format(new Date(now));
}

/** Semaine ISO courante a Paris, au format AAAA-Wss (lundi 00:00 → dimanche 23:59:59). */
function weekKey(now = Date.now()) {
  const [y, m, d] = todayKey(now).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);          // le jeudi de la semaine porte l'annee ISO
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
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

/** `count` morceaux distincts du vivier, dans l'ordre du tirage. */
function draw(pool, seed, count) {
  const rng = rngFrom(seed);
  const picked = [];
  const used = new Set();
  while (picked.length < Math.min(count, pool.length)) {
    const i = Math.floor(rng() * pool.length);
    if (used.has(i)) continue;
    used.add(i);
    picked.push(pool[i]);
  }
  return picked;
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
      throw new Error('Vivier trop petit pour les modes solo (Deezer indisponible ?).');
    }
    return pool;
  })();
  return poolPromise;
}

/* ------------------------------------------------------------------ */
/* Regles communes                                                    */
/* ------------------------------------------------------------------ */

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

/** Ce qu'on revele d'un morceau une fois qu'il est joue. */
function card(track) {
  return {
    id: track.id, title: track.title, artist: track.artist,
    album: track.album || '', cover: track.cover || '', link: track.link || '',
  };
}

/* ------------------------------------------------------------------ */
/* Un mode                                                            */
/* ------------------------------------------------------------------ */

/**
 * @param options.mode        identifiant du mode, le meme que dans la fiche Podium (`daily`, `weekly`)
 * @param options.trackCount  morceaux par edition
 * @param options.periodKey   () => cle de la periode courante
 * @param options.cacheTtlMs  duree de vie du tirage memorise sur disque
 * @param options.meta        (run) => metadonnees jointes au resultat envoye a Podium
 */
function createMode({ mode, trackCount, periodKey, cacheTtlMs, meta }) {
  const tag = `[${mode}]`;

  /** { periodKey, seed, challengeId, tracks: [{ ...track, previewAt }] } — une seule par periode. */
  let edition = null;
  let editionPromise = null;

  async function challengeFor() {
    const list = await podium.activeChallenges(GAME_SLUG);
    return list.find((c) => c.kind === 'mode' && c.mode === mode) || null;
  }

  async function resolveEdition() {
    const key = periodKey();
    if (edition && edition.periodKey === key) return edition;
    if (editionPromise) return editionPromise;

    editionPromise = (async () => {
      const challenge = await challengeFor();
      const seed = challenge?.seed || key;
      const challengeId = challenge?.id || null;

      // Le tirage est memorise sur disque : si le vivier bouge en cours de
      // periode (cache expire, top mis a jour), tout le monde garde les memes
      // morceaux.
      const cacheKey = `${mode}_${key}_${crypto.createHash('sha1').update(seed).digest('hex').slice(0, 10)}`;
      let tracks = deezer.readCache(cacheKey, cacheTtlMs);
      if (!Array.isArray(tracks) || tracks.length !== trackCount) {
        const pool = await loadPool();
        tracks = draw(pool, seed, trackCount);
        deezer.writeCache(cacheKey, tracks);
      }

      edition = { periodKey: key, seed, challengeId, tracks: tracks.map((t) => ({ ...t, previewAt: 0 })) };
      return edition;
    })().finally(() => { editionPromise = null; });

    return editionPromise;
  }

  /** L'URL d'extrait d'un morceau, re-resolue si elle date. */
  async function freshPreview(track) {
    if (Date.now() - track.previewAt < PREVIEW_TTL_MS) return track.preview;
    try {
      const url = await deezer.freshPreview(track.id);
      if (url) track.preview = url;
    } catch { /* l'ancienne URL vaut mieux que rien */ }
    track.previewAt = Date.now();
    return track.preview;
  }

  /* ---- Parties ---------------------------------------------------- */

  /** cle `${periodKey}:${who}` -> partie. `who` = `p:<pid>` ou `a:<anonId>`. */
  const runs = new Map();
  let lastSweep = 0;

  function sweep(key) {
    const now = Date.now();
    if (now - lastSweep < 60 * 60 * 1000) return;
    lastSweep = now;
    for (const k of runs.keys()) if (!k.startsWith(`${key}:`)) runs.delete(k);
  }

  function getRun(key, who) {
    sweep(key);
    const id = `${key}:${who}`;
    let run = runs.get(id);
    if (!run) {
      run = {
        trackIndex: 0, stage: 0, attempts: [],
        rounds: [],                 // { index, solved, score, attempts }
        totalScore: 0, finished: false,
        startedAt: Date.now(), finishedAt: null, reported: false,
      };
      runs.set(id, run);
    }
    return run;
  }

  /** Clot le morceau en cours (trouve a l'etape `solvedAt`, ou echoue si null) et passe au suivant. */
  function closeRound(run, solvedAt) {
    const score = solvedAt === null ? 0 : (SCORES[solvedAt] ?? 0);
    run.rounds.push({ index: run.trackIndex, solved: solvedAt !== null, score, attempts: run.attempts });
    run.totalScore += score;
    run.trackIndex += 1;
    run.stage = 0;
    run.attempts = [];
    if (run.trackIndex >= trackCount) {
      run.finished = true;
      run.finishedAt = Date.now();
    }
  }

  /** Ce que voit le client. Seuls les morceaux termines sont reveles. */
  function view(ed, run, identity, preview) {
    return {
      mode,
      periodKey: ed.periodKey,
      challengeId: ed.challengeId,
      trackIndex: Math.min(run.trackIndex, trackCount - 1),
      tracksTotal: trackCount,
      stage: run.stage,
      maxStages: MAX_STAGES,
      unlockSeconds: UNLOCK_SECONDS,
      unlocked: UNLOCK_SECONDS[Math.min(run.stage, MAX_STAGES - 1)],
      preview,
      attempts: run.attempts,
      revealed: run.rounds.map((r) => ({ ...card(ed.tracks[r.index]), index: r.index, solved: r.solved, points: r.score, attempts: r.attempts.length, attemptsDetail: r.attempts })),
      totalScore: run.totalScore,
      finished: run.finished,
      identity: identity ? { pid: identity.pid, pseudo: identity.pseudo, avatar: identity.avatar } : null,
      hubUrl: podium.URL_BASE || null,
    };
  }

  /** Une partie finie et rattachee a un compte Podium remonte au hub, une fois. */
  function report(ed, run, identity) {
    if (run.reported || !identity || !podium.enabled()) return;
    run.reported = true;
    const payload = {
      matchId: `${mode}-${ed.periodKey}-${identity.pid}`,
      mode,
      challengeId: ed.challengeId,
      playedAt: run.finishedAt,
      durationS: Math.max(0, Math.round((run.finishedAt - run.startedAt) / 1000)),
      meta: meta(run),
      players: [{ pid: identity.pid, nickname: identity.pseudo, avatar: identity.avatar, score: run.totalScore, rank: 1 }],
    };
    podium.postResults(GAME_SLUG, payload).catch((err) => console.warn(`${tag} envoi Podium : ${err.message}`));
  }

  /** Le morceau en cours, ou le dernier une fois la partie finie (pour l'extrait complet). */
  function currentTrack(ed, run) {
    return ed.tracks[Math.min(run.trackIndex, trackCount - 1)];
  }

  async function snapshot(ed, run, identity, result, roundEnded = false) {
    return { ...view(ed, run, identity, await freshPreview(currentTrack(ed, run))), result, roundEnded };
  }

  /* ---- API -------------------------------------------------------- */

  async function state(who, identity) {
    const ed = await resolveEdition();
    const run = getRun(ed.periodKey, who);
    return snapshot(ed, run, identity, undefined);
  }

  async function guess(who, identity, rawTitle) {
    const ed = await resolveEdition();
    const run = getRun(ed.periodKey, who);
    if (run.finished) return snapshot(ed, run, identity, 'finished');

    const text = String(rawTitle || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (text.length < 2) return snapshot(ed, run, identity, 'empty');

    const ok = isCorrect(text, currentTrack(ed, run));
    run.attempts.push({ text, ok, skipped: false });
    let roundEnded = false;
    if (ok) {
      closeRound(run, run.stage);
      roundEnded = true;
    } else {
      run.stage += 1;
      if (run.stage >= MAX_STAGES) { closeRound(run, null); roundEnded = true; }
    }
    if (run.finished) report(ed, run, identity);
    return snapshot(ed, run, identity, ok ? 'ok' : 'miss', roundEnded);
  }

  async function skip(who, identity) {
    const ed = await resolveEdition();
    const run = getRun(ed.periodKey, who);
    let roundEnded = false;
    if (!run.finished) {
      run.attempts.push({ text: '', ok: false, skipped: true });
      run.stage += 1;
      if (run.stage >= MAX_STAGES) { closeRound(run, null); roundEnded = true; }
      if (run.finished) report(ed, run, identity);
    }
    return snapshot(ed, run, identity, 'skipped', roundEnded);
  }

  return { mode, trackCount, state, guess, skip };
}

module.exports = {
  createMode, todayKey, weekKey, isCorrect, rngFrom, draw, loadPool, card,
  UNLOCK_SECONDS, MAX_STAGES, SCORES, POOL_CATEGORIES, GAME_SLUG,
};
