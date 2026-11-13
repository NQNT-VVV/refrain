import Link from 'next/link';
import type { Metadata } from 'next';

import { Icon } from '@/components/Icon';
import { Brand } from '@/components/Brand';
import styles from './legal.module.css';

export const metadata: Metadata = {
  title: 'Données et conditions',
  description: 'Ce que Refrain fait de vos données — c’est-à-dire presque rien — et les conditions d’utilisation.',
};

const RESUME = [
  { mark: '', title: 'Aucun compte obligatoire', text: 'Ni email, ni mot de passe, ni inscription. Un pseudo suffit. Si vous êtes connecté à Podium, le hub des jeux, il vous reconnaît — c’est facultatif.' },
  { mark: '', title: 'Presque aucun cookie', text: 'Un seul, anonyme, pour les modes solo (musique du jour, playlist de la semaine). Pas de traceur, pas de mesure d’audience, pas de publicité.' },
  { mark: '', title: 'Aucune base de données', text: 'Les parties vivent dans la mémoire du serveur. Seul le classement de fin de partie est envoyé à Podium, quand le serveur y est relié.' },
];

export default function LegalPage() {
  return (
    <div className={styles.wrap}>
      <div className={styles.topbar}>
        <Brand />
        <span className={styles.spacer} />
        <Link className="btn sm" href="/"><Icon name="precedent" />Accueil</Link>
      </div>

      <header className={styles.hero}>
        <h1>Données et conditions</h1>
        <p>
          Refrain est un jeu de soirée, pas un service qui vit de vos données. Cette page décrit
          exactement ce que l’application fait — et surtout ce qu’elle ne fait pas.
        </p>
      </header>

      <div className={styles.summary}>
        {RESUME.map((r) => (
          <div key={r.title}>
            <span className={styles.mark}>{r.mark}</span>
            <b>{r.title}</b>
            <span>{r.text}</span>
          </div>
        ))}
      </div>

      <section className={styles.section}>
        <h2>Vos données</h2>

        <h3>Ce que le serveur garde pendant la partie</h3>
        <p>
          Le temps d’un salon, et uniquement en mémoire vive : votre <b>pseudo</b> — celui que
          vous choisissez, rien ne vous oblige à donner votre vrai prénom —, un emoji d’avatar,
          votre score, les réponses que vous tapez, et un jeton aléatoire qui vous permet de
          retrouver votre place si vous rafraîchissez la page.
        </p>
        <p>
          Il n’y a <b>aucune base de données</b>. Un salon disparaît après trois heures sans
          activité, vingt minutes s’il est vide, ou immédiatement au redémarrage du serveur.
          Quitter la partie vous retire sur-le-champ.
        </p>

        <h3>Les modes solo</h3>
        <p>
          La musique du jour et la playlist de la semaine gardent votre progression en mémoire le temps de la
          journée ou de la semaine : étape en cours, tentatives, score. Pour retrouver votre partie sans compte,
          un cookie anonyme <code>refrain_daily</code> — un identifiant aléatoire, rien d’autre — est déposé
          pour huit jours. Le tirage des morceaux est mis en cache sur le serveur, sans lien avec les joueurs.
        </p>

        <h3>Podium, le hub des jeux</h3>
        <p>
          Refrain peut être relié à <b>Podium</b> (<code>podium.danwalex.com</code>), qui tient un classement commun
          à plusieurs jeux. C’est un projet personnel, <b>sans aucun but commercial</b>, à finalité purement
          technique : reconnaître un joueur d’un jeu à l’autre et classer les parties.
        </p>
        <ul>
          <li>
            <b>Ce que Refrain lit</b> — le cookie <code>nqnt_id</code> posé par Podium sur <code>.danwalex.com</code>,
            s’il existe : il contient votre identifiant Podium, votre pseudo et votre avatar, signés par le hub.
            Refrain s’en sert pour pré-remplir votre pseudo et rattacher vos résultats à votre compte. Il ne
            peut ni le créer ni le modifier.
          </li>
          <li>
            <b>Ce que Refrain envoie</b> — à la fin de chaque partie, le classement : jeu, mode, date, et pour chaque
            joueur le pseudo tapé en jeu, l’avatar, le score et le rang. Pour les joueurs connectés à Podium,
            leur identifiant Podium y est joint ; pour les autres, rien de plus que le pseudo. Les modes solo
            envoient votre score au défi du jour ou de la semaine, uniquement si vous êtes connecté.
          </li>
          <li>
            <b>Pour ne pas être concerné</b> — ne vous connectez pas à Podium. Vos parties y apparaissent alors
            sous le pseudo tapé en jeu, sans identifiant, et n’entrent dans aucun classement.
          </li>
        </ul>
        <p>
          Ce que Podium fait ensuite de ces données, combien de temps il les garde et comment supprimer son compte
          est décrit sur <a href="https://podium.danwalex.com/confidentialite">sa propre page de confidentialite</a>.
        </p>

        <h3>Ce qui reste sur votre appareil</h3>
        <p>
          Quelques réglages, stockés dans le navigateur et <b>jamais envoyés ailleurs</b> : votre
          jeton de session pour le salon en cours, le dernier pseudo utilisé, votre volume et votre
          sourdine, et pour un animateur le code de son salon. Vider les données du site les efface.
        </p>

        <h3>Cookies et traceurs</h3>
        <p>
          En dehors du cookie anonyme des modes solo décrit plus haut, l’application ne dépose
          <b>aucun cookie</b>. Pas de Google Analytics, pas de pixel, pas de régie publicitaire. Les polices
          de caractères sont servies depuis notre propre serveur : même afficher la page ne prévient personne.
        </p>

        <h3>Ce que votre navigateur contacte quand même</h3>
        <ul>
          <li>
            <b>Deezer</b> — les pochettes et les extraits de 30 s sont chargés directement depuis
            son réseau de diffusion (<code>dzcdn.net</code>). Deezer voit donc votre adresse IP,
            comme pour n’importe quelle image affichée sur le web.
          </li>
          <li>
            <b>YouTube</b> — uniquement si l’animateur importe une playlist YouTube, et
            uniquement sur l’appareil qui diffuse le son. Le lecteur YouTube dépose alors ses
            propres cookies, sur lesquels nous n’avons pas la main. Les téléphones des joueurs
            ne sont pas concernés.
          </li>
          <li>
            <b>Spotify</b> — interrogé par le serveur, jamais par votre navigateur. Aucune donnée
            vous concernant ne lui parvient.
          </li>
        </ul>

        <h3>Journaux techniques</h3>
        <p>
          Comme tout site, l’hébergement conserve des journaux techniques — adresse IP, date,
          page demandée — nécessaires au fonctionnement et à la sécurité. Ils ne servent à aucun
          profilage et ne sont recoupés avec rien.
        </p>
        <p>
          Des compteurs de fonctionnement sont également collectés : nombre de salons, de manches
          jouées, de réponses justes. Ce sont des <b>totaux anonymes</b> : aucun pseudo, aucune
          réponse, aucun identifiant n’y figure.
        </p>

        <h3>Vos droits</h3>
        <p>
          Le règlement européen vous donne un droit d’accès, de rectification et
          d’effacement. Ici, il n’y a rien à exporter ni à supprimer durablement :
          quittez la partie, videz les données du site, ou attendez — tout disparaît de lui-même.
          Pour toute question, contactez <b>danwalex</b>.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Conditions d’utilisation</h2>

        <h3>Le service</h3>
        <p>
          Refrain est mis à disposition <b>gratuitement</b>, sans compte et sans engagement. Il est
          en <b>bêta</b> : il peut évoluer, s’interrompre ou perdre une partie en cours sans
          préavis. Aucune garantie de disponibilité n’est donnée.
        </p>

        <h3>La musique</h3>
        <p>
          <b>Refrain n’héberge aucune musique.</b> Les extraits de 30 s proviennent de
          l’API publique de Deezer et sont diffusés depuis ses propres serveurs ; les
          playlists YouTube sont lues par le lecteur officiel de YouTube. L’application ne
          stocke, ne copie et ne redistribue aucun fichier audio.
        </p>
        <p>
          <b>Les droits restent entièrement ceux des artistes, auteurs, compositeurs, producteurs
          et ayants droit.</b> Rien ici ne transfère ni ne concède le moindre droit sur ces œuvres.
          Le service se contente d’orchestrer un jeu autour d’extraits mis à disposition
          par ces plateformes, dans un cadre de divertissement privé.
        </p>
        <p>
          Si vous êtes ayant droit et souhaitez qu’une œuvre ne soit plus jouable via le
          service, contactez <b>danwalex</b> : elle sera retirée.
        </p>

        <h3>Usage attendu</h3>
        <ul>
          <li>Choisissez un pseudo correct : il s’affiche en grand sur l’écran de tout le monde.</li>
          <li>Ne perturbez pas les parties des autres et n’essayez pas de contourner le jeu.</li>
          <li>L’animateur répond des listes qu’il importe et de la tenue de son salon.</li>
          <li>Le service est destiné à un usage privé et amical, sans contrepartie financière.</li>
        </ul>

        <h3>Responsabilité</h3>
        <p>
          Le service est fourni « en l’état ». Il ne saurait être tenu responsable d’une
          interruption, d’une partie perdue, d’un contenu remonté par les plateformes
          tierces, ni de l’usage qui en est fait par les participants.
        </p>

        <div className={styles.note}>
          <span>
            <b>Un usage public ou commercial n’est pas le même qu’une soirée entre
            amis.</b> Diffuser une partie devant une audience, en direct ou non, relève de règles
            différentes selon les pays et les plateformes. Renseignez-vous avant, cette page ne
            vaut pas conseil juridique.
          </span>
        </div>
      </section>

      <p className={styles.updated}>
        Cette page décrit le fonctionnement réel du service. Une question ? <b>danwalex</b>.
      </p>
    </div>
  );
}
