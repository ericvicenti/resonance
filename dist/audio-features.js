(() => {
  /* Meyda features become independent continuous energy and transient impulses. */
  class ResonanceFeatures {
    constructor() {
      this.previous = new Float32Array(512);
      this.peaks = [0.02, 0.008, 0.003];
      this.mean = 0.003;
      this.fluxMean = 0.0005;
      this.fluxDeviation = 0.0005;
      this.previousBass = 0;
      this.lastBeat = -10;
      this.beats = 0;
    }
    update(f, sampleRate, now) {
      const bins = f.amplitudeSpectrum,
        n = bins.length * 2,
        dt = 512 / sampleRate;
      const energy = [0, 0, 0];
      let flux = 0;
      for (let i = 1; i < bins.length; i++) {
        const hz = (i * sampleRate) / n,
          amplitude = (bins[i] * 2) / n;
        if (hz < 190) {
          energy[0] += amplitude * amplitude;
          flux += Math.max(0, amplitude - this.previous[i]);
        } else if (hz < 2600) energy[1] += amplitude * amplitude;
        else if (hz < 14000) energy[2] += amplitude * amplitude;
        this.previous[i] = amplitude;
      }
      const raw = energy.map(Math.sqrt),
        audible = f.rms > 0.0006;
      const threshold = this.fluxMean + this.fluxDeviation * 1.6 + 0.00025;
      const hit =
        audible &&
        now - this.lastBeat > 0.19 &&
        raw[0] > Math.max(0.001, f.rms * 0.15) &&
        raw[0] > this.previousBass * 1.04 &&
        (flux > threshold || raw[0] > this.mean * 1.65);
      if (hit) {
        this.lastBeat = now;
        this.beats++;
      }
      const adapt = 1 - Math.exp(-dt / 1.1);
      this.mean += (raw[0] - this.mean) * adapt;
      this.fluxDeviation +=
        (Math.abs(flux - this.fluxMean) - this.fluxDeviation) * adapt;
      this.fluxMean += (flux - this.fluxMean) * adapt;
      this.previousBass = raw[0];
      const levels = raw.map((value, i) => {
        this.peaks[i] = Math.max(
          [0.008, 0.003, 0.001][i],
          value,
          this.peaks[i] * Math.exp(-dt / 5),
        );
        return audible
          ? Math.min(
              1.25,
              value / (this.peaks[i] * 0.85 + [0.0015, 0.0006, 0.0003][i]),
            )
          : 0;
      });
      const bands = new Float32Array(64);
      for (let b = 0; b < 64; b++) {
        const start = Math.max(
          1,
          Math.floor((30 * Math.pow(14000 / 30, b / 64) * n) / sampleRate),
        );
        const end = Math.min(
          bins.length,
          Math.max(
            start + 1,
            Math.ceil(
              (30 * Math.pow(14000 / 30, (b + 1) / 64) * n) / sampleRate,
            ),
          ),
        );
        let sum = 0;
        for (let i = start; i < end; i++) sum += ((bins[i] * 2) / n) ** 2;
        bands[b] = audible
          ? Math.min(
              1,
              (Math.sqrt(sum) /
                (this.peaks[b < 20 ? 0 : b < 46 ? 1 : 2] + 0.001)) *
                2,
            )
          : 0;
      }
      return {
        low: levels[0],
        mid: levels[1],
        high: levels[2],
        rms: f.rms,
        features: f,
        sampleRate,
        flux,
        beatTime: this.lastBeat,
        beats: this.beats,
        beat: hit,
        bands,
      };
    }
  }
  globalThis.ResonanceFeatures = ResonanceFeatures;
})();

(() => {
  /** Builds a frame-friendly view of Meyda data and detected musical events. */
  class ResonanceAudio {
    constructor(beatCount = 0) {
      this.seen = beatCount;
      this.smooth = { low: 0, mid: 0, high: 0 };
    }
    /** Read once per animation frame; beat is true only for a newly observed onset. */
    read(state, time, dt, sensitivity = 1) {
      const features = state.features ?? {};
      const sampleRate = state.sampleRate ?? 48000;
      const spectrum = features.amplitudeSpectrum ?? new Float32Array(512);
      const n = spectrum.length * 2;
      for (const key of ["low", "mid", "high"]) {
        const target = Math.min(1.3, (state[key] ?? 0) * sensitivity);
        this.smooth[key] +=
          (target - this.smooth[key]) *
          (1 - Math.exp(-dt * (target > this.smooth[key] ? 42 : 10)));
      }
      const beatCount = state.beats ?? 0;
      const beat = beatCount > this.seen;
      this.seen = beatCount;
      const beatAge = beatCount ? Math.max(0, time - state.beatTime) : Infinity;
      return {
        bass: this.smooth.low,
        mids: this.smooth.mid,
        treble: this.smooth.high,
        energy: Math.min(1, (state.rms ?? 0) * 25 * sensitivity),
        rms: state.rms ?? 0,
        pulse: Math.exp(-beatAge * 8) * Math.min(sensitivity, 1.8),
        beat,
        beatCount,
        beatAge,
        flux: state.flux ?? 0,
        spectrum: state.bands ?? new Float32Array(64),
        waveform: features.buffer ?? new Float32Array(1024),
        features,
        sampleRate,
        centroidHz: Number.isFinite(features.spectralCentroid)
          ? (features.spectralCentroid * sampleRate) / n
          : 0,
        frequency(hz) {
          if (hz < 0 || hz >= sampleRate / 2) return 0;
          const bin = (hz * n) / sampleRate,
            left = Math.floor(bin),
            fraction = bin - left;
          return (
            (((spectrum[left] ?? 0) * (1 - fraction) +
              (spectrum[left + 1] ?? 0) * fraction) *
              2) /
            n
          );
        },
        band(fromHz, toHz) {
          let power = 0;
          for (
            let bin = Math.max(0, Math.ceil((fromHz * n) / sampleRate));
            bin < Math.min(spectrum.length, Math.ceil((toHz * n) / sampleRate));
            bin++
          )
            power += ((spectrum[bin] * 2) / n) ** 2;
          return Math.sqrt(power);
        },
      };
    }
  }
  globalThis.ResonanceAudio = ResonanceAudio;
})();
