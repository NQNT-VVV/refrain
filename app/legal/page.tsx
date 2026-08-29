import Link from 'next/link';
import type { Metadata } from 'next';

import { Brand } from '@/components/Brand';
import styles from './legal.module.css';

export const metadata: Metadata = {
  title: 'Donnees et conditions',
  description: 'Ce que Refrain fait de vos donnees — c\'est-a-dire presque rien — et les conditions d\'utilisation.',
};

const RESUME = [
  { mark: '🚫', title: 'Aucun compte', text: 'Ni email, ni mot de passe, ni inscription. Un pseudo suffit, et il disparait avec la partie.' },
  { mark: '🍪', title: 'Aucun cookie', text: 'L\'application n\'en depose aucun. Pas de traceur, pas de mesure d\'audience, pas de publicite.' },
  { mark: '🗄️', title: 'Aucune base de donnees', text: 'Tout vit dans la memoire du serveur et s\'efface a la fin de la partie.' },
];

export default function LegalPage() {
  return (
    <div className={styles.wrap}>
      <div className={styles.topbar}>
        <Brand />
        <span className={styles.spacer} />
        <Link className="btn sm" href="/">← Accueil</Link>
      </div>

      <header className={styles.hero}>
        <h1>Donnees et conditions</h1>
        <p>
          Refrain est un jeu de soiree, pas un service qui vit de vos donnees. Cette page decrit
          exactement ce que l&apos;application fait — et surtout ce qu&apos;elle ne fait pas.
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
        <h2>Vos donnees</h2>

        <h3>Ce que le serveur garde pendant la partie</h3>
        <p>
          Le temps d&apos;un salon, et uniquement en memoire vive : votre <b>pseudo</b> — celui que
          vous choisissez, rien ne vous oblige a donner votre vrai prenom —, un emoji d&apos;avatar,
          votre score, les reponses que vous tapez, et un jeton aleatoire qui vous permet de
          retrouver votre place si vous rafraichissez la page.
        </p>
        <p>
          Il n&apos;y a <b>aucune base de donnees</b>. Un salon disparait apres trois heures sans
          activite, vingt minutes s&apos;il est vide, ou immediatement au redemarrage du serveur.
          Quitter la partie vous retire sur-le-champ.
        </p>

        <h3>Ce qui reste sur votre appareil</h3>
        <p>
          Quelques reglages, stockes dans le navigateur et <b>jamais envoyes ailleurs</b> : votre
          jeton de session pour le salon en cours, le dernier pseudo utilise, votre volume et votre
          sourdine, et pour un animateur le code de son salon. Vider les donnees du site les efface.
        </p>

        <h3>Cookies et traceurs</h3>
        <p>
          L&apos;application ne depose <b>aucun cookie</b>. Pas de Google Analytics, pas de pixel,
          pas de regie publicitaire. Les polices de caracteres sont servies depuis notre propre
          serveur : meme afficher la page ne previent personne.
        </p>

        <h3>Ce que votre navigateur contacte quand meme</h3>
        <ul>
          <li>
            <b>Deezer</b> — les pochettes et les extraits de 30 s sont charges directement depuis
            son reseau de diffusion (<code>dzcdn.net</code>). Deezer voit donc votre adresse IP,
            comme pour n&apos;importe quelle image affichee sur le web.
          </li>
          <li>
            <b>YouTube</b> — uniquement si l&apos;animateur importe une playlist YouTube, et
            uniquement sur l&apos;appareil qui diffuse le son. Le lecteur YouTube depose alors ses
            propres cookies, sur lesquels nous n&apos;avons pas la main. Les telephones des joueurs
            ne sont pas concernes.
          </li>
          <li>
            <b>Spotify</b> — interroge par le serveur, jamais par votre navigateur. Aucune donnee
            vous concernant ne lui parvient.
          </li>
        </ul>

        <h3>Journaux techniques</h3>
        <p>
          Comme tout site, l&apos;hebergement conserve des journaux techniques — adresse IP, date,
          page demandee — necessaires au fonctionnement et a la securite. Ils ne servent a aucun
          profilage et ne sont recoupes avec rien.
        </p>
        <p>
          Des compteurs de fonctionnement sont egalement collectes : nombre de salons, de manches
          jouees, de reponses justes. Ce sont des <b>totaux anonymes</b> : aucun pseudo, aucune
          reponse, aucun identifiant n&apos;y figure.
        </p>

        <h3>Vos droits</h3>
        <p>
          Le reglement europeen vous donne un droit d&apos;acces, de rectification et
          d&apos;effacement. Ici, il n&apos;y a rien a exporter ni a supprimer durablement :
          quittez la partie, videz les donnees du site, ou attendez — tout disparait de lui-meme.
          Pour toute question, contactez <b>danwalex</b>.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Conditions d&apos;utilisation</h2>

        <h3>Le service</h3>
        <p>
          Refrain est mis a disposition <b>gratuitement</b>, sans compte et sans engagement. Il est
          en <b>beta</b> : il peut evoluer, s&apos;interrompre ou perdre une partie en cours sans
          preavis. Aucune garantie de disponibilite n&apos;est donnee.
        </p>

        <h3>La musique</h3>
        <p>
          <b>Refrain n&apos;heberge aucune musique.</b> Les extraits de 30 s proviennent de
          l&apos;API publique de Deezer et sont diffuses depuis ses propres serveurs ; les
          playlists YouTube sont lues par le lecteur officiel de YouTube. L&apos;application ne
          stocke, ne copie et ne redistribue aucun fichier audio.
        </p>
        <p>
          <b>Les droits restent entierement ceux des artistes, auteurs, compositeurs, producteurs
          et ayants droit.</b> Rien ici ne transfere ni ne concede le moindre droit sur ces oeuvres.
          Le service se contente d&apos;orchestrer un jeu autour d&apos;extraits mis a disposition
          par ces plateformes, dans un cadre de divertissement prive.
        </p>
        <p>
          Si vous etes ayant droit et souhaitez qu&apos;une oeuvre ne soit plus jouable via le
          service, contactez <b>danwalex</b> : elle sera retiree.
        </p>

        <h3>Usage attendu</h3>
        <ul>
          <li>Choisissez un pseudo correct : il s&apos;affiche en grand sur l&apos;ecran de tout le monde.</li>
          <li>Ne perturbez pas les parties des autres et n&apos;essayez pas de contourner le jeu.</li>
          <li>L&apos;animateur repond des listes qu&apos;il importe et de la tenue de son salon.</li>
          <li>Le service est destine a un usage prive et amical, sans contrepartie financiere.</li>
        </ul>

        <h3>Responsabilite</h3>
        <p>
          Le service est fourni « en l&apos;etat ». Il ne saurait etre tenu responsable d&apos;une
          interruption, d&apos;une partie perdue, d&apos;un contenu remonte par les plateformes
          tierces, ni de l&apos;usage qui en est fait par les participants.
        </p>

        <div className={styles.note}>
          <span className={styles.mark}>ℹ️</span>
          <span>
            <b>Un usage public ou commercial n&apos;est pas le meme qu&apos;une soiree entre
            amis.</b> Diffuser une partie devant une audience, en direct ou non, releve de regles
            differentes selon les pays et les plateformes. Renseignez-vous avant, cette page ne
            vaut pas conseil juridique.
          </span>
        </div>
      </section>

      <p className={styles.updated}>
        Cette page decrit le fonctionnement reel du service. Une question ? <b>danwalex</b>.
      </p>
    </div>
  );
}
