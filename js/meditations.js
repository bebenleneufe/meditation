export const FREE_MEDITATION_ID = 'libre';

// Cue times are in seconds from the start bell. Gaps are deliberately long:
// the silence between instructions is where the practice actually happens.
export const GUIDED_MEDITATIONS = Object.freeze([
  {
    id: 'pause-respiration',
    color: 'yellow',
    title: 'Pause respiration',
    summary: 'Trois minutes pour souffler au milieu de la journée.',
    durationMinutes: 3,
    cues: [
      { atSeconds: 4, text: 'Installez-vous confortablement, le dos droit, les épaules relâchées.' },
      { atSeconds: 14, text: 'Fermez les yeux, ou posez votre regard sur un point devant vous.' },
      { atSeconds: 26, text: 'Prenez une inspiration profonde par le nez… et relâchez lentement par la bouche.' },
      { atSeconds: 42, text: 'Encore une fois. Prenez une grande inspiration… et soufflez, en laissant partir les tensions.' },
      { atSeconds: 60, text: 'Maintenant, laissez votre respiration retrouver son rythme naturel. Ne cherchez pas à la contrôler.' },
      { atSeconds: 82, text: "Observez simplement l'air qui entre… et l'air qui sort." },
      { atSeconds: 112, text: "Si votre esprit s'évade, c'est normal. Remarquez-le, et revenez doucement au souffle." },
      { atSeconds: 145, text: 'Restez encore quelques instants avec cette respiration tranquille.' },
      { atSeconds: 168, text: 'Doucement, reprenez contact avec la pièce autour de vous.' },
    ],
  },
  {
    id: 'ancrage-souffle',
    color: 'orange',
    title: 'Ancrage dans le souffle',
    summary: "La pratique de base : revenir au souffle, encore et encore.",
    durationMinutes: 10,
    cues: [
      { atSeconds: 4, text: 'Installez-vous confortablement, le dos droit sans être raide.' },
      { atSeconds: 15, text: 'Fermez les yeux, et laissez votre corps se poser.' },
      { atSeconds: 30, text: 'Portez votre attention sur votre respiration, là où vous la sentez le plus nettement : les narines, la poitrine, ou le ventre.' },
      { atSeconds: 55, text: "Sentez l'air frais qui entre… et l'air plus tiède qui ressort." },
      { atSeconds: 80, text: "Vous n'avez rien à changer. Laissez simplement le souffle se faire tout seul." },
      { atSeconds: 115, text: 'Si cela vous aide, notez intérieurement : inspire… expire.' },
      { atSeconds: 165, text: "Votre esprit va s'éloigner vers des pensées. C'est ainsi qu'il fonctionne. Chaque fois que vous le remarquez, revenez au souffle, sans vous juger." },
      { atSeconds: 235, text: "Revenir, c'est l'exercice lui-même. Chaque retour est un moment de pleine conscience." },
      { atSeconds: 305, text: "Remarquez le petit temps d'arrêt à la fin de chaque expiration, avant que le souffle ne revienne." },
      { atSeconds: 375, text: "Où est votre attention en ce moment ? Si elle s'est égarée, ramenez-la doucement." },
      { atSeconds: 445, text: 'Laissez le souffle être comme il est : long ou court, profond ou léger.' },
      { atSeconds: 510, text: 'Restez avec chaque respiration, une à la fois.' },
      { atSeconds: 565, text: 'Élargissez maintenant votre attention à tout le corps, assis ici, qui respire.' },
      { atSeconds: 588, text: 'Quand la cloche sonnera, prenez le temps de rouvrir les yeux.' },
    ],
  },
  {
    id: 'scan-corporel',
    color: 'lilac',
    title: 'Scan corporel',
    summary: 'Parcourir le corps des pieds à la tête pour relâcher les tensions.',
    durationMinutes: 12,
    cues: [
      { atSeconds: 4, text: 'Allongez-vous, ou asseyez-vous confortablement. Laissez le poids du corps reposer sur son support.' },
      { atSeconds: 18, text: 'Fermez les yeux, et prenez trois respirations calmes.' },
      { atSeconds: 42, text: 'Portez votre attention sur vos pieds. Remarquez les sensations : la chaleur, le froid, le contact, des picotements… ou peut-être rien du tout. Tout est bien.' },
      { atSeconds: 85, text: "Remontez vers les chevilles, puis les mollets et le bas des jambes. Observez, sans chercher à changer quoi que ce soit." },
      { atSeconds: 125, text: 'Maintenant les genoux, puis les cuisses. Ressentez leur poids.' },
      { atSeconds: 170, text: 'Portez votre attention sur le bassin et les hanches, et sur le contact avec le sol ou le siège.' },
      { atSeconds: 215, text: "Observez votre ventre, qui se soulève et s'abaisse au rythme de la respiration." },
      { atSeconds: 260, text: 'Remontez vers la poitrine. Vous sentez peut-être les battements du cœur.' },
      { atSeconds: 305, text: "Portez l'attention sur le bas du dos, puis le haut du dos. Si vous rencontrez une tension, respirez vers elle, et laissez-la s'adoucir." },
      { atSeconds: 355, text: 'Les épaules, maintenant. Laissez-les descendre un peu, se relâcher.' },
      { atSeconds: 400, text: "Descendez le long des bras, jusqu'aux mains : les avant-bras, les poignets… et le bout des doigts." },
      { atSeconds: 445, text: 'Revenez vers la nuque et la gorge. Laissez-les se détendre.' },
      { atSeconds: 485, text: 'Observez votre visage : la mâchoire, que vous pouvez desserrer… les yeux… le front.' },
      { atSeconds: 530, text: 'Enfin, le sommet de la tête.' },
      { atSeconds: 565, text: "Prenez maintenant conscience du corps tout entier, d'un seul tenant, qui respire." },
      { atSeconds: 625, text: 'Restez ainsi, simplement présent à ce corps vivant.' },
      { atSeconds: 680, text: 'Commencez doucement à bouger les doigts et les orteils.' },
      { atSeconds: 700, text: 'Quand vous êtes prêt, ouvrez les yeux.' },
    ],
  },
  {
    id: 'observer-pensees',
    color: 'blue',
    title: 'Observer les pensées',
    summary: "Regarder les pensées passer comme des feuilles sur une rivière.",
    durationMinutes: 8,
    cues: [
      { atSeconds: 4, text: 'Installez-vous confortablement, le dos droit, les mains posées.' },
      { atSeconds: 16, text: 'Fermez les yeux, et laissez la respiration devenir calme.' },
      { atSeconds: 35, text: "Pendant quelques instants, posez simplement l'attention sur le souffle." },
      { atSeconds: 70, text: "Maintenant, tournez-vous vers vos pensées. Imaginez que vous êtes assis au bord d'une rivière." },
      { atSeconds: 95, text: 'Chaque pensée qui apparaît est une feuille posée sur l\'eau. Regardez-la passer, sans la retenir, ni la repousser.' },
      { atSeconds: 140, text: 'Une pensée sur le travail, un souvenir, un projet… Posez-la sur une feuille, et laissez le courant l\'emporter.' },
      { atSeconds: 195, text: "Si vous vous retrouvez emporté par une pensée, ce n'est pas un problème. Remontez simplement sur la berge, et observez à nouveau." },
      { atSeconds: 255, text: 'Vous pouvez nommer les pensées doucement : un souvenir… un souci… une envie… puis les laisser partir.' },
      { atSeconds: 315, text: "Remarquez qu'il y a parfois un espace entre deux pensées. Reposez-vous dans cet espace." },
      { atSeconds: 380, text: "Vous n'êtes pas vos pensées. Vous êtes celui qui les regarde passer." },
      { atSeconds: 430, text: 'Revenez maintenant au souffle, pour quelques respirations.' },
      { atSeconds: 462, text: 'Quand la cloche sonnera, ouvrez doucement les yeux.' },
    ],
  },
  {
    id: 'bienveillance',
    color: 'pink',
    title: 'Bienveillance',
    summary: 'Cultiver la douceur envers soi, puis envers les autres.',
    durationMinutes: 10,
    cues: [
      { atSeconds: 4, text: 'Installez-vous confortablement, et laissez le visage se détendre.' },
      { atSeconds: 16, text: 'Fermez les yeux, et prenez quelques respirations tranquilles.' },
      { atSeconds: 35, text: 'Si vous le souhaitez, posez une main sur votre cœur, et sentez sa chaleur.' },
      { atSeconds: 60, text: 'Commencez par vous-même. Répétez intérieurement : que je sois en paix… que je sois en bonne santé… que je vive dans la sérénité.' },
      { atSeconds: 110, text: "Laissez ces mots résonner. Il n'est pas nécessaire de ressentir quelque chose de particulier : l'intention suffit." },
      { atSeconds: 150, text: 'Pensez maintenant à quelqu\'un que vous aimez. Voyez son visage.' },
      { atSeconds: 168, text: 'Offrez-lui ces vœux : que tu sois en paix… que tu sois en bonne santé… que tu vives dans la sérénité.' },
      { atSeconds: 230, text: 'Pensez à une personne que vous connaissez à peine, croisée récemment.' },
      { atSeconds: 248, text: 'Offrez-lui les mêmes vœux : que tu sois en paix… que tu sois en bonne santé… que tu vives dans la sérénité.' },
      { atSeconds: 310, text: "Si vous le pouvez, pensez à une personne avec qui c'est plus difficile. Commencez par quelqu'un de seulement un peu difficile." },
      { atSeconds: 335, text: 'Que tu sois en paix… que tu sois en bonne santé… que tu vives dans la sérénité.' },
      { atSeconds: 395, text: 'Élargissez enfin à tous les êtres, proches et lointains.' },
      { atSeconds: 412, text: "Que tous les êtres soient en paix… qu'ils soient en bonne santé… qu'ils vivent dans la sérénité." },
      { atSeconds: 480, text: 'Revenez à vous, à votre souffle, à la chaleur dans la poitrine.' },
      { atSeconds: 555, text: 'Restez quelques instants dans cette bienveillance.' },
      { atSeconds: 585, text: 'Quand la cloche sonnera, ouvrez doucement les yeux.' },
    ],
  },
]);

export const FREE_MEDITATION = Object.freeze({
  id: FREE_MEDITATION_ID,
  color: 'mint',
  title: 'Méditation libre',
  summary: 'Sans voix : la cloche, et un guide de respiration si vous le souhaitez.',
  durationMinutes: null,
  cues: [],
});

export const ALL_MEDITATIONS = Object.freeze([...GUIDED_MEDITATIONS, FREE_MEDITATION]);

// Files produced by tools/generate_audio.py, which names them after the meditation id.
export function audioTrackPath(meditation) {
  return `audio/${meditation.id}.mp3`;
}

export function findMeditation(meditationId) {
  return ALL_MEDITATIONS.find((meditation) => meditation.id === meditationId) ?? null;
}
