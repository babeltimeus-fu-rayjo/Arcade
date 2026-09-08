/**
 * Fight script: "Robot in the Ruins" (three acts).
 *
 * A fight is a graph of beats. A plain beat plays its clip for `duration` ms
 * then goes to `next`. A prompt beat plays `windup` ms of its clip at full
 * speed, then time slows and the prompt opens; the clip keeps creeping along
 * (its total `length`) until the prompt resolves, which jumps to `success` or
 * `fail`. A beat with `damage` costs hearts when entered (story mode); a beat
 * with `end` finishes the fight with that outcome.
 *
 * Prompt types:
 *   key       { keys: ['s'], label, window }                 press the key
 *   sequence  { keys: ['j','k','l'], label, window }         press them in order
 *   hold      { keys: [' '], label, window, holdMs }         hold the key for holdMs in total
 *   mash      { keys: ['k'], label, window, presses }        press it `presses` times
 *   choice    { options: [{ keys, label, next }], window }   any option's key succeeds, into its own branch
 * `window` is real milliseconds; settings scale it. Keys here are the "fixed per
 * scene" set; the practice-pool setting swaps them for pool keys at play time.
 *
 * Act 1 probes the robot (duck, jump, parry, a thrown rock). Act 2 is the charge and
 * the grapple. In act 3 the robot powers up: prompts get shorter, and the fight ends
 * with a dizzy robot to climb, a combo and a choice of finisher.
 */
