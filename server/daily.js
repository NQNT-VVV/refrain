'use strict';

/**
 * « Musique du jour » : un morceau, six ecoutes de plus en plus longues, une
 * seule partie par jour et par joueur. Premier mode solo de Refrain ; le
 * moteur est dans `solo.js`, partage avec la playlist de la semaine.
 *
 * Ce module conserve la forme de reponse historique de `/api/daily` : un seul
 * morceau, donc `dateKey`, `solved`, `failed`, `score` et `track` a plat.
 */

const solo = require('./solo');

const mode = solo.createMode({
  mode: 'daily',
  trackCount: 1,
  periodKey: solo.todayKey,
  cacheTtlMs: 36 * 60 * 60 * 1000,
  meta: (run) => ({ attempts: run.rounds[0]?.attempts.length ?? 0, solved: Boolean(run.rounds[0]?.solved) }),
});

/** Etat generique du moteur -> reponse historique de la musique du jour. */
function legacy(s) {
  const round = s.revealed[0] || null;
  return {
    dateKey: s.periodKey,
    challengeId: s.challengeId,
    stage: s.stage,
    maxStages: s.maxStages,
    unlockSeconds: s.unlockSeconds,
    unlocked: s.unlocked,
    preview: s.preview,
    attempts: round ? round.attemptsDetail : s.attempts,
    solved: Boolean(round?.solved),
    failed: s.finished && !round?.solved,
    finished: s.finished,
    score: s.totalScore,
    identity: s.identity,
    hubUrl: s.hubUrl,
    track: round ? { id: round.id, title: round.title, artist: round.artist, album: round.album, cover: round.cover, link: round.link } : null,
    ...(s.result ? { result: s.result } : {}),
  };
}

module.exports = {
  state: (who, identity) => mode.state(who, identity).then(legacy),
  guess: (who, identity, title) => mode.guess(who, identity, title).then(legacy),
  skip: (who, identity) => mode.skip(who, identity).then(legacy),
  todayKey: solo.todayKey,
  isCorrect: solo.isCorrect,
  rngFrom: solo.rngFrom,
  UNLOCK_SECONDS: solo.UNLOCK_SECONDS,
  MAX_STAGES: solo.MAX_STAGES,
  SCORES: solo.SCORES,
  POOL_CATEGORIES: solo.POOL_CATEGORIES,
};
