'use strict';

const path = require('path');
const os = require('os');
const express = require('express');
const http = require('http');
const next = require('next');
const { Server } = require('socket.io');
const QRCode = require('qrcode');

const catalog = require('./catalog');
const deezer = require('./deezer');
const { GameServer, cleanName } = require('./game');
const spotify = require('./spotify');
const metrics = require('./metrics');

const PORT = Number(process.env.PORT) || 3000;
const METRICS_PORT = Number(process.env.METRICS_PORT) || 9464;
const ROOT_DIR = path.join(__dirname, '..');
const dev = process.env.NODE_ENV !== 'production';

// Next rend les pages ; Express garde l'API et Socket.IO sur le meme serveur HTTP.
const nextApp = next({ dev, dir: ROOT_DIR });
const renderPage = nextApp.getRequestHandler();

const app = express();
app.use(express.json({ limit: '1mb' }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, pingTimeout: 20000 });
const game = new GameServer(io);
metrics.bind(game, io);

/* ------------------------------------------------------------------ */
/* API                                                                */
/* ------------------------------------------------------------------ */

app.get('/api/catalog', (req, res) => {
  res.json({ categories: catalog.listCategories() });
});

app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ tracks: [] });
  try {
    const tracks = await deezer.searchTracks(q, 20);
    res.json({ tracks: tracks.map((t) => ({ id: t.id, title: t.title, artist: t.artist, album: t.album, cover: t.cover, preview: t.preview })) });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/api/qr', async (req, res) => {
  const text = String(req.query.text || '').slice(0, 512);
  if (!text) return res.status(400).send('parametre "text" manquant');
  try {
    const svg = await QRCode.toString(text, {
      type: 'svg', margin: 1, errorCorrectionLevel: 'M',
      color: { dark: String(req.query.dark || '#0B0A14'), light: String(req.query.light || '#FFFFFF') },
    });
    res.type('image/svg+xml').set('Cache-Control', 'public, max-age=3600').send(svg);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/** Ce que ce serveur sait faire : l'interface s'y adapte. */
app.get('/api/sources', (req, res) => {
  res.json({ deezer: true, youtube: true, spotify: spotify.enabled() });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, rooms: game.rooms.size, uptime: Math.round(process.uptime()) });
});

// Lien court d'invitation : /j/ABCD
app.get('/j/:code', (req, res) => {
  res.redirect(`/play?code=${encodeURIComponent(String(req.params.code).toUpperCase())}`);
});

/* ------------------------------------------------------------------ */
/* Temps reel                                                         */
/* ------------------------------------------------------------------ */

const ok = (cb, data = {}) => typeof cb === 'function' && cb({ ok: true, ...data });
const fail = (cb, message) => typeof cb === 'function' && cb({ ok: false, error: message });

function roomOf(socket) {
  const room = socket.data.code ? game.get(socket.data.code) : null;
  return room;
}

function asHost(socket) {
  const room = roomOf(socket);
  if (!room || socket.data.role !== 'host') return null;
  return room;
}

function asPlayer(socket) {
  const room = roomOf(socket);
  if (!room || socket.data.role !== 'player') return null;
  const player = room.players.get(socket.data.playerId);
  return player ? { room, player } : null;
}

/**
 * Seul le terminal charge du son pilote le lecteur YouTube : c'est lui qui
 * remonte la liste des videos et le titre de celle en cours.
 */
function asAudioDevice(socket) {
  const room = roomOf(socket);
  if (!room) return null;
  const expected = room.audioTarget === 'host' ? 'host' : 'screen';
  return socket.data.role === expected ? room : null;
}

function bindHost(socket, room) {
  socket.data.role = 'host';
  socket.data.code = room.code;
  socket.join([`${room.code}:host`]);
  room.hostOnline = true;
}

