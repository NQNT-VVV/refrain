# 🎧 Refrain

Refrain est un blind test multijoueur, sans compte ni base de donnees : l'animateur cree un salon,
les joueurs le rejoignent depuis leur telephone, et une page plein ecran separee
sert d'affichage a projeter, partager en visio ou capturer dans OBS.

La musique vient des extraits publics de 30 s de Deezer — **aucune cle API n'est
necessaire**.

---

## Demarrage

```bash
npm install
npm run build     # compile le front Next
npm start
```

En developpement, `npm run dev` suffit : Next compile a la volee, pas besoin de
build prealable.

Le serveur affiche les adresses utilisables :

```
  🎧  Refrain — serveur pret

     http://localhost:3000
     http://192.168.1.24:3000        <-- celle-ci pour les telephones du salon
```

Les joueurs doivent etre **sur le meme reseau Wi-Fi** que la machine qui heberge
le serveur, et utiliser l'adresse en `192.168.x.x` (pas `localhost`).

Pour changer de port : `PORT=8080 npm start`.

---

## Les trois pages

| Page | Adresse | Pour qui |
|---|---|---|
| **Regie** | `/host` | L'animateur. Choix des listes, reglages, pilotage des manches. |
| **Ecran** | `/screen` | La projection / le stream. Joue le son, affiche le QR code, les compte a rebours et les reponses. |
| **Joueur** | `/j/CODE` | Telephone **ou ordinateur** — la page s'adapte : une colonne au pouce, deux colonnes a la souris. |
| **Tuto** | `/tuto` | Comment ca marche, pour ceux qui decouvrent. |

### Deroule type

1. Ouvre `/host` : un code a 4 lettres est genere automatiquement.
2. Ouvre `/screen` sur l'ecran de projection, clique une fois sur
   **« Activer le son »** (obligatoire : les navigateurs bloquent la lecture
   automatique tant qu'il n'y a pas eu de geste utilisateur).
3. Les joueurs scannent le QR code affiche, ou saisissent le code sur la page
   d'accueil.
4. Dans la regie, choisis une liste, ajuste les reglages, puis **Lancer la partie**.

> Pas d'ecran separe ? Bascule **Sortie du son → « Ici »** dans la regie : la
> musique sort alors de la page animateur. Pratique en visio avec partage
> d'ecran, ou sur un simple ordinateur portable.

### Jouer a distance

L'option **« Son aussi sur les telephones »** (reglages de la regie) diffuse
l'extrait sur chaque telephone en plus de la sortie principale. Tous les
appareils partent du meme horodatage serveur, donc les lectures restent calees.
Chaque joueur garde un bouton 🔊 / 🔇 dans sa barre du haut.

C'est indispensable quand les joueurs ne sont pas dans la meme piece — visio,
soiree a distance. **Dans une meme piece, laisse l'option fermee** : une dizaine
de telephones a quelques dizaines de millisecondes d'ecart font de la bouillie.

Chaque joueur dispose alors d'un reglage de volume dans sa barre du haut. Sur
iOS, ecrire dans `audio.volume` n'a aucun effet — seuls les boutons physiques
agissent : l'application le detecte et le dit, plutot que d'afficher un curseur
inerte.

---

## Modes de jeu

### ⌨️ Reponse libre (par defaut)

Tout le monde tape le titre et l'artiste sur son telephone. La correction est
automatique et **indulgente** : accents, majuscules, ponctuation, fautes de
frappe, mentions `(Remastered 2011)` ou `feat. X` sont ignores. « jackson »
compte pour « Michael Jackson », « bohemian rapsodie » pour « Bohemian
Rhapsody ».

Un champ trouve se verrouille en vert : on peut continuer a chercher l'autre.
Revalider autant de fois que necessaire ne coute rien — seule la date du premier
succes compte.

**Points par manche** (reglable) :

| | Points |
|---|---|
| Titre trouve | 3 |
| Artiste trouve | 3 |
| Bonus de rapidite | jusqu'a 2 par champ, degressif pendant l'extrait |
| **Maximum** | **10** |

La manche se termine d'elle-meme des que tout le monde a tout trouve.

### 🔔 Buzzer

