/**
 * Fight script: "Dragonling of the Peak". Fireballs, claw swipes, a tail slam,
 * and a fire-breathing phase where everything speeds up.
 */
export default {
  id: 'peak-dragon',
  title: 'Dragonling of the Peak',
  blurb: 'A young dragon guards the mountain top, and it is grumpy. Dodge its fireballs, parry its bites, and hold on when its tail slams down.',
  foe: 'dragon',
  foeName: 'the dragon',
  projectile: 'fireball',
  scene: 'peak',
  hearts: 5,
  start: 'intro',
  lose: 'knockdown',
  beats: {
    intro: { clip: 'faceoff', duration: 1700, camera: 'wide', caption: 'A young dragon guards the peak, and it is NOT pleased to see you.', next: 'throw' },

    throw: {
      clip: 'foe_throw_windup', windup: 900, length: 1800, camera: 'foe', caption: 'It coughs up a fireball!',
      prompt: {
        type: 'choice', label: 'Dodge the fireball!', window: 1200,
        options: [
          { keys: ['s'], label: 'Duck', next: 'rock_duck' },
          { keys: ['w'], label: 'Jump', next: 'rock_jump' },
        ],
      },
      fail: 'rock_hit',
    },
    rock_duck: { clip: 'hero_rock_duck', duration: 900, camera: 'wide', caption: 'The fireball whooshes over you and bursts!', next: 'swing_high' },
    rock_jump: { clip: 'hero_rock_jump', duration: 900, camera: 'wide', caption: 'You hop over it. Toasty!', next: 'swing_high' },
    rock_hit: { clip: 'hero_rock_hit', duration: 900, damage: 1, camera: 'hero', caption: 'FWOOM! Your plume is singed.', next: 'swing_high' },

    swing_high: {
      clip: 'foe_swing_high', windup: 700, length: 1600, camera: 'foe', caption: 'It swipes with a big claw!',
      prompt: { type: 'key', keys: ['s'], label: 'Duck!', window: 1000 }, success: 'duck', fail: 'hit_high',
    },
    duck: { clip: 'hero_duck', duration: 800, camera: 'action', caption: 'Whoosh! Right over your helmet.', next: 'counter' },
    counter: { clip: 'hero_counter', duration: 1000, camera: 'close', caption: 'You bonk its snout. It sneezes a spark!', next: 'thrust' },
    hit_high: { clip: 'hero_hit', duration: 900, damage: 1, camera: 'hero', caption: 'Swiped! That claw is sharp.', next: 'thrust' },

    thrust: {
      clip: 'foe_thrust_windup', windup: 700, length: 1600, camera: 'action', caption: 'It lunges to BITE!',
      prompt: { type: 'key', keys: ['p'], label: 'Parry!', window: 1000 }, success: 'parry', fail: 'thrust_hit',
    },
    parry: { clip: 'hero_parry', duration: 900, camera: 'close', caption: 'CLANG! Its teeth meet your sword instead.', next: 'charge' },
    thrust_hit: { clip: 'hero_thrust_hit', duration: 900, damage: 1, camera: 'hero', caption: 'Chomp! Good thing you have armour.', next: 'charge' },

    charge: {
      clip: 'foe_charge', windup: 800, length: 1800, camera: 'wide', caption: 'It charges with a roar!',
      prompt: {
        type: 'choice', label: 'Dodge!', window: 1200,
        options: [
          { keys: ['a'], label: 'Roll left', next: 'roll_left' },
          { keys: ['d'], label: 'Roll right', next: 'roll_right' },
        ],
      },
      fail: 'trampled',
    },
    roll_left: { clip: 'hero_roll_left', duration: 1000, camera: 'wide', caption: 'You roll clear and it barrels past.', next: 'grapple' },
    roll_right: { clip: 'hero_roll_right', duration: 1000, camera: 'wide', caption: 'You roll right under its belly!', next: 'throw2' },
    trampled: { clip: 'hero_trampled', duration: 1100, damage: 1, camera: 'hero', caption: 'Flattened by a dragon. You get up slowly.', next: 'grapple' },

    grapple: {
      clip: 'grapple', windup: 700, length: 2800, camera: 'close', caption: 'It grabs you in its claws! Push!',
      prompt: { type: 'hold', keys: [' '], label: 'Hold to push!', window: 2400, holdMs: 1100 }, success: 'shove', fail: 'squeezed',
    },
    shove: { clip: 'shove', duration: 900, camera: 'action', caption: 'You shove it back. It huffs smoke.', next: 'throw2' },
    squeezed: { clip: 'squeezed', duration: 900, damage: 1, camera: 'close', caption: 'Squeeze! Dragon hugs are not friendly.', next: 'throw2' },

    throw2: {
      clip: 'foe_throw_windup', windup: 800, length: 1700, camera: 'foe', caption: 'Another fireball, bigger this time!',
      prompt: {
        type: 'choice', label: 'Dodge the fireball!', window: 1100,
        options: [
          { keys: ['s'], label: 'Duck', next: 'rock_duck2' },
          { keys: ['w'], label: 'Jump', next: 'rock_jump2' },
        ],
      },
      fail: 'rock_hit2',
    },
    rock_duck2: { clip: 'hero_rock_duck', duration: 900, camera: 'wide', caption: 'It bursts on the rocks behind you.', next: 'powerup' },
    rock_jump2: { clip: 'hero_rock_jump', duration: 900, camera: 'wide', caption: 'Over it! Nicely done.', next: 'powerup' },
    rock_hit2: { clip: 'hero_rock_hit', duration: 900, damage: 1, camera: 'hero', caption: 'FWOOM! Ow, hot hot hot.', next: 'powerup' },

    powerup: { clip: 'foe_powerup', duration: 1800, camera: 'foe', caption: 'It breathes FIRE into the sky! The heat makes it faster.', next: 'pound' },

    pound: {
      clip: 'foe_pound_windup', windup: 800, length: 1800, camera: 'action', caption: 'It rears up to slam its tail down!',
      prompt: { type: 'hold', keys: [' '], label: 'Brace!', window: 2000, holdMs: 900 }, success: 'brace', fail: 'blown',
    },
    brace: { clip: 'hero_brace', duration: 1100, camera: 'action', caption: 'The mountain shakes, but you hold your ground.', next: 'swing_low' },
    blown: { clip: 'hero_blown', duration: 1100, damage: 1, camera: 'action', caption: 'The shockwave tumbles you down the slope!', next: 'swing_low' },

    swing_low: {
      clip: 'foe_swing_low', windup: 650, length: 1500, camera: 'foe', caption: 'A low claw sweep!',
      prompt: { type: 'key', keys: ['w'], label: 'Jump!', window: 850 }, success: 'jump', fail: 'hit_low',
    },
    jump: { clip: 'hero_jump', duration: 800, camera: 'action', caption: 'Hop! It snorts.', next: 'double' },
    hit_low: { clip: 'hero_hit_low', duration: 900, damage: 1, camera: 'hero', caption: 'Swiped in the shins!', next: 'double' },

    double: {
      clip: 'foe_double_windup', windup: 600, length: 1500, camera: 'foe', caption: 'Two swipes coming!',
      prompt: { type: 'sequence', keys: ['a', 'd'], label: 'Weave!', window: 1500 }, success: 'weave', fail: 'double_hit',
    },
    weave: { clip: 'hero_weave', duration: 1100, camera: 'action', caption: 'Left, right. Its claws find only air.', next: 'dizzy' },
    double_hit: { clip: 'hero_double_hit', duration: 1100, damage: 1, camera: 'hero', caption: 'One, two. Ow, ow.', next: 'dizzy' },

    dizzy: { clip: 'foe_dizzy', duration: 1300, camera: 'foe', caption: 'Too much fire-breathing. It is dizzy!', next: 'climb' },
    climb: {
      clip: 'foe_dizzy_prompt', windup: 400, length: 2800, camera: 'action', caption: 'Climb its neck and bonk that snout!',
      prompt: { type: 'mash', keys: ['c'], label: 'Climb!', window: 2400, presses: 7 }, success: 'climb_pound', fail: 'shaken_off',
    },
    climb_pound: { clip: 'hero_climb_pound', duration: 1400, camera: 'close', caption: 'Bonk! Bonk! BONK!', next: 'combo' },
    shaken_off: { clip: 'hero_shaken_off', duration: 1000, damage: 1, camera: 'wide', caption: 'It flicks you off with its wing.', next: 'combo' },

    combo: {
      clip: 'combo_ready', windup: 500, length: 2800, camera: 'action', caption: 'An opening! Strike!',
      prompt: { type: 'sequence', keys: ['j', 'k', 'l'], label: 'Combo!', window: 2300 }, success: 'combo_hit', fail: 'combo_fumble',
    },
    combo_hit: { clip: 'combo_hit', duration: 1300, camera: 'close', caption: 'One, two, three! Scales rattle.', next: 'finisher' },
    combo_fumble: { clip: 'combo_fumble', duration: 1000, damage: 1, camera: 'action', caption: 'You swing wide and it bonks you back.', next: 'finisher' },

    finisher: {
      clip: 'finisher_ready', windup: 900, length: 2400, camera: 'close', caption: 'The dragon wobbles. Finish it your way!',
      prompt: {
        type: 'choice', label: 'Finish it!', window: 1300,
        options: [
          { keys: ['f'], label: 'Sword slash', next: 'victory' },
          { keys: ['g'], label: 'Shield bash', next: 'victory_bash' },
        ],
      },
      fail: 'finisher_miss',
    },
    finisher_miss: { clip: 'finisher_miss', duration: 900, camera: 'action', caption: 'Missed! It is still wobbling…', next: 'finisher' },

    victory: { clip: 'victory', duration: 2600, end: 'win', camera: 'wide', caption: 'The dragon flops over and huffs a little smoke ring. Victory!' },
    victory_bash: { clip: 'victory_bash', duration: 2600, end: 'win', camera: 'wide', caption: 'WHAM! The dragon tumbles down the slope. Victory!' },
    knockdown: { clip: 'knockdown', duration: 2400, end: 'lose', camera: 'wide', caption: 'The dragon wins this round… it curls up for a smug nap.' },
  },
};
