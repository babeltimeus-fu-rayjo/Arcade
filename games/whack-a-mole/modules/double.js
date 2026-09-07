/** Tough moles: a share of moles need two whacks. The engine counts the hits. */
export default {
  id: 'double',
  name: 'Tough moles',
  description: 'Some moles show a 2 and need two whacks to go down.',
  options: [
    { id: 'share', label: 'Tough moles', type: 'number', default: 40, min: 0, max: 100, step: 10, unit: '%' },
  ],
  onSpawn(target, engine) {
    const { share } = engine.options('double');
    if (engine.rng.next() * 100 < share) target.hitsRequired = 2;
  },
};
