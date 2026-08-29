'use strict';

const dz = require('./deezer');
const metrics = require('./metrics');
const { normalize } = require('./match');

/**
 * Catalogue de manches pretes a l'emploi.
 * Chaque liste est definie par des "graines" resolues a la demande via l'API
 * publique Deezer (extraits de 30 s, sans cle API) :
 *   - { artist }  -> top titres de l'artiste
 *   - { q }       -> recherche libre (musiques de films, jeux video...)
 *   - { chart }   -> top Deezer d'un genre
 */

const CATEGORIES = [
  {
    id: 'top',
    emoji: '🔥',
    title: 'Top du moment',
    subtitle: 'Le classement Deezer, mis a jour tout seul',
    accent: '#FF3D8B',
    seeds: [{ chart: 0, limit: 100 }],
  },
  {
    id: 'hymnes',
    emoji: '🍻',
    title: 'Hymnes de soiree',
    subtitle: 'Ceux que tout le monde reprend en choeur',
    accent: '#FBBF24',
    seeds: [
      'Michel Sardou', 'Claude François', 'Joe Dassin', 'Patrick Sébastien', 'Village People',
      'Gloria Gaynor', 'Céline Dion', 'Francky Vincent', 'Les Charlots', 'Michel Delpech',
      'Gilbert Montagné', 'Boney M.', 'Ottawan', 'Sardou', 'La Compagnie Créole',
      'Rick Astley', 'Bon Jovi', 'Journey', 'Toto', 'ABBA', 'Queen', 'Kool & The Gang',
    ].map((artist) => ({ artist })),
  },
  {
    id: 'fr',
    emoji: '🇫🇷',
    title: 'Chanson francaise',
    subtitle: 'Du classique au moderne',
    accent: '#60A5FA',
    seeds: [
      'Jean-Jacques Goldman', 'Daniel Balavoine', 'Francis Cabrel', 'Renaud', 'Jacques Brel',
      'Édith Piaf', 'Charles Aznavour', 'Serge Gainsbourg', 'Michel Sardou', 'Johnny Hallyday',
      'France Gall', 'Michel Berger', 'Julien Clerc', 'Véronique Sanson', 'Alain Souchon',
      'Téléphone', 'Indochine', 'Mylène Farmer', 'Zaz', 'Louane', 'Angèle', 'Clara Luciani',
      'Vianney', 'Stromae', 'Calogero', 'Bénabar', 'Julien Doré', 'Pierre Bachelet',
      'Jacques Dutronc', 'Georges Brassens',
    ].map((artist) => ({ artist })),
  },
  {
    id: 'rapfr',
    emoji: '🎤',
    title: 'Rap FR',
    subtitle: 'Des pionniers a la nouvelle vague',
    accent: '#A78BFA',
    seeds: [
      'Jul', 'Ninho', 'PNL', 'Damso', 'Orelsan', 'Booba', 'SCH', 'Nekfeu', 'Gazo',
      'Aya Nakamura', 'Soprano', 'IAM', 'Suprême NTM', 'MC Solaar', 'Bigflo & Oli',
      'Vald', 'Lomepal', 'Dadju', 'Naps', 'Tiakola', 'Freeze Corleone', 'Sexion d\'Assaut',
      'Sniper', 'Diam\'s', 'Rohff', 'Sefyu', 'Niska', 'Maes', 'Werenoi', 'Fresh La Peufra',
    ].map((artist) => ({ artist })),
  },
  {
    id: '80s',
    emoji: '📼',
    title: 'Annees 80',
    subtitle: 'Synthes, epaulettes et refrains immortels',
    accent: '#F472B6',
    seeds: [
      'Michael Jackson', 'Madonna', 'Queen', 'Prince', 'a-ha', 'Depeche Mode', 'The Police',
      'Whitney Houston', 'Cyndi Lauper', 'Tears for Fears', 'Duran Duran', 'Bon Jovi',
      'Eurythmics', 'Toto', 'Wham!', 'Europe', 'Survivor', 'Rick Astley', 'Kool & The Gang',
      'Dire Straits', 'U2', 'Bananarama', 'Desireless', 'Lio', 'Indochine', 'Téléphone',
      'Jean-Jacques Goldman', 'Daniel Balavoine', 'The Cure', 'New Order',
    ].map((artist) => ({ artist })),
  },
  {
    id: '90s',
    emoji: '💿',
    title: 'Annees 90',
    subtitle: 'Eurodance, grunge et boys bands',
    accent: '#34D399',
    seeds: [
      'Nirvana', 'Oasis', 'Spice Girls', 'Backstreet Boys', 'Céline Dion', 'Mariah Carey',
      'TLC', 'Ace of Base', 'Blur', 'Radiohead', 'Red Hot Chili Peppers', 'No Doubt',
      'Alanis Morissette', 'Snap!', '2 Unlimited', 'Haddaway', 'Aqua', 'Eiffel 65',
      'Vengaboys', 'Daft Punk', 'Robert Miles', 'Lauryn Hill', 'The Notorious B.I.G.',
      '2Pac', 'Dr. Dre', 'R.E.M.', 'Green Day', 'The Cranberries', 'Savage Garden',
      'Ricky Martin', 'Pascal Obispo', 'Zebda', 'Alliage', 'Worlds Apart',
    ].map((artist) => ({ artist })),
  },
  {
    id: '2000s',
    emoji: '📱',
    title: 'Annees 2000',
    subtitle: 'MP3, MSN et sonneries polyphoniques',
    accent: '#38BDF8',
    seeds: [
      'Coldplay', 'Linkin Park', 'Eminem', 'Rihanna', 'Beyoncé', 'The Black Eyed Peas',
      'Gorillaz', 'The Killers', 'Amy Winehouse', 'Nelly Furtado', 'Justin Timberlake',
      'Shakira', 'Kanye West', '50 Cent', 'OutKast', 'Maroon 5', 'Evanescence',
      'Avril Lavigne', 'Snow Patrol', 'Kings of Leon', 'Franz Ferdinand', 'The White Stripes',
      'Sean Paul', 'Usher', 'Christina Aguilera', 'P!nk', 'Diam\'s', 'Kyo', 'Superbus',
      'Corneille', 'Tryo', 'Yannick Noah',
    ].map((artist) => ({ artist })),
  },
  {
    id: '2010s',
    emoji: '🕶️',
    title: 'Annees 2010',
    subtitle: 'La decennie streaming',
    accent: '#818CF8',
    seeds: [
      'Adele', 'Ed Sheeran', 'Bruno Mars', 'Drake', 'Daft Punk', 'Avicii', 'Calvin Harris',
      'David Guetta', 'Lorde', 'Lana Del Rey', 'Sia', 'Imagine Dragons', 'Twenty One Pilots',
      'The Weeknd', 'Post Malone', 'Billie Eilish', 'Dua Lipa', 'Ariana Grande',
      'Taylor Swift', 'Kendrick Lamar', 'Major Lazer', 'Kygo', 'Clean Bandit', 'Stromae',
      'GIMS', 'Kendji Girac', 'Louane', 'Christine and the Queens', 'Pharrell Williams',
      'Mark Ronson',
    ].map((artist) => ({ artist })),
  },
  {
    id: 'rock',
    emoji: '🎸',
    title: 'Rock legendes',
    subtitle: 'Les riffs que personne n\'a le droit de rater',
    accent: '#FB7185',
    seeds: [
      'Queen', 'AC/DC', 'Led Zeppelin', 'Pink Floyd', 'The Rolling Stones', 'The Beatles',
      'Nirvana', 'Metallica', 'Guns N\' Roses', 'Aerosmith', 'Deep Purple', 'The Who',
      'Jimi Hendrix', 'The Doors', 'Eagles', 'Scorpions', 'Rage Against the Machine',
      'Foo Fighters', 'Muse', 'Arctic Monkeys', 'Red Hot Chili Peppers', 'Radiohead',
      'Oasis', 'The Clash', 'David Bowie', 'Bruce Springsteen', 'ZZ Top', 'Dire Straits',
      'Téléphone', 'Noir Désir', 'Trust', 'The Cure',
    ].map((artist) => ({ artist })),
  },
  {
    id: 'disco',
    emoji: '🕺',
    title: 'Disco & Funk',
    subtitle: 'Boule a facettes obligatoire',
    accent: '#FACC15',
    seeds: [
      'Bee Gees', 'Donna Summer', 'CHIC', 'Earth, Wind & Fire', 'Kool & The Gang',
      'Gloria Gaynor', 'Sister Sledge', 'Boney M.', 'ABBA', 'Village People',
      'KC & The Sunshine Band', 'The Jacksons', 'Diana Ross', 'Stevie Wonder', 'James Brown',
      'Barry White', 'Michael Jackson', 'Cerrone', 'Ottawan', 'Patrick Hernandez',
      'Jamiroquai', 'Nile Rodgers', 'Bruno Mars', 'Daft Punk', 'Lipps Inc.',
    ].map((artist) => ({ artist })),
  },
  {
    id: 'dancefloor',
    emoji: '💃',
    title: 'Dancefloor',
    subtitle: 'Club, festival et gros drops',
    accent: '#22D3EE',
    seeds: [
      'David Guetta', 'Calvin Harris', 'Avicii', 'Swedish House Mafia', 'Martin Garrix',
      'Tiësto', 'Alan Walker', 'Kygo', 'Robin Schulz', 'Bob Sinclar', 'deadmau5',
      'Skrillex', 'Major Lazer', 'DJ Snake', 'Ofenbach', 'The Chainsmokers', 'Marshmello',
      'Zedd', 'Duke Dumont', 'Purple Disco Machine', 'Regard', 'MEDUZA', 'Jax Jones',
      'Fisher', 'Bakermat',
    ].map((artist) => ({ artist })),
  },
  {
    id: 'films',
    emoji: '🎬',
    title: 'Films & Series',
    subtitle: 'Themes cultes du grand et du petit ecran',
    accent: '#E879F9',
    seeds: [
      { artist: 'Hans Zimmer' }, { artist: 'John Williams' }, { artist: 'Ennio Morricone' },
      { artist: 'Howard Shore' }, { artist: 'Danny Elfman' }, { artist: 'Alan Silvestri' },
      { artist: 'Vangelis' }, { artist: 'Michael Giacchino' }, { artist: 'Ramin Djawadi' },
      { artist: 'James Horner' }, { artist: 'Alexandre Desplat' }, { artist: 'Klaus Badelt' },
      { artist: 'Lalo Schifrin' }, { artist: 'Henry Mancini' }, { artist: 'Nino Rota' },
      { q: 'Game of Thrones main title', limit: 4 },
      { q: 'Stranger Things theme', limit: 4 },
      { q: 'Peaky Blinders soundtrack', limit: 4 },
      { q: 'Mission Impossible theme', limit: 4 },
      { q: 'James Bond theme', limit: 4 },
      { q: 'Amelie Poulain bande originale', limit: 4 },
      { q: 'Intouchables bande originale', limit: 4 },
      { q: 'Le Grand Bleu bande originale', limit: 4 },
    ],
  },
  {
    id: 'disney',
    emoji: '🏰',
    title: 'Disney & dessins animes',
    subtitle: 'Chapitre nostalgie, VF comprise',
    accent: '#F0ABFC',
    seeds: [
      { q: 'Le Roi Lion bande originale', limit: 6 },
      { q: 'La Reine des Neiges Libérée Délivrée', limit: 6 },
      { q: 'Aladdin Ce reve bleu', limit: 5 },
      { q: 'La Belle et la Bête Disney', limit: 5 },
      { q: 'Vaiana Le bleu lumière', limit: 5 },
      { q: 'Encanto Ne parlons pas de Bruno', limit: 5 },
      { q: 'Le Livre de la Jungle Il en faut peu', limit: 5 },
      { q: 'Pocahontas L\'air du vent', limit: 4 },
      { q: 'Mulan Comme un homme', limit: 4 },
      { q: 'Hercule Disney bande originale', limit: 4 },
      { q: 'Raiponce Disney bande originale', limit: 4 },
      { q: 'Toy Story Je suis ton ami', limit: 4 },
      { q: 'Coco Disney Pixar', limit: 4 },
      { q: 'Les Aristochats Tout le monde veut devenir un cat', limit: 4 },
      { q: 'Pinocchio Disney', limit: 4 },
      { q: 'Le Bossu de Notre Dame Disney', limit: 4 },
      { q: 'Tarzan Phil Collins', limit: 4 },
      { q: 'Rox et Rouky Disney', limit: 3 },
      { q: 'Générique dessin animé club Dorothée', limit: 6 },
    ],
  },
  {
    id: 'jeux',
    emoji: '🎮',
    title: 'Jeux video',
    subtitle: 'Pour les vrais',
    accent: '#4ADE80',
    seeds: [
      { q: 'Zelda main theme', limit: 5 }, { q: 'Super Mario theme', limit: 5 },
      { q: 'Final Fantasy soundtrack', limit: 5 }, { q: 'Tetris theme', limit: 4 },
      { q: 'Halo theme', limit: 4 }, { q: 'Skyrim Dragonborn', limit: 4 },
      { q: 'Minecraft C418', limit: 4 }, { q: 'The Witcher 3 soundtrack', limit: 4 },
      { q: 'Assassin\'s Creed Ezio Family', limit: 4 }, { q: 'Pokemon theme', limit: 4 },
      { q: 'Sonic the Hedgehog Green Hill', limit: 4 }, { q: 'Street Fighter theme', limit: 4 },
      { q: 'Metal Gear Solid soundtrack', limit: 4 }, { q: 'DOOM Mick Gordon', limit: 4 },
      { q: 'Undertale Megalovania', limit: 4 }, { q: 'Hollow Knight soundtrack', limit: 4 },
      { q: 'Elden Ring soundtrack', limit: 4 }, { q: 'Red Dead Redemption 2 soundtrack', limit: 4 },
      { q: 'Portal Still Alive', limit: 3 }, { q: 'Nier Automata soundtrack', limit: 4 },
    ],
  },
  {
    id: 'rnb',
    emoji: '🎶',
    title: 'R&B & Soul',
    subtitle: 'Groove et voix d\'or',
    accent: '#C084FC',
    seeds: [
      'Beyoncé', 'Rihanna', 'Usher', 'Alicia Keys', 'Aretha Franklin', 'Marvin Gaye',
      'Otis Redding', 'Stevie Wonder', 'Ray Charles', 'Whitney Houston', 'Mariah Carey',
      'TLC', 'Destiny\'s Child', 'Ne-Yo', 'Chris Brown', 'The Weeknd', 'SZA',
      'Frank Ocean', 'John Legend', 'Bruno Mars', 'Amy Winehouse', 'Sam Smith',
      'H.E.R.', 'Jorja Smith', 'Lauryn Hill',
    ].map((artist) => ({ artist })),
  },
  {
    id: 'latino',
    emoji: '🌴',
    title: 'Latino & Reggaeton',
    subtitle: 'Ca sent les vacances',
    accent: '#FB923C',
    seeds: [
      'Daddy Yankee', 'Bad Bunny', 'J Balvin', 'Shakira', 'Enrique Iglesias', 'Luis Fonsi',
      'Ozuna', 'Maluma', 'Nicky Jam', 'KAROL G', 'ROSALÍA', 'Manu Chao', 'Gipsy Kings',
      'Ricky Martin', 'Marc Anthony', 'Sean Paul', 'Rauw Alejandro', 'Farruko',
      'Don Omar', 'Wisin & Yandel', 'Buena Vista Social Club', 'Carlos Vives',
    ].map((artist) => ({ artist })),
  },
  {
    id: 'tiktok',
    emoji: '✨',
    title: 'Sons TikTok',
    subtitle: 'Ce qui tourne en boucle sur ton fil',
    accent: '#22D3EE',
    seeds: [
      { artist: 'Doja Cat' }, { artist: 'Lil Nas X' }, { artist: 'Måneskin' },
      { artist: 'Olivia Rodrigo' }, { artist: 'Sabrina Carpenter' }, { artist: 'Tate McRae' },
      { artist: 'PinkPantheress' }, { artist: 'Central Cee' }, { artist: 'Ice Spice' },
      { artist: 'Steve Lacy' }, { artist: 'd4vd' }, { artist: 'Chappell Roan' },
      { artist: 'Gazo' }, { artist: 'Yamê' }, { artist: 'Aya Nakamura' },
      { q: 'Oh No Kreepa', limit: 3 },
      { q: 'Astronaut In The Ocean Masked Wolf', limit: 3 },
      { q: 'Sunroof Nicky Youre', limit: 3 },
      { q: 'Murder On The Dancefloor Sophie Ellis-Bextor', limit: 3 },
      { q: 'Escapism Raye', limit: 3 },
      { q: 'Bloody Mary Lady Gaga', limit: 3 },
      { q: 'Say So Doja Cat', limit: 3 },
      { q: 'Monkeys Spinning Monkeys', limit: 3 },
      { q: 'Sofia Clairo', limit: 3 },
      { q: 'Cupid Fifty Fifty', limit: 3 },
    ],
  },
  {
    id: 'kpop',
    emoji: '🇰🇷',
    title: 'K-pop',
    subtitle: 'Choregraphies incluses',
    accent: '#F472B6',
    seeds: [
      'BTS', 'BLACKPINK', 'TWICE', 'Stray Kids', 'NewJeans', 'SEVENTEEN', 'EXO',
      'Red Velvet', 'aespa', 'ITZY', 'IVE', 'LE SSERAFIM', 'PSY', 'BIGBANG',
      'TOMORROW X TOGETHER', 'ENHYPEN', '(G)I-DLE', 'NCT 127', 'MAMAMOO', 'SHINee',
      'Girls\' Generation', 'Jungkook', 'JISOO', 'Lisa',
    ].map((artist) => ({ artist })),
  },
  {
    id: 'afro',
    emoji: '🌍',
    title: 'Afro & Amapiano',
    subtitle: 'Lagos, Johannesburg et Paris',
    accent: '#FB923C',
    seeds: [
      'Burna Boy', 'Wizkid', 'Davido', 'Tems', 'Rema', 'Asake', 'Ayra Starr',
      'CKay', 'Fireboy DML', 'Omah Lay', 'Tyla', 'Master KG', 'Uncle Waffles',
      'Angélique Kidjo', 'Youssou N\'Dour', 'Salif Keita', 'Magic System',
      'Fally Ipupa', 'Koffi Olomidé', 'Alpha Blondy', 'Tiken Jah Fakoly',
      'Amadou & Mariam', 'Ninho', 'Dadju',
    ].map((artist) => ({ artist })),
  },
  {
    id: 'punk',
    emoji: '🤟',
    title: 'Punk & Emo',
    subtitle: 'Ton adolescence, en accords de puissance',
    accent: '#A78BFA',
    seeds: [
      'Green Day', 'blink-182', 'Sum 41', 'My Chemical Romance', 'Fall Out Boy',
      'Paramore', 'Panic! At The Disco', 'Simple Plan', 'Good Charlotte',
      'The Offspring', 'Avril Lavigne', 'Yellowcard', 'All Time Low',
      'Bowling For Soup', 'New Found Glory', 'Jimmy Eat World', 'Rise Against',
      'AFI', 'Billy Talent', 'The All-American Rejects', 'Bring Me The Horizon',
      'Thirty Seconds To Mars',
    ].map((artist) => ({ artist })),
  },
  {
    id: 'ete',
    emoji: '☀️',
    title: 'Tubes de l\'ete',
    subtitle: 'Ceux qui sentent la creme solaire',
    accent: '#FACC15',
    seeds: [
      'Kungs', 'Ofenbach', 'Bob Sinclar', 'Shakira', 'Luis Fonsi', 'Magic System',
      'Lou Bega', 'Las Ketchup', 'O-Zone', 'Sean Paul', 'Kaoma', 'Gipsy Kings',
      'Manu Chao', 'Stromae', 'Jain', 'Naps', 'Kendji Girac', 'Vianney',
      'Alvaro Soler', 'Robin Schulz', 'Lost Frequencies', 'Mr. Vegas',
      'Daddy Yankee', 'Jonas Blue',
    ].map((artist) => ({ artist })),
  },
  {
    id: 'classique',
    emoji: '🎻',
    title: 'Classique',
    subtitle: 'Plutot au buzzer : les titres sont coriaces',
    accent: '#94A3B8',
    seeds: [
      'Ludwig van Beethoven', 'Wolfgang Amadeus Mozart', 'Johann Sebastian Bach',
      'Frédéric Chopin', 'Antonio Vivaldi', 'Pyotr Ilyich Tchaikovsky',
      'Claude Debussy', 'Erik Satie', 'Edvard Grieg', 'Georges Bizet',
      'Giuseppe Verdi', 'Camille Saint-Saëns', 'Maurice Ravel', 'Gustav Holst',
      'Carl Orff', 'Johann Strauss II', 'Franz Schubert', 'Sergei Rachmaninoff',
      'Antonín Dvořák', 'Modest Mussorgsky',
    ].map((artist) => ({ artist })),
  },
  {
    id: 'metal',
    emoji: '🤘',
    title: 'Metal',
    subtitle: 'Volume conseille : trop fort',
    accent: '#94A3B8',
    seeds: [
      'Metallica', 'Iron Maiden', 'Slipknot', 'System of a Down', 'Rammstein', 'Nightwish',
      'Linkin Park', 'Korn', 'Slayer', 'Megadeth', 'Black Sabbath', 'Judas Priest',
      'Gojira', 'Avenged Sevenfold', 'Bring Me The Horizon', 'Disturbed', 'Pantera',
      'Motörhead', 'Ghost', 'Sepultura', 'Lamb of God', 'In Flames',
    ].map((artist) => ({ artist })),
  },
];

