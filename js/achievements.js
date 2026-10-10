// Each accessory is a <symbol> in index.html named "accessory-<id>".
export const ACCESSORIES = Object.freeze({
  fleur: 'Fleur',
  bonnet: 'Bonnet',
  echarpe: 'Écharpe',
  casque: 'Casque audio',
  lunettes: 'Lunettes de soleil',
  couronne: 'Couronne',
});

// "icon" names a <symbol> in index.html; badges with an accessory show the accessory itself.
export const BADGES = Object.freeze([
  {
    id: 'premiere-seance',
    title: 'Premier pas',
    description: 'Terminer une première séance.',
    accessory: 'fleur',
    measure: (stats) => ({ current: stats.totalSessions, target: 1 }),
  },
  {
    id: 'serie-3',
    title: 'Belle lancée',
    description: '3 jours de suite.',
    icon: 'badge-flame',
    measure: (stats) => ({ current: stats.longestStreakDays, target: 3 }),
  },
  {
    id: 'serie-7',
    title: 'Une semaine pleine',
    description: '7 jours de suite.',
    accessory: 'bonnet',
    measure: (stats) => ({ current: stats.longestStreakDays, target: 7 }),
  },
  {
    id: 'seances-10',
    title: 'Habitué',
    description: '10 séances terminées.',
    icon: 'badge-check',
    measure: (stats) => ({ current: stats.totalSessions, target: 10 }),
  },
  {
    id: 'minutes-100',
    title: 'Cent minutes',
    description: '100 minutes de pratique.',
    accessory: 'echarpe',
    measure: (stats) => ({ current: stats.totalMinutes, target: 100 }),
  },
  {
    id: 'leve-tot',
    title: 'Lève-tôt',
    description: 'Méditer avant 8 h.',
    icon: 'badge-sun',
    measure: (stats) => ({ current: Number(stats.hasEarlySession), target: 1 }),
  },
  {
    id: 'oiseau-de-nuit',
    title: 'Oiseau de nuit',
    description: 'Méditer après 22 h.',
    icon: 'badge-moon',
    measure: (stats) => ({ current: Number(stats.hasLateSession), target: 1 }),
  },
  {
    id: 'explorateur',
    title: 'Explorateur',
    description: 'Essayer 5 séances différentes.',
    icon: 'badge-compass',
    measure: (stats) => ({ current: stats.distinctMeditationCount, target: 5 }),
  },
  {
    id: 'seances-30',
    title: 'Fidèle',
    description: '30 séances terminées.',
    accessory: 'casque',
    measure: (stats) => ({ current: stats.totalSessions, target: 30 }),
  },
  {
    id: 'minutes-500',
    title: 'Cinq cents minutes',
    description: '500 minutes de pratique.',
    accessory: 'lunettes',
    measure: (stats) => ({ current: stats.totalMinutes, target: 500 }),
  },
  {
    id: 'serie-30',
    title: 'Un mois entier',
    description: '30 jours de suite.',
    accessory: 'couronne',
    measure: (stats) => ({ current: stats.longestStreakDays, target: 30 }),
  },
]);

export function isKnownAccessory(candidate) {
  return typeof candidate === 'string' && Object.hasOwn(ACCESSORIES, candidate);
}

export function evaluateBadges(stats) {
  return BADGES.map((badge) => {
    const { current, target } = badge.measure(stats);
    return { ...badge, current: Math.min(current, target), target, isUnlocked: current >= target };
  });
}

export function findNewlyUnlockedBadges(statsBefore, statsAfter) {
  const unlockedBefore = new Set(evaluateBadges(statsBefore).filter((badge) => badge.isUnlocked).map((badge) => badge.id));
  return evaluateBadges(statsAfter).filter((badge) => badge.isUnlocked && !unlockedBefore.has(badge.id));
}

export function listUnlockedAccessories(stats) {
  return evaluateBadges(stats)
    .filter((badge) => badge.isUnlocked && badge.accessory !== undefined)
    .map((badge) => badge.accessory);
}
