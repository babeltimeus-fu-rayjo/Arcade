/**
 * Fight script: "Ogre of the Bridge". A slow, heavy hitter: big smashes, a ground
 * pound, boulders, and a rage phase. Same beat/clip vocabulary as the robot fight
 * (see ruins-robot.js for the format); the ogre is drawn by scene.js.
 */
export default {
  id: 'bridge-ogre',
  title: 'Ogre of the Bridge',
  blurb: 'A big green ogre guards the old bridge and wants a toll you cannot pay. Block, brace and roll, and watch out for boulders.',
  foe: 'ogre',
  foeName: 'the ogre',
  projectile: 'boulder',
  scene: 'bridge',
  hearts: 5,
  start: 'intro',
  lose: 'knockdown',
  beats: {
    intro: { clip: 'faceoff', duration: 1700, camera: 'wide', caption: 'An ogre blocks the bridge. "No toll, no crossing!"', next: 'smash' },

    smash: {
      clip: 'foe_smash_windup', windup: 800, length: 1600, camera: 'foe', caption: 'It heaves its club high with both hands!',
      prompt: { type: 'key', keys: ['b'], label: 'Block!', window: 1100 }, success: 'block', fail: 'smashed',
    },
    block: { clip: 'hero_block', duration: 900, camera: 'close', caption: 'Your shield rings like a bell. Still standing!', next: 'swing_low' },
    smashed: { clip: 'hero_smashed', duration: 1000, damage: 1, camera: 'hero', caption: 'SPLAT. The bridge shakes. So do you.', next: 'swing_low' },

    swing_low: {
      clip: 'foe_swing_low', windup: 800, length: 1700, camera: 'foe', caption: 'It sweeps the club at your ankles!',
      prompt: { type: 'key', keys: ['w'], label: 'Jump!', window: 1100 }, success: 'jump', fail: 'hit_low',
    },
    jump: { clip: 'hero_jump', duration: 800, camera: 'action', caption: 'Hop! It grumbles.', next: 'charge' },
    hit_low: { clip: 'hero_hit_low', duration: 900, damage: 1, camera: 'hero', caption: 'Ouch. Right in the shins.', next: 'charge' },

    charge: {
      clip: 'foe_charge', windup: 900, length: 1900, camera: 'wide', caption: 'The ogre thunders at you!',
      prompt: {
        type: 'choice', label: 'Dodge!', window: 1300,
        options: [
          { keys: ['a'], label: 'Roll left', next: 'roll_left' },
          { keys: ['d'], label: 'Roll right', next: 'roll_right' },
        ],
      },
      fail: 'trampled',
    },
    roll_left: { clip: 'hero_roll_left', duration: 1000, camera: 'wide', caption: 'You roll aside and it skids past.', next: 'grapple' },
    roll_right: { clip: 'hero_roll_right', duration: 1000, camera: 'wide', caption: 'You roll right between its legs!', next: 'throw' },
    trampled: { clip: 'hero_trampled', duration: 1100, damage: 1, camera: 'hero', caption: 'Flattened! You peel yourself off the planks.', next: 'grapple' },

    grapple: {
      clip: 'grapple', windup: 700, length: 2800, camera: 'close', caption: 'It grabs you in a bear hug! Push!',
      prompt: { type: 'hold', keys: [' '], label: 'Hold to push!', window: 2600, holdMs: 1200 }, success: 'shove', fail: 'squeezed',
    },
    shove: { clip: 'shove', duration: 900, camera: 'action', caption: 'You shove it back. It looks surprised.', next: 'throw' },
    squeezed: { clip: 'squeezed', duration: 900, damage: 1, camera: 'close', caption: 'Squeeze! It smells like old socks.', next: 'pinned' },
    pinned: {
      clip: 'pinned', windup: 600, length: 2800, camera: 'close', caption: 'It sits on you!',
      prompt: { type: 'mash', keys: ['k'], label: 'Mash to wriggle out!', window: 2600, presses: 6 }, success: 'free', fail: 'pinned_hit',
    },
    free: { clip: 'free', duration: 900, camera: 'action', caption: 'You wriggle out. Phew.', next: 'throw' },
    pinned_hit: { clip: 'pinned_hit', duration: 900, damage: 1, camera: 'hero', caption: 'Thump. Rude.', next: 'throw' },

    throw: {
      clip: 'foe_throw_windup', windup: 1000, length: 1900, camera: 'foe', caption: 'It rips a boulder out of the bridge!',
      prompt: {
        type: 'choice', label: 'Dodge the boulder!', window: 1300,
        options: [
          { keys: ['s'], label: 'Duck', next: 'rock_duck' },
          { keys: ['w'], label: 'Jump', next: 'rock_jump' },
        ],
      },
      fail: 'rock_hit',
    },
    rock_duck: { clip: 'hero_rock_duck', duration: 900, camera: 'wide', caption: 'The boulder sails over you. CRUNCH.', next: 'powerup' },
    rock_jump: { clip: 'hero_rock_jump', duration: 900, camera: 'wide', caption: 'You hop over the bouncing boulder!', next: 'powerup' },
    rock_hit: { clip: 'hero_rock_hit', duration: 900, damage: 1, camera: 'hero', caption: 'Bonk! That was a big rock.', next: 'powerup' },

    powerup: { clip: 'foe_powerup', duration: 1800, camera: 'foe', caption: 'The ogre flies into a RAGE! It is faster now.', next: 'pound' },

    pound: {
      clip: 'foe_pound_windup', windup: 800, length: 1800, camera: 'action', caption: 'It is going to slam the bridge!',
      prompt: { type: 'hold', keys: [' '], label: 'Brace!', window: 2100, holdMs: 950 }, success: 'brace', fail: 'blown',
    },
    brace: { clip: 'hero_brace', duration: 1100, camera: 'action', caption: 'The whole bridge bucks, but you hold on.', next: 'swing_high' },
    blown: { clip: 'hero_blown', duration: 1100, damage: 1, camera: 'action', caption: 'The planks throw you into the air!', next: 'swing_high' },

    swing_high: {
      clip: 'foe_swing_high', windup: 650, length: 1500, camera: 'foe', caption: 'A furious swing at your head!',
      prompt: { type: 'key', keys: ['s'], label: 'Duck!', window: 950 }, success: 'duck', fail: 'hit_high',
    },
    duck: { clip: 'hero_duck', duration: 800, camera: 'action', caption: 'Whoosh! It nearly took your plume.', next: 'counter' },
    counter: { clip: 'hero_counter', duration: 1000, camera: 'close', caption: 'You bonk its knee. It hops in pain!', next: 'double' },
    hit_high: { clip: 'hero_hit', duration: 900, damage: 1, camera: 'hero', caption: 'CLONK. Stars everywhere.', next: 'double' },

    double: {
      clip: 'foe_double_windup', windup: 600, length: 1500, camera: 'foe', caption: 'It winds up for a double swing!',
      prompt: { type: 'sequence', keys: ['a', 'd'], label: 'Weave!', window: 1500 }, success: 'weave', fail: 'double_hit',
    },
    weave: { clip: 'hero_weave', duration: 1100, camera: 'action', caption: 'Left, right. The club hits nothing but air.', next: 'dizzy' },
    double_hit: { clip: 'hero_double_hit', duration: 1100, damage: 1, camera: 'hero', caption: 'One, two. Ow, ow.', next: 'dizzy' },

    dizzy: { clip: 'foe_dizzy', duration: 1300, camera: 'foe', caption: 'It spun itself silly. It is dizzy!', next: 'climb' },
    climb: {
      clip: 'foe_dizzy_prompt', windup: 400, length: 2800, camera: 'action', caption: 'Climb its belly and bonk that head!',
      prompt: { type: 'mash', keys: ['c'], label: 'Climb!', window: 2500, presses: 7 }, success: 'climb_pound', fail: 'shaken_off',
    },
    climb_pound: { clip: 'hero_climb_pound', duration: 1400, camera: 'close', caption: 'Bonk! Bonk! BONK!', next: 'combo' },
    shaken_off: { clip: 'hero_shaken_off', duration: 1000, damage: 1, camera: 'wide', caption: 'It shakes you off like a flea.', next: 'combo' },

    combo: {
      clip: 'combo_ready', windup: 500, length: 2800, camera: 'action', caption: 'It is wobbling. Strike!',
      prompt: { type: 'sequence', keys: ['j', 'k', 'l'], label: 'Combo!', window: 2400 }, success: 'combo_hit', fail: 'combo_fumble',
    },
    combo_hit: { clip: 'combo_hit', duration: 1300, camera: 'close', caption: 'One, two, three! It totters.', next: 'finisher' },
    combo_fumble: { clip: 'combo_fumble', duration: 1000, damage: 1, camera: 'action', caption: 'You swing wide and it bonks you back.', next: 'finisher' },

    finisher: {
      clip: 'finisher_ready', windup: 900, length: 2400, camera: 'close', caption: 'The ogre teeters on the edge. Finish it your way!',
      prompt: {
        type: 'choice', label: 'Finish it!', window: 1400,
        options: [
          { keys: ['f'], label: 'Sword slash', next: 'victory' },
          { keys: ['g'], label: 'Shield bash', next: 'victory_bash' },
        ],
      },
      fail: 'finisher_miss',
    },
    finisher_miss: { clip: 'finisher_miss', duration: 900, camera: 'action', caption: 'Missed! It is still teetering…', next: 'finisher' },

    victory: { clip: 'victory', duration: 2600, end: 'win', camera: 'wide', caption: 'THUD. The ogre is down and the bridge is yours!' },
    victory_bash: { clip: 'victory_bash', duration: 2600, end: 'win', camera: 'wide', caption: 'WHUMP! One shield bash and the ogre is off the bridge. Victory!' },
    knockdown: { clip: 'knockdown', duration: 2400, end: 'lose', camera: 'wide', caption: 'The ogre wins this one… but the bridge will still be there tomorrow.' },
  },
};