/** Metadonnees seules (sans appel reseau) pour l'ecran de selection. */
function listCategories() {
  return CATEGORIES.map(({ id, emoji, title, subtitle, accent }) => ({ id, emoji, title, subtitle, accent }));
}

function getCategory(id) {
  return CATEGORIES.find((c) => c.id === id) || null;
}

const trackKey = (t) => `${normalize(t.title)}::${normalize(t.artist)}`;

/**
 * Deduplique et diversifie : jamais deux fois le meme titre, et au plus
 * `maxPerArtist` morceaux du meme artiste pour eviter les blocs monotones.
 */
function diversify(tracks, maxPerArtist = 2) {
  const seenTrack = new Set();
  const seenTitle = new Set();
  const perArtist = new Map();
  const out = [];
  for (const t of tracks) {
    if (!t || !t.preview) continue;
    const key = trackKey(t);
    const titleKey = normalize(t.title);
    if (seenTrack.has(key) || seenTitle.has(titleKey)) continue;
    const aKey = normalize(t.artist);
    const count = perArtist.get(aKey) || 0;
    if (count >= maxPerArtist) continue;
    seenTrack.add(key);
    seenTitle.add(titleKey);
    perArtist.set(aKey, count + 1);
    out.push(t);
  }
  return out;
}

