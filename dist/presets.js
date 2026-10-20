(() => {
  const previous = window.ResonanceGallery;
  const customScene = previous?.customScene ?? window.Resonance.definition;
  const wasOpen = previous?.panelOpen ?? true;
  previous?.dispose();

  // These presets use the same plain-JavaScript API as visual.js.
  const presets = [
    { id: "custom", label: "Live code", scene: null },
    {
      id: "tunnel",
      label: "Tunnel",
      scene: {
        draw({ draw, audio, time, palette, controls }) {
          draw.background("#010207");
          draw.tunnel({
            colors: palette,
            layers: Math.round(12 + controls.detail * 28),
            twist: controls.shape * 6,
            speed: 0.2 + audio.bass * 3 + audio.pulse * 5,
            zoom: 1 + audio.bass * 0.2 + audio.pulse * 0.25,
            rotation: time * 0.04 + audio.beatCount * 0.06,
          });
        },
      },
    },
    {
      id: "particles",
      label: "Particles",
      scene: {
        draw({ draw, audio, time, palette, controls }) {
          draw.background("#01030a");
          draw.particles({
            id: "near",
            count: Math.round(160 + controls.detail * 800),
            speed: 0.3 + audio.bass * 1.5 + audio.pulse * 4,
            spread: 1.5 + controls.shape * 2,
            rotation: time * 0.035,
            color: palette[0],
            size: 5 + audio.treble * 5,
            opacity: 0.65,
          });
          draw.particles({
            id: "far",
            count: Math.round(100 + controls.detail * 400),
            speed: 0.15 + audio.bass * 0.5,
            spread: 2.7,
            rotation: -time * 0.02,
            color: palette[1],
            size: 3,
            opacity: 0.4,
          });
          draw.ring({
            radius: 0.08 + audio.bass * 0.08 + audio.pulse * 0.07,
            color: palette[0],
            width: 0.004,
            opacity: 0.2 + audio.pulse * 0.5,
          });
        },
      },
    },
    {
      id: "rings",
      label: "Rings",
      scene: {
        draw({ draw, audio, time, palette, controls }) {
          draw.background("#02030b");
          for (let i = 0; i < Math.round(3 + controls.detail * 9); i++) {
            draw.ring({
              radius: 0.2 + i * 0.065 + audio.bass * 0.12 + audio.pulse * 0.08,
              wobble: 0.015 + audio.mids * 0.045,
              lobes: 2 + Math.round(controls.shape * 7) + (i % 3),
              phase: time * 0.6 + i * 0.6,
              rotation: time * 0.07 + i * 0.12,
              spectrum: audio.spectrum,
              reactivity: 0.025 + audio.treble * 0.025,
              color: Resonance.mix(palette[0], palette[1], i / 6),
              width: 0.003,
              opacity: 0.55 + audio.energy * 0.35,
            });
          }
        },
      },
    },
    {
      id: "waveform",
      label: "Waveform",
      scene: {
        draw({ draw, audio, palette, aspect, controls }) {
          draw.background("#01050a");
          const span = Math.min(3.1, aspect * 1.75);
          draw.path(
            [
              [-span / 2, 0],
              [span / 2, 0],
            ],
            { color: palette[0], width: 0.001, opacity: 0.18 },
          );
          const amplitude = Math.min(
            8,
            (0.2 + controls.shape * 0.5) / Math.max(0.02, audio.rms),
          );
          draw.waveform(
            audio.waveform.filter(
              (_, i) =>
                i % Math.max(1, Math.round(8 - controls.detail * 7)) === 0,
            ),
            {
              span,
              amplitude,
              color: palette[0],
              width: 0.004 + audio.pulse * 0.002,
              opacity: 0.8,
            },
          );
          draw.waveform(
            audio.waveform.filter(
              (_, i) =>
                i % Math.max(1, Math.round(8 - controls.detail * 7)) === 0,
            ),
            {
              span,
              amplitude: -amplitude * 0.65,
              color: palette[1],
              width: 0.003,
              opacity: 0.45,
            },
          );
        },
      },
    },
    {
      id: "spectrum",
      label: "Spectrum",
      scene: {
        draw({ draw, audio, palette, aspect, controls }) {
          draw.background("#02040b");
          const count = Math.round(16 + controls.detail * 80),
            span = Math.min(2.8, aspect * 1.7),
            tops = [];
          draw.path(
            [
              [-span / 2, -0.6],
              [span / 2, -0.6],
            ],
            { color: palette[0], width: 0.001, opacity: 0.2 },
          );
          for (let i = 0; i < count; i++) {
            const value =
              audio.spectrum[Math.floor((i * audio.spectrum.length) / count)];
            const x = (i / (count - 1) - 0.5) * span,
              y = -0.6 + 0.015 + value * 1.2;
            draw.path(
              [
                [x, -0.6],
                [x, y],
              ],
              {
                color: Resonance.mix(palette[0], palette[1], i / (count - 1)),
                width: Math.min(0.009, (span / count) * 0.15),
                opacity: 0.45 + value * 0.5,
              },
            );
            tops.push([x, y]);
          }
          draw.points(tops, { color: "#e5faff", size: 4, opacity: 0.6 });
        },
      },
    },
  ];

  presets.push(
    {
      id: "galaxy",
      label: "Galaxy",
      scene: {
        draw({ draw, audio, time, palette, controls }) {
          draw.background("#020309");
          const arms = 3 + Math.round(controls.shape * 5);
          for (let arm = 0; arm < arms; arm++) {
            const stars = [],
              count = Math.round(80 + controls.detail * 220);
            for (let i = 0; i < count; i++) {
              const r = Math.sqrt(i / count) * (0.8 + audio.bass * 0.13);
              const angle =
                (arm * Math.PI * 2) / arms +
                r * (5 + controls.shape * 5) -
                time * 0.18;
              const jitter = Math.sin(i * 127.1 + arm) * 0.035;
              stars.push([
                Math.cos(angle) * r + jitter,
                Math.sin(angle) * r * 0.65 + jitter,
              ]);
            }
            draw.points(stars, {
              color: Resonance.mix(palette[0], palette[1], arm / arms),
              size: 3 + audio.pulse * 5,
              opacity: 0.8,
            });
          }
          draw.points([[0, 0]], {
            color: "#fff2de",
            size: 24 + audio.pulse * 24,
          });
        },
      },
    },
    {
      id: "aurora",
      label: "Aurora",
      scene: {
        draw({ draw, audio, time, palette, aspect, controls }) {
          draw.background("#01070b");
          const layers = Math.round(8 + controls.detail * 24);
          for (let j = 0; j < layers; j++) {
            const points = [];
            for (let i = 0; i <= 160; i++) {
              const x = (i / 160 - 0.5) * aspect * 2.2;
              const y =
                Math.sin(
                  x * (1.5 + controls.shape * 3) + time * 0.6 + j * 0.06,
                ) *
                  0.24 +
                Math.sin(x * 3 - time * 0.35 + j * 0.1) * 0.12 +
                (j / layers - 0.5) * (0.55 + audio.bass * 0.2) +
                audio.spectrum[Math.floor((i / 161) * 64)] * 0.12;
              points.push([x, y]);
            }
            draw.path(points, {
              color: Resonance.mix(palette[0], palette[1], j / layers),
              width: 0.008,
              opacity: 0.16 + audio.energy * 0.18,
            });
          }
        },
      },
    },
    {
      id: "lissajous",
      label: "Lissajous",
      scene: {
        draw({ draw, audio, time, palette, controls }) {
          draw.background("#030309");
          const frequency = 2 + Math.round(controls.shape * 5);
          for (let layer = 0; layer < 4; layer++) {
            const points = [],
              count = Math.round(240 + controls.detail * 480);
            for (let i = 0; i <= count; i++) {
              const angle = (i / count) * Math.PI * 2;
              points.push([
                Math.sin(angle * frequency + time * 0.22 + layer * 0.04) * 0.78,
                Math.sin(angle * (frequency + 1) + layer * 0.06) *
                  (0.55 + audio.bass * 0.12),
              ]);
            }
            draw.path(points, {
              color: Resonance.mix(palette[0], palette[1], layer / 3),
              width: 0.0025,
              opacity: 0.5,
            });
          }
        },
      },
    },
    {
      id: "mandala",
      label: "Mandala",
      scene: {
        draw({ draw, audio, time, palette, controls }) {
          draw.background("#07030a");
          const petals = 4 + Math.round(controls.shape * 10),
            layers = Math.round(4 + controls.detail * 10);
          for (let j = 0; j < layers; j++) {
            const points = [];
            for (let i = 0; i <= 360; i++) {
              const a = (i / 360) * Math.PI * 2;
              const r =
                (0.18 + (j / layers) * 0.48) *
                  (1 + 0.27 * Math.cos(a * petals + time * 0.3)) +
                audio.pulse * 0.04;
              const turn = time * 0.05 + j * 0.035;
              points.push([Math.cos(a + turn) * r, Math.sin(a + turn) * r]);
            }
            draw.path(points, {
              closed: true,
              color: Resonance.mix(palette[0], palette[1], j / layers),
              width: 0.003,
              opacity: 0.65,
            });
          }
        },
      },
    },
    {
      id: "terrain",
      label: "Terrain",
      scene: {
        draw({ draw, audio, time, palette, controls }) {
          draw.background("#02050b");
          const rows = Math.round(14 + controls.detail * 24);
          for (let row = rows; row >= 0; row--) {
            const depth = (row + ((time * 1.5) % 1)) / rows,
              perspective = 1 / (0.5 + depth * 4);
            const points = [];
            for (let i = 0; i <= 80; i++) {
              const x = (i / 80 - 0.5) * 3;
              const ridge =
                Math.sin(
                  x * (3 + controls.shape * 8) + depth * 12 + time * 0.3,
                ) *
                  0.08 +
                audio.spectrum[Math.floor((i / 81) * 64)] *
                  (0.1 + controls.shape * 0.3);
              points.push([
                x * perspective,
                (ridge - 0.38) * perspective + 0.18,
              ]);
            }
            draw.path(points, {
              color: Resonance.mix(palette[0], palette[1], depth),
              width: 0.0025,
              opacity: 0.25 + (1 - depth) * 0.55,
            });
          }
        },
      },
    },
  );

  const sources = [
    { id: "off", label: "Off · fixed value", read: () => 0 },
    { id: "volume", label: "Volume · RMS", read: (a) => a.rms * 8 },
    { id: "bass", label: "Bass energy", read: (a) => a.bass },
    { id: "mids", label: "Mid energy", read: (a) => a.mids },
    { id: "treble", label: "Treble energy", read: (a) => a.treble },
    { id: "beat", label: "Beat impulse", read: (a) => a.pulse },
    {
      id: "loudness",
      label: "Perceived loudness",
      feature: "loudness",
      read: (a) => (a.features.loudness?.total ?? 0) / 60,
    },
    {
      id: "centroid",
      label: "Tone brightness · centroid",
      feature: "spectralCentroid",
      read: (a) => a.centroidHz / 6000,
    },
    {
      id: "flatness",
      label: "Noisiness · flatness",
      feature: "spectralFlatness",
      read: (a) => a.features.spectralFlatness,
    },
    {
      id: "zcr",
      label: "Zero crossings",
      feature: "zcr",
      read: (a) => a.features.zcr / a.waveform.length,
    },
    {
      id: "chroma",
      label: "Dominant pitch class · chroma",
      feature: "chroma",
      read: (a) => {
        const c = a.features.chroma;
        return c?.length ? c.indexOf(Math.max(...c)) / 11 : 0;
      },
    },
  ];
  const defaults = {
    size: { source: "bass", amount: 0.35 },
    motion: { source: "beat", amount: 0.65 },
    brightness: { source: "volume", amount: 0.4 },
    colour: { source: "centroid", amount: 0.6 },
  };
  const controlSpecs = [
    ["size", "Size", 0.3, 2, 0.01, 1],
    ["speed", "Speed", 0, 3, 0.01, 1],
    ["brightness", "Brightness", 0.1, 2, 0.01, 1],
    ["hue", "Colour shift", 0, 360, 1, 0],
    ["detail", "Detail / density", 0, 1, 0.01, 0.5],
    ["shape", "Shape / twist", 0, 1, 0.01, 0.42],
  ];
  let mappings = structuredClone(defaults);
  let controls = Object.fromEntries(
    controlSpecs.map(([key, , , , , value]) => [key, value]),
  );
  try {
    const saved = JSON.parse(
      localStorage.getItem("resonance-controls") ?? "null",
    );
    for (const [key, value] of Object.entries(saved?.mappings ?? {})) {
      if (
        key in defaults &&
        sources.some((s) => s.id === value?.source) &&
        Number.isFinite(value.amount)
      )
        mappings[key] = {
          source: value.source,
          amount: Math.max(0, Math.min(2, value.amount)),
        };
    }
    for (const [key, , min, max] of controlSpecs) {
      const value = saved?.controls?.[key];
      if (Number.isFinite(value))
        controls[key] = Math.max(min, Math.min(max, value));
    }
  } catch {}
  function persist() {
    try {
      localStorage.setItem(
        "resonance-controls",
        JSON.stringify({ mappings, controls }),
      );
    } catch {}
  }
  const editor = document.createElement("details");
  editor.className = "chrome visual-editor";
  editor.id = "visual-editor";
  editor.open = wasOpen;
  editor.innerHTML =
    '<summary>Live controls <span>SHAPE + SOUND</span></summary><div class="editor-body"><div class="editor-heading">SCENE SETTINGS <button type="button" id="reset-visual-controls">Reset</button></div><div id="scene-settings"></div><h2>AUDIO MAPPING</h2><p>Choose a sound feature to drive each effect. Amount adds to the scene settings above.</p><div id="audio-mappings"></div><p class="mapping-note">Size, speed, brightness and colour apply to every visual. Detail and shape depend on the selected preset. Off removes the extra mapping; each scene keeps its own audio response.</p></div>';
  document.body.append(editor);
  // Let native select and range keys work without triggering global shortcuts.
  editor.addEventListener("keydown", (event) => event.stopPropagation());
  const controlInputs = {};
  for (const [key, label, min, max, step] of controlSpecs) {
    const row = document.createElement("label");
    row.className = "scene-setting";
    row.innerHTML = `<span>${label}</span><input id="control-${key}" type="range" min="${min}" max="${max}" step="${step}"><output></output>`;
    const input = row.querySelector("input"),
      output = row.querySelector("output");
    function sync() {
      input.value = controls[key];
      output.value =
        key === "hue"
          ? Math.round(controls[key]) + "°"
          : controls[key].toFixed(2);
    }
    input.oninput = () => {
      controls[key] = Number(input.value);
      sync();
      persist();
    };
    sync();
    controlInputs[key] = sync;
    editor.querySelector("#scene-settings").append(row);
  }
  const mappingInputs = {};
  for (const [key, title] of [
    ["size", "Size"],
    ["motion", "Motion"],
    ["brightness", "Brightness"],
    ["colour", "Colour"],
  ]) {
    const row = document.createElement("div");
    row.className = "mapping-row";
    row.innerHTML = `<label for="mapping-${key}">${title} <span class="signal-meter"><i></i></span></label><select id="mapping-${key}" aria-label="${title} audio source"></select><div class="mapping-amount"><span>Amount</span><input type="range" min="0" max="2" step="0.05" aria-label="${title} audio amount"><output></output></div>`;
    const select = row.querySelector("select"),
      amount = row.querySelector("input"),
      output = row.querySelector("output"),
      meter = row.querySelector("i");
    for (const source of sources)
      select.add(new Option(source.label, source.id));
    function sync() {
      select.value = mappings[key].source;
      amount.value = mappings[key].amount;
      output.value = mappings[key].amount.toFixed(2);
    }
    select.onchange = () => {
      mappings[key].source = select.value;
      window.resonanceConfigureFeatures?.();
      persist();
    };
    amount.oninput = () => {
      mappings[key].amount = Number(amount.value);
      sync();
      persist();
    };
    sync();
    mappingInputs[key] = { sync, meter };
    editor.querySelector("#audio-mappings").append(row);
  }
  editor.querySelector("#reset-visual-controls").onclick = () => {
    mappings = structuredClone(defaults);
    controls = Object.fromEntries(
      controlSpecs.map(([key, , , , , value]) => [key, value]),
    );
    Object.values(controlInputs).forEach((sync) => sync());
    Object.values(mappingInputs).forEach(({ sync }) => sync());
    window.resonanceConfigureFeatures?.();
    persist();
  };
  let lastMeterTime = 0;
  function modulation(audio) {
    const values = {};
    const updateMeters = editor.open && performance.now() - lastMeterTime > 80;
    for (const [key, mapping] of Object.entries(mappings)) {
      const source = sources.find((s) => s.id === mapping.source);
      const raw = audio.rms > 0.0006 ? source.read(audio) : 0;
      const value = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;
      values[key] = value * mapping.amount;
      if (updateMeters)
        mappingInputs[key].meter.style.transform = `scaleX(${value})`;
    }
    if (updateMeters) lastMeterTime = performance.now();
    return {
      scale: controls.size * (1 + values.size),
      speed: controls.speed * (1 + values.motion * 3),
      brightness: controls.brightness * (1 + values.brightness),
      hue: controls.hue + values.colour * 300,
    };
  }

  let selected = "custom";
  try {
    selected = localStorage.getItem("resonance-visualization") ?? "custom";
  } catch {}
  if (!presets.some((preset) => preset.id === selected)) selected = "custom";
  const panel = document.createElement("div");
  panel.className = "visualizations";
  panel.id = "visualizations";
  const label = document.createElement("span");
  label.id = "visualizations-label";
  label.textContent = "VISUAL";
  panel.append(label);
  const choices = document.createElement("div");
  choices.className = "visualization-choices";
  choices.setAttribute("role", "radiogroup");
  choices.setAttribute("aria-labelledby", label.id);
  panel.append(choices);
  const buttons = presets.map((preset) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = preset.label;
    button.dataset.visualization = preset.id;
    button.setAttribute("role", "radio");
    button.onclick = () => select(preset.id);
    choices.append(button);
    return button;
  });
  document.querySelector("footer").prepend(panel);

  function renderSelection() {
    buttons.forEach((button) => {
      const active = button.dataset.visualization === selected;
      button.setAttribute("aria-checked", String(active));
      button.tabIndex = active ? 0 : -1;
    });
  }
  function definition(id) {
    return id === "custom"
      ? gallery.customScene
      : presets.find((preset) => preset.id === id)?.scene;
  }
  function select(id) {
    if (!presets.some((preset) => preset.id === id))
      throw Error("Unknown visualization: " + id);
    if (selected === id) return;
    const scene = definition(id);
    if (!scene) return;
    const old = Resonance.definition;
    Resonance.definition = scene;
    try {
      window.resonanceReloadVisual?.();
      selected = id;
      try {
        localStorage.setItem("resonance-visualization", selected);
      } catch {}
      renderSelection();
    } catch (error) {
      Resonance.definition = old;
      document.getElementById("message").textContent = error.message;
    }
  }
  const sceneDefined = (event) => {
    gallery.customScene = event.detail;
    Resonance.definition = definition(selected);
  };
  const keyboard = (event) => {
    if (
      event.key.toLowerCase() !== "v" ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.target.matches("input,textarea,select,button")
    )
      return;
    event.preventDefault();
    select(
      presets[
        (presets.findIndex((preset) => preset.id === selected) + 1) %
          presets.length
      ].id,
    );
  };
  choices.addEventListener("keydown", (event) => {
    const direction = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
    }[event.key];
    if (!direction && !["Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? presets.length - 1
          : (presets.findIndex((preset) => preset.id === selected) +
              direction +
              presets.length) %
            presets.length;
    select(presets[index].id);
    buttons[index].focus();
  });
  /** Preset selection leaves the current audio session intact. */
  const gallery = {
    customScene,
    /** Current scene knobs, exposed to live JavaScript compositions as frame.controls. */
    get controls() {
      return controls;
    },
    /** Read normalized sound mappings without changing the audio source. */
    modulation,
    /** Additional Meyda extractors selected by the mapping controls. */
    get features() {
      return [
        ...new Set(
          Object.values(mappings)
            .map((m) => sources.find((s) => s.id === m.source).feature)
            .filter(Boolean),
        ),
      ];
    },
    get panelOpen() {
      return editor.open;
    },
    get selected() {
      return selected;
    },
    get presets() {
      return presets.map(({ id, label }) => ({ id, label }));
    },
    select,
    dispose() {
      panel.remove();
      editor.remove();
      window.removeEventListener("resonance:scene-defined", sceneDefined);
      document.removeEventListener("keydown", keyboard);
    },
  };
  window.ResonanceGallery = gallery;
  window.addEventListener("resonance:scene-defined", sceneDefined);
  document.addEventListener("keydown", keyboard);
  if (definition(selected)) Resonance.definition = definition(selected);
  renderSelection();
})();
