# Pleine conscience

Une petite appli de méditation, juste pour moi. Pas de compte, pas de pub, pas de dépendance : tout reste dans le navigateur.

## Ce qu'elle fait

- **Méditations guidées** à voix haute, avec les consignes aussi affichées à l'écran :
  - Pause respiration (3 min)
  - Ancrage dans le souffle (10 min)
  - Scan corporel (12 min)
  - Observer les pensées (8 min)
  - Bienveillance (10 min)
- **Voix d'homme posée** : l'appli cherche une voix française masculine (Thomas sur Mac et iPhone, Henri ou Paul sur Windows et Edge…). La lecture est lente et un peu grave. On peut choisir une autre voix et l'écouter avant la séance.
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

## Organisation

```
index.html          structure des trois écrans (réglages, séance, fin)
styles.css          thème clair/sombre, animation du cercle
js/app.js           orchestration : événements, écrans, cycle de vie
js/timer.js         minuteur sans dérive (basé sur un horodatage de fin)
js/bell.js          synthèse de la cloche
js/meditations.js   textes des méditations guidées et moment de chaque consigne
js/guided-script.js déroulé des consignes pendant la séance
js/narrator.js      voix (Web Speech API) et choix d'une voix masculine
js/breathing.js     cercle de respiration (rythmé ou ambiant)
js/history.js       historique et série de jours
js/preferences.js   réglages mémorisés
js/storage.js       accès au localStorage protégé contre les erreurs
js/wake-lock.js     maintien de l'écran allumé
js/format.js        mise en forme des durées
```
