import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    (process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : undefined),
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(process.env.VISUALIZER_URL ?? "http://localhost:18765");
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.reload();
await page.waitForFunction(() => window.resonance?.snapshot().frames > 10);
const initial = await page.evaluate(() => resonance.snapshot());
assert.equal(initial.mode, "ambient");
await page.screenshot({ path: "/tmp/resonance-ambient.png" });
await page.locator("#demo").click();
await page.waitForFunction(
  () => resonance.snapshot().callbacks > 10 && resonance.snapshot().rms > 0.01,
);
const audio = await page.evaluate(() => resonance.snapshot());
assert.equal(audio.mode, "demo");
assert(audio.low > 0);
assert(audio.mid > 0);
assert(audio.high > 0);
await page.waitForFunction(() => resonance.snapshot().beats >= 3);
assert((await page.evaluate(() => resonance.snapshot())).beatTime > 0);
await page.screenshot({ path: "/tmp/resonance-live.png" });
await page.locator("#palette").click();
assert.equal(await page.evaluate(() => resonance.snapshot().palette), 1);
// Switch each actual preset while preserving the active audio graph.
await page.evaluate(() => {
  window.__galleryTest = {
    context: session.context,
    original: ResonanceGallery.customScene,
  };
});
for (const id of [
  "tunnel",
  "particles",
  "rings",
  "waveform",
  "spectrum",
  "galaxy",
  "aurora",
  "lissajous",
  "mandala",
  "terrain",
  "custom",
]) {
  await page.locator(`[data-visualization="${id}"]`).click();
  await page.waitForFunction(() => resonanceRenderer.frame.time > 0);
  assert.equal(
    await page
      .locator(`[data-visualization="${id}"]`)
      .getAttribute("aria-checked"),
    "true",
  );
  const result = await page.evaluate(() => ({
    selected: ResonanceGallery.selected,
    sameContext: session.context === window.__galleryTest.context,
    glError: resonanceRenderer.gl.getError(),
    customRetained:
      ResonanceGallery.customScene === window.__galleryTest.original,
  }));
  assert.equal(result.selected, id);
  assert(result.sameContext && result.customRetained);
  assert.equal(result.glError, 0);
  await page.screenshot({ path: `/tmp/resonance-${id}.png` });
}
await page.evaluate(() => document.activeElement.blur());
await page.keyboard.press("v");
assert.equal(await page.evaluate(() => ResonanceGallery.selected), "tunnel");
await page.locator('[data-visualization="tunnel"]').focus();
await page.keyboard.press("ArrowRight");
assert.equal(await page.evaluate(() => ResonanceGallery.selected), "particles");
await page.keyboard.press("Home");
assert.equal(await page.evaluate(() => ResonanceGallery.selected), "custom");
await page.evaluate(() => delete window.__galleryTest);
// Route every source through the on-screen controls and real Meyda analyzer.
await page.evaluate(() => {
  window.__mappingContext = session.context;
});
const featureSources = {
  volume: null,
  bass: null,
  mids: null,
  treble: null,
  beat: null,
  loudness: "loudness",
  centroid: "spectralCentroid",
  flatness: "spectralFlatness",
  zcr: "zcr",
  chroma: "chroma",
  off: null,
};
for (const [source, feature] of Object.entries(featureSources)) {
  await page.locator("#mapping-brightness").selectOption(source);
  if (feature)
    await page.waitForFunction(
      (feature) => state.features[feature] !== undefined,
      feature,
    );
  assert(
    await page.evaluate(() => session.context === window.__mappingContext),
  );
  const modulation = await page.evaluate(() =>
    ResonanceGallery.modulation(resonanceRenderer.frame.audio),
  );
  assert(
    Object.values(modulation).every(Number.isFinite),
    source + " produces finite controls",
  );
}
// Deterministic audio levels prove that the selected feature drives the destination.
await page.locator('[aria-label="Size audio amount"]').fill("1");
const expectedSources = {
  off: 0,
  volume: 0.5,
  bass: 0.25,
  mids: 0.4,
  treble: 0.7,
  beat: 0.8,
  loudness: 0.5,
  centroid: 0.5,
  flatness: 0.3,
  zcr: 0.25,
  chroma: 7 / 11,
};
for (const [source, value] of Object.entries(expectedSources)) {
  await page.locator("#mapping-size").selectOption(source);
  const scale = await page.evaluate(
    () =>
      ResonanceGallery.modulation({
        rms: 0.0625,
        bass: 0.25,
        mids: 0.4,
        treble: 0.7,
        pulse: 0.8,
        centroidHz: 3000,
        waveform: new Float32Array(1024),
        features: {
          loudness: { total: 30 },
          spectralFlatness: 0.3,
          zcr: 256,
          chroma: [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0],
        },
      }).scale,
  );
  assert(Math.abs(scale - (1 + value)) < 1e-6, source + " controls size");
}
const silent = await page.evaluate(() =>
  ResonanceGallery.modulation({ rms: 0, features: {} }),
);
assert.equal(silent.scale, 1, "silence has no phantom modulation");
// Actual GPU draws must change with size, colour and brightness controls.
const pixelChecks = await page.evaluate(() => {
  const renderer = resonanceRenderer,
    original = renderer.scene;
  renderer.scene = {
    draw({ draw }) {
      draw.background("#000");
      draw.ring({ radius: 0.35, color: "#ff3300", width: 0.01 });
    },
  };
  function set(id, value) {
    const el = document.getElementById(id);
    el.value = String(value);
    el.dispatchEvent(
      new Event(el.tagName === "SELECT" ? "change" : "input", {
        bubbles: true,
      }),
    );
  }
  for (const key of ["size", "motion", "brightness", "colour"])
    set("mapping-" + key, "off");
  function read() {
    renderer.render(performance.now() / 1000, 0);
    const pixels = new Uint8Array(
      renderer.canvas.width * renderer.canvas.height * 4,
    );
    renderer.gl.readPixels(
      0,
      0,
      renderer.canvas.width,
      renderer.canvas.height,
      renderer.gl.RGBA,
      renderer.gl.UNSIGNED_BYTE,
      pixels,
    );
    let r = 0,
      g = 0,
      b = 0,
      spread = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      r += pixels[i];
      g += pixels[i + 1];
      b += pixels[i + 2];
      const x = ((i / 4) % renderer.canvas.width) - renderer.canvas.width / 2;
      spread += (pixels[i] + pixels[i + 1] + pixels[i + 2]) * x * x;
    }
    return { r, g, b, spread: spread / (r + g + b) };
  }
  const normal = read();
  set("control-size", 1.5);
  const larger = read();
  set("control-hue", 120);
  const shifted = read();
  set("control-brightness", 0.3);
  const dimmed = read();
  renderer.scene = original;
  return { normal, larger, shifted, dimmed };
});
assert(
  pixelChecks.larger.spread > pixelChecks.normal.spread * 1.8,
  "size changes rendered geometry",
);
assert(
  pixelChecks.shifted.g > pixelChecks.shifted.r * 2,
  "hue changes rendered colour",
);
assert(
  pixelChecks.dimmed.g < pixelChecks.shifted.g * 0.5,
  "brightness changes rendered intensity",
);
await page.locator("#control-speed").fill("0");
await page.waitForFunction(() => resonanceRenderer.effects.speed < 0.001);
assert(
  await page.evaluate(() => session.context === window.__mappingContext),
  "zero visual speed keeps audio alive",
);
await page.locator("#reset-visual-controls").click();
assert.equal(await page.locator("#control-size").inputValue(), "1");
assert.equal(await page.locator("#mapping-size").inputValue(), "bass");
await page.locator("#control-shape").fill("0.8");
await page.locator("#control-detail").fill("0.7");
await page.locator("#mapping-colour").selectOption("chroma");
await page.locator('[aria-label="Colour audio amount"]').fill("1.25");
await page.locator('[data-visualization="galaxy"]').click();
await page.evaluate(() => {
  window.__hotControls = {
    controls: JSON.stringify(ResonanceGallery.controls),
    context: session.context,
    selected: ResonanceGallery.selected,
  };
});
await page.addScriptTag({ url: "presets.js?test=" + Date.now() });
await page.evaluate(() => resonanceReloadVisual());
assert(
  await page.evaluate(
    () =>
      JSON.stringify(ResonanceGallery.controls) ===
      window.__hotControls.controls,
  ),
);
assert(
  await page.evaluate(() => session.context === window.__hotControls.context),
);
assert.equal(await page.evaluate(() => ResonanceGallery.selected), "galaxy");
assert.equal(await page.locator("#visual-editor").count(), 1);
await page.locator("#mapping-colour").focus();
const paletteBeforeKey = await page.evaluate(() => state.palette);
await page.keyboard.press("c");
assert.equal(await page.evaluate(() => state.palette), paletteBeforeKey);
await page.evaluate(() => {
  document.activeElement.blur();
  document.querySelector(".editor-body").scrollTop = 0;
  delete window.__hotControls;
});
await page.screenshot({ path: "/tmp/resonance-controls.png" });
await page.locator('[data-visualization="custom"]').click();
// Exercise the composition API and feature changes without reopening audio.
await page.evaluate(() => {
  window.__libraryTest = {
    context: session.context,
    original: Resonance.definition,
    old: window.resonanceRenderer,
  };
  Resonance.define({
    features: ["loudness", "chroma", "mfcc"],
    setup: () => ({ events: 0 }),
    onBeat({ memory }) {
      memory.events++;
    },
    draw({ draw, audio, time }) {
      draw.background("#010207");
      draw.tunnel({
        layers: 8,
        membrane: false,
        particles: false,
        shockwaves: false,
      });
      draw.ring({
        radius: 0.35 + audio.bass * 0.1,
        color: "#44ccff",
        spectrum: audio.spectrum,
      });
      draw.path(
        [
          [-0.6, -0.4],
          [0, 0.5],
          [0.6, -0.4],
        ],
        { color: "#ff6633", closed: true },
      );
      draw.waveform(audio.waveform, { y: -0.5, color: "#ffffff" });
      draw.points(
        [
          [0, 0],
          [0.2, 0.2],
        ],
        { size: 12, color: "#ffffff" },
      );
      draw.particles({
        id: "stars",
        count: 100,
        speed: 0.3 + audio.pulse,
        color: Resonance.hsl(time * 20),
      });
    },
  });
  window.resonanceReloadVisual();
});
await page.waitForFunction(
  () =>
    window.resonanceRenderer.memory.events >= 2 &&
    state.features.mfcc?.length > 0,
);
const composed = await page.evaluate(() => ({
  sameContext: session.context === window.__libraryTest.context,
  oldDisposed: window.__libraryTest.old.disposed,
  glError: window.resonanceRenderer.gl.getError(),
  loudness: state.features.loudness.total,
  chroma: state.features.chroma.length,
  mfcc: state.features.mfcc.length,
}));
assert(composed.sameContext && composed.oldDisposed);
assert.equal(composed.glError, 0);
assert.equal(composed.chroma, 12);
assert(composed.mfcc > 0 && composed.loudness > 0);
await page.evaluate(() => {
  const current = window.resonanceRenderer;
  Resonance.define({
    draw() {
      throw Error("Intentional invalid scene");
    },
  });
  try {
    window.resonanceReloadVisual();
  } catch (error) {
    if (error.message !== "Intentional invalid scene") throw error;
  }
  if (window.resonanceRenderer !== current || current.disposed)
    throw Error("Bad edit replaced working scene");
  Resonance.define(window.__libraryTest.original);
  window.resonanceReloadVisual();
  delete window.__libraryTest;
});
await page.locator("#stop").click();
assert.equal(await page.evaluate(() => resonance.snapshot().context), "none");
await page.evaluate(() => document.activeElement.blur());
await page.keyboard.press("h");
assert(
  await page.locator("body").evaluate((e) => e.classList.contains("clean")),
);
await page.mouse.move(100, 100);
assert(
  !(await page.locator("body").evaluate((e) => e.classList.contains("clean"))),
);
await page.locator("#palette").click();
await page.locator("#palette").click();
await page.locator('[data-visualization="rings"]').click();
await page.reload();
await page.waitForFunction(() => resonance.snapshot().frames > 3);
assert.equal(await page.evaluate(() => ResonanceGallery.selected), "rings");
assert.equal(
  await page
    .locator('[data-visualization="rings"]')
    .getAttribute("aria-checked"),
  "true",
);
assert.equal(await page.locator("#control-shape").inputValue(), "0.8");
assert.equal(await page.locator("#control-detail").inputValue(), "0.7");
assert.equal(await page.locator("#mapping-colour").inputValue(), "chroma");
assert.equal(
  await page.locator('[aria-label="Colour audio amount"]').inputValue(),
  "1.25",
);
await page.locator('[data-visualization="custom"]').click();
await page.setViewportSize({ width: 390, height: 844 });
const bounds = await page.locator("#visual-editor").boundingBox();
assert(
  bounds.x >= 0 && bounds.x + bounds.width <= 390,
  "controls fit mobile width",
);
await page.screenshot({ path: "/tmp/resonance-controls-mobile.png" });
assert.deepEqual(errors, []);
console.log(
  JSON.stringify(
    {
      initial: { mode: initial.mode, frames: initial.frames },
      audio: {
        mode: audio.mode,
        rms: audio.rms,
        low: audio.low,
        mid: audio.mid,
        high: audio.high,
      },
      errors,
      composed,
      checks: [
        "WebGL rendered",
        "Meyda live demo measured",
        "all three bands nonzero",
        "repeated demo kick detection",
        "all composition primitives and optional Meyda features",
        "scene replacement preserves audio; invalid scene retains previous renderer",
        "all eleven modes preserve audio and custom scene; V/arrows switch; selection persists",
        "all eleven mapping sources, actual GPU size/hue/brightness changes, controls persist, mobile panel fits",
        "palette changed",
        "stop closed AudioContext",
        "hide/show controls",
      ],
    },
    null,
    2,
  ),
);
await browser.close();
