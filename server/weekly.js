'use strict';

/**
 * « Playlist de la semaine » : cinq morceaux tires de la graine hebdomadaire,
 * joues a la suite, score cumule (300 au mieux), une seule tentative par
 * compte et par semaine ISO (Europe/Paris, lundi 00:00 → dimanche 23:59:59).
 *
 * Meme moteur que la musique du jour ; la reponse expose la progression dans
 * la playlist (`trackIndex`, `revealed`, `totalScore`).
 */

const solo = require('./solo');

const TRACKS = 5;

const mode = solo.createMode({
  mode: 'weekly',
  trackCount: TRACKS,
  periodKey: solo.weekKey,
  cacheTtlMs: 8 * 24 * 60 * 60 * 1000,
  meta: (run) => ({ tracks: TRACKS, solved: run.rounds.filter((r) => r.solved).length, attempts: run.rounds.reduce((n, r) => n + r.attempts.length, 0) }),
});

/** Etat generique du moteur -> reponse de la playlist de la semaine. */
function shape(s) {
  const { mode: _mode, periodKey, revealed, ...rest } = s;
  return {
    weekKey: periodKey,
    ...rest,
    revealed: revealed.map(({ attemptsDetail: _d, ...r }) => r),
  };
}

module.exports = {
  TRACKS,
  state: (who, identity) => mode.state(who, identity).then(shape),
  guess: (who, identity, title) => mode.guess(who, identity, title).then(shape),
  skip: (who, identity) => mode.skip(who, identity).then(shape),
  weekKey: solo.weekKey,
};
