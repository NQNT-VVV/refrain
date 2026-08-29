'use strict';

const crypto = require('crypto');
const { matchTitle, matchArtist, normalize } = require('./match');
const catalog = require('./catalog');
const deezer = require('./deezer');
const youtube = require('./youtube');
const spotify = require('./spotify');
const metrics = require('./metrics');

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans O/0/I/1/L

/**
 * Une partie diffusee en stream peut rassembler des milliers de joueurs. Deux
 * regles rendent ca tenable :
 *   - on ne diffuse jamais la liste complete, seulement un classement borne ;
 *   - chaque joueur recoit sa ligne a lui, sur son propre canal, et rarement.
 */
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS) || 2000;
const LEADERBOARD_SIZE = 12;   // ce que voient l'ecran et les joueurs
const HOST_LIST_SIZE = 50;     // ce que la regie peut afficher utilement
const TOP_GAINS_SIZE = 10;     // marqueurs mis en avant a la revelation
const PODIUM_SIZE = 20;

// Les evenements de jeu arrivent en rafale : on regroupe les diffusions.
const BROADCAST_INTERVAL_MS = 180;
const ANSWER_THROTTLE_MS = 300;
const COUNTDOWN_MS = 3400;
const ROOM_TTL_MS = 3 * 60 * 60 * 1000;
const SCOREBOARD_EVERY = 5;

const DEFAULT_SETTINGS = {
  mode: 'input',        // 'input' = tout le monde repond | 'buzzer' = premier au buzzer
  rounds: 12,
  clip: 25,             // duree d'ecoute en secondes (extrait Deezer = 30 s max)
  guessArtist: true,
  pointsTitle: 3,
  pointsArtist: 3,
  speedBonus: 2,        // bonus max par champ, degressif dans le temps
  buzzerPoints: 5,
  buzzDelay: 3,         // secondes d'ecoute imposees avant d'ouvrir le buzzer
  buzzAnswerTime: 5,    // secondes laissees au buzzeur pour donner sa reponse
  playerAudio: false,   // diffuser aussi l'extrait sur les telephones
  revealDelay: 9,       // duree de l'ecran de reponse
  autoNext: true,
};

const AVATARS = ['🦊', '🐼', '🐸', '🦁', '🐙', '🦄', '🐝', '🦉', '🐨', '🦋', '🐳', '🦖', '🐧', '🦩', '🐢', '🦔', '🐺', '🦚', '🐹', '🦜'];

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const token = () => crypto.randomBytes(16).toString('hex');

function makeCode(taken) {
  for (let attempt = 0; attempt < 500; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    if (!taken.has(code)) return code;
  }
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function cleanName(raw) {
  const name = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 18);
  return name || 'Anonyme';
}

class Room {
  constructor(code) {
    this.code = code;
    this.hostToken = token();
    this.createdAt = Date.now();
    this.touchedAt = Date.now();
    this.players = new Map();
    this.settings = { ...DEFAULT_SETTINGS };
    this.playlist = null;      // { id, title, emoji, accent, subtitle, tracks: [] }
    this.customTracks = [];
    this.queue = [];
    this.index = -1;
    this.phase = 'lobby';      // lobby | countdown | playing | buzzed | reveal | scores | ended
    this.round = null;
    this.audioTarget = 'screen';
    this.timers = new Set();
    this.hostOnline = false;
    this.screenOnline = 0;
    this.history = [];
    this.connectedCount = 0;      // tenu a jour, plutot que recompte a chaque fois
    this.playedTrackIds = new Set();   // memoire des parties precedentes du salon
    this.broadcastTimer = null;
    this.dirty = false;
  }

  touch() { this.touchedAt = Date.now(); }

  clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  after(ms, fn) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      try { fn(); } catch (err) { console.error('[timer]', err); }
    }, Math.max(0, ms));
    this.timers.add(t);
    return t;
  }

  get connectedPlayers() {
    return [...this.players.values()].filter((p) => p.connected);
  }

  /** Salle Socket.IO propre a un joueur, pour lui envoyer sa ligne a lui. */
  playerRoom(playerId) {
    return `${this.code}:p:${playerId}`;
  }
}

