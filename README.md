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
npm start
```

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

---

## Listes de morceaux

**17 listes pretes** : Top du moment, Hymnes de soiree, Chanson francaise,
Rap FR, Annees 80 / 90 / 2000 / 2010, Rock legendes, Disco & Funk, Dancefloor,
Films & Series, Disney & dessins animes, Jeux video, R&B & Soul,
Latino & Reggaeton, Metal.

Elles sont construites a la volee depuis l'API Deezer (60 a 100 titres chacune,
melanges, deux morceaux maximum par artiste), puis mises en cache dans
`.cache/` pendant 6 h. Le premier chargement d'une liste prend quelques
secondes ; ensuite c'est instantane.

Deux autres sources dans la regie :

- **🔎 Ma selection** — recherche libre, on ajoute les titres un par un ;
- **📥 Playlist Deezer** — colle l'adresse d'une playlist publique
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

- Node 18+, Express, Socket.IO, `qrcode`. Aucun build, aucune base de donnees :
  l'etat des parties vit en memoire.
- Les extraits Deezer durent 30 s au maximum — d'ou la limite de duree d'ecoute.
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
server/
  index.js     serveur HTTP + Socket.IO + API
  game.js      salons, manches, scores, reconnexion
  catalog.js   les 17 listes et leur construction
  deezer.js    client API Deezer (cache disque + limiteur de debit)
  match.js     normalisation et comparaison floue des reponses
public/
  index.html   accueil
  host.html    regie
  screen.html  ecran de diffusion
  play.html    telephone joueur
test/
  e2e.mjs      partie complete simulee, dans les deux modes
```

### Tests

```bash
npm start          # dans un terminal
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
