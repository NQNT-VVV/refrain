'use strict';

const fs = require('fs');
const path = require('path');
const { normalize } = require('./match');

/**
 * Variete des parties : ce qu'une regie a deja entendu, et comment composer la
 * prochaine partie a partir d'un vivier.
 *
 * Deux defauts remontes en soiree ont motive ce module. D'une part, la memoire
 * des morceaux joues vivait dans le salon et repartait de zero a chaque
 * changement de liste ou de reglage : en jouant deux heures en variant les
 * listes, on reentendait cinq ou six fois les memes titres. D'autre part, la
 * composition se contentait de « deux titres par artiste au plus », ce qui
 * sur une partie consacree a un seul artiste reduisait celui-ci a deux titres
 * et laissait ses featurings remplir tout le reste, en bloc.
 */

/* ------------------------------------------------------------------ */
/* Memoire d'ecoute                                                    */
/* ------------------------------------------------------------------ */

const MAX_TRACKS_PER_KEY = 3000;
const MAX_GROUPS_PER_KEY = 1500;
const MAX_KEYS = 500;
const KEY_TTL_MS = 60 * 24 * 60 * 60 * 1000;   // 60 j sans jouer : on oublie
const SAVE_DELAY_MS = 5000;

/** Garde les `max` entrees les plus recentes d'une Map id -> horodatage. */
function trim(map, max) {
  if (map.size <= max) return;
  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, max);
  map.clear();
  for (const [k, v] of sorted) map.set(k, v);
}

/**
 * Ce qu'une regie a entendu, et quand. La cle est un identifiant tire au
 * hasard et garde par le navigateur de l'animateur : changer de salon, de liste
 * ou de reglage ne remet plus rien a zero. Sauvegarde sur disque au mieux —
 * un disque en lecture seule ou un redemarrage ne coute que la memoire.
 */
class ListenMemory {
  constructor(file) {
    this.file = file;
    this.byKey = new Map();   // cle -> { at, tracks: Map(id -> at), groups: Map(groupe -> at) }
    this.saveTimer = null;
    this.load();
  }

  load() {
    if (!this.file) return;
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const now = Date.now();
      for (const [key, v] of Object.entries(raw || {})) {
        if (!v || now - v.at > KEY_TTL_MS) continue;
        this.byKey.set(key, {
          at: v.at,
          tracks: new Map(Object.entries(v.tracks || {})),
          groups: new Map(Object.entries(v.groups || {})),
        });
      }
    } catch { /* premiere execution ou fichier illisible : memoire vide */ }
  }

  get(key) {
    let entry = this.byKey.get(key);
    if (!entry) {
      entry = { at: Date.now(), tracks: new Map(), groups: new Map() };
      this.byKey.set(key, entry);
    }
    return entry;
  }

  /** Note une partie entiere : ses morceaux et ses groupes (artistes, albums). */
  record(key, tracks, groupKeys = []) {
    const entry = this.get(key);
    const now = Date.now();
    entry.at = now;
    // Un leger decalage garde l'ordre de la partie : les derniers joues sont
    // les plus recents, ce qui departage les egalites au tirage suivant.
    tracks.forEach((t, i) => entry.tracks.set(String(t.id), now + i));
    groupKeys.forEach((g, i) => { if (g) entry.groups.set(g, now + i); });
    trim(entry.tracks, MAX_TRACKS_PER_KEY);
    trim(entry.groups, MAX_GROUPS_PER_KEY);
    this.prune();
    this.scheduleSave();
  }

  prune() {
    const now = Date.now();
    for (const [key, v] of this.byKey) if (now - v.at > KEY_TTL_MS) this.byKey.delete(key);
    if (this.byKey.size > MAX_KEYS) {
      const keep = [...this.byKey.entries()].sort((a, b) => b[1].at - a[1].at).slice(0, MAX_KEYS);
      this.byKey = new Map(keep);
    }
  }

  scheduleSave() {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.save();
    }, SAVE_DELAY_MS);
    this.saveTimer.unref?.();
  }

  save() {
    if (!this.file) return;
    const out = {};
    for (const [key, v] of this.byKey) {
      out[key] = { at: v.at, tracks: Object.fromEntries(v.tracks), groups: Object.fromEntries(v.groups) };
    }
    try {
      fs.writeFileSync(`${this.file}.tmp`, JSON.stringify(out));
      fs.renameSync(`${this.file}.tmp`, this.file);
    } catch { /* disque en lecture seule */ }
  }
}

