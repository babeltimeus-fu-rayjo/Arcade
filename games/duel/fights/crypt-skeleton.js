/**
 * Fight script: "Skeleton of the Crypt". Quick and tricky: jabs to parry, double
 * swings, thrown bones, and a ghost-fire phase with shorter windows.
 */
export default {
  id: 'crypt-skeleton',
  title: 'Skeleton of the Crypt',
  blurb: 'A rattling skeleton knight guards a spooky crypt. It is fast and sneaky: parry its jabs and weave through its double swings.',
  foe: 'skeleton',
  foeName: 'the skeleton',
  projectile: 'bone',
  scene: 'crypt',
  hearts: 5,
  start: 'intro',
  lose: 'knockdown',
  beats: {
    intro: { clip: 'faceoff', duration: 1600, camera: 'wide', caption: 'A skeleton knight rattles out of the dark!', next: 'thrust' },

    thrust: {
      clip: 'foe_thrust_windup', windup: 650, length: 1500, camera: 'action', caption: 'It jabs with its rusty sword!',
      prompt: { type: 'key', keys: ['p'], label: 'Parry!', window: 900 }, success: 'parry', fail: 'thrust_hit',
    },
    parry: { clip: 'hero_parry', duration: 900, camera: 'close', caption: 'CLANG! You knock the jab aside.', next: 'counter' },
    counter: { clip: 'hero_counter', duration: 1000, camera: 'close', caption: 'You rattle its ribs!', next: 'swing_high' },
    thrust_hit: { clip: 'hero_thrust_hit', duration: 900, damage: 1, camera: 'hero', caption: 'Poke! Right in the chest plate.', next: 'swing_high' },

    swing_high: {
      clip: 'foe_swing_high', windup: 650, length: 1500, camera: 'foe', caption: 'A swing at your head!',
      prompt: { type: 'key', keys: ['s'], label: 'Duck!', window: 900 }, success: 'duck', fail: 'hit_high',
    },
    duck: { clip: 'hero_duck', duration: 800, camera: 'action', caption: 'Whoosh! Its jaw clacks in annoyance.', next: 'double' },
    hit_high: { clip: 'hero_hit', duration: 900, damage: 1, camera: 'hero', caption: 'Clonk! That rattled your helmet.', next: 'double' },

    double: {
      clip: 'foe_double_windup', windup: 550, length: 1400, camera: 'foe', caption: 'It spins into a double swing!',
      prompt: { type: 'sequence', keys: ['a', 'd'], label: 'Weave!', window: 1500 }, success: 'weave', fail: 'double_hit',
    },
    weave: { clip: 'hero_weave', duration: 1100, camera: 'action', caption: 'Left, right. Nothing but air.', next: 'throw' },
    double_hit: { clip: 'hero_double_hit', duration: 1100, damage: 1, camera: 'hero', caption: 'One, two. Ow, ow.', next: 'throw' },

    throw: {
      clip: 'foe_throw_windup', windup: 900, length: 1800, camera: 'foe', caption: 'It pulls off its own arm bone and throws it!',
      prompt: {
        type: 'choice', label: 'Dodge the bone!', window: 1150,
        options: [
          { keys: ['s'], label: 'Duck', next: 'rock_duck' },
          { keys: ['w'], label: 'Jump', next: 'rock_jump' },
        ],
      },
      fail: 'rock_hit',
    },
    rock_duck: { clip: 'hero_rock_duck', duration: 900, camera: 'wide', caption: 'The bone whirls over your head and clatters away.', next: 'charge' },
    rock_jump: { clip: 'hero_rock_jump', duration: 900, camera: 'wide', caption: 'You hop over the skipping bone!', next: 'charge' },
    rock_hit: { clip: 'hero_rock_hit', duration: 900, damage: 1, camera: 'hero', caption: 'Bonk! Hit by a bone. Gross.', next: 'charge' },

    charge: {
      clip: 'foe_charge', windup: 750, length: 1700, camera: 'wide', caption: 'It charges, bones clattering!',
      prompt: {
        type: 'choice', label: 'Dodge!', window: 1150,
        options: [
          { keys: ['a'], label: 'Roll left', next: 'roll_left' },
          { keys: ['d'], label: 'Roll right', next: 'roll_right' },
        ],
      },
      fail: 'trampled',
    },
    roll_left: { clip: 'hero_roll_left', duration: 1000, camera: 'wide', caption: 'You roll clear and it rattles past.', next: 'grapple' },
    roll_right: { clip: 'hero_roll_right', duration: 1000, camera: 'wide', caption: 'You roll right through its legs!', next: 'powerup' },
    trampled: { clip: 'hero_trampled', duration: 1100, damage: 1, camera: 'hero', caption: 'Trampled by a pile of bones. Embarrassing.', next: 'grapple' },

    grapple: {
      clip: 'grapple', windup: 700, length: 2700, camera: 'close', caption: 'Cold bony fingers grab you! Push!',
      prompt: { type: 'hold', keys: [' '], label: 'Hold to push!', window: 2300, holdMs: 1050 }, success: 'shove', fail: 'squeezed',
    },
    shove: { clip: 'shove', duration: 900, camera: 'action', caption: 'You shove it back. Bones clatter!', next: 'powerup' },
    squeezed: { clip: 'squeezed', duration: 900, damage: 1, camera: 'close', caption: 'Squeeze! It is stronger than it looks.', next: 'powerup' },

    powerup: { clip: 'foe_powerup', duration: 1800, camera: 'foe', caption: 'Its bones glow with ghostly fire! It is faster now.', next: 'thrust2' },

    thrust2: {
      clip: 'foe_thrust_windup', windup: 550, length: 1400, camera: 'action', caption: 'A lightning-fast jab!',
      prompt: { type: 'key', keys: ['p'], label: 'Parry!', window: 750 }, success: 'parry2', fail: 'thrust_hit2',
    },
    parry2: { clip: 'hero_parry', duration: 900, camera: 'close', caption: 'CLANG! Parried again!', next: 'counter2' },
    counter2: { clip: 'hero_counter', duration: 1000, camera: 'close', caption: 'And a whack to the ribs!', next: 'swing_low' },
    thrust_hit2: { clip: 'hero_thrust_hit', duration: 900, damage: 1, camera: 'hero', caption: 'Poke! Too fast this time.', next: 'swing_low' },

    swing_low: {
      clip: 'foe_swing_low', windup: 600, length: 1400, camera: 'foe', caption: 'It sweeps low!',
      prompt: { type: 'key', keys: ['w'], label: 'Jump!', window: 750 }, success: 'jump', fail: 'hit_low',
    },
    jump: { clip: 'hero_jump', duration: 800, camera: 'action', caption: 'Hop! Its skull tilts, confused.', next: 'smash' },
    hit_low: { clip: 'hero_hit_low', duration: 900, damage: 1, camera: 'hero', caption: 'Oof, right in the shins.', next: 'smash' },

    smash: {
      clip: 'foe_smash_windup', windup: 650, length: 1400, camera: 'foe', caption: 'It raises the sword with both hands!',
      prompt: { type: 'key', keys: ['b'], label: 'Block!', window: 750 }, success: 'block', fail: 'smashed',
    },
    block: { clip: 'hero_block', duration: 900, camera: 'close', caption: 'Your shield takes it. Sparks fly!', next: 'dizzy' },
    smashed: { clip: 'hero_smashed', duration: 1000, damage: 1, camera: 'hero', caption: 'SPLAT. You are a little shorter now.', next: 'dizzy' },

    dizzy: { clip: 'foe_dizzy', duration: 1300, camera: 'foe', caption: 'Its skull is spinning. It is dizzy!', next: 'climb' },
    climb: {
      clip: 'foe_dizzy_prompt', windup: 400, length: 2700, camera: 'action', caption: 'Climb up and bonk that skull!',
      prompt: { type: 'mash', keys: ['c'], label: 'Climb!', window: 2300, presses: 7 }, success: 'climb_pound', fail: 'shaken_off',
    },
    climb_pound: { clip: 'hero_climb_pound', duration: 1400, camera: 'close', caption: 'Bonk! Bonk! BONK! Its jaw falls off.', next: 'combo' },
    shaken_off: { clip: 'hero_shaken_off', duration: 1000, damage: 1, camera: 'wide', caption: 'It rattles you right off.', next: 'combo' },

    combo: {
      clip: 'combo_ready', windup: 500, length: 2700, camera: 'action', caption: 'An opening! Strike!',
      prompt: { type: 'sequence', keys: ['j', 'k', 'l'], label: 'Combo!', window: 2200 }, success: 'combo_hit', fail: 'combo_fumble',
    },
    combo_hit: { clip: 'combo_hit', duration: 1300, camera: 'close', caption: 'One, two, three! Bones everywhere.', next: 'finisher' },
    combo_fumble: { clip: 'combo_fumble', duration: 1000, damage: 1, camera: 'action', caption: 'You swing wide and it bonks you back.', next: 'finisher' },

    finisher: {
      clip: 'finisher_ready', windup: 900, length: 2400, camera: 'close', caption: 'It is wobbling apart. Finish it your way!',
      prompt: {
        type: 'choice', label: 'Finish it!', window: 1250,
        options: [
          { keys: ['f'], label: 'Sword slash', next: 'victory' },
          { keys: ['g'], label: 'Shield bash', next: 'victory_bash' },
        ],
      },
      fail: 'finisher_miss',
    },
    finisher_miss: { clip: 'finisher_miss', duration: 900, camera: 'action', caption: 'Missed! It is still wobbling…', next: 'finisher' },

    victory: { clip: 'victory', duration: 2600, end: 'win', camera: 'wide', caption: 'CRACK! The skeleton collapses into a tidy pile of bones. Victory!' },
    victory_bash: { clip: 'victory_bash', duration: 2600, end: 'win', camera: 'wide', caption: 'WHAM! Bones go flying. Victory!' },
    knockdown: { clip: 'knockdown', duration: 2400, end: 'lose', camera: 'wide', caption: 'The skeleton wins this round… it does a little bony dance.' },
  },
};