Le premier qui appuie coupe la musique. Son nom s'affiche en grand sur l'ecran,
il repond a voix haute, et l'animateur tranche :

- **✅ Bonne reponse** → points attribues, manche revelee ;
- **❌ Mauvaise reponse** → la musique reprend exactement ou elle s'etait arretee,
  et ce joueur est bloque pour le reste de la manche.

Deux garde-fous, tous deux reglables depuis la regie :

| Reglage | Par defaut | A quoi ca sert |
|---|---|---|
| **Delai avant buzz** | 3 s | Le buzzer reste ferme au debut de l'extrait, avec un decompte visible sur le telephone et sur l'ecran. Sans ca, la manche se gagne au reflexe des la premiere note plutot qu'a la reconnaissance du morceau. |
| **Temps pour repondre** | 5 s | Une fois le buzz pris, l'animateur a ce delai pour trancher. Passe ce temps **sans arbitrage, la reponse est comptee ratee** : la musique repart ou elle s'etait arretee, le buzzeur est bloque pour la manche, et les autres peuvent tenter leur chance. La partie ne reste jamais suspendue parce que quelqu'un a quitte la regie. |

---

## Listes de morceaux

**23 listes pretes** : Top du moment, Hymnes de soiree, Chanson francaise,
Rap FR, Annees 80 / 90 / 2000 / 2010, Rock legendes, Disco & Funk, Dancefloor,
Films & Series, Disney & dessins animes, Jeux video, R&B & Soul,
Latino & Reggaeton, Sons TikTok, K-pop, Afro & Amapiano, Punk & Emo,
Tubes de l'ete, Classique, Metal.

> **Classique** est volontairement etiquete « plutot au buzzer » : les titres
> renvoyes par Deezer ressemblent a « Symphony No. 5 in C minor, Op. 67: I.
> Allegro con brio », impossibles a taper au clavier. En buzzer, la liste
> fonctionne tres bien.

Elles sont construites a la volee depuis l'API Deezer (60 a 100 titres chacune,
melanges, deux morceaux maximum par artiste), puis mises en cache dans
`.cache/` pendant 6 h. Le premier chargement d'une liste prend quelques
secondes ; ensuite c'est instantane.

Chaque liste tient **90 a 215 titres** — quatre morceaux par artiste au
maximum — et se reconstruit toute seule au bout de six heures. Le bouton
**🔄 Actualiser** force la reconstruction immediatement.

### Ne pas rejouer les memes morceaux

Un vivier profond ne suffit pas : avec douze manches tirees dans quatre-vingts
titres, deux parties d'affilee partagent statistiquement trois morceaux. Le
salon **retient donc ce qu'il a deja joue** et sert d'abord les inedits. Il faut
epuiser tout le vivier avant qu'un morceau revienne.

Une seconde regle s'applique en composant la liste des manches : **deux titres
par artiste au maximum**, pour qu'une partie ne vire pas au monographique meme
si le vivier en contient quatre.

### Une partie sur un seul artiste

L'onglet **🎤 Un artiste** cherche un artiste et construit la partie sur son
seul repertoire. Trois profondeurs, calees sur le rang de popularite que Deezer
attribue a chaque piste :

| | |
|---|---|
| ⭐ **Les classiques** | Ses titres les plus connus — tout le monde peut suivre. |
| 🎲 **Au hasard** | Pioches dans toute la discographie, tubes et faces B melanges. |
| 🕵️ **T'es un vrai fan ?** | Uniquement ce que le grand public ne connait pas. |

**L'artiste n'est pas demande** : toute la partie porte sur lui, la question
n'aurait aucun sens. Seul le titre compte, et le reglage « demander aussi
l'artiste » se desactive tout seul.

Une case **« Inclure les featurings »** decide du sort de ses collaborations et
de ses passages invite chez d'autres. Trois pieges ont demande du soin :

- les pistes d'album ne portent ni contributeurs ni mention « feat » : la
  detection vient du top de l'artiste, qui les liste avec leur **role** ;
- se fier au nombre de contributeurs ne suffit pas — « Bohemian Rhapsody » ne
  credite que Queen en Main, « Under Pressure » credite Queen et Bowie ;
