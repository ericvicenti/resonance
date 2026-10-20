# Resonance — sound into light

A full-screen WebGL music visualizer powered by Meyda.js. Eleven visual modes, live scene controls, and audio mappings let you turn volume, bass, beats, and spectral features into motion, size, brightness, and colour. Audio is analyzed locally; there is no microphone input or audio upload.

## Quick start

Install Node.js 22 or newer, then:

```sh
git clone https://github.com/ericvicenti/resonance.git
cd resonance
npm ci
npm start
```

Open **http://localhost:8765** in a desktop browser. Try **Demo**, **Open music**, or **Listen to computer audio** and enable audio sharing in the browser's picker when available. System-audio capture availability depends on the browser, operating system, and chosen source. Use the **Live controls** panel to change visuals and audio mappings immediately.

No build step is required: `dist/` contains the editable application source. Local code edits take effect after a browser reload; reconnect computer audio after reloading. The optional remote hot-edit workflow described below is configured for the original Starlight → Clipper setup.

## Write your own visual

**Edit [`dist/visual.js`](dist/visual.js) and choose Live code in the visualizer.**

The GPU, animation loop, resize handling, audio capture, feature extraction, and live replacement are managed by the library. VS Code completes and documents `draw`, `audio`, and `Resonance` as you type. The existing tunnel is one example; you can replace the entire scene with this:

```js
Resonance.define({
  draw({ draw, audio, time }) {
    draw.background("#02050c");
    draw.ring({
      radius: 0.25 + audio.bass * 0.2,
      wobble: audio.mids * 0.04,
      phase: time,
      color: "#40ddff",
      width: 0.004,
    });
    draw.particles({
      count: 200,
      speed: 0.2 + audio.pulse * 3,
      color: "#ff6633",
    });
  },
});
```

## Edit visuals on the page

The **Live controls** panel edits the running visual without restarting audio. It opens by default; click its title to collapse it. Size, speed, brightness, and colour shift affect every scene, including your Live code. Detail/density and shape/twist are interpreted by each built-in preset. Settings and audio mappings are saved in this browser; **Reset** restores their defaults.

Choose from **Live code, Tunnel, Particles, Rings, Waveform, Spectrum, Galaxy, Aurora, Lissajous, Mandala, Terrain**. **V** cycles modes; focused visual buttons support arrow keys and Home/End. Live code always uses the latest saved `dist/visual.js`. Switching presets does not overwrite that file. Built-ins are editable in `dist/presets.js`, which also hot updates from Starlight.

Under **Audio mapping**, pick a source for **Size**, **Motion**, **Brightness**, or **Colour** and adjust its Amount. For example, Size ← Bass, Motion ← Beat, Brightness ← Volume, Colour ← Chroma. The small meters show the selected input levels. **Off** disables the extra mapping for that effect; scenes still retain the audio response written into their composition.

| Source               | Normalization for on-screen mappings (clamped to 0–1)               |
| -------------------- | ------------------------------------------------------------------- |
| Volume               | Meyda RMS × 8                                                       |
| Bass / mids / treble | Adaptive band energy from the Meyda amplitude spectrum              |
| Beat                 | Detected low-frequency onset impulse                                |
| Perceived loudness   | Meyda loudness.total / 60                                           |
| Tone brightness      | Meyda spectral centroid converted to Hz / 6000                      |
| Noisiness            | Meyda spectralFlatness                                              |
| Zero crossings       | Meyda zcr / window length                                           |
| Dominant pitch class | Index of the strongest chroma bin / 11; not melody or key detection |

Silence and non-finite feature values produce zero modulation. Optional Meyda features are requested automatically without reopening the audio stream. Size and brightness multiply the base knob by `(1 + signal × amount)`; motion multiplies speed by `(1 + signal × amount × 3)`; colour adds up to `signal × amount × 300°`. Effects are smoothed over animation frames.