class GameServer {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    this.playersBySocket = new Map();
    setInterval(() => this.sweep(), 10 * 60 * 1000).unref?.();
  }

  /* ---------------------------------------------------------------- */
  /* Cycle de vie des salons                                          */
  /* ---------------------------------------------------------------- */

  createRoom() {
    const room = new Room(makeCode(this.rooms));
    this.rooms.set(room.code, room);
    metrics.roomsCreated.inc();
    return room;
  }

  get(code) {
    const room = this.rooms.get(String(code || '').toUpperCase().trim());
    if (room) room.touch();
    return room || null;
  }

  destroy(room) {
    room.clearTimers();
    if (room.broadcastTimer) clearTimeout(room.broadcastTimer);
    this.rooms.delete(room.code);
  }

  sweep() {
    const now = Date.now();
    for (const room of [...this.rooms.values()]) {
      const idle = now - room.touchedAt > ROOM_TTL_MS;
      const empty = !room.hostOnline && room.connectedCount === 0 && now - room.touchedAt > 20 * 60 * 1000;
      if (idle || empty) this.destroy(room);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Joueurs                                                          */
  /* ---------------------------------------------------------------- */

  addPlayer(room, rawName) {
    if (room.players.size >= MAX_PLAYERS) throw new Error('La partie est complete.');
    let name = cleanName(rawName);
    const used = new Set([...room.players.values()].map((p) => p.name.toLowerCase()));
    if (used.has(name.toLowerCase())) {
      let i = 2;
      while (used.has(`${name} ${i}`.toLowerCase())) i++;
      name = `${name} ${i}`;
    }
    const player = {
      id: crypto.randomUUID(),
      token: token(),
      name,
      avatar: AVATARS[room.players.size % AVATARS.length],
      score: 0,
      connected: true,
      lastGain: 0,
      joinedAt: Date.now(),
    };
    room.players.set(player.id, player);
    room.connectedCount += 1;
    metrics.playersJoined.inc();
    return player;
  }

  /** Un joueur quitte de lui-meme : on le retire pour que les compteurs collent. */
  removePlayer(room, playerId) {
    const player = room.players.get(playerId);
    if (!player) return false;
    if (player.connected) room.connectedCount = Math.max(0, room.connectedCount - 1);
    room.players.delete(playerId);
    room.round?.answers.delete(playerId);
    room.round?.lockedOut.delete(playerId);
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* Selection de la playlist                                         */
  /* ---------------------------------------------------------------- */

  async setPlaylist(room, spec) {
    if (spec.type === 'catalog') {
      const cat = catalog.getCategory(spec.id);
      if (!cat) throw new Error('Liste inconnue.');
      const tracks = await catalog.buildCategory(cat.id);
      if (tracks.length < 5) throw new Error('Impossible de charger cette liste (Deezer indisponible ?).');
      room.playlist = {
        id: cat.id, title: cat.title, emoji: cat.emoji,
        subtitle: cat.subtitle, accent: cat.accent, source: 'catalog', tracks,
      };
      metrics.playlistSelections.inc({ source: 'catalog', id: cat.id });
    } else if (spec.type === 'deezer') {
      const id = String(spec.id || '').match(/(\d{3,})/)?.[1];
      if (!id) throw new Error('Identifiant de playlist Deezer invalide.');
      const dzApi = require('./deezer');
      const pl = await dzApi.playlistTracks(id);
      const tracks = catalog.diversify(catalog.shuffle(pl.tracks), 3);
      if (tracks.length < 5) throw new Error('Cette playlist Deezer n\'a pas assez d\'extraits jouables.');
      room.playlist = {
        id: `dz-${id}`, title: pl.title, emoji: '🎧',
        subtitle: 'Playlist Deezer importee', accent: '#22D3EE', source: 'deezer', tracks,
      };
      metrics.playlistSelections.inc({ source: 'deezer', id: 'import' });
    } else if (spec.type === 'spotify') {
      if (!spotify.enabled()) throw new Error('Spotify n\'est pas configure sur ce serveur.');
      const id = spotify.parsePlaylistId(spec.id);
      if (!id) throw new Error('Lien de playlist Spotify invalide.');

      // Le nom d'abord : l'animateur voit tout de suite ce qu'il charge.
      const info = await spotify.playlistInfo(id);
      const key = `sp-${id}`;
      room.playlist = {
        id: key, title: info.name, emoji: '🟢',
        subtitle: 'Lecture de la playlist…', accent: '#1DB954',
        source: 'spotify', tracks: [], pending: true,
      };
      this.broadcastNow(room);

      // Retrouver chaque morceau chez Deezer prend une vingtaine de secondes :
      // on montre l'avancement plutot qu'un ecran fige.
      const entries = await spotify.playlistItems(id, spotify.MAX_TRACKS);
      const tracks = await spotify.resolvePlayable(entries, (done, total, found) => {
        if (room.playlist?.id !== key) return;   // l'animateur a change d'avis entre-temps
        room.playlist.subtitle = `${done}/${total} morceaux verifies • ${found} jouables`;
        this.broadcast(room);
      });

      const usable = catalog.diversify(catalog.shuffle(tracks), 4);
      if (usable.length < 5) {
        room.playlist = null;
        this.broadcastNow(room);
        throw new Error(`Seulement ${usable.length} morceaux jouables sur ${entries.length} : trop peu pour une partie.`);
      }
      room.playlist = {
        id: key, title: info.name, emoji: '🟢',
        subtitle: `${usable.length} titres jouables sur ${entries.length}`,
        accent: '#1DB954', source: 'spotify', tracks: usable, pending: false,
      };
      metrics.playlistSelections.inc({ source: 'spotify', id: 'import' });
    } else if (spec.type === 'youtube') {
      const listId = youtube.parsePlaylistId(spec.id);
      if (!listId) throw new Error('Lien de playlist YouTube invalide (il faut le parametre « list »).');
      if (!this.audioDeviceOnline(room)) {
        throw new Error(this.audioTargetLabel(room) + ' n\'est pas connecte : c\'est lui qui charge la playlist.');
      }
      // Sans cle API, le serveur ne peut pas lister la playlist : le lecteur
      // YouTube du terminal audio s'en charge et nous renvoie les identifiants.
      room.playlist = {
        id: `yt-${listId}`, title: 'Playlist YouTube', emoji: '▶️',
        subtitle: 'Chargement par le lecteur…', accent: '#FF3D46',
        source: 'youtube', ytPlaylistId: listId, tracks: [], pending: true,
      };
      this.io.to(this.audioRoom(room)).emit('youtube:load', { playlistId: listId });
      metrics.playlistSelections.inc({ source: 'youtube', id: 'import' });
      return room.playlist;
    } else if (spec.type === 'custom') {
      const tracks = catalog.diversify(room.customTracks, 99);
      if (tracks.length < 3) throw new Error('Ajoute au moins 3 titres a ta selection.');
      room.playlist = {
        id: 'custom', title: 'Ma selection', emoji: '⭐',
        subtitle: `${tracks.length} titres choisis a la main`, accent: '#FBBF24', source: 'custom', tracks,
      };
      metrics.playlistSelections.inc({ source: 'custom', id: 'custom' });
    } else {
      throw new Error('Type de liste inconnu.');
    }
    room.settings.rounds = clamp(room.settings.rounds, 3, room.playlist.tracks.length);
    return room.playlist;
  }

  /** Reconstruit la liste courante depuis la source, en ignorant le cache. */
  async refreshPlaylist(room) {
    const pl = room.playlist;
    if (!pl) throw new Error('Aucune liste a actualiser.');
    if (pl.source !== 'catalog') throw new Error('Seules les listes pretes se reconstruisent.');
    const tracks = await catalog.buildCategory(pl.id, { force: true });
    if (tracks.length < 5) throw new Error('Reconstruction impossible (Deezer indisponible ?).');
    pl.tracks = tracks;
    pl.subtitle = `${tracks.length} titres, tout juste actualises`;
    room.settings.rounds = clamp(room.settings.rounds, 3, tracks.length);
    // La memoire des morceaux joues repart : le vivier n'est plus le meme.
    room.playedTrackIds = new Set();
    this.broadcast(room);
    return tracks.length;
  }

  updateSettings(room, patch) {
    const s = room.settings;
    if (patch.mode === 'input' || patch.mode === 'buzzer') s.mode = patch.mode;
    if (patch.rounds !== undefined) s.rounds = clamp(Math.round(+patch.rounds || 0), 3, 40);
    if (patch.clip !== undefined) s.clip = clamp(Math.round(+patch.clip || 0), 5, 30);
    if (patch.guessArtist !== undefined) s.guessArtist = !!patch.guessArtist;
    if (patch.speedBonus !== undefined) s.speedBonus = clamp(Math.round(+patch.speedBonus || 0), 0, 6);
    if (patch.revealDelay !== undefined) s.revealDelay = clamp(Math.round(+patch.revealDelay || 0), 4, 30);
    if (patch.autoNext !== undefined) s.autoNext = !!patch.autoNext;
  if (patch.playerAudio !== undefined) {
    const before = s.playerAudio;
    s.playerAudio = !!patch.playerAudio;
    // Coupure immediate si on desactive en pleine manche
    if (before && !s.playerAudio) this.io.to(`${room.code}:player`).emit('audio', { action: 'stop' });
  }
    if (patch.buzzerPoints !== undefined) s.buzzerPoints = clamp(Math.round(+patch.buzzerPoints || 0), 1, 20);
  if (patch.buzzDelay !== undefined) s.buzzDelay = clamp(Math.round(+patch.buzzDelay || 0), 0, 15);
  if (patch.buzzAnswerTime !== undefined) s.buzzAnswerTime = clamp(Math.round(+patch.buzzAnswerTime || 0), 3, 30);
    if (room.playlist) s.rounds = clamp(s.rounds, 3, room.playlist.tracks.length);
    return s;
  }

  /* ---------------------------------------------------------------- */
  /* Deroulement de la partie                                         */
  /* ---------------------------------------------------------------- */

  /** Salle Socket.IO du terminal charge du son. */
  audioRoom(room) {
    return room.audioTarget === 'host' ? `${room.code}:host` : `${room.code}:screen`;
  }

  audioTargetLabel(room) {
    return room.audioTarget === 'host' ? 'La regie' : 'L\'ecran de diffusion';
  }

  audioDeviceOnline(room) {
    return room.audioTarget === 'host' ? room.hostOnline : room.screenOnline > 0;
  }

  /** Le terminal audio a lu la playlist YouTube et renvoie les identifiants. */
  setYoutubeVideos(room, playlistId, videoIds) {
    const pl = room.playlist;
    if (!pl || pl.source !== 'youtube' || pl.ytPlaylistId !== playlistId) return false;
    const ids = [...new Set((videoIds || []).filter((v) => typeof v === 'string' && v.length > 5))];
    pl.tracks = ids.map((id, i) => youtube.toTrack(id, i));
    pl.pending = false;
    pl.subtitle = `${pl.tracks.length} videos chargees`;
    if (pl.tracks.length) room.settings.rounds = clamp(room.settings.rounds, 3, pl.tracks.length);
    this.broadcast(room);
    return true;
  }

  /** Titre de la video en cours, remonte par le lecteur pour la correction. */
  setYoutubeMeta(room, { videoId, title, author }) {
    const track = room.round?.track;
    if (!track || track.source !== 'youtube' || track.videoId !== String(videoId)) return false;
    const parsed = youtube.parseVideoTitle(title, author);
    track.title = parsed.title;
    track.artist = parsed.artist;
    track.album = author ? youtube.cleanChannel(author) : '';
    this.broadcast(room);
    return true;
  }

  start(room) {
    if (!room.playlist) throw new Error('Choisis d\'abord une liste de morceaux.');
    if (room.playlist.pending) throw new Error('La playlist YouTube n\'est pas encore chargee.');
    if (room.connectedCount === 0) throw new Error('Aucun joueur connecte.');
    if (room.playlist.source === 'youtube' && !this.audioDeviceOnline(room)) {
      throw new Error(this.audioTargetLabel(room) + ' doit rester connecte pour lire YouTube.');
    }
    room.clearTimers();
    room.queue = this.pickQueue(room);
    room.index = -1;
    room.history = [];
    for (const p of room.players.values()) { p.score = 0; p.lastGain = 0; }
    metrics.gamesStarted.inc({ mode: room.settings.mode });
    this.nextRound(room);
  }

  /**
   * Compose la liste des manches.
   *
   * Deux regles, dans cet ordre : on sert d'abord ce que ce salon n'a jamais
   * entendu — sinon deux parties d'affilee se ressemblent — puis on limite a
   * deux titres par artiste, pour qu'une partie ne vire pas au monographique.
   */
  pickQueue(room) {
    const wanted = room.settings.rounds;
    const pool = catalog.shuffle(room.playlist.tracks);
    const played = room.playedTrackIds;

    const ordered = [
      ...pool.filter((t) => !played.has(t.id)),
      ...pool.filter((t) => played.has(t.id)),
    ];

    const queue = [];
    const perArtist = new Map();
    for (const track of ordered) {
      if (queue.length >= wanted) break;
      const key = normalize(track.artist || '');
      const seen = perArtist.get(key) || 0;
      if (key && seen >= 2) continue;
      perArtist.set(key, seen + 1);
      queue.push(track);
    }

    // Vivier trop etroit pour tenir la contrainte : on complete sans elle.
    if (queue.length < wanted) {
      const taken = new Set(queue.map((t) => t.id));
      for (const track of ordered) {
        if (queue.length >= wanted) break;
        if (!taken.has(track.id)) { queue.push(track); taken.add(track.id); }
      }
    }

    for (const track of queue) played.add(track.id);
    // On borne la memoire : au-dela, les plus anciens redeviennent jouables.
    if (played.size > 400) {
      room.playedTrackIds = new Set([...played].slice(-300));
    }
    return queue;
  }

  nextRound(room) {
    room.clearTimers();
    room.index += 1;
    if (room.index >= room.queue.length) return this.finish(room);

    const track = room.queue[room.index];
    const now = Date.now();
    room.phase = 'countdown';
    room.round = {
      track,
      startAt: now + COUNTDOWN_MS,
      durationMs: room.settings.clip * 1000,
      endAt: now + COUNTDOWN_MS + room.settings.clip * 1000,
      remainingMs: room.settings.clip * 1000,
      answers: new Map(),
      doneCount: 0,
      buzz: null,
      answerDeadline: null,
      lockedOut: new Set(),
      results: null,
    };
    for (const p of room.players.values()) p.lastGain = 0;

    this.cueTrack(room, track);

    // Indispensable : sans ca, chaque joueur garde le badge de reponse de la
    // manche precedente et se retrouve bloque, comme s'il avait deja repondu.
    this.sendPersonal(room);

    room.after(COUNTDOWN_MS, () => {
      room.phase = 'playing';
      this.broadcastNow(room);
      room.after(room.round.durationMs, () => this.reveal(room, 'timeout'));
    });

    this.broadcastNow(room);
  }

  /**
   * Envoie l'ordre de lecture, apres avoir re-resolu l'URL de l'extrait.
   * Le compte a rebours laisse le temps de l'appel ; au-dela, on part sur
   * l'URL connue plutot que de retarder la manche.
   */
  cueTrack(room, track) {
    // Lecture directe YouTube : pas d'extrait a re-resoudre, le lecteur du
    // terminal audio se charge de tout a partir de l'identifiant de video.
    if (track.source === 'youtube') {
      this.sendAudio(room, {
        action: 'play',
        kind: 'youtube',
        videoId: track.videoId,
        startAt: room.round.startAt,
        durationMs: room.round.durationMs,
        index: room.index,
      });
      return;
    }

    const send = (preview) => {
      if (!room.round || room.round.track !== track) return; // manche deja passee
      this.sendAudio(room, {
        action: 'play',
        preview,
        startAt: room.round.startAt,
        durationMs: room.round.durationMs,
        index: room.index,
      });
    };

    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), COUNTDOWN_MS - 600));
    Promise.race([deezer.freshPreview(track.id).catch(() => null), timeout])
      .then((url) => {
        if (url) {
          track.preview = url;
          metrics.previewRefresh.inc({ result: 'refreshed' });
        } else {
          metrics.previewRefresh.inc({ result: 'fallback' });
        }
        send(track.preview);
      });
  }

  /**
   * Demande-t-on l'artiste sur cette manche ?
   *
   * Les titres YouTube n'en contiennent pas toujours (« Trois nuits par
   * semaine » sans nom d'artiste) : exiger un artiste inconnaissable
   * condamnerait la moitie des points. On decide donc manche par manche.
   */
  asksArtist(room) {
    if (!room.settings.guessArtist) return false;
    return Boolean(room.round?.track?.artist);
  }

  ratioAt(room, at) {
    if (!room.round) return 0;
    const elapsed = at - room.round.startAt;
    return clamp(1 - elapsed / room.round.durationMs, 0, 1);
  }

  submitAnswer(room, player, { title, artist }) {
    if (room.phase !== 'playing' || room.settings.mode !== 'input') return null;
    const now = Date.now();
    const r = room.round;
    let ans = r.answers.get(player.id);
    if (!ans) {
      ans = { titleOk: false, artistOk: false, titleAt: 0, artistAt: 0, title: '', artist: '', tries: 0, lastAt: 0 };
      r.answers.set(player.id, ans);
    }
    // Garde-fou : a deux mille joueurs, un client qui s'emballe ne doit pas
    // pouvoir saturer la boucle du serveur.
    if (now - ans.lastAt < ANSWER_THROTTLE_MS) {
      return { titleOk: ans.titleOk, artistOk: ans.artistOk, found: null, throttled: true };
    }
    ans.lastAt = now;
    ans.tries += 1;
    if (title) ans.title = String(title).slice(0, 80);
    if (artist) ans.artist = String(artist).slice(0, 80);

    const needArtist = this.asksArtist(room);
    const wasDone = ans.titleOk && (!needArtist || ans.artistOk);

    let found = null;
    if (!ans.titleOk && title) {
      if (matchTitle(title, r.track.title)) {
        ans.titleOk = true; ans.titleAt = now; found = 'title';
        metrics.answersTotal.inc({ field: 'title', result: 'hit' });
        metrics.answerLatency.observe({ field: 'title' }, (now - r.startAt) / 1000);
      } else {
        metrics.answersTotal.inc({ field: 'title', result: 'miss' });
      }
    }
    if (needArtist && !ans.artistOk && artist) {
      if (matchArtist(artist, r.track.artist, r.track.contributors)) {
        ans.artistOk = true; ans.artistAt = now; found = found ? 'both' : 'artist';
        metrics.answersTotal.inc({ field: 'artist', result: 'hit' });
        metrics.answerLatency.observe({ field: 'artist' }, (now - r.startAt) / 1000);
      } else {
        metrics.answersTotal.inc({ field: 'artist', result: 'miss' });
      }
    }
    // Compteur incremental : inutile de reparcourir tous les joueurs a chaque reponse.
    if (found && !wasDone && ans.titleOk && (!needArtist || ans.artistOk)) r.doneCount += 1;

    // Un champ vient d'etre trouve : le joueur doit le voir se verrouiller, et
    // le retrouver verrouille s'il rafraichit sa page. Au plus deux fois par
    // manche et par joueur, donc sans consequence a grande echelle.
    if (found) this.sendPersonalTo(room, player.id);

    this.broadcast(room);
    if (this.everyoneDone(room)) room.after(600, () => this.reveal(room, 'complete'));
    return { titleOk: ans.titleOk, artistOk: ans.artistOk, found };
  }

  everyoneDone(room) {
    if (!room.round || room.connectedCount === 0) return false;
    return room.round.doneCount >= room.connectedCount;
  }

  /** Instant a partir duquel le buzzer s'ouvre sur la manche en cours. */
  buzzOpensAt(room) {
    if (!room.round) return Infinity;
    return room.round.startAt + room.settings.buzzDelay * 1000;
  }

  /**
   * Prise du buzzer. Renvoie la raison d'un refus pour que le joueur sache
   * pourquoi son appui n'a rien donne.
   */
  buzz(room, player) {
    if (room.settings.mode !== 'buzzer' || !room.round) return { accepted: false, reason: 'closed' };
    // « Deja pris » d'abord : c'est le refus le plus parlant, et la phase est
    // deja passee a `buzzed` quand un second joueur appuie dans la foulee.
    if (room.round.buzz) {
      metrics.buzzRejected.inc({ reason: 'taken' });
      return { accepted: false, reason: 'taken' };
    }
    if (room.phase !== 'playing') return { accepted: false, reason: 'closed' };
    if (room.round.lockedOut.has(player.id)) {
      metrics.buzzRejected.inc({ reason: 'locked_out' });
      return { accepted: false, reason: 'locked_out' };
    }

    const now = Date.now();
    // Anti-reflexe : quelques secondes d'ecoute imposees avant d'autoriser le buzz.
    if (now < this.buzzOpensAt(room)) {
      metrics.buzzRejected.inc({ reason: 'too_early' });
      return { accepted: false, reason: 'too_early' };
    }

    room.round.buzz = { playerId: player.id, name: player.name, avatar: player.avatar, at: now };
    metrics.buzzesTotal.inc();
    room.round.remainingMs = Math.max(0, room.round.endAt - now);
    room.clearTimers();
    room.phase = 'buzzed';
    this.sendAudio(room, { action: 'pause' });

    // Le buzzeur a un temps limite pour repondre : sans arbitrage de
    // l'animateur, la manche repart plutot que de rester suspendue.
    room.round.answerDeadline = now + room.settings.buzzAnswerTime * 1000;
    room.after(room.settings.buzzAnswerTime * 1000, () => this.judge(room, { ok: false, timedOut: true }));

    this.broadcastNow(room);
    return { accepted: true, reason: null };
  }

  judge(room, { ok, points, timedOut = false }) {
    if (room.phase !== 'buzzed' || !room.round.buzz) return;
    room.clearTimers();                       // annule le compte a rebours de reponse
    room.round.answerDeadline = null;
    const player = room.players.get(room.round.buzz.playerId);
    metrics.buzzVerdicts.inc({ verdict: ok ? 'good' : timedOut ? 'timeout' : 'bad' });
    if (ok) {
      const gain = clamp(Math.round(+points || room.settings.buzzerPoints), 0, 50);
      if (player) { player.score += gain; player.lastGain = gain; }
      room.round.answers.set(room.round.buzz.playerId, {
        titleOk: true, artistOk: true, titleAt: room.round.buzz.at, artistAt: room.round.buzz.at,
        title: room.round.track.title, artist: room.round.track.artist, tries: 1, manual: gain,
      });
      this.reveal(room, 'buzzer');
    } else {
      room.round.lockedOut.add(room.round.buzz.playerId);
      if (player) player.lastGain = 0;
      this.sendPersonalTo(room, room.round.buzz.playerId);
      room.round.buzz = null;
      const remaining = room.round.remainingMs;
      if (remaining <= 400) return this.reveal(room, 'timeout');
      room.phase = 'playing';
      room.round.endAt = Date.now() + remaining;
      this.sendAudio(room, { action: 'resume' });
      room.after(remaining, () => this.reveal(room, 'timeout'));
      this.broadcastNow(room);
    }
  }

  computeResults(room) {
    const s = room.settings;
    const r = room.round;
    const needArtist = this.asksArtist(room);
    const results = [];
    for (const player of room.players.values()) {
      const a = r.answers.get(player.id);
      if (!a) { results.push({ playerId: player.id, name: player.name, avatar: player.avatar, gained: 0, titleOk: false, artistOk: false, guessTitle: '', guessArtist: '' }); continue; }
      let gained = 0;
      if (a.manual !== undefined) {
        gained = a.manual;
      } else {
        if (a.titleOk) gained += s.pointsTitle + Math.round(s.speedBonus * this.ratioAt(room, a.titleAt));
        if (needArtist && a.artistOk) gained += s.pointsArtist + Math.round(s.speedBonus * this.ratioAt(room, a.artistAt));
        player.score += gained;
      }
      player.lastGain = gained;
      if (gained > 0) metrics.pointsAwarded.inc(gained);
      results.push({
        playerId: player.id, name: player.name, avatar: player.avatar, gained,
        titleOk: !!a.titleOk, artistOk: !!a.artistOk,
        guessTitle: a.title || '', guessArtist: a.artist || '',
        ms: a.titleAt ? a.titleAt - r.startAt : null,
      });
    }
    results.sort((x, y) => y.gained - x.gained || x.name.localeCompare(y.name));
    return results;
  }

  reveal(room, reason = 'timeout') {
    if (!room.round || room.phase === 'reveal' || room.phase === 'scores' || room.phase === 'ended') return;
    room.clearTimers();
    room.phase = 'reveal';
    metrics.roundsFinished.inc({ reason });
    room.round.results = this.computeResults(room);
    room.round.reason = reason;
    // On ne garde que l'essentiel : douze manches de deux mille resultats
    // n'ont aucun interet en memoire.
    room.history.push({
      track: this.trackCard(room.round.track),
      topGains: room.round.results.filter((r) => r.gained > 0).slice(0, TOP_GAINS_SIZE),
    });
    this.sendAudio(room, { action: 'stop' });
    this.broadcastNow(room);
    this.sendPersonal(room);

    if (!room.settings.autoNext) return;
    const isLast = room.index >= room.queue.length - 1;
    const showBoard = !isLast && (room.index + 1) % SCOREBOARD_EVERY === 0;
    room.after(room.settings.revealDelay * 1000, () => {
      if (showBoard) {
        room.phase = 'scores';
        this.broadcastNow(room);
        room.after(6500, () => this.nextRound(room));
      } else {
        this.nextRound(room);
      }
    });
  }

  finish(room) {
    room.clearTimers();
    metrics.gamesFinished.inc();
    room.phase = 'ended';
    room.round = null;
    this.sendAudio(room, { action: 'stop' });
    this.broadcastNow(room);
    this.sendPersonal(room);
  }

  backToLobby(room) {
    room.clearTimers();
    room.phase = 'lobby';
    room.round = null;
    room.index = -1;
    room.queue = [];
    room.history = [];
    for (const p of room.players.values()) { p.score = 0; p.lastGain = 0; }
    this.sendAudio(room, { action: 'stop' });
    this.broadcastNow(room);
    this.sendPersonal(room);
  }

  /* ---------------------------------------------------------------- */
  /* Diffusion d'etat                                                 */
  /* ---------------------------------------------------------------- */

  /** Ligne publique d'un joueur. */
  playerRow(room, player, withGuesses = false) {
    const row = {
      id: player.id, name: player.name, avatar: player.avatar, score: player.score,
      connected: player.connected, lastGain: player.lastGain,
      answered: this.answerBadge(room, player.id),
    };
    if (withGuesses) {
      const a = room.round?.answers.get(player.id);
      row.guessTitle = a?.title || '';
      row.guessArtist = a?.artist || '';
    }
    return row;
  }

  /**
   * Classement borne — jamais la liste complete.
   *
   * Au salon on montre les derniers arrives : c'est ce qu'on regarde en
   * attendant. En jeu, les meilleurs.
   */
  leaderboard(room, size, withGuesses = false) {
    const players = [...room.players.values()];
    if (room.phase === 'lobby') players.sort((a, b) => b.joinedAt - a.joinedAt);
    else players.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    return players.slice(0, size).map((p) => this.playerRow(room, p, withGuesses));
  }

  counts(room) {
    return {
      players: room.players.size,
      connected: room.connectedCount,
      answered: room.round ? room.round.answers.size : 0,
      done: room.round ? room.round.doneCount : 0,
    };
  }

  answerBadge(room, playerId) {
    const a = room.round?.answers.get(playerId);
    if (!a) return null;
    return { titleOk: !!a.titleOk, artistOk: !!a.artistOk, tries: a.tries || 0 };
  }

  /** Ce que chaque joueur recoit sur son propre canal : sa ligne, son rang. */
  youPayload(room, player, rank) {
    return {
      id: player.id, name: player.name, avatar: player.avatar,
      score: player.score, rank, lastGain: player.lastGain,
      answered: this.answerBadge(room, player.id),
      lockedOut: Boolean(room.round?.lockedOut.has(player.id)),
    };
  }

  /** Une seule passe de tri pour servir tout le monde. */
  sendPersonal(room) {
    const sorted = [...room.players.values()]
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    sorted.forEach((player, i) => {
      this.io.to(room.playerRoom(player.id)).emit('you', this.youPayload(room, player, i + 1));
    });
  }

  sendPersonalTo(room, playerId) {
    const player = room.players.get(playerId);
    if (!player) return null;
    let rank = 1;
    for (const other of room.players.values()) if (other.score > player.score) rank += 1;
    const payload = this.youPayload(room, player, rank);
    this.io.to(room.playerRoom(playerId)).emit('you', payload);
    return payload;
  }

  baseState(room) {
    return {
      code: room.code,
      phase: room.phase,
      settings: room.settings,
      audioTarget: room.audioTarget,
      screenOnline: room.screenOnline,
      hostOnline: room.hostOnline,
      playlist: room.playlist && {
        id: room.playlist.id, title: room.playlist.title, emoji: room.playlist.emoji,
        subtitle: room.playlist.subtitle, accent: room.playlist.accent,
        total: room.playlist.tracks.length,
        source: room.playlist.source, pending: !!room.playlist.pending,
      },
      counts: this.counts(room),
      round: room.round && {
        index: room.index, total: room.queue.length,
        startAt: room.round.startAt, endAt: room.round.endAt,
        durationMs: room.round.durationMs,
        buzz: room.round.buzz,
        answerDeadline: room.round.answerDeadline,
        lockedOut: [...room.round.lockedOut],
        answeredCount: room.round.answers.size,
        buzzOpensAt: this.buzzOpensAt(room),
        askArtist: this.asksArtist(room),
        reason: room.round.reason || null,
      },
      serverNow: Date.now(),
    };
  }

  publicState(room) {
    const state = this.baseState(room);
    state.leaderboard = this.leaderboard(room, LEADERBOARD_SIZE);
    const revealing = room.phase === 'reveal' || room.phase === 'scores';
    if (room.round && revealing) {
      state.round.track = this.trackCard(room.round.track);
      state.round.topGains = (room.round.results || [])
        .filter((r) => r.gained > 0)
        .slice(0, TOP_GAINS_SIZE);
    }
    if (room.phase === 'ended') state.podium = this.leaderboard(room, PODIUM_SIZE);
    return state;
  }

  hostState(room) {
    const state = this.publicState(room);
    // La regie voit plus de monde, et les reponses tapees — mais toujours borne.
    state.leaderboard = this.leaderboard(room, HOST_LIST_SIZE, true);
    if (room.round && !state.round.track) state.round.track = this.trackCard(room.round.track);
    state.upcoming = room.queue.slice(room.index + 1, room.index + 4).map((t) => this.trackCard(t));
    state.customCount = room.customTracks.length;
    return state;
  }

  trackCard(t) {
    if (!t) return null;
    return {
      id: t.id, title: t.title, artist: t.artist, album: t.album,
      cover: t.cover, coverFallback: t.coverFallback || '', link: t.link,
    };
  }

  /**
   * Diffusion regroupee. Les evenements arrivent en rafale — deux mille
   * joueurs qui rejoignent, ou qui repondent dans la meme seconde — et il
   * serait absurde de re-serialiser l'etat a chaque fois.
   */
  broadcast(room) {
    room.touch();
    if (room.broadcastTimer) return;
    room.broadcastTimer = setTimeout(() => {
      room.broadcastTimer = null;
      this.flush(room);
    }, BROADCAST_INTERVAL_MS);
  }

  /** Changement de phase : tout le monde doit basculer sans attendre. */
  broadcastNow(room) {
    room.touch();
    this.flush(room);
  }

  flush(room) {
    if (room.broadcastTimer) {
      clearTimeout(room.broadcastTimer);
      room.broadcastTimer = null;
    }
    this.io.to(`${room.code}:public`).emit('state', this.publicState(room));
    this.io.to(`${room.code}:host`).emit('state', this.hostState(room));
  }

  /**
   * Envoie l'ordre de lecture au terminal charge du son — et, si l'animateur
   * l'a demande, aux telephones des joueurs. Tout le monde part du meme
   * horodatage absolu, donc les lectures restent alignees.
   */
  sendAudio(room, payload) {
    const target = room.audioTarget === 'host' ? `${room.code}:host` : `${room.code}:screen`;
    this.io.to(target).emit('audio', payload);

    // Les extraits Deezer peuvent etre diffuses sur les telephones ; une video
    // YouTube ne peut pas etre repliquee proprement sur vingt appareils.
    if (room.settings.playerAudio && payload.kind !== 'youtube') {
      this.io.to(`${room.code}:player`).emit('audio', payload);
    }

    // L'autre terminal doit couper le son s'il en jouait
    const other = room.audioTarget === 'host' ? `${room.code}:screen` : `${room.code}:host`;
    if (payload.action === 'play') this.io.to(other).emit('audio', { action: 'stop' });
  }
}

module.exports = { GameServer, Room, DEFAULT_SETTINGS, AVATARS, cleanName };
