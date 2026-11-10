/**
 * Composition des parties (server/variety.js), sans reseau ni serveur.
 * Rejoue les cas remontes en soiree : featurings en bloc, memes titres d'une
 * partie a l'autre, memes artistes dans une liste prete.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
process.env.REFRAIN_MEMORY_FILE = 'off';
const { composeQueue, groupsOf, ListenMemory } = require('../server/variety.js');

const fails = [];
const check = (label, cond, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!cond) fails.push(label);
};

/* Generateur pseudo-aleatoire reproductible */
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

/* ---------- Partie sur un artiste, featurings compris ---------- */
console.log('Mode artiste, avec featurings');
const albums = 'ABCDEFGHIJKLMN'.split('');
const solo = Array.from({ length: 150 }, (_, i) => ({
  id: `s${i}`, title: `Solo ${i}`, artist: 'Vald', album: `Album ${albums[i % albums.length]}`,
  feat: false, tier: i < 40 ? 0 : i < 90 ? 1 : 2,
}));
const feats = Array.from({ length: 40 }, (_, i) => ({
  id: `f${i}`, title: `Feat ${i}`, artist: `Invite ${i}`, album: `Single ${i}`,
  feat: true, tier: i < 15 ? 0 : 1,
}));
const pool = [...solo, ...feats];
const mix = { groupBy: 'album', tiers: { 0: 0.4, 1: 0.35, 2: 0.25 }, featShare: 0.3 };
const mem = new ListenMemory(null);
const seen = [];
for (let g = 0; g < 6; g++) {
  const memory = mem.get('hote');
  const q = composeQueue(pool, { wanted: 12, memory, mix, rng: rng(g + 1) });
  mem.record('hote', q, groupsOf(q, mix));
  seen.push(q);
  const featCount = q.filter((t) => t.feat).length;
  let longestFeatRun = 0; let run = 0;
  for (const t of q) { run = t.feat ? run + 1 : 0; longestFeatRun = Math.max(longestFeatRun, run); }
  const perAlbum = new Map();
  for (const t of q) perAlbum.set(t.album, (perAlbum.get(t.album) || 0) + 1);
  const tiers = [0, 1, 2].map((k) => q.filter((t) => t.tier === k).length);
  if (g === 0) {
    check('12 manches', q.length === 12);
    check('4 featurings sur 12 (30 %)', featCount === 4, String(featCount));
    check('jamais deux featurings d\'affilee', longestFeatRun <= 1, `serie max ${longestFeatRun}`);
    check('un seul titre par album', Math.max(...perAlbum.values()) === 1, `max ${Math.max(...perAlbum.values())}`);
    check('dosage de popularite hors feats 3/3/2', [0, 1, 2].map((k) => q.filter((t) => !t.feat && t.tier === k).length).join('/') === '3/3/2', tiers.join('/'));
  }
}
const all = seen.flat().map((t) => t.id);
check('aucun titre rejoue en 6 parties', new Set(all).size === all.length, `${new Set(all).size} distincts sur ${all.length}`);

/* ---------- Sans featurings : l'artiste n'est plus limite a deux titres ---------- */
console.log('Mode artiste, sans featurings');
const q2 = composeQueue(solo, { wanted: 12, memory: null, mix: { ...mix, featShare: 0 }, rng: rng(42) });
check('12 titres de l\'artiste', q2.length === 12 && q2.every((t) => t.artist === 'Vald'));
check('aucun featuring', q2.every((t) => !t.feat));

/* ---------- Liste prete : variete des artistes d'une partie a l'autre ---------- */
console.log('Liste prete (30 artistes, 6 titres chacun)');
const catPool = [];
for (let a = 0; a < 30; a++) for (let k = 0; k < 6; k++) catPool.push({ id: `c${a}-${k}`, title: `T${a}-${k}`, artist: `Artiste ${a}` });
const mem2 = new ListenMemory(null);
const artistsByGame = [];
for (let g = 0; g < 2; g++) {
  const q = composeQueue(catPool, { wanted: 12, memory: mem2.get('h'), mix: {}, rng: rng(100 + g) });
  mem2.record('h', q, groupsOf(q, {}));
  artistsByGame.push(q.map((t) => t.artist));
}
check('12 artistes differents dans une partie', new Set(artistsByGame[0]).size === 12);
const shared = artistsByGame[1].filter((a) => artistsByGame[0].includes(a)).length;
check('la partie suivante change d\'artistes', shared === 0, `${shared} artiste(s) en commun`);

/* ---------- Vivier epuise : on resert les plus anciens ---------- */
console.log('Vivier epuise');
const small = catPool.slice(0, 20);
const mem3 = new ListenMemory(null);
const g1 = composeQueue(small, { wanted: 12, memory: mem3.get('h'), rng: rng(7) });
mem3.record('h', g1, groupsOf(g1));
const g2 = composeQueue(small, { wanted: 12, memory: mem3.get('h'), rng: rng(8) });
const fresh = g2.filter((t) => !g1.includes(t)).length;
check('les 8 inedits passent en premier', fresh === 8, `${fresh} inedits`);
check('la partie reste complete', g2.length === 12);

console.log(fails.length ? `\n❌ ${fails.join(' | ')}` : '\n✅ Composition conforme');
process.exit(fails.length ? 1 : 0);
