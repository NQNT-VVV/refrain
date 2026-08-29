'use strict';

/**
 * Metriques Prometheus de Refrain.
 *
 * Exposees sur un port distinct de l'application (METRICS_PORT, 9464 par
 * defaut) : l'Ingress ne route que le port applicatif, donc /metrics reste
 * interne au cluster sans avoir a filtrer quoi que ce soit cote nginx.
 */

const { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } = require('prom-client');

const registry = new Registry();
registry.setDefaultLabels({ app: 'refrain' });

// Metriques Node standard (heap, boucle d'evenements, GC, fd...) : noms non
// prefixes pour rester compatibles avec les tableaux de bord Node existants.
collectDefaultMetrics({ register: registry });

/* ------------------------------------------------------------------ */
/* Compteurs                                                          */
/* ------------------------------------------------------------------ */

const counter = (name, help, labelNames = []) =>
  new Counter({ name, help, labelNames, registers: [registry] });

const roomsCreated = counter('refrain_rooms_created_total', 'Salons crees depuis le demarrage.');
const playersJoined = counter('refrain_players_joined_total', 'Arrivees de joueurs (hors reconnexions).');
const playersResumed = counter('refrain_players_resumed_total', 'Reconnexions de joueurs sur jeton.');
const gamesStarted = counter('refrain_games_started_total', 'Parties lancees.', ['mode']);
const gamesFinished = counter('refrain_games_finished_total', 'Parties menees jusqu\'au podium.');
const roundsFinished = counter('refrain_rounds_finished_total', 'Manches terminees, par cause de fin.', ['reason']);
const answersTotal = counter('refrain_answers_total', 'Champs de reponse soumis en mode reponse libre.', ['field', 'result']);
const buzzesTotal = counter('refrain_buzzes_total', 'Buzz enregistres.');
const buzzVerdicts = counter('refrain_buzz_verdicts_total', 'Arbitrages de l\'animateur sur un buzz.', ['verdict']);
const buzzRejected = counter('refrain_buzz_rejected_total', 'Appuis sur le buzzer refuses.', ['reason']);
const pointsAwarded = counter('refrain_points_awarded_total', 'Points distribues aux joueurs.');
const playlistSelections = counter('refrain_playlist_selections_total', 'Listes de morceaux selectionnees.', ['source', 'id']);
const deezerRequests = counter('refrain_deezer_requests_total', 'Appels a l\'API Deezer.', ['outcome']);
const deezerCache = counter('refrain_deezer_cache_total', 'Consultations du cache Deezer.', ['result']);
const previewRefresh = counter('refrain_preview_refresh_total', 'Rafraichissements d\'URL d\'extrait avant lecture.', ['result']);

/* ------------------------------------------------------------------ */
/* Histogrammes                                                       */
/* ------------------------------------------------------------------ */

const deezerDuration = new Histogram({
  name: 'refrain_deezer_request_duration_seconds',
  help: 'Duree des appels a l\'API Deezer.',
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

const catalogBuildDuration = new Histogram({
  name: 'refrain_catalog_build_duration_seconds',
  help: 'Duree de construction d\'une liste de morceaux (cache froid).',
  labelNames: ['category'],
  buckets: [0.5, 1, 2, 5, 10, 20, 40, 80],
  registers: [registry],
});

const answerLatency = new Histogram({
  name: 'refrain_answer_latency_seconds',
  help: 'Delai entre le debut de l\'extrait et une bonne reponse.',
  labelNames: ['field'],
  buckets: [1, 2, 3, 5, 8, 12, 18, 25, 30],
  registers: [registry],
});

/* ------------------------------------------------------------------ */
/* Jauges : calculees a la volee au moment du scrape                  */
/* ------------------------------------------------------------------ */

const PHASES = ['lobby', 'countdown', 'playing', 'buzzed', 'paused', 'reveal', 'scores', 'ended'];

/**
 * Branche les jauges sur l'etat vivant du serveur de jeu.
 * Les valeurs sont recalculees a chaque scrape : rien a maintenir a la main.
 */
function bind(gameServer, io) {
  new Gauge({
    name: 'refrain_rooms',
    help: 'Salons actifs, par phase de jeu.',
    labelNames: ['phase'],
    registers: [registry],
    collect() {
      const byPhase = Object.fromEntries(PHASES.map((p) => [p, 0]));
      for (const room of gameServer.rooms.values()) byPhase[room.phase] = (byPhase[room.phase] || 0) + 1;
      for (const phase of PHASES) this.set({ phase }, byPhase[phase]);
    },
  });

  new Gauge({
    name: 'refrain_players',
    help: 'Joueurs presents dans les salons.',
    labelNames: ['state'],
    registers: [registry],
    collect() {
      let connected = 0;
      let total = 0;
      for (const room of gameServer.rooms.values()) {
        for (const player of room.players.values()) {
          total += 1;
          if (player.connected) connected += 1;
        }
      }
      this.set({ state: 'connected' }, connected);
      this.set({ state: 'total' }, total);
    },
  });

  new Gauge({
    name: 'refrain_screens_connected',
    help: 'Ecrans de diffusion connectes.',
    registers: [registry],
    collect() {
      let screens = 0;
      for (const room of gameServer.rooms.values()) screens += room.screenOnline;
      this.set(screens);
    },
  });

  new Gauge({
    name: 'refrain_hosts_online',
    help: 'Regies animateur connectees.',
    registers: [registry],
    collect() {
      let hosts = 0;
      for (const room of gameServer.rooms.values()) if (room.hostOnline) hosts += 1;
      this.set(hosts);
    },
  });

  new Gauge({
    name: 'refrain_socket_clients',
    help: 'Connexions Socket.IO ouvertes, tous roles confondus.',
    registers: [registry],
    collect() { this.set(io.engine?.clientsCount ?? 0); },
  });
}

module.exports = {
  registry, bind,
  roomsCreated, playersJoined, playersResumed, gamesStarted, gamesFinished,
  roundsFinished, answersTotal, buzzesTotal, buzzVerdicts, buzzRejected, pointsAwarded,
  playlistSelections, deezerRequests, deezerCache, previewRefresh,
  deezerDuration, catalogBuildDuration, answerLatency,
};
