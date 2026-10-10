# Pleine conscience

Une petite appli de méditation, juste pour moi. Pas de compte, pas de pub, pas de dépendance : tout reste dans le navigateur.

## Ce qu'elle fait

- **Minuteur** : 1, 3, 5, 10, 15, 20 ou 30 minutes.
- **Cloche de bol chantant**, synthétisée avec la Web Audio API : un coup au début, trois à la fin.
- **Cloche d'intervalle** en option, plus douce, pour revenir au souffle.
- **Guide de respiration** en option : cercle animé, 4 s d'inspiration et 6 s d'expiration.
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
js/breathing.js     guide de respiration
js/history.js       historique et série de jours
js/preferences.js   réglages mémorisés
js/storage.js       accès au localStorage protégé contre les erreurs
js/wake-lock.js     maintien de l'écran allumé
js/format.js        mise en forme des durées
```
