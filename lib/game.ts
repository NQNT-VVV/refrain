import type { AnswerBadge, GameState, PlayerRow } from './types';

/** Un joueur a-t-il trouve tout ce qui etait demande sur la manche ? */
export function hasFoundAll(badge: AnswerBadge | null | undefined, guessArtist: boolean): boolean {
  return Boolean(badge?.titleOk && (!guessArtist || badge.artistOk));
}

/** A-t-il trouve au moins un des deux champs ? */
export function hasFoundSome(badge: AnswerBadge | null | undefined): boolean {
  return Boolean(badge && (badge.titleOk || badge.artistOk));
}

/** Marqueurs compacts affiches a cote d'un joueur : 🎵 titre, 🎤 artiste. */
export function answerMarks(badge: AnswerBadge | null | undefined, guessArtist: boolean): string {
  const title = badge?.titleOk ? '🎵' : '·';
  const artist = guessArtist ? (badge?.artistOk ? '🎤' : '·') : '';
  return `${title}${artist}`;
}

/**
 * L'artiste est-il demande maintenant ? La manche a le dernier mot : une video
 * YouTube dont le titre ne nomme pas l'artiste ne peut pas l'exiger.
 */
export function asksArtist(state: GameState | null): boolean {
  if (!state) return false;
  return state.round?.askArtist ?? state.settings.guessArtist;
}

export function findPlayer(state: GameState | null, playerId: string | null): PlayerRow | null {
  if (!state || !playerId) return null;
  return state.leaderboard.find((p) => p.id === playerId) ?? null;
}

/**
 * Classement affichable pour un joueur : le haut du tableau, et sa propre ligne
 * ajoutee en bas s'il n'y figure pas.
 */
export function boardWithSelf(state: GameState, self: PlayerRow | null, size = 10): PlayerRow[] {
  const rows = state.leaderboard.slice(0, size);
  if (self && !rows.some((r) => r.id === self.id)) rows.push(self);
  return rows;
}

/** Rang affiche : « 1re », « 3e »… */
export function ordinal(position: number): string {
  return `${position}${position === 1 ? 're' : 'e'}`;
}

export const PHASE_LABEL: Record<GameState['phase'], string> = {
  lobby: 'Salon',
  countdown: 'Depart…',
  playing: 'En ecoute',
  buzzed: 'Buzz !',
  paused: 'Pause',
  reveal: 'Reponse',
  scores: 'Classement',
  ended: 'Termine',
};