- l'exclusion se fait par identifiant de piste, et par titre uniquement quand
  *toutes* ses versions sont des collaborations. Le top de Queen contient quatre
  « Bohemian Rhapsody » — l'album, un live, un medley et une version avec les
  Muppets — et seule la version d'album doit survivre.

Resultat mesure : Vald passe de 230 a 198 titres, Queen de 208 a 202 —
« Under Pressure » sort, « Bohemian Rhapsody » et « Killer Queen » restent.

La discographie complete est reconstituee album par album, EP et singles
compris, puis dedoublonnee : un morceau sorti en single, en reedition et en
version « reloaded » ne compte qu'une fois, dans sa version la mieux classee.
Intros, interludes et pistes de moins d'une minute sont ecartes — ils ne font
pas de bonnes manches.

Exemple mesure : **Vald**, 226 titres au repertoire une fois nettoye. Classiques
45 titres (rang moyen 681 000), au hasard 226, vrai fan 156 (rang moyen 398 000).
Sur **Queen** l'ecart est encore plus marque : 614 000 contre 183 000.

Autres sources dans la regie :

- **🔎 Ma selection** — recherche libre, on ajoute les titres un par un ;
- **📥 Importer une playlist** — colle une adresse **Deezer**, **YouTube** ou
  **Spotify**, le type est reconnu tout seul.

### Playlists Spotify

Colle l'adresse d'une playlist publique. Spotify sert de **catalogue**, Deezer
de **source sonore** : depuis fin 2024, l'API Spotify ne renvoie plus d'extrait
de 30 s sur la plupart des morceaux en client-credentials. Elle reste excellente
pour savoir *quoi* jouer, mais ne donne plus de quoi le jouer.

Chaque morceau est donc retrouve chez Deezer par son **ISRC**, l'identifiant
international de l'enregistrement : pas d'ambiguite de titre, pas de reprise
prise pour l'original. A defaut d'ISRC, une recherche titre + artiste prend le
relais, verifiee par le meme correcteur que les reponses des joueurs. L'ecart
entre morceaux demandes et morceaux jouables s'affiche a l'import.

Le taux de resolution est eleve : mesure sur deux playlists publiques,
**115 titres jouables sur 116** et **198 sur 200**. Compter une vingtaine de
secondes pour une playlist de cent titres — l'avancement est visible dans la
regie.

