import { Engine, State } from '../../shared/engine/engine.js';
import { modules } from './modules/index.js';
import { molePlanner } from './planner.js';
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
    ui.showGame();
    engine.start({
      settings,
      // Positions come from the keyboard, so the arena only needs to be roomy.
      arena: { aspect: 3.4, radiusFrac: 0.02 },
      // The planner runs last so it sees any lifetime changes other modules make.
      modules: [...modules.filter((m) => settings.modules.includes(m.id)), molePlanner],
      // Multiplayer hook: pass the same `seed` on every device for an identical round.
    });
  },
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && (engine.state === State.RUNNING || engine.state === State.COUNTDOWN)) {
    engine.pause();
  }
});

window.__whackAMole = { engine, modules, get settings() { return settings; } };
