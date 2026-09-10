# IUTime — emploi du temps IUT Lille

Site statique (HTML/CSS/JS, sans dépendance) qui affiche l'emploi du temps
récupéré depuis Hyperplanning (IUT Lille), avec une interface mobile
(`index.html`) et une interface bureau (`pc.html`).

## Comment ça marche

Le navigateur ne peut pas aller chercher directement le `.ics` de l'IUT
(CORS bloqué côté serveur univ-lille.fr). À la place :

1. Un workflow **GitHub Actions** (`.github/workflows/sync-edt.yml`) tourne
   toutes les 10 minutes, télécharge le `.ics` depuis l'IUT côté serveur
   (pas de blocage CORS là), et le commit dans `data/edt.ics`.
2. Le site (`script.js`) va chercher ce fichier `data/edt.ics` en local —
   même origine, donc pas de blocage.

## Mise en place (à faire une seule fois)

1. **Secret du lien `.ics`** — `Settings → Secrets and variables → Actions
   → New repository secret` : nom `EDT_ICS_URL`, valeur = l'URL complète
   Hyperplanning (avec `idICal=...&param=...`).
2. **Permissions d'écriture** — `Settings → Actions → General` → tout en
   bas, section *Workflow permissions* → coche **Read and write
   permissions**. Sans ça, le workflow ne peut pas commit/push.
3. **GitHub Pages** — `Settings → Pages` → vérifie que la source est bien
   la branche `main` (ou celle utilisée), dossier `/ (root)`. Tous les
   fichiers (`index.html`, `pc.html`, `styles.css`, `desktop.css`,
   `script.js`, `.github/workflows/sync-edt.yml`) doivent être **à la
   racine du dépôt**.
4. **Premier lancement manuel** — onglet `Actions` → sélectionne
   *Sync emploi du temps* → `Run workflow`. Ça doit créer `data/edt.ics`
   et pousser un commit.

## Si l'emploi du temps ne s'affiche toujours pas

Le site affiche maintenant un panneau de diagnostic précis (code HTTP,
raison exacte) à la place de « chargement… » qui reste bloqué. Regarde ce
panneau, il te dira directement laquelle de ces causes s'applique :

- **404 sur `data/edt.ics`** → le workflow n'a jamais réussi. Va dans
  l'onglet `Actions`, ouvre le dernier run de *Sync emploi du temps*, et
  regarde le log de l'étape *Télécharger le fichier .ics* — le message
  d'erreur (`::error::`) t'indiquera si c'est le secret qui manque, un
  code HTTP différent de 200, ou un contenu invalide.
- **Contenu invalide** → le fichier existe mais ne commence pas par
  `BEGIN:VCALENDAR` (lien Hyperplanning expiré ou incorrect).
- **Timeout** → problème réseau ponctuel, réessaie.

Tu peux aussi ouvrir directement `data/edt.ics` dans le navigateur
(`https://TON-USER.github.io/IUTime/data/edt.ics`) pour voir son contenu
brut.