io.on('connection', (socket) => {
  socket.on('time:sync', (payload, cb) => ok(cb, { serverNow: Date.now() }));

  /* ---------------- Animateur ---------------- */

  socket.on('host:create', (payload, cb) => {
    const room = game.createRoom();
    bindHost(socket, room);
    ok(cb, { code: room.code, hostToken: room.hostToken, state: game.hostState(room) });
    game.broadcast(room);
  });

  socket.on('host:resume', ({ code, hostToken } = {}, cb) => {
    const room = game.get(code);
    if (!room) return fail(cb, 'Cette partie n\'existe plus.');
    if (room.hostToken !== hostToken) return fail(cb, 'Jeton animateur invalide.');
    bindHost(socket, room);
    ok(cb, { code: room.code, state: game.hostState(room) });
    game.broadcast(room);
  });

  socket.on('host:playlist', async (spec, cb) => {
    const room = asHost(socket);
    if (!room) return fail(cb, 'Session animateur expiree.');
    try {
      const pl = await game.setPlaylist(room, spec || {});
      ok(cb, { playlist: { title: pl.title, total: pl.tracks.length } });
      game.broadcast(room);
    } catch (err) { fail(cb, err.message); }
  });

  socket.on('host:custom', ({ action, track, id } = {}, cb) => {
    const room = asHost(socket);
    if (!room) return fail(cb, 'Session animateur expiree.');
    if (action === 'add' && track && track.preview && track.title && track.artist) {
      if (room.customTracks.length >= 60) return fail(cb, 'Selection pleine (60 titres max).');
      if (!room.customTracks.some((t) => t.id === String(track.id))) {
        room.customTracks.push({
          id: String(track.id), title: track.title, artist: track.artist,
          album: track.album || '', cover: track.cover || '', preview: track.preview,
          contributors: [], duration: 30, rank: 0,
        });
      }
    } else if (action === 'remove') {
      room.customTracks = room.customTracks.filter((t) => t.id !== String(id));
    } else if (action === 'clear') {
      room.customTracks = [];
    }
    ok(cb, { tracks: room.customTracks.map((t) => ({ id: t.id, title: t.title, artist: t.artist, cover: t.cover })) });
    game.broadcast(room);
  });

  socket.on('host:refresh', async (payload, cb) => {
    const room = asHost(socket);
    if (!room) return fail(cb, 'Session animateur expiree.');
    try {
      const total = await game.refreshPlaylist(room);
      ok(cb, { total });
    } catch (err) { fail(cb, err.message); }
  });

  socket.on('host:settings', (patch, cb) => {
    const room = asHost(socket);
    if (!room) return fail(cb, 'Session animateur expiree.');
    ok(cb, { settings: game.updateSettings(room, patch || {}) });
    game.broadcast(room);
  });

  socket.on('host:audioTarget', ({ target } = {}, cb) => {
    const room = asHost(socket);
    if (!room) return fail(cb, 'Session animateur expiree.');
    room.audioTarget = target === 'host' ? 'host' : 'screen';
    ok(cb, { audioTarget: room.audioTarget });
    game.broadcast(room);
  });

  socket.on('host:start', (payload, cb) => {
    const room = asHost(socket);
    if (!room) return fail(cb, 'Session animateur expiree.');
    try { game.start(room); ok(cb); } catch (err) { fail(cb, err.message); }
  });

  socket.on('host:next', (payload, cb) => {
    const room = asHost(socket);
    if (!room) return fail(cb, 'Session animateur expiree.');
    if (room.phase === 'ended' || room.phase === 'lobby') return fail(cb, 'Aucune manche en cours.');
    game.nextRound(room);
    ok(cb);
  });

  socket.on('host:reveal', (payload, cb) => {
    const room = asHost(socket);
    if (!room) return fail(cb, 'Session animateur expiree.');
    game.reveal(room, 'host');
    ok(cb);
  });

  socket.on('host:judge', ({ ok: good, points } = {}, cb) => {
    const room = asHost(socket);
    if (!room) return fail(cb, 'Session animateur expiree.');
    game.judge(room, { ok: !!good, points });
    ok(cb);
  });

  socket.on('host:award', ({ playerId, delta } = {}, cb) => {
    const room = asHost(socket);
    if (!room) return fail(cb, 'Session animateur expiree.');
    const player = room.players.get(playerId);
    if (!player) return fail(cb, 'Joueur introuvable.');
    player.score = Math.max(0, player.score + Math.round(Number(delta) || 0));
    ok(cb);
    game.sendPersonalTo(room, playerId);
    game.broadcast(room);
  });

  socket.on('host:kick', ({ playerId } = {}, cb) => {
    const room = asHost(socket);
    if (!room) return fail(cb, 'Session animateur expiree.');
    const removed = room.players.get(playerId);
    if (removed?.connected) room.connectedCount = Math.max(0, room.connectedCount - 1);
    room.players.delete(playerId);
    for (const [sid, ref] of game.playersBySocket) {
      if (ref.playerId === playerId) {
        io.sockets.sockets.get(sid)?.emit('kicked');
        game.playersBySocket.delete(sid);
      }
    }
    ok(cb);
    game.broadcast(room);
  });

  socket.on('host:lobby', (payload, cb) => {
    const room = asHost(socket);
    if (!room) return fail(cb, 'Session animateur expiree.');
    game.backToLobby(room);
    ok(cb);
  });

  /* ---------------- Ecran ---------------- */

  socket.on('screen:join', ({ code } = {}, cb) => {
    const room = game.get(code);
    if (!room) return fail(cb, 'Code de partie inconnu.');
    socket.data.role = 'screen';
    socket.data.code = room.code;
    socket.join([`${room.code}:screen`, `${room.code}:public`]);
    room.screenOnline += 1;
    ok(cb, { state: game.publicState(room) });
    game.broadcast(room);
  });

  /* ---------------- Lecteur YouTube ---------------- */

  socket.on('youtube:videos', ({ playlistId, videoIds } = {}, cb) => {
    const room = asAudioDevice(socket);
    if (!room) return fail(cb, 'Ce terminal ne pilote pas le son.');
    const applied = game.setYoutubeVideos(room, String(playlistId || ''), videoIds);
    if (!applied) return fail(cb, 'Cette playlist n\'est plus celle du salon.');
    ok(cb, { total: room.playlist.tracks.length });
  });

  socket.on('youtube:meta', (payload = {}, cb) => {
    const room = asAudioDevice(socket);
    if (!room) return fail(cb, 'Ce terminal ne pilote pas le son.');
    ok(cb, { applied: game.setYoutubeMeta(room, payload) });
  });

  socket.on('youtube:failed', ({ videoId, reason } = {}, cb) => {
    const room = asAudioDevice(socket);
    if (!room) return fail(cb, 'Ce terminal ne pilote pas le son.');
    // Video indisponible ou lecture refusee : on passe a la manche suivante.
    if (room.phase === 'countdown' || room.phase === 'playing') {
      console.warn(`[youtube] video ${videoId} injouable (${reason || 'inconnu'}), manche passee`);
      game.reveal(room, 'unavailable');
    }
    ok(cb);
  });

  /* ---------------- Joueurs ---------------- */

  socket.on('player:join', ({ code, name } = {}, cb) => {
    const room = game.get(code);
    if (!room) return fail(cb, 'Code de partie inconnu.');
    try {
      const player = game.addPlayer(room, cleanName(name));
      socket.data.role = 'player';
      socket.data.code = room.code;
      socket.data.playerId = player.id;
      // Chaque joueur a sa propre salle : c'est par la qu'arrive sa ligne a lui,
      // sans imposer la liste complete a tout le monde.
      socket.join([`${room.code}:player`, `${room.code}:public`, room.playerRoom(player.id)]);
      game.playersBySocket.set(socket.id, { code: room.code, playerId: player.id });
      ok(cb, {
        playerId: player.id, token: player.token, name: player.name, avatar: player.avatar,
        state: game.publicState(room), you: game.sendPersonalTo(room, player.id),
      });
      game.broadcast(room);
    } catch (err) { fail(cb, err.message); }
  });

  socket.on('player:resume', ({ code, token, playerId } = {}, cb) => {
    const room = game.get(code);
    if (!room) return fail(cb, 'Cette partie n\'existe plus.');
    const player = room.players.get(playerId);
    if (!player || player.token !== token) return fail(cb, 'Session joueur expiree.');
    if (!player.connected) {
      player.connected = true;
      room.connectedCount += 1;
    }
    metrics.playersResumed.inc();
    socket.data.role = 'player';
    socket.data.code = room.code;
    socket.data.playerId = player.id;
    socket.join([`${room.code}:player`, `${room.code}:public`, room.playerRoom(player.id)]);
    game.playersBySocket.set(socket.id, { code: room.code, playerId: player.id });
    ok(cb, {
      playerId: player.id, name: player.name, avatar: player.avatar,
      state: game.publicState(room), you: game.sendPersonalTo(room, player.id),
    });
    game.broadcast(room);
  });

  socket.on('player:answer', ({ title, artist } = {}, cb) => {
    const ref = asPlayer(socket);
    if (!ref) return fail(cb, 'Session joueur expiree.');
    const result = game.submitAnswer(ref.room, ref.player, { title, artist });
    if (!result) return fail(cb, 'Trop tard !');
    ok(cb, result);
  });

  socket.on('player:buzz', (payload, cb) => {
    const ref = asPlayer(socket);
    if (!ref) return fail(cb, 'Session joueur expiree.');
    const result = game.buzz(ref.room, ref.player);
    ok(cb, result);
  });

  socket.on('player:leave', (payload, cb) => {
    const ref = asPlayer(socket);
    if (!ref) return ok(cb);          // deja parti : rien a faire
    game.removePlayer(ref.room, ref.player.id);
    game.playersBySocket.delete(socket.id);
    socket.leave(`${ref.room.code}:player`);
    socket.leave(`${ref.room.code}:public`);
    socket.leave(ref.room.playerRoom(ref.player.id));
    socket.data.playerId = null;
    socket.data.role = null;
    ok(cb);
    game.broadcast(ref.room);
  });

  socket.on('player:rename', ({ name } = {}, cb) => {
    const ref = asPlayer(socket);
    if (!ref) return fail(cb, 'Session joueur expiree.');
    ref.player.name = cleanName(name);
    ok(cb, { name: ref.player.name });
    game.broadcast(ref.room);
  });

  /* ---------------- Deconnexion ---------------- */

  socket.on('disconnect', () => {
    const room = roomOf(socket);
    if (!room) return;
    if (socket.data.role === 'host') {
      room.hostOnline = io.sockets.adapter.rooms.get(`${room.code}:host`)?.size > 0;
    } else if (socket.data.role === 'screen') {
      room.screenOnline = Math.max(0, room.screenOnline - 1);
    } else if (socket.data.role === 'player') {
      if (!socket.data.playerId) return game.broadcast(room);
      const player = room.players.get(socket.data.playerId);
      if (player && player.connected) {
        player.connected = false;
        room.connectedCount = Math.max(0, room.connectedCount - 1);
      }
      game.playersBySocket.delete(socket.id);
    }
    game.broadcast(room);
  });
});

