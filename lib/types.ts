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
  /** Secondes d'ecoute imposees avant que le buzzer s'ouvre. */
  buzzDelay: number;
  /** Secondes laissees au buzzeur pour donner sa reponse. */
  buzzAnswerTime: number;
  revealDelay: number;
  autoNext: boolean;
  /** Diffuser aussi l'extrait sur les telephones des joueurs. */
  playerAudio: boolean;
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
  /** Reponses tapees — envoyees a la regie seulement. */
  guessTitle?: string;
  guessArtist?: string;
}

/** Ce que le serveur envoie a chaque joueur sur son canal personnel. */
export interface You {
  id: string;
  name: string;
  avatar: string;
  score: number;
  rank: number;
  lastGain: number;
  answered: AnswerBadge | null;
  lockedOut: boolean;
}

export interface Counts {
  players: number;
  connected: number;
  answered: number;
  done: number;
}

export interface TrackCard {
  id: string;
  title: string;
  artist: string;
  album: string;
  cover: string;
  /** Image de repli quand `cover` n'existe pas (miniatures YouTube). */
  coverFallback?: string;
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
  /** Instant absolu ou le temps de reponse expire, ou null hors arbitrage. */
  answerDeadline: number | null;
  lockedOut: string[];
  answeredCount: number;
  /** Instant absolu ou le buzzer s'ouvre, en millisecondes. */
  buzzOpensAt: number;
  /** L'artiste est-il demande sur cette manche ? (faux si le titre YouTube n'en donne pas) */
  askArtist: boolean;
  reason: string | null;
  /** Present uniquement pour la regie, ou pour tous a la revelation. */
  track?: TrackCard;
  /** A la revelation : uniquement les meilleurs gains, pas les milliers d'autres. */
  topGains?: RoundResult[];
}

export interface PlaylistMeta {
  id: string;
  title: string;
  emoji: string;
  subtitle: string;
  accent: string;
  total: number;
  /** 'catalog' | 'deezer' | 'custom' | 'youtube' */
  source: string;
  /** Vrai tant que le lecteur YouTube n'a pas remonte la liste des videos. */
  pending: boolean;
}

export interface GameState {
  code: string;
  phase: Phase;
  settings: Settings;
  audioTarget: AudioTarget;
  screenOnline: number;
  hostOnline: boolean;
  playlist: PlaylistMeta | null;
  /**
   * Classement borne : douze lignes pour les joueurs et l'ecran, cinquante pour
   * la regie. La liste complete n'est jamais diffusee — a deux mille joueurs
   * elle peserait plus lourd que tout le reste de la partie.
   */
  leaderboard: PlayerRow[];
  counts: Counts;
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
  /** 'youtube' pour une lecture directe ; absent pour un extrait Deezer. */
  kind?: 'youtube';
  videoId?: string;
  preview?: string;
  startAt?: number;
  durationMs?: number;
  index?: number;
}

/** Reponse d'un `socket.emit` avec accuse de reception. */
export type Ack<T = Record<string, never>> = ({ ok: true } & T) | { ok: false; error: string };