function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function resolveSeed(seed) {
  try {
    if (seed.chart !== undefined) return await dz.chartTracks(seed.chart, seed.limit || 100);
    // Plus large qu'avant : c'est la profondeur du vivier qui evite de retomber
    // sur les memes morceaux d'une partie a l'autre.
    if (seed.artist) return await dz.artistTopTracks(seed.artist, seed.limit || 20);
    if (seed.q) return await dz.searchTracks(seed.q, seed.limit || 10);
  } catch (err) {
    console.warn(`[catalogue] graine ignoree (${seed.artist || seed.q || `chart ${seed.chart}`}) :`, err.message);
  }
  return [];
}

const buildLocks = new Map();

/** Construit (et met en cache) la liste de morceaux jouables d'une categorie. */
async function buildCategory(id, { force = false } = {}) {
  const cat = getCategory(id);
  if (!cat) throw new Error(`Categorie inconnue : ${id}`);

  const cacheKey = `cat_${id}_v3`;
  if (!force) {
    const cached = dz.readCache(cacheKey, 6 * 60 * 60 * 1000);
    if (cached && cached.length >= 20) return cached;
  }

  if (buildLocks.has(id)) return buildLocks.get(id);

  const job = (async () => {
    const stopTimer = metrics.catalogBuildDuration.startTimer({ category: id });
    const chunks = [];
    const seeds = cat.seeds;
    // Petits lots pour rester sous le quota Deezer
    for (let i = 0; i < seeds.length; i += 4) {
      const batch = await Promise.all(seeds.slice(i, i + 4).map(resolveSeed));
      chunks.push(...batch);
    }
    const flat = chunks.flat();
    // Quatre titres par artiste dans le vivier : la variete d'une partie donnee
    // est garantie ailleurs, au moment de composer la liste des manches.
    const maxPerArtist = cat.seeds.length > 15 ? 4 : 6;
    const tracks = diversify(shuffle(flat), maxPerArtist);
    if (tracks.length) dz.writeCache(cacheKey, tracks);
    stopTimer();
    return tracks;
  })().finally(() => buildLocks.delete(id));

  buildLocks.set(id, job);
  return job;
}

