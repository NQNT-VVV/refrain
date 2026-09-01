/**
 * Types des charges utiles echangees avec le serveur.
 * Miroir de `publicState()` / `hostState()` dans server/game.js.
 */

export type Phase = 'lobby' | 'countdown' | 'playing' | 'buzzed' | 'paused' | 'reveal' | 'scores' | 'ended';
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

export interface Fastest {
  playerId: string;
  name: string;
  avatar: string;
  /** Temps mis depuis le debut de l'extrait, en millisecondes. */
  ms: number;
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
  /** Les premiers a avoir tout trouve sur cette manche, dans l'ordre. */
  fastest: Fastest[];
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
  /** Faux pour une partie sur un artiste : son nom n'est pas a deviner. */
  askArtist: boolean;
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
  /** Vrai pendant une pause de l'animateur : chrono et son figes. */
  paused: boolean;
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

export interface ArtistHit {
  id: string;
  name: string;
  picture: string;
  fans: number;
  albums: number;
}

export interface ArtistMode {
  id: 'hits' | 'random' | 'deep';
  emoji: string;
  title: string;
  hint: string;
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

/* ------------------------------------------------------------------ */
/* Podium (hub : comptes, ranked, defis)                               */
/* ------------------------------------------------------------------ */

/** Compte Podium reconnu par le serveur d'apres le cookie signe du hub. */
export interface PodiumIdentity {
  pid: string;
  pseudo: string;
  avatar: string;
}

/** Reponse de `/api/podium/me` : identite si connecte, et l'adresse du hub si branche. */
export type PodiumMe = Partial<PodiumIdentity> & { hubUrl: string | null };

/** Variation d'Elo renvoyee par Podium apres une partie, relayee sur `podium:ratings`. */
export interface PodiumRating {
  pid: string;
  before: number;
  after: number;
  tier: string;
}

export interface DailyAttempt {
  text: string;
  ok: boolean;
  skipped: boolean;
}

/** Etat de la musique du jour pour ce joueur — la reponse n'arrive qu'une fois fini. */
export interface DailyState {
  dateKey: string;
  challengeId: string | null;
  stage: number;
  maxStages: number;
  unlockSeconds: number[];
  /** Secondes d'ecoute actuellement debloquees. */
  unlocked: number;
  preview: string;
  attempts: DailyAttempt[];
  solved: boolean;
  failed: boolean;
  finished: boolean;
  score: number;
  identity: PodiumIdentity | null;
  hubUrl: string | null;
  track: TrackCard | null;
  result?: 'ok' | 'miss' | 'skipped' | 'finished' | 'empty';
}
