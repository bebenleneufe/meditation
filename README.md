# Pleine conscience

Une petite appli de méditation, juste pour moi. Pas de compte, pas de pub, pas de dépendance : tout reste dans le navigateur.

## Ce qu'elle fait

- **Méditations guidées** à voix haute, avec les consignes aussi affichées à l'écran :
  - Pause respiration (3 min)
  - Ancrage dans le souffle (10 min)
  - Scan corporel (12 min)
  - Observer les pensées (8 min)
  - Bienveillance (10 min)
- **Voix d'homme posée**, enregistrée dans de vrais fichiers audio (dossier `audio/`). Chaque méditation est une seule piste : cloche, consignes, silences, cloches de fin.
  La piste continue de jouer quand le téléphone se verrouille. Si elle ne se charge pas, la séance continue avec les consignes à l'écran.
- **Méditation libre**, sans voix :
  - durée de 1 à 30 minutes ;
  - cloche d'intervalle en option ;
  - guide de respiration en option (4 s d'inspiration, 6 s d'expiration).
- **Cloche de bol chantant**, synthétisée avec la Web Audio API : un coup au début, trois à la fin.
- **Statistiques** : nombre de séances, minutes au total, jours d'affilée. Elles sont enregistrées dans le `localStorage`.
  Une séance de moins d'une minute ne compte pas.
- Les réglages sont mémorisés d'une fois sur l'autre.
- L'écran reste allumé pendant la séance (Wake Lock API), pour que la cloche de fin sonne bien sur mobile.
- Mode sombre automatique.
- Raccourcis : `Espace` met en pause, `Échap` termine.

## Lancer l'appli

Le code est découpé en modules ES. Le navigateur refuse de les charger quand on ouvre `index.html` directement depuis le disque (`file://`). Il faut donc un petit serveur local :

```sh
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

Pour l'avoir sur le téléphone, le plus simple est d'activer **GitHub Pages** sur ce dépôt (Settings → Pages → branche `main`, dossier `/`).

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
index.html          structure des trois écrans (réglages, séance, fin)
styles.css          thème clair/sombre, animation du cercle
js/app.js           orchestration : événements, écrans, cycle de vie
js/timer.js         minuteur sans dérive (basé sur un horodatage de fin)
js/bell.js          synthèse de la cloche
js/meditations.js   textes des méditations guidées et moment de chaque consigne
js/guided-script.js déroulé des consignes pendant la séance
js/audio-track.js   lecture de la piste audio, qui sert aussi d'horloge à la séance
audio/              pistes MP3 générées (une par méditation guidée)
tools/              script de génération des pistes
js/breathing.js     cercle de respiration (rythmé ou ambiant)
js/history.js       historique et série de jours
js/preferences.js   réglages mémorisés
js/storage.js       accès au localStorage protégé contre les erreurs
js/wake-lock.js     maintien de l'écran allumé
js/format.js        mise en forme des durées
```
