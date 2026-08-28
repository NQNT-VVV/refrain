'use strict';

const crypto = require('crypto');
const { matchTitle, matchArtist } = require('./match');
const catalog = require('./catalog');

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans O/0/I/1/L
const MAX_PLAYERS = 60;
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
    return room;
  }

  get(code) {
    const room = this.rooms.get(String(code || '').toUpperCase().trim());
    if (room) room.touch();
    return room || null;
  }

  destroy(room) {
    room.clearTimers();
    this.rooms.delete(room.code);
  }

  sweep() {
    const now = Date.now();
    for (const room of [...this.rooms.values()]) {
      const idle = now - room.touchedAt > ROOM_TTL_MS;
      const empty = !room.hostOnline && room.connectedPlayers.length === 0 && now - room.touchedAt > 20 * 60 * 1000;
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
    return player;
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
    } else if (spec.type === 'custom') {
      const tracks = catalog.diversify(room.customTracks, 99);
      if (tracks.length < 3) throw new Error('Ajoute au moins 3 titres a ta selection.');
      room.playlist = {
        id: 'custom', title: 'Ma selection', emoji: '⭐',
        subtitle: `${tracks.length} titres choisis a la main`, accent: '#FBBF24', source: 'custom', tracks,
      };
    } else {
      throw new Error('Type de liste inconnu.');
    }
    room.settings.rounds = clamp(room.settings.rounds, 3, room.playlist.tracks.length);
    return room.playlist;
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
    if (patch.buzzerPoints !== undefined) s.buzzerPoints = clamp(Math.round(+patch.buzzerPoints || 0), 1, 20);
    if (room.playlist) s.rounds = clamp(s.rounds, 3, room.playlist.tracks.length);
    return s;
  }

  /* ---------------------------------------------------------------- */
  /* Deroulement de la partie                                         */
  /* ---------------------------------------------------------------- */

  start(room) {
    if (!room.playlist) throw new Error('Choisis d\'abord une liste de morceaux.');
    if (room.connectedPlayers.length === 0) throw new Error('Aucun joueur connecte.');
    room.clearTimers();
    room.queue = catalog.shuffle(room.playlist.tracks).slice(0, room.settings.rounds);
    room.index = -1;
    room.history = [];
    for (const p of room.players.values()) { p.score = 0; p.lastGain = 0; }
    this.nextRound(room);
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
      buzz: null,
      lockedOut: new Set(),
      results: null,
    };
    for (const p of room.players.values()) p.lastGain = 0;

    this.sendAudio(room, {
      action: 'play',
      preview: track.preview,
      startAt: room.round.startAt,
      durationMs: room.round.durationMs,
      index: room.index,
    });

    room.after(COUNTDOWN_MS, () => {
      room.phase = 'playing';
      this.broadcast(room);
      room.after(room.round.durationMs, () => this.reveal(room, 'timeout'));
    });

    this.broadcast(room);
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
      ans = { titleOk: false, artistOk: false, titleAt: 0, artistAt: 0, title: '', artist: '', tries: 0 };
      r.answers.set(player.id, ans);
    }
    ans.tries += 1;
    if (title) ans.title = String(title).slice(0, 80);
    if (artist) ans.artist = String(artist).slice(0, 80);

    let found = null;
    if (!ans.titleOk && title && matchTitle(title, r.track.title)) {
      ans.titleOk = true; ans.titleAt = now; found = 'title';
    }
    if (room.settings.guessArtist && !ans.artistOk && artist
        && matchArtist(artist, r.track.artist, r.track.contributors)) {
      ans.artistOk = true; ans.artistAt = now; found = found ? 'both' : 'artist';
    }
    this.broadcast(room);
    if (this.everyoneDone(room)) room.after(600, () => this.reveal(room, 'complete'));
    return { titleOk: ans.titleOk, artistOk: ans.artistOk, found };
  }

  everyoneDone(room) {
    const players = room.connectedPlayers;
    if (!players.length) return false;
    return players.every((p) => {
      const a = room.round.answers.get(p.id);
      return a && a.titleOk && (!room.settings.guessArtist || a.artistOk);
    });
  }

  buzz(room, player) {
    if (room.phase !== 'playing' || room.settings.mode !== 'buzzer') return false;
    if (room.round.buzz || room.round.lockedOut.has(player.id)) return false;
    const now = Date.now();
    room.round.buzz = { playerId: player.id, name: player.name, avatar: player.avatar, at: now };
    room.round.remainingMs = Math.max(0, room.round.endAt - now);
    room.clearTimers();
    room.phase = 'buzzed';
    this.sendAudio(room, { action: 'pause' });
    this.broadcast(room);
    return true;
  }

  judge(room, { ok, points }) {
    if (room.phase !== 'buzzed' || !room.round.buzz) return;
    const player = room.players.get(room.round.buzz.playerId);
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
      room.round.buzz = null;
      const remaining = room.round.remainingMs;
      if (remaining <= 400) return this.reveal(room, 'timeout');
      room.phase = 'playing';
      room.round.endAt = Date.now() + remaining;
      this.sendAudio(room, { action: 'resume' });
      room.after(remaining, () => this.reveal(room, 'timeout'));
      this.broadcast(room);
    }
  }

  computeResults(room) {
    const s = room.settings;
    const r = room.round;
    const results = [];
    for (const player of room.players.values()) {
      const a = r.answers.get(player.id);
      if (!a) { results.push({ playerId: player.id, name: player.name, avatar: player.avatar, gained: 0, titleOk: false, artistOk: false, guessTitle: '', guessArtist: '' }); continue; }
      let gained = 0;
      if (a.manual !== undefined) {
        gained = a.manual;
      } else {
        if (a.titleOk) gained += s.pointsTitle + Math.round(s.speedBonus * this.ratioAt(room, a.titleAt));
        if (s.guessArtist && a.artistOk) gained += s.pointsArtist + Math.round(s.speedBonus * this.ratioAt(room, a.artistAt));
        player.score += gained;
      }
      player.lastGain = gained;
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
    room.round.results = this.computeResults(room);
    room.round.reason = reason;
    room.history.push({ track: room.round.track, results: room.round.results });
    this.sendAudio(room, { action: 'stop' });
    this.broadcast(room);

    if (!room.settings.autoNext) return;
    const isLast = room.index >= room.queue.length - 1;
    const showBoard = !isLast && (room.index + 1) % SCOREBOARD_EVERY === 0;
    room.after(room.settings.revealDelay * 1000, () => {
      if (showBoard) {
        room.phase = 'scores';
        this.broadcast(room);
        room.after(6500, () => this.nextRound(room));
      } else {
        this.nextRound(room);
      }
    });
  }

  finish(room) {
    room.clearTimers();
    room.phase = 'ended';
    room.round = null;
    this.sendAudio(room, { action: 'stop' });
    this.broadcast(room);
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
    this.broadcast(room);
  }

  /* ---------------------------------------------------------------- */
  /* Diffusion d'etat                                                 */
  /* ---------------------------------------------------------------- */

  scoreboard(room) {
    return [...room.players.values()]
      .map((p) => ({
        id: p.id, name: p.name, avatar: p.avatar, score: p.score,
        connected: p.connected, lastGain: p.lastGain,
        answered: room.round ? this.answerBadge(room, p.id) : null,
      }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }

  answerBadge(room, playerId) {
    const a = room.round?.answers.get(playerId);
    if (!a) return null;
    return { titleOk: !!a.titleOk, artistOk: !!a.artistOk, tries: a.tries || 0 };
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
        subtitle: room.playlist.subtitle, accent: room.playlist.accent, total: room.playlist.tracks.length,
      },
      players: this.scoreboard(room),
      round: room.round && {
        index: room.index, total: room.queue.length,
        startAt: room.round.startAt, endAt: room.round.endAt,
        durationMs: room.round.durationMs,
        buzz: room.round.buzz,
        lockedOut: [...room.round.lockedOut],
        answeredCount: room.round.answers.size,
        reason: room.round.reason || null,
      },
      serverNow: Date.now(),
    };
  }

  publicState(room) {
    const state = this.baseState(room);
    const revealing = room.phase === 'reveal' || room.phase === 'scores';
    if (room.round && revealing) {
      state.round.track = this.trackCard(room.round.track);
      state.round.results = room.round.results;
    }
    if (room.phase === 'ended') state.podium = this.scoreboard(room);
    return state;
  }

  hostState(room) {
    const state = this.publicState(room);
    if (room.round && !state.round.track) state.round.track = this.trackCard(room.round.track);
    if (room.round && !state.round.results) {
      state.round.answers = [...room.round.answers.entries()].map(([playerId, a]) => ({
        playerId, titleOk: !!a.titleOk, artistOk: !!a.artistOk, title: a.title, artist: a.artist,
      }));
    }
    state.upcoming = room.queue.slice(room.index + 1, room.index + 4).map((t) => this.trackCard(t));
    state.customCount = room.customTracks.length;
    return state;
  }

  trackCard(t) {
    if (!t) return null;
    return { id: t.id, title: t.title, artist: t.artist, album: t.album, cover: t.cover, link: t.link };
  }

  broadcast(room) {
    room.touch();
    this.io.to(`${room.code}:public`).emit('state', this.publicState(room));
    this.io.to(`${room.code}:host`).emit('state', this.hostState(room));
  }

  /** Envoie l'ordre de lecture uniquement au terminal charge du son. */
  sendAudio(room, payload) {
    const target = room.audioTarget === 'host' ? `${room.code}:host` : `${room.code}:screen`;
    this.io.to(target).emit('audio', payload);
    // L'autre terminal doit couper le son s'il en jouait
    const other = room.audioTarget === 'host' ? `${room.code}:screen` : `${room.code}:host`;
    if (payload.action === 'play') this.io.to(other).emit('audio', { action: 'stop' });
  }
}

module.exports = { GameServer, Room, DEFAULT_SETTINGS, AVATARS, cleanName };