/* ------------------------------------------------------------------ */
/* Composition d'une partie                                            */
/* ------------------------------------------------------------------ */

function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Cle de regroupement : on limite le nombre de titres d'un meme groupe par partie. */
function groupKeyOf(track, groupBy) {
  if (groupBy === 'album') {
    const album = normalize(track.album || '');
    return album ? `album:${album}` : '';
  }
  const artist = normalize(track.artist || '');
  return artist ? `artist:${artist}` : '';
}

/** Repartit `total` places selon des poids, au plus fort reste. */
function apportion(weights, total) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const sum = entries.reduce((s, [, w]) => s + w, 0);
  if (!sum) return {};
  const raw = entries.map(([k, w]) => ({ k, exact: (w / sum) * total }));
  const out = {};
  let given = 0;
  for (const r of raw) { out[r.k] = Math.floor(r.exact); given += out[r.k]; }
  raw.sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)));
  for (let i = 0; given < total && i < raw.length; i++, given++) out[raw[i].k] += 1;
  return out;
}

/** Positions regulierement espacees pour `count` elements parmi `total`. */
function spread(count, total, rng = Math.random) {
  if (count <= 0) return new Set();
  const step = total / count;
  const offset = rng() * step;
  const out = new Set();
  for (let i = 0; i < count; i++) out.add(Math.min(total - 1, Math.floor(offset + i * step)));
  // Collisions possibles sur de petits totaux : on complete aux places libres.
  for (let p = 0; out.size < count && p < total; p++) out.add(p);
  return out;
}

/**
 * Compose la liste des manches.
 *
 *   pool     vivier de la liste choisie
 *   wanted   nombre de manches
 *   memory   { tracks: Map(id -> at), groups: Map(groupe -> at) } de la regie
 *   mix      { groupBy: 'artist'|'album', tiers: {0: .4, 1: .35, 2: .25}, featShare }
 *
 * Priorites, de la plus forte a la plus faible :
 *   1. un morceau jamais entendu par cette regie, sinon le plus anciennement joue ;
 *   2. le dosage demande (etages de popularite, part de featurings) ;
 *   3. un seul titre par groupe (artiste, ou album sur une partie mono-artiste),
 *      deux si le vivier ne permet pas mieux ;
 *   4. a fraicheur egale, les groupes entendus il y a le plus longtemps.
 * Les featurings sont espaces regulierement plutot que groupes.
 */