⚠️ Les playlists **editoriales** de Spotify (identifiants en `37i9dQ…`, du genre
« Today's Top Hits ») ne sont plus accessibles en client-credentials depuis fin
2024 : elles repondent 404. Les playlists creees par des utilisateurs, elles,
fonctionnent normalement.

**Configuration.** Cree une application sur
[developer.spotify.com](https://developer.spotify.com/dashboard) : elle donne un
Client ID et un Client Secret. Le flux « client credentials » suffit.

```bash
kubectl -n refrain create secret generic refrain-spotify \
  --from-literal=SPOTIFY_CLIENT_ID='ton-client-id' \
  --from-literal=SPOTIFY_CLIENT_SECRET='ton-client-secret' \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl -n refrain rollout restart deploy/refrain
```

En local, `SPOTIFY_CLIENT_ID` et `SPOTIFY_CLIENT_SECRET` dans l'environnement.
Le Deployment lit ces cles en `optional: true` : **sans elles l'application
tourne normalement**, l'import Spotify est simplement masque dans la regie.
`GET /api/sources` dit ce que le serveur sait faire.

### Playlists YouTube

Colle l'adresse d'une playlist publique (celle qui contient `list=`). La lecture
est directe : pas de passage par Deezer.

Comme il n'y a **aucune cle API**, le serveur ne peut pas lire une playlist
YouTube. C'est le terminal charge du son — l'ecran de diffusion, ou la regie si
la sortie est reglee sur « Ici » — qui embarque un lecteur YouTube invisible,
remonte la liste des videos a l'import, puis le titre de chaque video au moment
de la jouer. Ce titre sert ensuite a la correction.

Trois consequences a connaitre :

- **Les titres sont ceux de YouTube**, pas d'un catalogue propre. Le serveur
  nettoie ce qu'il peut (« (Official Video) », « [Remastered in 4K] », « | Label »,
  conventions K-pop `ARTISTE 'Titre'`), mais ca reste moins net que Deezer.
- **L'artiste n'est demande que s'il est connaissable.** Une video intitulee
  simplement « Trois nuits par semaine » ne nomme pas Indochine : sur ces
  manches-la, le champ artiste disparait cote joueur et seuls les points du
  titre comptent. Le **mode buzzer** est souvent plus confortable sur ces listes.
- **Le son ne peut pas etre diffuse sur les telephones** avec YouTube : une video
  ne se replique pas proprement sur vingt appareils.
- L'ecran (ou la regie) doit rester connecte pendant toute la partie : c'est lui
  qui joue. Une video indisponible fait passer la manche automatiquement.

- **📥 Playlist Deezer** — l'adresse d'une playlist publique
  (`https://www.deezer.com/fr/playlist/1234567890`) ou juste son numero.

---

## Diffusion / OBS

La page `/screen?code=XXXX` est concue pour du 16/9 et se met a l'echelle en
`vmin` : elle reste lisible aussi bien en 1280×720 qu'en 4K.

### Mode stream

La regie propose un **lien pour OBS**, a copier tel quel dans une source
navigateur 1920×1080 avec « controler l'audio via OBS » coche. Il porte
`stream=1` et active tout ce qu'un viewer doit voir — et rien de ce qui sert a
l'operateur :

| | |
|---|---|
| **Carte d'invitation permanente** | Code, adresse et QR restent affiches pendant toute la partie. Un viewer qui arrive au milieu d'un stream peut rejoindre sans attendre le prochain salon. |
| **Commandes cachees** | Volume, plein ecran et badge beta disparaissent de la capture. Le clavier les remplace : `F` plein ecran, `M` muet, `↑` `↓` volume. |
| **Cote du classement** | `side=left` ou `side=right` (defaut). L'autre cote reste libre pour la webcam ou le chat ; la carte d'invitation se place a l'oppose. |
| **Fond transparent** | `bg=transparent` : la page ne peint rien derriere le jeu, OBS compose la scene du streamer au travers. |

Ces options se choisissent dans la regie, qui construit l'adresse.

**Grande audience.** Au-dela de douze joueurs, la liste de noms cede la place a
un compteur — « 847 / 2000 ont trouve » avec sa barre — et aux **cinq plus
rapides** de la manche, avec leur temps. A la revelation, le plus rapide a son
badge. C'est ce qu'un stream retient d'une manche ; douze pseudos sur deux mille
ne disent rien.

**Pause.** Le bouton ⏸ de la regie (ou `P`) fige le chrono et le son la ou ils
en sont — une coupure pub, un souci technique — et la reprise repart exactement
de la : la fin de manche est decalee du temps passe en pause. Fonctionne aussi
pendant un buzz. L'ecran et les telephones affichent « Pause ».

**Emojis.** Une source navigateur OBS, ou un PC de projection fraichement
installe, n'a souvent aucune police emoji : avatars et trophees s'affichent
alors en carres vides — sur l'ecran que tout le monde regarde. La police est
donc **embarquee** (Noto Color Emoji, 700 Ko) : meme rendu partout.

Sans `stream=1`, le bouton **⛶ Plein ecran** et le volume sont en bas a
droite ; ils s'estompent d'eux-memes, et le curseur disparait apres 3 s.

---

## Raccourcis clavier (regie)

| Touche | Effet |
|---|---|
| `Espace` | Lancer la partie / manche suivante |
| `R` | Reveler la reponse immediatement |
| `O` ou `Entree` | Valider un buzz (bonne reponse) |
| `N` ou `Echap` | Refuser un buzz |
| `P` | Pause / reprise |

Le bouton **Masquer** floute le morceau en cours et les manches a venir, si des
joueurs peuvent voir ton ecran.

---

## Notes techniques

- **Front** : Next.js 15 (App Router) en TypeScript, CSS Modules par page et un
  socle de jetons partages dans `app/globals.css`. Polices auto-hebergees via
  `next/font`, donc aucune requete vers un CDN externe au chargement.
- **Serveur** : Express + Socket.IO montent Next sur le meme serveur HTTP. Une
  seule connexion, un seul port, et les routes `/api/*` restent devant le rendu.
  Aucune base de donnees : l'etat des parties vit en memoire.
- Les extraits Deezer durent 30 s au maximum — d'ou la limite de duree d'ecoute.
- **Les URL d'extrait Deezer sont signees et expirent en moins d'une heure.** Les
  listes sont mises en cache 6 h, mais l'URL est systematiquement re-resolue
  pendant le compte a rebours de la manche : sans ca, une soiree un peu longue
  perdrait le son sur un `403`. La metrique
  `refrain_preview_refresh_total{result}` suit ce rafraichissement.
- La reponse n'est **jamais** envoyee aux telephones ni a l'ecran avant la
  revelation. Seule la regie la connait. L'URL de l'extrait ne part que vers le
  terminal charge du son.
- Reconnexion automatique : un joueur qui rafraichit sa page ou perd le reseau
  retrouve son score et sa progression (jeton stocke dans le navigateur).
- Les salons inactifs sont liberes au bout de 3 h.
- Le limiteur d'appels Deezer respecte le quota (~50 requetes / 5 s) et relance
  automatiquement en cas de depassement.

### Structure

```
server/                 CommonJS, sans build
  index.js              serveur HTTP, API, Socket.IO, montage de Next
  game.js               salons, manches, scores, reconnexion
  catalog.js            les 17 listes et leur construction
  deezer.js             client API Deezer (cache, limiteur de debit, extraits)
  match.js              normalisation et comparaison floue des reponses
  metrics.js            registre Prometheus

app/                    Next.js App Router
  layout.tsx            coquille commune, polices, fond anime, notifications
  globals.css           jetons de design et composants partages
  page.tsx              accueil (rendu serveur)
  host/                 regie animateur
  screen/               ecran de diffusion
  play/                 telephone joueur

lib/                    logique client partagee
  types.ts              types des charges utiles Socket.IO
  useGameSocket.ts      connexion temps reel et etat de partie
  useRoundClock.ts      compte a rebours cale sur l'horloge serveur
  useAudioPlayer.ts     lecture des extraits et deblocage autoplay
  sfx.ts, confetti.ts, clock.ts, toast.ts, storage.ts, game.ts

components/             Aurora, Toaster, QrCode
deploy/                 manifestes Kubernetes et supervision
test/e2e.mjs            partie complete simulee, dans les deux modes
```

### Tests

```bash
npm run typecheck    # TypeScript
npm run dev          # dans un terminal
npm test             # dans un autre
npm run test:rounds  # on peut repondre a chaque manche, pas qu'a la premiere
npm run test:artist  # mode artiste : featurings et absence de question artiste
npm run test:pause   # la pause fige chrono et son, la reprise repart de la
PLAYERS=2000 npm run load
```

Simule deux parties completes (reponse libre et buzzer) avec trois joueurs :
chargement de liste, correction, scores, buzz refuse puis valide, podium,
reconnexion, retour au salon.

---

## Deploiement

### Image

Chaque `push` sur `main` declenche le workflow `.github/workflows/image.yml`, qui
construit l'image et la publie sur `ghcr.io/nqnt-vvv/refrain` (tags `latest` et
`sha-xxxxxxx`).

