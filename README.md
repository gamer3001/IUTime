# IUTime

Mon emploi du temps IUT Lille, en version web — pensé pour être plus lisible et plus rapide que Hyperplanning, avec une interface mobile et une interface bureau.

🔗 [gamer3001.github.io/IUTime](https://gamer3001.github.io/IUTime/)

## Pourquoi

Hyperplanning est lent, pas terrible sur téléphone, et il faut se reconnecter sans arrêt. J'ai voulu un site simple qui affiche juste mon planning, à jour automatiquement, sans compte ni connexion à faire à chaque fois.

## Fonctionnalités

- Vue **Jour** et vue **Semaine** (du lundi au samedi, pas de colonne inutile le dimanche)
- Version **mobile** (`index.html`) et version **ordinateur** (`pc.html`), avec un bouton pour passer de l'une à l'autre
- Chaque matière a sa propre couleur, avec une légende
- Les cours annulés / prof absent sont signalés visuellement
- Mise à jour automatique de l'emploi du temps toutes les 10 minutes
- Navigation au clavier sur la version PC (← → pour changer de jour/semaine, `t` pour revenir à aujourd'hui)
- Petit calendrier pour sauter directement à une date

## Comment ça marche

Le site est entièrement statique (HTML/CSS/JS, aucun serveur, aucune dépendance). Le souci, c'est que le navigateur ne peut pas aller chercher directement le fichier `.ics` d'Hyperplanning (bloqué par leur serveur). Du coup :

1. Un **GitHub Action** (`.github/workflows/sync-edt.yml`) tourne toutes les 10 minutes, télécharge le `.ics` depuis Hyperplanning côté serveur (là, pas de blocage), et le commit dans `data/edt.ics`.
2. Le site (`script.js`) va simplement lire ce fichier local, le parse, et affiche le planning.

Le tout est hébergé gratuitement sur **GitHub Pages**.

## Fichiers du projet

| Fichier | Rôle |
|---|---|
| `index.html` | Page mobile |
| `pc.html` | Page ordinateur |
| `styles.css` | Style commun aux deux versions |
| `desktop.css` | Ajustements spécifiques à la version PC |
| `script.js` | Toute la logique : récupération, parsing du `.ics`, affichage |
| `.github/workflows/sync-edt.yml` | Synchro automatique du planning |
| `data/edt.ics` | Le fichier d'emploi du temps, mis à jour automatiquement |

## Mise en place (si je dois refaire ça un jour)

1. Créer un secret de repo `EDT_ICS_URL` (`Settings → Secrets and variables → Actions`) avec le lien `.ics` complet d'Hyperplanning.
2. Activer les permissions d'écriture du workflow (`Settings → Actions → General → Workflow permissions → Read and write permissions`).
3. Vérifier que GitHub Pages sert bien la branche `main`, racine du repo (`Settings → Pages`).
4. Lancer le workflow une première fois manuellement (`Actions → Sync emploi du temps → Run workflow`) pour créer `data/edt.ics`.

## À propos du cache

Les fichiers `script.js`, `styles.css` et `desktop.css` sont chargés avec un paramètre de version (`?v=6`). À chaque modification de l'un de ces fichiers, il faut monter ce numéro dans `index.html` et `pc.html`, sinon les visiteurs peuvent continuer à voir l'ancienne version à cause du cache du navigateur.