function composeQueue(pool, { wanted, memory, mix = {}, rng = Math.random } = {}) {
  const tracksAt = memory?.tracks || new Map();
  const groupsAt = memory?.groups || new Map();
  const groupBy = mix.groupBy || 'artist';
  const n = Math.min(wanted, pool.length);
  if (n <= 0) return [];

  const candidates = shuffle(pool, rng).map((track) => {
    const group = groupKeyOf(track, groupBy);
    return {
      track,
      group,
      playedAt: tracksAt.get(String(track.id)) || 0,
      groupAt: (group && groupsAt.get(group)) || 0,
    };
  });
  // Tri stable : l'ordre aleatoire departage les egalites.
  candidates.sort((a, b) => {
    if (!a.playedAt !== !b.playedAt) return a.playedAt ? 1 : -1;
    if (a.playedAt || b.playedAt) return a.playedAt - b.playedAt;
    return a.groupAt - b.groupAt;
  });

  // Creneaux : featuring ou non a chaque position, puis l'etage de popularite
  // des creneaux restants. Les featurings n'ont pas d'etage impose : leur part
  // est deja dosee, et leur popularite ne se compare pas a celle de l'artiste.
  const slots = Array.from({ length: n }, () => ({ tier: undefined, feat: undefined }));
  if (mix.featShare !== undefined) {
    const featPool = pool.filter((t) => t.feat).length;
    let featCount = Math.min(featPool, Math.round(n * mix.featShare));
    if (mix.featShare > 0 && featPool > 0 && featCount === 0) featCount = 1;
    const featAt = spread(featCount, n, rng);
    slots.forEach((slot, i) => { slot.feat = featAt.has(i); });
  }
  if (mix.tiers) {
    const open = slots.filter((slot) => !slot.feat);
    const present = {};
    for (const [tier, w] of Object.entries(mix.tiers)) {
      if (pool.some((t) => !t.feat && String(t.tier) === tier)) present[tier] = w;
    }
    const counts = apportion(present, open.length);
    const labels = shuffle(Object.entries(counts).flatMap(([tier, c]) => Array(c).fill(Number(tier))), rng);
    labels.forEach((tier, i) => { open[i].tier = tier; });
  }

  // Du plus exigeant au plus permissif. La fraicheur passe avant tout :
  // mieux vaut un deuxieme titre du meme artiste qu'un morceau deja entendu.
  const LEVELS = [
    { fresh: true, cap: 1, tier: true, feat: true },
    { fresh: true, cap: 2, tier: true, feat: true },
    { fresh: true, cap: 2, tier: false, feat: true },
    { fresh: true, cap: Infinity, tier: false, feat: true },
    { fresh: true, cap: Infinity, tier: false, feat: false },
    { fresh: false, cap: 2, tier: true, feat: true },
    { fresh: false, cap: Infinity, tier: false, feat: true },
    { fresh: false, cap: Infinity, tier: false, feat: false },
  ];

  const taken = new Set();
  const perGroup = new Map();
  const queue = new Array(n).fill(null);

  for (const level of LEVELS) {
    for (let i = 0; i < n; i++) {
      if (queue[i]) continue;
      const slot = slots[i];
      const found = candidates.find((c) => {
        if (taken.has(c)) return false;
        if (level.fresh && c.playedAt) return false;
        if (level.tier && slot.tier !== undefined && c.track.tier !== slot.tier) return false;
        if (level.feat && slot.feat !== undefined && Boolean(c.track.feat) !== slot.feat) return false;
        if (c.group && (perGroup.get(c.group) || 0) >= level.cap) return false;
        return true;
      });
      if (!found) continue;
      taken.add(found);
      if (found.group) perGroup.set(found.group, (perGroup.get(found.group) || 0) + 1);
      queue[i] = found;
    }
  }

  const ordered = queue.filter(Boolean);
  // Deux titres d'un meme groupe cote a cote s'entendent : on les eloigne,
  // sans deplacer les featurings deja espaces.
  for (let i = 1; i < ordered.length; i++) {
    if (!ordered[i].group || ordered[i].group !== ordered[i - 1].group) continue;
    for (let j = i + 1; j < ordered.length; j++) {
      const sameFeat = Boolean(ordered[j].track.feat) === Boolean(ordered[i].track.feat);
      if (sameFeat && ordered[j].group !== ordered[i - 1].group
        && (j + 1 >= ordered.length || ordered[j + 1].group !== ordered[i].group)) {
        [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
        break;
      }
    }
  }
  return ordered.map((c) => c.track);
}

/** Groupes a memoriser apres une partie : artistes, et albums en mono-artiste. */
function groupsOf(queue, mix = {}) {
  return queue.map((t) => groupKeyOf(t, mix.groupBy || 'artist'));
}

const memory = new ListenMemory(
  process.env.REFRAIN_MEMORY_FILE === 'off'
    ? null
    : process.env.REFRAIN_MEMORY_FILE || path.join(__dirname, '..', '.cache', 'listen-memory.json'),
);

module.exports = { ListenMemory, composeQueue, groupsOf, groupKeyOf, apportion, spread, memory };