/* ------------------------------------------------------------------ */
/* Mode artiste                                                        */
/* ------------------------------------------------------------------ */

/**
 * Trois facons de jouer un artiste : ses tubes, tout son repertoire au hasard,
 * ou seulement ce que les vrais connaissent.
 */
const ARTIST_MODES = {
  hits: {
    emoji: '⭐', title: 'Les classiques',
    hint: 'Ses titres les plus connus — tout le monde peut suivre.',
  },
  random: {
    emoji: '🎲', title: 'Au hasard',
    hint: 'Pioches dans toute la discographie, tubes et faces B melanges.',
  },
  deep: {
    emoji: '🕵️', title: 'T\'es un vrai fan ?',
    hint: 'Uniquement les morceaux que le grand public ne connait pas.',
  },
};

/** Intros, interludes et pistes trop courtes ne font pas de bonnes manches. */
const FILLER = /^\s*(intro|outro|interlude|skit|prologue|epilogue|transition)\b/i;

function playableForGame(track) {
  if (!track?.preview) return false;
  if (track.duration && track.duration < 60) return false;
  return !FILLER.test(track.title || '');
}

/**
 * Compose une liste a partir d'un artiste.
 * Le rang de popularite Deezer separe les tubes du reste.
 */
async function buildArtist(artistId, mode = 'hits') {
  const config = ARTIST_MODES[mode] || ARTIST_MODES.hits;
  const [info, discography] = await Promise.all([
    dz.artistInfo(artistId),
    dz.artistDiscography(artistId),
  ]);

  // Un meme morceau revient en single, en reedition, en version « reloaded » :
  // on ne garde que la version la mieux classee de chaque titre.
  const byTitle = new Map();
  for (const track of discography) {
    if (!playableForGame(track)) continue;
    const key = normalize(track.title);
    if (!key) continue;
    const kept = byTitle.get(key);
    if (!kept || (track.rank || 0) > (kept.rank || 0)) byTitle.set(key, track);
  }

  const ranked = [...byTitle.values()].sort((a, b) => (b.rank || 0) - (a.rank || 0));
  if (ranked.length < 8) {
    throw new Error(`Trop peu de morceaux jouables pour ${info.name}.`);
  }

  // La frontiere entre tube et rarete depend de la taille du repertoire.
  // On la place franchement : sinon « vrai fan » ressemble a « au hasard ».
  const hitCount = Math.max(15, Math.min(45, Math.round(ranked.length * 0.2)));
  const deepFrom = Math.max(12, Math.min(70, Math.round(ranked.length * 0.45)));

  let tracks;
  if (mode === 'hits') tracks = ranked.slice(0, hitCount);
  else if (mode === 'deep') tracks = ranked.slice(deepFrom);
  else tracks = ranked;

  if (tracks.length < 8) tracks = ranked;   // repertoire trop mince pour trancher

  return {
    id: `artist-${artistId}-${mode}`,
    title: `${info.name} — ${config.title}`,
    emoji: config.emoji,
    subtitle: `${tracks.length} titres sur ${ranked.length} au repertoire`,
    accent: '#F472B6',
    source: 'artist',
    artist: info,
    mode,
    tracks: shuffle(tracks),
  };
}

module.exports = {
  CATEGORIES, listCategories, getCategory, buildCategory, diversify, shuffle,
  ARTIST_MODES, buildArtist,
};