Construction locale, si besoin :

```bash
docker build -t refrain .
docker run --rm -p 3000:3000 refrain
```

### Kubernetes

```bash
kubectl apply -f deploy/refrain.yaml
kubectl -n refrain rollout status deploy/refrain
```

Le manifeste cree un namespace `refrain`, un Deployment **a une seule replique**,
un Service et un Ingress `nginx` sur `refrain.danwalex.com`.

> **Une seule replique, et c'est volontaire.** L'etat des parties vit en memoire :
> deux repliques voudraient dire deux jeux de salons sans rien pour les relier, et
> les connexions Socket.IO d'une meme partie atterriraient au hasard sur l'une ou
> l'autre. La strategie de deploiement est `Recreate` pour la meme raison.
> Un redemarrage coupe les parties en cours — pour une soiree blind test, c'est
> un compromis acceptable face a une base de donnees a maintenir.

L'Ingress allonge `proxy-read-timeout` et `proxy-send-timeout` a une heure : sans
ca, nginx couperait les connexions Socket.IO au bout de 60 s.

Mise a jour vers la derniere image :

```bash
kubectl -n refrain rollout restart deploy/refrain
```

---

## Fluidite de l'affichage

Un rapport de terrain signalait « 10 images par seconde ». Reproduit puis mesure
page par page, effet par effet — l'origine n'etait pas le JavaScript : ca ramait
autant dans le salon d'attente, ou rien ne bouge.

