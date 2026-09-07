/**
 * Registry of games shown on the Arcade landing page.
 * To add a game: drop it in games/<id>/ and add an entry here.
 * `path` is relative to the site root so it works under a GitHub Pages sub-path.
 */
export const games = [
  {
    id: 'target-rush',
    title: 'Target Rush',
    icon: '🎯',
    tagline: 'Tap the targets before their rings run out.',
    description:
      'Targets pop up around the arena for a few seconds each. Hit as many as you can before time is up, then check your accuracy.',
    path: 'games/target-rush/',
    tags: ['reflex', 'mobile friendly', 'keyboard option', 'solo'],
  },
  {
    id: 'whack-a-mole',
    title: 'Whack-a-Mole',
    icon: '🔨',
    tagline: 'Moles pop up on a keyboard. Hit the key to whack them.',
    description:
      'The board is a QWERTY keyboard. Moles pop up on keys for a couple of seconds each; press the matching key to whack them before they duck back down.',
    path: 'games/whack-a-mole/',
    tags: ['reflex', 'keyboard only', 'solo'],
  },
];