Your JS scene also receives `frame.controls` with `size`, `speed`, `brightness`, `hue`, `detail`, and `shape`. Geometry, brightness, colour, and animation speed are applied by the renderer; use `controls.detail` / `controls.shape` in your own drawing logic. Animation `time`/`dt` follow the speed control, while audio beat timing continues in real time. A speed of zero pauses time-based motion, but live audio deformation can still move.

## Compose a scene

Drawing happens in call order. Colors add together with a glow. Coordinates are centered: `(0, 0)` is the center; `1` reaches half the shorter screen dimension. Y points upward. Angles use radians. Colors accept CSS names such as `"pink"`, hex, `rgb(...)`, `hsl(...)`, or RGB arrays in 0–1.

| Command                                                      | Use                                                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `draw.background(color)`                                     | Clear the frame. Call before your layers.                                                                    |
| `draw.ring({radius, color, width, ...})`                     | Circle, polygon (`segments: 6`), wobbly ring, or spectrum-shaped ring.                                       |
| `draw.path([[x,y], ...], {color, width, closed})`            | Any shape you generate with normal JS and loops.                                                             |
| `draw.points([[x,y], ...], {color, size})`                   | Glowing points; size is in CSS pixels.                                                                       |
| `draw.waveform(audio.waveform, {y, span, amplitude, color})` | Draw audio samples as a line. Also accepts your own sample arrays.                                           |
| `draw.particles({id, count, speed, color})`                  | Moving radial particles. Give separate layers separate IDs.                                                  |
| `draw.tunnel({speed, zoom, rotation, twist, layers, ...})`   | The original audio-reactive tunnel as a reusable layer. Toggle its `membrane`, `shockwaves`, or `particles`. |

Each frame provides `{ draw, audio, time, dt, memory, palette, width, height, aspect }`. `time` and `dt` are seconds. `palette` is the pair selected with **C**. `Resonance.mix(a,b,amount)` blends colors; `Resonance.hsl(degrees,saturation,lightness)` creates colors.

## React to beats

`audio.pulse` hits immediately and decays between onsets. Use it for zoom, speed, width, or brightness. `onBeat` runs once per newly observed onset; it doesn't repeat on every frame of the pulse. Use `setup` for your own state:

```js
Resonance.define({
  setup: () => ({ rotation: 0 }),
  onBeat({ memory }) {
    memory.rotation += 0.2;
  },
  draw({ draw, audio, memory }) {
    draw.ring({
      segments: 6,
      radius: 0.3 + audio.pulse * 0.15,
      rotation: memory.rotation,
      color: "#ff8844",
    });
  },
});
```

Scene code has its own scope: top-level `let` and `const` are safe across saves. State resets when you save. Beat detection follows low-frequency onsets; it is not a BPM grid or musical beat prediction.

## Use the audio features

| Property                                         | Meaning                                                                                                         |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `audio.bass`, `audio.mids`, `audio.treble`       | Smoothed, adaptive band energy, usually 0–1 and capped at 1.3. Bands: below 190 Hz, 190–2600 Hz, 2600–14000 Hz. |
| `audio.energy`                                   | Display loudness in 0–1.                                                                                        |
| `audio.rms`                                      | Unmodified Meyda RMS.                                                                                           |
| `audio.pulse`                                    | Kick impulse with fast decay, up to 1.8 with Sensitivity.                                                       |
| `audio.beat`, `audio.beatCount`, `audio.beatAge` | New-onset flag, count, seconds since onset. Age is Infinity before the first beat.                              |
| `audio.spectrum`                                 | 64 normalized logarithmic bands, 30–14000 Hz.                                                                   |
| `audio.waveform`                                 | 1024 windowed audio samples.                                                                                    |
| `audio.band(30, 100)`                            | Linear spectral amplitude across a custom Hz range, useful for sub-bass.                                        |
| `audio.frequency(440)`                           | Interpolated linear spectral amplitude at a frequency.                                                          |
| `audio.flux`                                     | Our detector's positive bass-spectrum change.                                                                   |
| `audio.centroidHz`                               | Spectral brightness in Hz; request `spectralCentroid`.                                                          |
| `audio.features`                                 | Raw results of the Meyda features requested below.                                                              |

