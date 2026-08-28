/**
 * Types des charges utiles echangees avec le serveur.
 * Miroir de `publicState()` / `hostState()` dans server/game.js.
 */

export type Phase = 'lobby' | 'countdown' | 'playing' | 'buzzed' | 'reveal' | 'scores' | 'ended';
export type Mode = 'input' | 'buzzer';
export type AudioTarget = 'screen' | 'host';

export interface Settings {
  mode: Mode;
  rounds: number;
  clip: number;
  guessArtist: boolean;
  pointsTitle: number;
  pointsArtist: number;
  speedBonus: number;
  buzzerPoints: number;
  revealDelay: number;
  autoNext: boolean;
}

export interface AnswerBadge {
  titleOk: boolean;
  artistOk: boolean;
  tries: number;
}

export interface PlayerRow {
  id: string;
  name: string;
  avatar: string;
  score: number;
  connected: boolean;
  lastGain: number;
  answered: AnswerBadge | null;
}

export interface TrackCard {
  id: string;
  title: string;
  artist: string;
  album: string;
  cover: string;
  link: string;
}

export interface RoundResult {
  playerId: string;
  name: string;
  avatar: string;
  gained: number;
  titleOk: boolean;
  artistOk: boolean;
  guessTitle: string;
  guessArtist: string;
  ms: number | null;
}

export interface Buzz {
  playerId: string;
  name: string;
  avatar: string;
  at: number;
}

export interface HostAnswer {
  playerId: string;
  titleOk: boolean;
  artistOk: boolean;
  title: string;
  artist: string;
}

export interface RoundState {
  index: number;
  total: number;
  startAt: number;
  endAt: number;
  durationMs: number;
  buzz: Buzz | null;
  lockedOut: string[];
  answeredCount: number;
  reason: string | null;
  /** Present uniquement pour la regie, ou pour tous a la revelation. */
  track?: TrackCard;
  results?: RoundResult[];
  answers?: HostAnswer[];
}

export interface PlaylistMeta {
  id: string;
  title: string;
  emoji: string;
  subtitle: string;
  accent: string;
  total: number;
}

export interface GameState {
  code: string;
  phase: Phase;
  settings: Settings;
  audioTarget: AudioTarget;
  screenOnline: number;
  hostOnline: boolean;
  playlist: PlaylistMeta | null;
  players: PlayerRow[];
  round: RoundState | null;
  serverNow: number;
  podium?: PlayerRow[];
  upcoming?: TrackCard[];
  customCount?: number;
}

export interface Category {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
  accent: string;
}

export interface SearchTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  cover: string;
  preview: string;
}

export interface AudioCue {
  action: 'play' | 'pause' | 'resume' | 'stop';
  preview?: string;
  startAt?: number;
  durationMs?: number;
  index?: number;
}

/** Reponse d'un `socket.emit` avec accuse de reception. */
export type Ack<T = Record<string, never>> = ({ ok: true } & T) | { ok: false; error: string };
