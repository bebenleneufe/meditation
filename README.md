# Pleine conscience

Une petite appli de méditation, juste pour moi. Pas de compte, pas de pub, pas de dépendance : tout reste dans le navigateur.

## Ce qu'elle fait

**Séances**
- **Méditations guidées**, lues par une voix d'homme posée, avec les consignes affichées à l'écran : pause respiration, ancrage dans le souffle, scan corporel, observer les pensées, bienveillance, apaiser le stress, gratitude, marche consciente, réveil en douceur.
- **Express** : minute de calme, recentrage en deux minutes.
- **Respiration** : cohérence cardiaque, respiration carrée, 4-7-8. La mascotte suit le rythme, avec un son montant à l'inspiration et descendant à l'expiration pour pratiquer les yeux fermés.
- **Sommeil** : souffle du soir (5 min), détente musculaire (7 min), se rendormir la nuit (8 min), lâcher la journée (10 min), glisser vers le sommeil (15 min), scan du corps pour dormir (20 min). La voix s'estompe peu à peu, sans cloche finale. Et une sieste réparatrice (20 min) qui se termine par un réveil en douceur à la cloche.
- **En silence** : durée au choix, cloche d'intervalle et guide de respiration en option.

Chaque méditation guidée est une seule piste MP3 (cloche, consignes, silences, cloches de fin) : elle continue de jouer quand le téléphone se verrouille. Si elle ne se charge pas, la séance continue avec les consignes à l'écran.

**Ambiance**
- Six musiques d'ambiance synthétisées en direct (nappe douce, pluie, vagues, feu de cheminée, forêt, bol tibétain), sans fichier et sans coupure à la boucle. Volume réglable, coupure pendant la séance (bouton ou touche `M`).
- **Minuterie de sommeil** : la musique peut continuer 15, 30 ou 60 minutes après la séance, puis s'éteint en fondu.

**Suivi et motivation**
- Série de jours en cours, meilleure série, minutes et séances.
- Calendrier mensuel des jours pratiqués.
- Onze badges. Six d'entre eux offrent un accessoire à la mascotte (fleur, bonnet, écharpe, casque, lunettes, couronne), porté dès qu'il est gagné.

**Au quotidien**
- **Installable sur téléphone** (application web progressive) : icône sur l'écran d'accueil, plein écran, fonctionnement hors ligne. Dès que l'appli est ouverte avec du réseau, toutes les méditations guidées (environ 45 Mo) sont téléchargées sur le téléphone ; elles se lisent ensuite directement depuis sa mémoire, en mode avion compris. Le panneau « Mode avion » de l'accueil indique où en est le téléchargement.
- **Rappel quotidien** : un rendez-vous récurrent avec alerte est ajouté à l'agenda du téléphone. Sans serveur, c'est le seul moyen fiable d'être prévenu à heure fixe, appli fermée.
- L'écran reste allumé pendant la séance. Mode sombre automatique. Réglages et historique sont gardés dans le navigateur (`localStorage`).
- Raccourcis : `Espace` met en pause, `M` coupe la musique, `Échap` termine.

## Lancer l'appli

Le code est découpé en modules ES. Le navigateur refuse de les charger quand on ouvre `index.html` directement depuis le disque (`file://`). Il faut donc un petit serveur local :

```sh
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

## L'installer sur le téléphone

1. Sur GitHub : **Settings → Pages**, source « Deploy from a branch », choisir la branche de l'appli et le dossier `/ (root)`, puis **Save**.
   Au bout d'une minute, l'appli est en ligne à l'adresse `https://bebenleneufe.github.io/meditation/`.
2. Ouvrir cette adresse sur le téléphone :
   - **iPhone** (Safari) : bouton Partager, puis « Sur l'écran d'accueil » ;
   - **Android** (Chrome) : menu ⋮, puis « Installer l'application ».
3. Pour le rappel : dans l'appli, choisir l'heure sous « Rappel quotidien », toucher « Ajouter à mon agenda », puis ouvrir le fichier proposé.

## Régénérer les pistes audio

Les pistes sont lues par **Adrien**, une voix de la bibliothèque [ElevenLabs](https://elevenlabs.io) (modèle multilingue v2), ralentie de 8 % après coup.
Il faut un abonnement payant (Starter suffit) : l'offre gratuite refuse les voix de la bibliothèque par l'API.
Les textes et le moment de chaque consigne viennent de `js/meditations.js`. Après une modification de ce fichier :

```sh
python3 -m venv .venv && .venv/bin/pip install -r tools/requirements.txt
ELEVENLABS_API_KEY=ta_clé .venv/bin/python tools/generate_audio.py   # ou --only scan-corporel
```

Il faut aussi `node` et `ffmpeg` (compilé avec rubberband, pour le ralenti).
Chaque phrase générée est gardée dans `.audio-cache/` : une relance ne repaie que les phrases modifiées.
Le script refuse d'écrire une piste si une consigne lue déborde sur la suivante : il indique laquelle, et il suffit d'espacer les `atSeconds`.

Les réglages de la voix (identifiant, stabilité, ralenti) sont en tête de `tools/generate_audio.py`.

Sans compte ElevenLabs, le script sait aussi utiliser [Piper](https://github.com/rhasspy/piper), gratuit et hors ligne, mais nettement plus robotique :

```sh
curl -LO https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/upmc/medium/fr_FR-upmc-medium.onnx
curl -LO https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/upmc/medium/fr_FR-upmc-medium.onnx.json
.venv/bin/python tools/generate_audio.py --engine piper --voice fr_FR-upmc-medium.onnx
```

Chaque piste est vérifiée en la faisant transcrire par Whisper.

## Organisation

```
index.html             écrans (accueil, progrès, séance, fin) et dessins SVG (mascotte, accessoires, badges)
styles.css             thème clair/sombre, couleurs par séance, animations
manifest.webmanifest   installation sur téléphone
sw.js                  service worker : mode hors ligne et cache des pistes audio
icons/                 icônes de l'appli
audio/                 pistes MP3 générées (une par méditation guidée)
tools/                 script de génération des pistes
js/app.js              orchestration : événements, écrans, déroulé d'une séance
js/meditations.js      catalogue : textes et moments des consignes, rythmes de respiration, catégories
js/audio-track.js      lecture de la piste audio, qui sert aussi d'horloge à la séance
js/guided-script.js    déroulé des sous-titres pendant la séance
js/timer.js            minuteur sans dérive (basé sur un horodatage de fin)
js/breathing.js        mascotte qui respire (rythme guidé ou ambiant)
js/bell.js             cloche de bol chantant et sons de respiration
js/ambience.js         musiques d'ambiance synthétisées et minuterie de sommeil
js/history.js          historique, séries et statistiques
js/achievements.js     badges et accessoires
js/progress-view.js    écran « Mes progrès » : records, calendrier, badges
js/reminder.js         rappel quotidien au format agenda (.ics)
js/offline-audio.js    téléchargement des pistes pour le mode avion et lecture depuis le téléphone
js/preferences.js      réglages mémorisés
js/storage.js          accès au localStorage protégé contre les erreurs
js/wake-lock.js        maintien de l'écran allumé
js/format.js           mise en forme des durées
```
