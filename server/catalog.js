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
    subtitle: 'Le classement Deezer, mis à jour tout seul',
    accent: '#FF3D8B',
    seeds: [{ chart: 0, limit: 100 }],
  },
  {
    id: 'hymnes',
    emoji: '🍻',
    title: 'Hymnes de soirée',
    subtitle: 'Ceux que tout le monde reprend en chœur',
    accent: '#FBBF24',
    seeds: [
      'Michel Sardou', 'Claude François', 'Joe Dassin', 'Patrick Sébastien', 'Village People',
      'Gloria Gaynor', 'Céline Dion', 'Francky Vincent', 'Les Charlots', 'Michel Delpech',
      'Gilbert Montagné', 'Boney M.', 'Ottawan', 'Sardou', 'La Compagnie Créole',
      'Rick Astley', 'Bon Jovi', 'Journey', 'Toto', 'ABBA', 'Queen', 'Kool & The Gang',
      'Bonnie Tyler', 'Cyndi Lauper', 'Europe', 'Survivor', 'The Weather Girls', 'Patrick Hernandez',
      'Lou Bega', 'Las Ketchup', 'Bob Sinclar', 'Dalida', 'Annie Cordy', 'Gala', 'Corona',
      'Images', 'Indochine', 'Téléphone', 'Gipsy Kings', 'Magic System',
    ].map((artist) => ({ artist })),
  },
  {
    id: 'fr',
    emoji: '🇫🇷',
    title: 'Chanson française',
    subtitle: 'Du classique au moderne',
    accent: '#60A5FA',
    seeds: [
      'Jean-Jacques Goldman', 'Daniel Balavoine', 'Francis Cabrel', 'Renaud', 'Jacques Brel',
      'Édith Piaf', 'Charles Aznavour', 'Serge Gainsbourg', 'Michel Sardou', 'Johnny Hallyday',
      'France Gall', 'Michel Berger', 'Julien Clerc', 'Véronique Sanson', 'Alain Souchon',
      'Téléphone', 'Indochine', 'Mylène Farmer', 'Zaz', 'Louane', 'Angèle', 'Clara Luciani',
      'Vianney', 'Stromae', 'Calogero', 'Bénabar', 'Julien Doré', 'Pierre Bachelet',
      'Jacques Dutronc', 'Georges Brassens',
      'Michel Polnareff', 'Claude Nougaro', 'Nino Ferrer', 'Laurent Voulzy', 'Patricia Kaas',
      'Florent Pagny', 'Pascal Obispo', 'Zazie', 'Patrick Bruel', '-M-', 'Les Rita Mitsouko',
      'Noir Désir', 'Christophe', 'Barbara', 'Joe Dassin', 'Dalida', 'Hoshi', 'Juliette Armanet',
      'Slimane', 'Christophe Maé', 'Grand Corps Malade', 'Gilbert Bécaud',
    ].map((artist) => ({ artist })),
  },
  {
    id: 'rapfr',
    emoji: '🎤',
    title: 'Rap FR',
    subtitle: 'Des pionniers à la nouvelle vague',
    accent: '#A78BFA',
    seeds: [
      'Jul', 'Ninho', 'PNL', 'Damso', 'Orelsan', 'Booba', 'SCH', 'Nekfeu', 'Gazo',
      'Aya Nakamura', 'Soprano', 'IAM', 'Suprême NTM', 'MC Solaar', 'Bigflo & Oli',
      'Vald', 'Lomepal', 'Dadju', 'Naps', 'Tiakola', 'Freeze Corleone', 'Sexion d\'Assaut',
      'Sniper', 'Diam\'s', 'Rohff', 'Sefyu', 'Niska', 'Maes', 'Werenoi', 'Fresh La Peufra',
      'Kaaris', 'Lacrim', 'Hamza', 'Alonzo', 'Kery James', 'Oxmo Puccino', 'Youssoupha',
      'Koba LaD', 'Zola', 'Heuss L\'enfoiré', 'Josman', 'Laylow', 'Rim\'K', 'Kalash Criminel',
      'La Fouine', 'Mister V', 'Lefa', 'Médine', 'Akhenaton', 'Disiz', 'Alpha Wann', 'Jok\'Air',
    ].map((artist) => ({ artist })),
  },
  {
    id: '80s',
    emoji: '📼',
    title: 'Années 80',
    subtitle: 'Synthés, épaulettes et refrains immortels',
    accent: '#F472B6',
    seeds: [
      'Michael Jackson', 'Madonna', 'Queen', 'Prince', 'a-ha', 'Depeche Mode', 'The Police',
      'Whitney Houston', 'Cyndi Lauper', 'Tears for Fears', 'Duran Duran', 'Bon Jovi',
      'Eurythmics', 'Toto', 'Wham!', 'Europe', 'Survivor', 'Rick Astley', 'Kool & The Gang',
      'Dire Straits', 'U2', 'Bananarama', 'Desireless', 'Lio', 'Indochine', 'Téléphone',
      'Jean-Jacques Goldman', 'Daniel Balavoine', 'The Cure', 'New Order',
      'Kim Wilde', 'Simple Minds', 'Billy Idol', 'Phil Collins', 'Lionel Richie', 'George Michael',
      'Pet Shop Boys', 'Culture Club', 'The Bangles', 'Laura Branigan', 'Spandau Ballet',
      'Soft Cell', 'Étienne Daho', 'Gold', 'Images', 'Jeanne Mas', 'Peter Gabriel', 'Kate Bush',
      'Van Halen', 'Bonnie Tyler', 'Murray Head', 'Patrick Coutin',
    ].map((artist) => ({ artist })),
  },
  {
    id: '90s',
    emoji: '💿',
    title: 'Années 90',
    subtitle: 'Eurodance, grunge et boys bands',
    accent: '#34D399',
    seeds: [
      'Nirvana', 'Oasis', 'Spice Girls', 'Backstreet Boys', 'Céline Dion', 'Mariah Carey',
      'TLC', 'Ace of Base', 'Blur', 'Radiohead', 'Red Hot Chili Peppers', 'No Doubt',
      'Alanis Morissette', 'Snap!', '2 Unlimited', 'Haddaway', 'Aqua', 'Eiffel 65',
      'Vengaboys', 'Daft Punk', 'Robert Miles', 'Lauryn Hill', 'The Notorious B.I.G.',
      '2Pac', 'Dr. Dre', 'R.E.M.', 'Green Day', 'The Cranberries', 'Savage Garden',
      'Ricky Martin', 'Pascal Obispo', 'Zebda', 'Alliage', 'Worlds Apart',
      'Britney Spears', 'Eagle-Eye Cherry', 'Fugees', 'Coolio', 'Dr. Alban', 'Corona',
      'Culture Beat', 'La Bouche', 'Blackstreet', 'Take That', 'Boyzone', 'Hanson',
      'Natalie Imbruglia', 'Texas', 'Moby', 'Fatboy Slim', 'Mylène Farmer', 'IAM',
      'Native', 'Larusso', 'Mano Negra', 'Les Négresses Vertes',
    ].map((artist) => ({ artist })),
  },
  {
    id: '2000s',
    emoji: '📱',
    title: 'Années 2000',
    subtitle: 'MP3, MSN et sonneries polyphoniques',
    accent: '#38BDF8',
    seeds: [
      'Coldplay', 'Linkin Park', 'Eminem', 'Rihanna', 'Beyoncé', 'The Black Eyed Peas',
      'Gorillaz', 'The Killers', 'Amy Winehouse', 'Nelly Furtado', 'Justin Timberlake',
      'Shakira', 'Kanye West', '50 Cent', 'OutKast', 'Maroon 5', 'Evanescence',
      'Avril Lavigne', 'Snow Patrol', 'Kings of Leon', 'Franz Ferdinand', 'The White Stripes',
      'Sean Paul', 'Usher', 'Christina Aguilera', 'P!nk', 'Diam\'s', 'Kyo', 'Superbus',
      'Corneille', 'Tryo', 'Yannick Noah',
      'Nelly', 'Gwen Stefani', 'Britney Spears', 'Lady Gaga', 'The Pussycat Dolls', 'Timbaland',
      'Akon', 'James Blunt', 'Mika', 'Katy Perry', 'Jennifer Lopez', 'Alizée', 'Lorie',
      'M. Pokora', 'Amel Bent', 'Christophe Maé', 'Grand Corps Malade', 'Sinik', 'Booba',
      'Bob Sinclar', 'Daft Punk', 'Muse',
    ].map((artist) => ({ artist })),
  },
  {
    id: '2010s',
    emoji: '🕶️',
    title: 'Années 2010',
    subtitle: 'La décennie streaming',
    accent: '#818CF8',
    seeds: [
      'Adele', 'Ed Sheeran', 'Bruno Mars', 'Drake', 'Daft Punk', 'Avicii', 'Calvin Harris',
      'David Guetta', 'Lorde', 'Lana Del Rey', 'Sia', 'Imagine Dragons', 'Twenty One Pilots',
      'The Weeknd', 'Post Malone', 'Billie Eilish', 'Dua Lipa', 'Ariana Grande',
      'Taylor Swift', 'Kendrick Lamar', 'Major Lazer', 'Kygo', 'Clean Bandit', 'Stromae',
      'GIMS', 'Kendji Girac', 'Louane', 'Christine and the Queens', 'Pharrell Williams',
      'Mark Ronson',
      'Rihanna', 'Katy Perry', 'Justin Bieber', 'Shawn Mendes', 'Sam Smith', 'Hozier',
      'Macklemore & Ryan Lewis', 'Gotye', 'OneRepublic', 'Martin Garrix', 'Zara Larsson',
      'Kungs', 'Indila', 'PNL', 'Angèle', 'Soprano', 'Bigflo & Oli', 'Jain',
      'Lilly Wood and The Prick', 'Nekfeu', 'Black M', 'Vianney',
    ].map((artist) => ({ artist })),
  },
  {
    id: 'rock',
    emoji: '🎸',
    title: 'Rock légendes',
    subtitle: 'Les riffs que personne n’a le droit de rater',
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
    subtitle: 'Boule à facettes obligatoire',
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
    title: 'Films & Séries',
    subtitle: 'Thèmes cultes du grand et du petit écran',
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
    title: 'Disney & dessins animés',
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
    title: 'Jeux vidéo',
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
    subtitle: 'Groove et voix d’or',
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
    subtitle: 'Ça sent les vacances',
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
    subtitle: 'Chorégraphies incluses',
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
    title: 'Tubes de l’été',
    subtitle: 'Ceux qui sentent la crème solaire',
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
    subtitle: 'Plutôt au buzzer : les titres sont coriaces',
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
    subtitle: 'Volume conseillé : trop fort',
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

/** Retire les doublons d'une playlist importee, sans limiter les artistes. */
function dedupe(tracks) {
  const seen = new Set();
  return tracks.filter((t) => {
    if (!t || (!t.preview && t.source !== 'youtube')) return false;
    const key = t.source === 'youtube' && !t.title ? `yt:${t.videoId}` : trackKey(t);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  if (!cat) throw new Error(`Catégorie inconnue : ${id}`);

  const cacheKey = `cat_${id}_v4`;
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
    // Six titres par artiste dans le vivier : la variete d'une partie (un titre
    // par artiste, artistes pas entendus recemment d'abord) est garantie au
    // moment de composer la liste des manches, voir variety.js.
    const maxPerArtist = cat.seeds.length > 15 ? 6 : 8;
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
    hint: 'Pioches dans toute la discographie, tubes et faces B mélangés.',
  },
  deep: {
    emoji: '🕵️', title: 'T’es un vrai fan ?',
    hint: 'Uniquement les morceaux que le grand public ne connaît pas.',
  },
};

/** Intros, interludes et pistes trop courtes ne font pas de bonnes manches. */
const FILLER = /^\s*(intro|outro|interlude|skit|prologue|epilogue|transition)\b/i;

/** Mention explicite d'invite dans le titre. Le « & » est volontairement exclu :
 *  « Strass & paillettes » n'est pas un featuring. */
const FEAT_IN_TITLE = /\b(feat\.?|ft\.?|featuring)\b/i;

function playableForGame(track) {
  if (!track?.preview) return false;
  if (track.duration && track.duration < 60) return false;
  return !FILLER.test(track.title || '');
}

/**
 * Compose une liste a partir d'un artiste.
 * Le rang de popularite Deezer separe les tubes du reste.
 */
async function buildArtist(artistId, mode = 'hits', { featurings = true } = {}) {
  const config = ARTIST_MODES[mode] || ARTIST_MODES.hits;
  const info = await dz.artistInfo(artistId);
  const [discography, collaborations] = await Promise.all([
    dz.artistDiscography(artistId),
    dz.artistCollaborations(artistId, info.name),
  ]);

  // Une discographie Deezer embarque des pistes qui ne sont pas de lui : les
  // compilations de son label (« Echelon » chez Vald : Aociz, Seezy, Sirius…)
  // ou l'album d'un proche ou il apparait a peine. Rien ne dit qu'il chante
  // dessus, et ces pistes noyaient les vraies : on ne garde que celles dont il
  // est l'artiste principal. Ses vrais featurings arrivent par `guests`, ou sa
  // presence est verifiee.
  const wanted = normalize(info.name);
  const own = discography.filter((t) => normalize(t.artist) === wanted);

  // L'exclusion se fait par identifiant de piste : le meme titre peut exister
  // en version solo et en version invitee, seule la seconde est un featuring.
  const sharedIds = new Set(collaborations.sharedIds);
  const sharedTitles = new Set(collaborations.sharedTitles || []);
  const isFeat = (t) => sharedIds.has(t.id)
    || sharedTitles.has(normalize(t.title))
    || FEAT_IN_TITLE.test(t.fullTitle || t.title);

  const solo = own.filter((t) => !isFeat(t)).map((t) => ({ ...t, feat: false }));
  const feats = [
    ...own.filter(isFeat),
    ...collaborations.guests,
  ].map((t) => ({ ...t, feat: true }));

  // Un meme morceau revient en single, en reedition, en version « reloaded » :
  // on ne garde que la version la mieux classee de chaque titre.
  const byTitle = new Map();
  for (const track of featurings ? [...solo, ...feats] : solo) {
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

  // Trois etages de popularite, en proportion du repertoire : le quart le plus
  // ecoute, le milieu, puis les raretes. Chaque mode dose ensuite ses etages
  // partie par partie (voir `pickQueue`) au lieu de tirer a plat : tiree
  // uniformement, une grosse discographie est faite aux deux tiers de faces B,
  // et « au hasard » ne sortait presque plus un tube.
  const tierOf = (i) => (i < ranked.length * 0.25 ? 0 : i < ranked.length * 0.6 ? 1 : 2);
  const tiered = ranked.map((t, i) => ({ ...t, tier: tierOf(i) }));

  let tracks;
  if (mode === 'hits') {
    // Assez large pour tourner sur plusieurs parties sans revenir aux memes.
    const hitCount = Math.max(20, Math.min(60, Math.round(ranked.length * 0.3)));
    tracks = tiered.slice(0, hitCount);
  } else if (mode === 'deep') {
    tracks = tiered.filter((t) => t.tier > 0);
  } else {
    tracks = tiered;
  }
  if (tracks.length < 8) tracks = tiered;   // repertoire trop mince pour trancher

  // Part des featurings dans une partie : celle du vivier, plafonnee au tiers.
  // Sans plafond, un repertoire riche en invitations ne joue plus que ca.
  const featCount = tracks.filter((t) => t.feat).length;
  const featShare = featurings ? Math.min(0.3, featCount / tracks.length) : 0;

  return {
    id: `artist-${artistId}-${mode}-${featurings ? 'f' : 'n'}`,
    title: `${info.name} — ${config.title}`,
    emoji: config.emoji,
    subtitle: `${tracks.length} titres${featurings ? `, dont ${featCount} featurings` : ', sans featuring'} sur ${ranked.length} au répertoire`,
    accent: '#F472B6',
    source: 'artist',
    artist: info,
    mode,
    featurings,
    // Toute la partie porte sur cet artiste : le demander n'aurait aucun sens.
    askArtist: false,
    // Regles de composition d'une partie, appliquees par `pickQueue`.
    mix: {
      groupBy: 'album',
      tiers: ARTIST_MIX[mode] || null,
      featShare,
    },
    tracks: shuffle(tracks),
  };
}

/**
 * Dosage des etages de popularite par partie.
 * « Au hasard » garde une majorite de titres connus : c'est ce qui le distingue
 * de « vrai fan », et ce qui le rend jouable a plusieurs.
 */
const ARTIST_MIX = {
  hits: null,
  random: { 0: 0.4, 1: 0.35, 2: 0.25 },
  deep: { 1: 0.5, 2: 0.5 },
};

module.exports = {
  CATEGORIES, listCategories, getCategory, buildCategory, diversify, dedupe, shuffle,
  ARTIST_MODES, buildArtist,
};
