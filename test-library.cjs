const assert = require("node:assert/strict");
globalThis.Meyda = require("./dist/vendor/meyda-5.6.3.min.js");
require("./dist/audio-features.js");
require("./dist/lib/resonance.js");

const rate = 48000,
  n = 1024,
  hz = (rate / n) * 8;
Meyda.bufferSize = n;
Meyda.sampleRate = rate;
const samples = Float32Array.from(
  { length: n },
  (_, i) => Math.sin((2 * Math.PI * hz * i) / rate) * 0.4,
);
const f = Meyda.extract(
  [
    "rms",
    "amplitudeSpectrum",
    "buffer",
    "spectralCentroid",
    "loudness",
    "chroma",
  ],
  samples,
);
const detector = new ResonanceFeatures();
const measured = detector.update(f, rate, 1);
const reader = new ResonanceAudio();
const first = reader.read({ ...measured, beats: 1, beatTime: 1 }, 1, 0.016);
assert.equal(first.beat, true);
assert.equal(
  reader.read({ ...measured, beats: 1, beatTime: 1 }, 1.016, 0.016).beat,
  false,
  "onset is one-shot",
);
assert.equal(
  reader.read({ ...measured, beats: 2, beatTime: 1.5 }, 1.5, 0.016).beat,
  true,
);
assert.equal(first.features, f, "raw feature objects remain exposed");
assert.equal(first.waveform.length, 1024);
assert.equal(first.spectrum.length, 64);
assert(Math.abs(first.centroidHz - hz) < 1, "centroid converts FFT bins to Hz");
assert(first.frequency(hz) > first.frequency(6000) * 100);
assert(first.band(300, 450) > first.band(4000, 8000) * 100);
assert.equal(first.frequency(-1), 0);
assert.equal(first.frequency(30000), 0);
assert(
  first.pulse >
    reader.read({ ...measured, beats: 2, beatTime: 1.5 }, 2, 0.016).pulse,
  "pulse decays",
);
assert.equal(
  new ResonanceAudio().read({ beats: 0 }, 1, 0.016).pulse,
  0,
  "no phantom pulse before first beat",
);
assert.equal(first.features.chroma.length, 12);
assert(first.features.loudness.total > 0);
const scene = { features: ["chroma", "mfcc"], draw() {} };
Resonance.define(scene);
assert.deepEqual(Resonance.requestedFeatures, [
  "rms",
  "amplitudeSpectrum",
  "buffer",
  "chroma",
  "mfcc",
]);
assert.throws(
  () => Resonance.define({ features: ["typo"], draw() {} }),
  /Unknown Meyda feature/,
);
assert.equal(
  Resonance.definition,
  scene,
  "invalid scene does not replace existing definition",
);
assert.throws(
  () => Resonance.define({ features: ["spectralFlux"], draw() {} }),
  /audio.flux/,
);
assert.deepEqual(Resonance.mix("#000", "#fff", 0.5), [0.5, 0.5, 0.5]);
assert.deepEqual(Resonance.hsl(0), [1, 0, 0]);
assert.deepEqual(Resonance.hsl(-120), [0, 0, 1]);
console.log(
  "PASS: frame audio API, once-per-onset events, raw Meyda data, frequency/Hz conversion, feature selection, validation, colors.",
);