Sensitivity affects the normalized display helpers; raw Meyda data and `band`/`frequency` retain their original scale. Raw optional features are undefined before the first analysis frame and can contain non-finite values for silent signals.

Request optional features in your scene, then use them directly:

```js
Resonance.define({
  features: [
    "spectralCentroid",
    "spectralFlatness",
    "loudness",
    "chroma",
    "mfcc",
  ],
  draw({ draw, audio }) {
    const c = audio.features.chroma?.[0] ?? 0; // C pitch-class energy
    draw.ring({
      radius: 0.3 + c * 0.1,
      color: Resonance.hsl(audio.centroidHz / 30),
    });
  },
});
```

`Resonance.featureNames` lists the supported extractors. See [Meyda's feature definitions](https://meyda.js.org/audio-features) for units and interpretation. The vendored Meyda 5.6.3 `spectralFlux` extractor throws internally, so the API rejects that name and offers `audio.flux` instead. Chroma is pitch-class energy, not a chord/key detector. Changing requested features live keeps the existing capture stream.

## Optional remote live editing and files

- **`dist/visual.js`** — your scene. Start here.
- **`dist/resonance.d.ts`** — autocomplete and the complete API reference.
- `dist/lib/resonance.js` — rendering internals; normally leave this alone.
- `dist/audio-features.js` — beat detector and audio adapter, if you want to change analysis.
- `dist/app.js` / `dist/index.html` — input controls and app shell.

The original installation uses Starlight's `com.resonance.live-edit` service, which syntax-checks and type-checks scene saves, syncs over SSH, then hot-swaps visual/library/audio/CSS updates. It preserves the active System Audio track. Invalid syntax, type errors, and initial drawing errors keep the previous scene. Errors later during animation display a message; fix and save to restart the scene.

App-shell or HTML changes reload the browser and require selecting computer audio again. Other files sync; server changes require restarting the server. No files are deleted remotely. Clipper must be reachable and its visualizer open. After an offline save, save again when connected.

VS Code tasks: **Live sync: show log**, **Live sync: restart**, **Test audio response**. Status: `.live-edit/status.json`. Log: `~/Library/Logs/Resonance/live-edit.log`.

## Run and check

On macOS with Node.js on PATH and Google Chrome installed, `./start.command` opens the app full-screen at http://localhost:8765 with loopback debugging enabled for live edits. Choose **Listen to computer audio → Entire Screen → Also share system audio → Share**. No microphone code exists. Screen frames are not processed or stored. Audio stays on the device.

**F** fullscreen, **H** controls, **C** colors; pointer movement reveals controls. Open music plays a local audio file. Demo plays an original synthesized loop.

- `npm test` — real Meyda kick tests, audio API units/events, feature requests, colors.
- `npm run check` — syntax and scene type checking.
- For isolated browser checks: `python3 -m http.server 18765 --bind 127.0.0.1 --directory dist`, then `node verify.mjs`. This does not touch Clipper's live capture. Set `VISUALIZER_URL` to use a different local URL. On macOS the checks use installed Google Chrome; elsewhere run `npx playwright install chromium` first. Set `CHROME_PATH` to override the browser executable.

## License and credits

Resonance is [MIT licensed](LICENSE), copyright 2026 Eric Vicenti. Contributions and new visual compositions are welcome through issues and pull requests.

Audio analysis uses [Meyda 5.6.3](https://github.com/meyda/meyda), vendored under its [MIT license](dist/vendor/MEYDA-LICENSE.md). WebGL rendering, visual compositions, live controls, and the onset detector are implemented in this repository.
