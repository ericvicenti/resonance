// Edit this file. Save → Clipper updates, keeping computer audio connected.
// Hover draw.*, audio.*, and Resonance.* for documentation and autocomplete.

let i = 0;

Resonance.define({
  // Request any supported Meyda features here. Access them via audio.features.
  features: ["spectralCentroid", "loudness", "chroma"],

  // Your own persistent state. It resets when you save a new scene.
  setup: () => ({
    waves: /** @type {number[]} */ ([]),
    rotation: 0,
    targetRotation: 0,
  }),

  // Called once for each newly detected bass hit, never every frame of a beat.
  onBeat({ time, memory }) {
    //if (i === 4) {
      memory.waves.push(time);
    //}
    i++;
    memory.targetRotation += 0.02;
  },

  // Drawing commands compose in order. No WebGL or shader code needed.
  draw({ draw, audio, time, dt, memory, palette }) {
    draw.background("#020044");
    memory.rotation +=
      (memory.targetRotation - memory.rotation) * Math.min(1, dt * 8);

    draw.tunnel({
      layers: 22,
      speed: 0.16 + audio.bass * 2.5 + audio.pulse * 5,
      zoom: 1 + audio.bass * 0.18 + audio.pulse * 0.22,
      rotation: memory.rotation + Math.sin(time * 0.13) * 0.08,
      twist: 0,
      colors: palette,
      shockwaves: false, // We compose our own beat rings below.
    });

    const brightness = Math.min(1, audio.centroidHz / 6000);
    const color = Resonance.mix(palette[0], palette[1], brightness);

    memory.waves = memory.waves.filter((born) => time - born < 1.5);
    for (const born of memory.waves) {
      const age = time - born;
      draw.ring({
        radius: 0.22 + age * 1.9,
        color: Resonance.mix(color, "#ffffff", 0.5),
        width: 0.004,
        opacity: Math.exp(-age * 3.2) * 0.65,
      });
    }

    draw.waveform(audio.waveform, {
      y: -0.82,
      span: 1.6,
      amplitude: 0.2 + audio.bass * 0.25,
      color,
      width: 0.002,
      opacity: 0.15 + audio.treble * 0.2,
    });
  },
});