Deux coupables, tous deux dans le CSS :

| Mesure sur la regie | Images/s |
|---|---|
| Avant | **6 a 7** |
| Fond en degrade radial au lieu d'un flou anime | 24 |
| Panneaux translucides au lieu de `backdrop-filter` | **60** |

**Le fond anime.** Trois halos en `filter: blur(90px)` dont l'animation touchait
a l'echelle : changer la taille d'un element floute oblige le navigateur a
recalculer le flou a chaque image. Un **degrade radial** est doux par nature,
sans filtre : le halo devient une texture que le compositeur se contente de
deplacer. L'animation ne fait plus que translater.

**Le verre depoli des cartes.** `backdrop-filter` doit refaire son flou des que
le fond change — et le fond bougeait en permanence. Sur la regie, une dizaine de
cartes recalculaient donc leur flou soixante fois par seconde. Un aplat
translucide (`--panel`) rend la meme lisibilite pour rien.

En prime, le compte a rebours ne declenche plus un rendu React par image : il ne
publie que lorsque l'affichage change vraiment, soit une dizaine de fois par
seconde au lieu de soixante. Sur la regie, chaque rendu re-parcourait la liste
des joueurs et les vingt-trois cartes du catalogue.

> Les deux regles a retenir : **ne pas animer la taille d'un element floute**, et
> **ne pas poser de `backdrop-filter` au-dessus d'un fond qui bouge**. Les
> commentaires du CSS le rappellent sur place.

---

## Tenir la charge

Une partie diffusee en stream peut rassembler des milliers de joueurs. Deux
regles rendent ca tenable, et `test/load.mjs` verifie qu'elles tiennent :

- **On ne diffuse jamais la liste complete des joueurs.** L'etat public porte un
  classement borne (douze lignes pour les joueurs et l'ecran, cinquante pour la
  regie) plus des compteurs. Chaque joueur recoit **sa** ligne — score, rang,
  reponses — sur un canal Socket.IO qui lui est propre, aux bornes de manche
  seulement.
- **Les diffusions sont regroupees.** Deux mille joueurs qui rejoignent ou qui
  repondent dans la meme seconde ne declenchent pas deux mille serialisations :
  l'etat part au plus toutes les 180 ms, sauf changement de phase qui passe
  devant. Les reponses sont par ailleurs limitees a une toutes les 300 ms par
  joueur.

Mesure sur une manche complete avec **2000 joueurs** (24 cœurs, Node 22) :

| | |
|---|---|
| Connexion des 2000 joueurs | **1,9 s**, aucun echec |
| 2000 reponses traitees | **1,0 s** |
| Messages `state` recus par joueur, sur toute la manche | **9** |
| Charge `state` la plus grosse | **5,1 Ko** — identique a 500 joueurs |
| Total recu par un joueur | 26 Ko |
| Memoire du serveur | 119 Mo au repos → **183 Mo** |
| Temps processeur | 3 s |

Le point important est la ligne **5,1 Ko a 500 comme a 2000 joueurs** : c'est ce
qui prouve que la charge ne depend plus du nombre de participants. Sans le
classement borne, l'etat aurait pese ~240 Ko et serait parti a chaque reponse.

`MAX_PLAYERS` (2000 par defaut) plafonne un salon.

---

## Supervision

L'application expose des metriques Prometheus sur un **port distinct** du port
applicatif (`METRICS_PORT`, 9464 par defaut). L'Ingress ne route que le port
3000 : `/metrics` reste donc joignable depuis le cluster uniquement, sans avoir
a filtrer quoi que ce soit cote nginx.

```bash
kubectl apply -f deploy/monitoring.yaml
```

Cree un `ServiceMonitor` (repris automatiquement par le kube-prometheus-stack) et
une ConfigMap `grafana_dashboard=1` que le sidecar Grafana charge dans un dossier
**Refrain**.

