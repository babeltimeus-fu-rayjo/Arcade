/** Sinking moles: a mole slides back into its hole as its time runs out. */
export default {
  id: 'sink',
  name: 'Sinking moles',
  description: 'Moles slowly sink back down as their time runs out.',
  onUpdate(_dtMs, engine) {
    for (const target of engine.active.values()) {
      target.scale = 0.45 + 0.55 * Math.max(0, target.remaining); // the UI reads scale as "how far up"
    }
  },
};