/* ------------------------------------------------------------------ */

function localAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

/**
 * Les metriques ecoutent sur un port distinct : l'Ingress ne route que le port
 * applicatif, donc /metrics n'est joignable que depuis le cluster.
 */
const metricsApp = express();
metricsApp.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', metrics.registry.contentType);
    res.end(await metrics.registry.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});
metricsApp.get('/healthz', (req, res) => res.json({ ok: true }));

metricsApp.listen(METRICS_PORT, () => {
  console.log(`     metriques : http://localhost:${METRICS_PORT}/metrics`);
});

/**
 * Next se prepare avant l'ecoute : les routes API et le lien court sont deja
 * declarees, le rendu des pages sert de dernier recours.
 */
nextApp
  .prepare()
  .then(() => {
    app.all('*', (req, res) => renderPage(req, res));

    server.listen(PORT, () => {
      const urls = ['localhost', ...localAddresses()].map((h) => `http://${h}:${PORT}`);
      console.log('\n  🎧  Refrain — serveur pret\n');
      for (const u of urls) console.log(`     ${u}`);
      console.log('\n     Animateur : /host      Ecran : /screen      Joueurs : /j/CODE');
      console.log(`     Spotify : ${spotify.enabled() ? 'configure' : 'absent (SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET)'}\n`);

      // Prechauffage discret des listes les plus utilisees
      for (const id of ['top', 'hymnes', 'fr']) {
        catalog.buildCategory(id).catch(() => {});
      }
    });
  })
  .catch((err) => {
    console.error('Next n\'a pas pu demarrer :', err);
    process.exit(1);
  });
