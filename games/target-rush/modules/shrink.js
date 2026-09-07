/**
 * Example module: targets shrink as their ring runs out.
 *
 * Module API (every hook is optional):
 *   id, name, description         shown as a checkbox in Settings
 *   options                       nested settings rendered under the checkbox; read them with engine.options(id)
 *                                 { id, label, type: 'checkbox', default }
 *                                 { id, label, type: 'number', default, min?, max?, step?, unit? }
 *                                 { id, label, type: 'range', default: [lo, hi], min?, max?, step? }   -> value is [lo, hi]
 *                                 { id, label, type: 'text', default, placeholder?, maxLength? }
 *   usesKeyboard                  true if targets are hit with keys (see keys.js)
 *   modifySettings(settings)      return adjusted settings before the round is scheduled
 *   onPlanStart(engine)           before the round is scheduled (reset per-round planning state)
 *   onPlan(planned, engine)       while the round is scheduled, before the target is placed:
 *                                 may change planned.lifetimeMs, widen planned.footprint (radius reserved
 *                                 around it, shorter-side units) or attach planned.motion (see move.js)
 *   onRoundStart(engine)
 *   onSpawn(target, engine)       target: { index, nx, ny, x, y, spawnAt, lifetimeMs, remaining,
 *                                           scale, dx, dy, hitsRequired, key, label, footprint, motion }
 *   onUpdate(dtMs, engine)        every frame while running; engine.active holds the live targets
 *   onPartialHit(target, engine)  a multi-hit target took a hit but isn't done
 *   onHit(target, engine)
 *   onMiss(target, engine)
 *   onRoundEnd(summary, engine)
 *
 * Useful engine fields: rng (seeded, deterministic per round), geometry
 * ({ width, height, radius } in shorter-side units), schedule, elapsed, active.
 *
 * Presentation fields a module may change on a live target; the UI applies them every frame:
 *   scale   1 = normal size
 *   dx, dy  offset from the scheduled position, as a fraction of the arena (0.1 = 10% across).
 *           Keep it within the footprint reserved in onPlan so targets never overlap.
 *   path    optional list of [nx, ny] points (arena fractions); the UI draws it as a dashed outline
 */
export default {
  id: 'shrink',
  name: 'Shrinking targets',
  description: 'Targets get smaller as their timer runs out.',
  onUpdate(_dtMs, engine) {
    for (const target of engine.active.values()) {
      target.scale = 0.55 + 0.45 * Math.max(0, target.remaining);
    }
  },
};
