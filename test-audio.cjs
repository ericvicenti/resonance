const assert = require("node:assert/strict");
const Meyda = require("./dist/vendor/meyda-5.6.3.min.js");
require("./dist/audio-features.js");
const rate = 48000;
Meyda.bufferSize = 1024;
Meyda.sampleRate = rate;
function run(signal) {
  const tracker = new ResonanceFeatures(),
    hits = [],
    levels = [];
  for (let frame = 0; frame < 750; frame++) {
    const data = Float32Array.from({ length: 1024 }, (_, i) =>
      signal((frame * 512 + i) / rate),
    );
    const f = Meyda.extract(["rms", "amplitudeSpectrum"], data);
    const result = tracker.update(f, rate, (frame * 512) / rate);
    if (result.beat) hits.push((frame * 512) / rate);
    levels.push(result.low);
  }
  return { hits, levels };
}
for (const volume of [0.08, 0.3, 0.8]) {
  const { hits, levels } = run(
    (t) => Math.sin(2 * Math.PI * 65 * t) * Math.exp(-(t % 0.5) * 18) * volume,
  );
  assert.equal(hits.length, 17, "one onset per kick");
  hits.forEach((time, i) =>
    assert(Math.abs(time - i * 0.5) < 0.025, "kick timing within 25ms"),
  );
  assert(
    Math.max(...levels) - Math.min(...levels) > 0.8,
    "bass must expand and release instead of clipping constantly",
  );
}
assert.equal(run(() => 0).hits.length, 0, "silence must not create beats");
assert(
  run((t) => Math.sin(2 * Math.PI * 65 * t) * 0.2).hits.length <= 1,
  "sustained bass must not continually retrigger",
);
assert.equal(
  run((t) => Math.sin(2 * Math.PI * 6000 * t) * Math.exp(-(t % 0.5) * 18) * 0.3)
    .hits.length,
  0,
  "treble hits must not masquerade as kicks",
);
console.log(
  "PASS: 120 BPM kick timing at three volumes; bass dynamic range; silence; sustained bass; treble rejection.",
);
