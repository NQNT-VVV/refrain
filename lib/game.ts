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

export function findPlayer(state: GameState | null, playerId: string | null): PlayerRow | null {
  if (!state || !playerId) return null;
  return state.players.find((p) => p.id === playerId) ?? null;
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
  reveal: 'Reponse',
  scores: 'Classement',
  ended: 'Termine',
};
