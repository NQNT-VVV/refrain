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
| **Joueur** | `/j/CODE` | Les telephones. Formulaire de reponse ou buzzer. |

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

Deux autres sources dans la regie :

- **🔎 Ma selection** — recherche libre, on ajoute les titres un par un ;
- **📥 Importer une playlist** — colle une adresse **Deezer** ou **YouTube**, le
  type est reconnu tout seul.

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

Dans OBS, ajoute une **Source navigateur** :

- URL : `http://localhost:3000/screen?code=XXXX`
- Largeur 1920, hauteur 1080
- Coche **« Controler l'audio via OBS »** pour capturer la musique
- Coche **« Rafraichir le navigateur quand la scene devient active »**

Le bouton **⛶ Plein ecran** et le reglage de volume sont en bas a droite ; ils
s'estompent d'eux-memes, et le curseur disparait apres 3 s d'inactivite.

---

## Raccourcis clavier (regie)

| Touche | Effet |
|---|---|
| `Espace` | Lancer la partie / manche suivante |
| `R` | Reveler la reponse immediatement |
| `O` ou `Entree` | Valider un buzz (bonne reponse) |
| `N` ou `Echap` | Refuser un buzz |

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
npm run typecheck  # TypeScript
npm run dev        # dans un terminal
npm test           # dans un autre
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