Au-dela des metriques Node standard (`process_*`, `nodejs_*`), Refrain expose :

| Metrique | Ce qu'elle raconte |
|---|---|
| `refrain_rooms{phase}` | Ou en sont les parties : salon, ecoute, revelation… |
| `refrain_players{state}` | Joueurs connectes / total |
| `refrain_screens_connected`, `refrain_hosts_online` | Ecrans de diffusion et regies ouvertes |
| `refrain_socket_clients` | Connexions Socket.IO, tous roles confondus |
| `refrain_games_started_total{mode}` | Parties lancees, par mode de jeu |
| `refrain_rounds_finished_total{reason}` | Manches terminees : `timeout`, `complete`, `buzzer`, `host` |
| `refrain_answers_total{field,result}` | Titres et artistes soumis, trouves ou rates |
| `refrain_answer_latency_seconds{field}` | Rapidite des bonnes reponses dans l'extrait |
| `refrain_buzzes_total` | Buzz effectivement pris |
| `refrain_buzz_rejected_total{reason}` | Appuis refuses : `too_early`, `taken`, `locked_out` |
| `refrain_buzz_verdicts_total{verdict}` | Arbitrages : `good`, `bad`, `timeout` (expiration) |
| `refrain_points_awarded_total` | Points distribues |
| `refrain_playlist_selections_total{source,id}` | Listes reellement jouees |
| `refrain_deezer_requests_total{outcome}` | Appels Deezer : `ok`, `quota`, `timeout`, `error` |
| `refrain_deezer_cache_total{result}` | Efficacite du cache 6 h |
| `refrain_catalog_build_duration_seconds{category}` | Cout de construction d'une liste a froid |

Le tableau de bord regroupe tout ca en quatre blocs : vue d'ensemble, activite de
jeu, Deezer, sante du processus.

---

## Donnees et conditions

La page **`/legal`** decrit ce que le service fait des donnees et pose les
conditions d'utilisation. Elle n'a pas ete redigee de memoire : chaque
affirmation a ete verifiee sur l'application deployee.

| Verifie | Resultat |
|---|---|
| Cookies deposes | **aucun**, sur les trois pages |
| Domaines tiers contactes par le navigateur | **`dzcdn.net` seulement** (pochettes et extraits) |
| Polices | auto-hebergees par `next/font`, aucun appel a Google |
| Etiquettes des metriques | `category`, `field`, `phase`, `state`… — aucun pseudo |

Les points que la page assume plutot que de les taire : le CDN Deezer voit
l'adresse IP des joueurs comme n'importe quelle image du web ; le lecteur
YouTube depose ses propres cookies, mais uniquement sur l'appareil qui diffuse
le son et seulement si une playlist YouTube est utilisee ; l'hebergement
conserve des journaux techniques.

Cote musique, la page rappelle que **rien n'est heberge** — les extraits sont
diffuses par Deezer et YouTube depuis leurs propres serveurs — et que les droits
restent entierement ceux des artistes et ayants droit.

> Ce texte decrit fidelement le fonctionnement du service, mais ne vaut pas
> conseil juridique. Un usage public ou diffuse releve de regles differentes
> d'une soiree privee : la page le signale explicitement.

---

## En cas de pepin

**Pas de son sur l'ecran.** Clique une fois sur la page. Les navigateurs
refusent de jouer un son tant que l'utilisateur n'a pas interagi.

**Les joueurs ne peuvent pas se connecter.** Verifie qu'ils utilisent l'adresse
`192.168.x.x` et non `localhost`, et que le pare-feu de la machine laisse passer
le port 3000.

**Une liste ne se charge pas.** Deezer est peut-etre momentanement indisponible
ou l'acces reseau est filtre. Essaie une autre liste, ou construis ta selection
a la main via l'onglet recherche. Supprimer `.cache/` force une reconstruction.

**Un morceau n'a pas d'extrait.** Les titres sans extrait jouable sont ecartes
automatiquement a la construction de la liste.

**« L'extrait n'a pas pu etre charge ».** L'URL signee de Deezer a expire ou son
CDN a refuse la requete. Le serveur re-resout l'URL a chaque manche ; si le
message revient souvent, verifie la connectivite sortante vers `dzcdn.net`.
