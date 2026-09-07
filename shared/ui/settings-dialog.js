import { estimateBursts } from '../engine/schedule.js';

/**
 * Settings dialog shared by the round-based games. Renders the standard groups
 * into a <dialog>: round (length, count, lifetime), bursts, and modules with
 * their nested options. A game adds its own fields with `roundExtraHtml` /
 * `extraGroupsHtml` and reads/fills them through `readExtra` / `fillExtra`.
 */
export function createSettingsDialog({
  dialog,
  modules,
  defaults,
  normalize,
  labels = {},
  roundExtraHtml = '',
  extraGroupsHtml = '',
  fillExtra,
  readExtra,
  onChange,
  onSave,
}) {
  const text = {
    title: 'Settings',
    count: 'Number of targets',
    lifetime: 'Target lifetime (seconds)',
    burstsLede: 'Targets arrive in random groups with random breaks in between.',
    perBurst: 'Targets per burst',
    breakAfter: 'Break after a burst (seconds)',
    modulesLede: 'Optional twists that change how a round plays. Mix and match.',
    ...labels,
  };

  dialog.innerHTML = `
    <form method="dialog" class="dialog-body">
      <h2 id="settings-title">${text.title}</h2>

      <section class="group">
        <h3 class="group-title">Round</h3>
        <div class="field">
          <span class="field-label" id="duration-label">Round length</span>
          <div class="field-row" role="group" aria-labelledby="duration-label">
            <input type="number" name="minutes" min="0" max="60" step="1" inputmode="numeric" aria-label="Minutes" required>
            <span class="unit">min</span>
            <input type="number" name="seconds" min="0" max="59" step="1" inputmode="numeric" aria-label="Seconds" required>
            <span class="unit">sec</span>
          </div>
        </div>
        <label class="field">
          <span class="field-label">${text.count}</span>
          <input type="number" name="targetCount" min="1" max="1000" step="1" inputmode="numeric" required>
        </label>
        <label class="field">
          <span class="field-label">${text.lifetime}</span>
          <input type="number" name="lifetime" min="0.3" max="10" step="0.1" inputmode="decimal" required>
        </label>
        ${roundExtraHtml}
      </section>

      <section class="group">
        <label class="check group-toggle">
          <input type="checkbox" name="burstsEnabled">
          <span><strong>Bursts</strong><small>${text.burstsLede}</small></span>
        </label>
        <div class="nested" data-role="bursts-options">
          <div class="field">
            <span class="field-label" id="burst-size-label">${text.perBurst}</span>
            <div class="field-row" role="group" aria-labelledby="burst-size-label">
              <input type="number" name="burstMin" min="1" max="50" step="1" inputmode="numeric" aria-label="Fewest per burst" required>
              <span class="unit">to</span>
              <input type="number" name="burstMax" min="1" max="50" step="1" inputmode="numeric" aria-label="Most per burst" required>
            </div>
          </div>
          <div class="field">
            <span class="field-label" id="burst-delay-label">${text.breakAfter}</span>
            <div class="field-row" role="group" aria-labelledby="burst-delay-label">
              <input type="number" name="delayMin" min="0" max="30" step="0.1" inputmode="decimal" aria-label="Shortest break" required>
              <span class="unit">to</span>
              <input type="number" name="delayMax" min="0" max="30" step="0.1" inputmode="decimal" aria-label="Longest break" required>
            </div>
          </div>
          <p class="hint" data-role="bursts-hint"></p>
        </div>
      </section>

      ${extraGroupsHtml}

      <section class="group">
        <h3 class="group-title">Modules</h3>
        <p class="muted small group-lede">${text.modulesLede}</p>
        <div data-role="modules-list"></div>
      </section>

      <menu>
        <button type="button" class="btn btn-ghost" data-role="reset">Reset</button>
        <button type="submit" value="cancel" class="btn btn-ghost" formnovalidate>Cancel</button>
        <button type="submit" value="save" class="btn btn-primary">Save</button>
      </menu>
    </form>`;

  const form = dialog.querySelector('form');
  const f = form.elements;
  const modulesList = dialog.querySelector('[data-role="modules-list"]');
  const burstsOptions = dialog.querySelector('[data-role="bursts-options"]');
  const burstsHint = dialog.querySelector('[data-role="bursts-hint"]');
  const optionName = (mod, opt) => `opt:${mod.id}:${opt.id}`;

  function el(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }

  function numberInput(opt, name, ariaLabel) {
    const field = el('input');
    field.type = 'number';
    field.name = name;
    if (opt.min !== undefined) field.min = String(opt.min);
    if (opt.max !== undefined) field.max = String(opt.max);
    field.step = String(opt.step ?? 1);
    field.inputMode = Number.isInteger(opt.step ?? 1) ? 'numeric' : 'decimal';
    field.required = true;
    if (ariaLabel) field.setAttribute('aria-label', ariaLabel);
    return field;
  }

  function renderOption(mod, opt) {
    const name = optionName(mod, opt);
    if (opt.type === 'checkbox') {
      const row = el('label', 'opt opt-check');
      const field = el('input');
      field.type = 'checkbox';
      field.name = name;
      row.append(field, el('span', 'opt-label', opt.label));
      return row;
    }
    if (opt.type === 'range') {
      const row = el('div', 'opt opt-range');
      const inputs = el('div', 'opt-range-row');
      inputs.append(
        numberInput(opt, `${name}:min`, `${opt.label}, lowest`),
        el('span', 'unit', 'to'),
        numberInput(opt, `${name}:max`, `${opt.label}, highest`),
      );
      row.append(el('span', 'opt-label', opt.label), inputs);
      return row;
    }
    if (opt.type === 'text') {
      const row = el('label', 'opt opt-text');
      const field = el('input');
      field.type = 'text';
      field.name = name;
      field.placeholder = opt.placeholder ?? '';
      if (opt.maxLength) field.maxLength = opt.maxLength;
      field.autocomplete = 'off';
      field.spellcheck = false;
      field.setAttribute('autocapitalize', 'off');
      row.append(el('span', 'opt-label', opt.label), field);
      return row;
    }
    const row = el('label', 'opt');
    row.append(el('span', 'opt-label', opt.label), numberInput(opt, name));
    if (opt.unit) row.append(el('span', 'unit', opt.unit));
    return row;
  }

  function renderModuleList() {
    modulesList.replaceChildren();
    if (!modules.length) {
      modulesList.append(el('p', 'muted small', 'No modules yet.'));
      return;
    }
    for (const mod of modules) {
      const wrap = el('div', 'module');
      const label = el('label', 'check');
      const input = el('input');
      input.type = 'checkbox';
      input.name = 'modules';
      input.value = mod.id;
      const body = el('span');
      body.append(el('strong', null, mod.name), el('small', null, mod.description));
      label.append(input, body);
      wrap.append(label);
      if (mod.options?.length) {
        const nested = el('div', 'nested module-options');
        nested.dataset.module = mod.id;
        for (const opt of mod.options) nested.append(renderOption(mod, opt));
        wrap.append(nested);
      }
      modulesList.append(wrap);
    }
  }

  /** Grey out and disable nested inputs whose parent toggle is off. */
  function syncNested() {
    setNestedEnabled(burstsOptions, f.namedItem('burstsEnabled').checked);
    for (const cb of form.querySelectorAll('input[name="modules"]')) {
      const nested = modulesList.querySelector(`.module-options[data-module="${cb.value}"]`);
      if (nested) setNestedEnabled(nested, cb.checked);
    }
  }

  function setNestedEnabled(container, on) {
    container.classList.toggle('is-off', !on);
    for (const input of container.querySelectorAll('input')) input.disabled = !on;
  }

  function fillForm(s) {
    f.namedItem('minutes').value = String(Math.floor(s.durationSec / 60));
    f.namedItem('seconds').value = String(s.durationSec % 60);
    f.namedItem('targetCount').value = String(s.targetCount);
    f.namedItem('lifetime').value = (s.lifetimeMs / 1000).toFixed(1);

    f.namedItem('burstsEnabled').checked = s.bursts.enabled;
    f.namedItem('burstMin').value = String(s.bursts.minSize);
    f.namedItem('burstMax').value = String(s.bursts.maxSize);
    f.namedItem('delayMin').value = (s.bursts.minDelayMs / 1000).toFixed(1);
    f.namedItem('delayMax').value = (s.bursts.maxDelayMs / 1000).toFixed(1);

    for (const cb of form.querySelectorAll('input[name="modules"]')) cb.checked = s.modules.includes(cb.value);
    for (const mod of modules) {
      for (const opt of mod.options ?? []) {
        const value = s.moduleOptions[mod.id]?.[opt.id] ?? opt.default;
        if (opt.type === 'range') {
          f.namedItem(`${optionName(mod, opt)}:min`).value = String(value[0]);
          f.namedItem(`${optionName(mod, opt)}:max`).value = String(value[1]);
          continue;
        }
        const input = f.namedItem(optionName(mod, opt));
        if (!input) continue;
        if (opt.type === 'checkbox') input.checked = Boolean(value);
        else input.value = String(value);
      }
    }
    fillExtra?.(f, s);
    syncNested();
    updateBurstsHint();
    onChange?.(form);
  }

  function readForm() {
    const val = (name) => f.namedItem(name)?.value ?? '';
    const moduleOptions = {};
    for (const mod of modules) {
      moduleOptions[mod.id] = {};
      for (const opt of mod.options ?? []) {
        if (opt.type === 'range') {
          moduleOptions[mod.id][opt.id] = [
            Number(f.namedItem(`${optionName(mod, opt)}:min`).value),
            Number(f.namedItem(`${optionName(mod, opt)}:max`).value),
          ];
          continue;
        }
        const input = f.namedItem(optionName(mod, opt));
        if (!input) continue;
        if (opt.type === 'checkbox') moduleOptions[mod.id][opt.id] = input.checked;
        else if (opt.type === 'text') moduleOptions[mod.id][opt.id] = input.value;
        else moduleOptions[mod.id][opt.id] = Number(input.value);
      }
    }
    return normalize(
      {
        durationSec: (Number(val('minutes')) || 0) * 60 + (Number(val('seconds')) || 0),
        targetCount: Number(val('targetCount')),
        lifetimeMs: Math.round(Number(val('lifetime')) * 1000),
        bursts: {
          enabled: f.namedItem('burstsEnabled').checked,
          minSize: Number(val('burstMin')),
          maxSize: Number(val('burstMax')),
          minDelayMs: Math.round(Number(val('delayMin')) * 1000),
          maxDelayMs: Math.round(Number(val('delayMax')) * 1000),
        },
        modules: [...form.querySelectorAll('input[name="modules"]:checked')].map((cb) => cb.value),
        moduleOptions,
        ...(readExtra?.(f) ?? {}),
      },
      modules,
    );
  }

  function updateBurstsHint() {
    const s = readForm();
    if (!s.bursts.enabled) {
      burstsHint.textContent = '';
      return;
    }
    const { count, breakScale } = estimateBursts(s);
    let hint = `About ${count} burst${count === 1 ? '' : 's'}.`;
    if (count > 1) {
      hint +=
        breakScale >= 0.85 && breakScale <= 1.15
          ? ' Breaks fit the round.'
          : ` Breaks run ×${breakScale.toFixed(1)} so everything fits the round.`;
    }
    burstsHint.textContent = hint;
  }

  renderModuleList();
  form.addEventListener('submit', (e) => {
    if (e.submitter?.value === 'save') onSave(readForm());
  });
  form.addEventListener('change', () => {
    syncNested();
    updateBurstsHint();
    onChange?.(form);
  });
  form.addEventListener('input', () => {
    updateBurstsHint();
    onChange?.(form);
  });
  dialog.querySelector('[data-role="reset"]').addEventListener('click', () => fillForm(normalize(defaults, modules)));

  return {
    form,
    readForm,
    open(settings) {
      fillForm(settings);
      dialog.showModal();
    },
  };
}
