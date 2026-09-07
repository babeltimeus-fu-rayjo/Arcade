import { Engine, State } from '../../shared/engine/engine.js';
import { modules } from './modules/index.js';
import { loadSettings, saveSettings } from './settings.js';
import { createUI } from './ui.js';

let settings = loadSettings(modules);
const engine = new Engine();

const ui = createUI({
  engine,
  modules,
  settings,
  onSettingsChange(next) {
    settings = next;
    saveSettings(next);
    ui.setSettings(next);
  },
  onStart() {
    ui.showGame(); // the arena has to be laid out before it can be measured
    engine.start({
      settings,
      arena: ui.getArenaMetrics(),
      modules: modules.filter((m) => settings.modules.includes(m.id)),
      // Multiplayer hook: pass the same `seed` on every device for an identical round.
    });
  },
});

// Switching tabs or apps freezes the frame loop; pause instead of dropping targets.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && (engine.state === State.RUNNING || engine.state === State.COUNTDOWN)) {
    engine.pause();
  }
});

// Debug handle for the console and for future multiplayer wiring (e.g. engine.seed).
window.__targetRush = { engine, modules, get settings() { return settings; } };