export default {
  id: 'ruins-robot',
  title: 'Robot in the Ruins',
  blurb: 'A rusty robot blocks the path. Duck, jump, parry, roll and strike your way past it, then finish it your way.',
  foe: 'robot', // drawn by scene.js; also: ogre, skeleton, dragon
  foeName: 'the robot',
  projectile: 'rock', // what the throw beats hurl: rock, boulder, bone, fireball
  scene: 'ruins', // backdrop theme: ruins, bridge, crypt, peak
  hearts: 5,
  start: 'intro',
  lose: 'knockdown',
  beats: {
    // ======== Act 1 ========
    intro: { clip: 'faceoff', duration: 1600, camera: 'wide', caption: 'A rusty robot blocks the path through the ruins!', next: 'swing_high' },

    swing_high: {
      clip: 'foe_swing_high', windup: 700, length: 1600, camera: 'foe', caption: 'It swings its club at your head!',
      prompt: { type: 'key', keys: ['s'], label: 'Duck!', window: 1000 }, success: 'duck', fail: 'hit_high',
    },
    duck: { clip: 'hero_duck', duration: 800, camera: 'action', caption: 'Whoosh! Right over your helmet.', next: 'counter' },
    hit_high: { clip: 'hero_hit', duration: 900, damage: 1, camera: 'hero', caption: 'Bonk! That rattled your helmet.', next: 'swing_low' },
    counter: { clip: 'hero_counter', duration: 1000, camera: 'close', caption: 'You strike back. Clang!', next: 'swing_low' },

    swing_low: {
      clip: 'foe_swing_low', windup: 700, length: 1600, camera: 'foe', caption: 'Now it sweeps low!',
      prompt: { type: 'key', keys: ['w'], label: 'Jump!', window: 1000 }, success: 'jump', fail: 'hit_low',
    },
    jump: { clip: 'hero_jump', duration: 800, camera: 'action', caption: 'Hop! Nice.', next: 'thrust' },
    hit_low: { clip: 'hero_hit_low', duration: 900, damage: 1, camera: 'hero', caption: 'Oof, right in the shins.', next: 'thrust' },

    thrust: {
      clip: 'foe_thrust_windup', windup: 700, length: 1600, camera: 'action', caption: 'It pulls the club back for a jab!',
      prompt: { type: 'key', keys: ['p'], label: 'Parry!', window: 1000 }, success: 'parry', fail: 'thrust_hit',
    },
    parry: { clip: 'hero_parry', duration: 900, camera: 'close', caption: 'CLANG! You knock the jab aside.', next: 'counter2' },
    counter2: { clip: 'hero_counter', duration: 1000, camera: 'close', caption: 'And press the advantage!', next: 'throw' },
    thrust_hit: { clip: 'hero_thrust_hit', duration: 900, damage: 1, camera: 'hero', caption: 'Thunk! Right in the chest plate.', next: 'throw' },

    throw: {
      clip: 'foe_throw_windup', windup: 900, length: 1800, camera: 'foe', caption: 'It grabs a rock and heaves it at you!',
      prompt: {
        type: 'choice', label: 'Dodge the rock!', window: 1200,
        options: [
          { keys: ['s'], label: 'Duck', next: 'rock_duck' },
          { keys: ['w'], label: 'Jump', next: 'rock_jump' },
        ],
      },
      fail: 'rock_hit',
    },
    rock_duck: { clip: 'hero_rock_duck', duration: 900, camera: 'wide', caption: 'The rock sails over you and shatters!', next: 'charge' },
    rock_jump: { clip: 'hero_rock_jump', duration: 900, camera: 'wide', caption: 'You hop over it as it skips past!', next: 'charge' },
    rock_hit: { clip: 'hero_rock_hit', duration: 900, damage: 1, camera: 'hero', caption: 'Ouch! Right on the helmet.', next: 'charge' },

    // ======== Act 2 ========
    charge: {
      clip: 'foe_charge', windup: 800, length: 1800, camera: 'wide', caption: 'The robot charges!',
      prompt: {
        type: 'choice', label: 'Dodge!', window: 1200,
        options: [
          { keys: ['a'], label: 'Roll left', next: 'roll_left' },
          { keys: ['d'], label: 'Roll right', next: 'roll_right' },
        ],
      },
      fail: 'trampled',
    },
    roll_left: { clip: 'hero_roll_left', duration: 1000, camera: 'wide', caption: 'You roll clear and it thunders past.', next: 'grapple' },
    roll_right: { clip: 'hero_roll_right', duration: 1000, camera: 'wide', caption: 'You roll right under its arm!', next: 'powerup' },
    trampled: { clip: 'hero_trampled', duration: 1100, damage: 1, camera: 'hero', caption: 'Squished! You scramble back up.', next: 'grapple' },

    grapple: {
      clip: 'grapple', windup: 700, length: 2800, camera: 'close', caption: 'It grabs you! Push back!',
      prompt: { type: 'hold', keys: [' '], label: 'Hold to push!', window: 2400, holdMs: 1100 }, success: 'shove', fail: 'squeezed',
    },
    shove: { clip: 'shove', duration: 900, camera: 'action', caption: 'You shove it off balance!', next: 'powerup' },
    squeezed: { clip: 'squeezed', duration: 900, damage: 1, camera: 'close', caption: 'Squeeze! It lets go with a clank.', next: 'pinned' },

    pinned: {
      clip: 'pinned', windup: 600, length: 2800, camera: 'close', caption: 'It pins you down!',
      prompt: { type: 'mash', keys: ['k'], label: 'Mash to break free!', window: 2400, presses: 6 }, success: 'free', fail: 'pinned_hit',
    },
    free: { clip: 'free', duration: 900, camera: 'action', caption: 'You wriggle free!', next: 'powerup' },
    pinned_hit: { clip: 'pinned_hit', duration: 900, damage: 1, camera: 'hero', caption: 'Thump. You roll away.', next: 'powerup' },

    // ======== Act 3: powered up ========
    powerup: { clip: 'foe_powerup', duration: 1800, camera: 'foe', caption: 'The robot POWERS UP! Everything gets faster.', next: 'smash' },

    smash: {
      clip: 'foe_smash_windup', windup: 700, length: 1500, camera: 'foe', caption: 'It raises the club with both arms!',
      prompt: { type: 'key', keys: ['b'], label: 'Block!', window: 850 }, success: 'block', fail: 'smashed',
    },
    block: { clip: 'hero_block', duration: 900, camera: 'close', caption: 'Your shield takes it. What a hit!', next: 'pound' },
    smashed: { clip: 'hero_smashed', duration: 1000, damage: 1, camera: 'hero', caption: 'SPLAT. You are a little shorter now.', next: 'pound' },

    pound: {
      clip: 'foe_pound_windup', windup: 800, length: 1800, camera: 'action', caption: 'It is going to slam the ground!',
      prompt: { type: 'hold', keys: [' '], label: 'Brace!', window: 2000, holdMs: 900 }, success: 'brace', fail: 'blown',
    },
    brace: { clip: 'hero_brace', duration: 1100, camera: 'action', caption: 'The shockwave rolls right past you.', next: 'double' },
    blown: { clip: 'hero_blown', duration: 1100, damage: 1, camera: 'action', caption: 'Whoa! The shockwave sends you tumbling.', next: 'double' },

    double: {
      clip: 'foe_double_windup', windup: 600, length: 1600, camera: 'foe', caption: 'A double swing! Weave through it!',
      prompt: { type: 'sequence', keys: ['a', 'd'], label: 'Weave!', window: 1600 }, success: 'weave', fail: 'double_hit',
    },
    weave: { clip: 'hero_weave', duration: 1100, camera: 'action', caption: 'Left, right, and the club finds nothing but air.', next: 'dizzy' },
    double_hit: { clip: 'hero_double_hit', duration: 1100, damage: 1, camera: 'hero', caption: 'One, two. Ow, ow.', next: 'dizzy' },

    dizzy: { clip: 'foe_dizzy', duration: 1300, camera: 'foe', caption: 'It spun too hard. It is dizzy!', next: 'climb' },
    climb: {
      clip: 'foe_dizzy_prompt', windup: 400, length: 2800, camera: 'action', caption: 'Climb up and bonk it!',
      prompt: { type: 'mash', keys: ['c'], label: 'Climb!', window: 2400, presses: 7 }, success: 'climb_pound', fail: 'shaken_off',
    },
    climb_pound: { clip: 'hero_climb_pound', duration: 1400, camera: 'close', caption: 'Bonk! Bonk! BONK!', next: 'combo' },
    shaken_off: { clip: 'hero_shaken_off', duration: 1000, damage: 1, camera: 'wide', caption: 'It shakes you off like a wet dog.', next: 'combo' },

    combo: {
      clip: 'combo_ready', windup: 500, length: 2900, camera: 'action', caption: 'An opening! Strike!',
      prompt: { type: 'sequence', keys: ['j', 'k', 'l'], label: 'Combo!', window: 2400 }, success: 'combo_hit', fail: 'combo_fumble',
    },
    combo_hit: { clip: 'combo_hit', duration: 1300, camera: 'close', caption: 'One, two, three! Sparks fly.', next: 'finisher' },
    combo_fumble: { clip: 'combo_fumble', duration: 1000, damage: 1, camera: 'action', caption: 'You swing wide and it bonks you back.', next: 'finisher' },

    finisher: {
      clip: 'finisher_ready', windup: 900, length: 2400, camera: 'close', caption: 'The robot wobbles. Finish it your way!',
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

    victory: { clip: 'victory', duration: 2600, end: 'win', camera: 'wide', caption: 'CLANG! The robot powers down. Victory!' },
    victory_bash: { clip: 'victory_bash', duration: 2600, end: 'win', camera: 'wide', caption: 'WHAM! One shield bash and the robot is scrap. Victory!' },
    knockdown: { clip: 'knockdown', duration: 2400, end: 'lose', camera: 'wide', caption: "You're knocked down… but heroes always get back up." },
  },
};
