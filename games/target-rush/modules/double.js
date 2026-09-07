/**
 * Double tap: a share of targets need two hits. They show the hits left as a
 * badge; the engine handles the counting (target.hitsRequired / hitsTaken).
 */
export default {
  id: 'double',
  name: 'Double tap',
  description: 'Some targets show a 2 and need two hits to count.',
  options: [
    { id: 'share', label: 'Double targets', type: 'number', default: 40, min: 0, max: 100, step: 10, unit: '%' },
  ],
  onSpawn(target, engine) {
    const { share } = engine.options('double');
    if (engine.rng.next() * 100 < share) target.hitsRequired = 2;
  },
};
