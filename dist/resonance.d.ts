/** Any CSS color (pink, #40ddff, rgb(...), hsl(...)), or an RGB triple in 0–1. */
type VisualColor = string | number[];
/** A point in centered coordinates. +/-1 reaches half the shorter screen dimension. */
type VisualPoint = [number, number];
/** Available Meyda 5.6.3 features. spectralFlux is excluded because its bundled extractor throws. */
type AudioFeature =
  | "amplitudeSpectrum"
  | "buffer"
  | "chroma"
  | "complexSpectrum"
  | "energy"
  | "loudness"
  | "melBands"
  | "mfcc"
  | "perceptualSharpness"
  | "perceptualSpread"
  | "powerSpectrum"
  | "rms"
  | "spectralCentroid"
  | "spectralCrest"
  | "spectralFlatness"
  | "spectralKurtosis"
  | "spectralRolloff"
  | "spectralSkewness"
  | "spectralSlope"
  | "spectralSpread"
  | "zcr";
/** Unmodified Meyda results; request optional fields in your scene's features list. */
interface MeydaFeatures {
  rms?: number;
  amplitudeSpectrum?: Float32Array;
  buffer?: Float32Array;
  /** Spectral center of gravity in FFT bins. Prefer audio.centroidHz for Hz. */
  spectralCentroid?: number;
  spectralFlatness?: number;
  spectralRolloff?: number;
  spectralCrest?: number;
  spectralKurtosis?: number;
  spectralSkewness?: number;
  spectralSlope?: number;
  spectralSpread?: number;
  zcr?: number;
  energy?: number;
  /** 12 pitch classes, C through B. Not a key/chord classifier. */
  chroma?: number[];
  mfcc?: number[];
  melBands?: number[];
  powerSpectrum?: Float32Array;
  complexSpectrum?: { real: Float32Array; imag: Float32Array };
  loudness?: { specific: Float32Array; total: number };
  perceptualSharpness?: number;
  perceptualSpread?: number;
}
/** Audio sampled for this animation frame. Normalized helpers honor Sensitivity; raw Meyda values do not. */
interface VisualAudio {
  /** Smoothed bass energy, roughly 0–1 (up to 1.3), below 190 Hz. */
  bass: number;
  /** Smoothed energy from 190–2600 Hz, roughly 0–1. */
  mids: number;
  /** Smoothed energy from 2600–14000 Hz, roughly 0–1. */
  treble: number;
  /** Display loudness: clamp(rms * 25 * sensitivity, 0, 1). */
  energy: number;
  /** Unmodified Meyda RMS. */
  rms: number;
  /** Fast impulse on each detected kick, then exponential decay. 0–1.8. */
  pulse: number;
  /** True for one rendered frame per newly detected onset. */
  beat: boolean;
  beatCount: number;
  /** Seconds since the last onset. Infinity before the first onset. */
  beatAge: number;
  /** Positive low-frequency spectral change used by our detector. Not Meyda spectralFlux. */
  flux: number;
  /** 64 normalized logarithmic bands spanning 30–14000 Hz. */
  spectrum: Float32Array;
  /** 1024 windowed samples from Meyda's buffer extractor. */
  waveform: Float32Array;
  features: MeydaFeatures;
  sampleRate: number;
  /** Brightness in Hz; request spectralCentroid. Zero before data arrives. */
  centroidHz: number;
  /** Interpolated linear spectral amplitude at a frequency in Hz. */
  frequency(hz: number): number;
  /** Root-sum-square spectral amplitude in a Hz range; not normalized like bass. */
  band(fromHz: number, toHz: number): number;
}
interface Stroke {
  color?: VisualColor;
  /** Width in centered coordinates. Default .003. */
  width?: number;
  opacity?: number;
}
interface RingOptions extends Stroke {
  x?: number;
  y?: number;
  radius?: number;
  /** Use 3 for a triangle, 6 for a hexagon, 192 for a smooth ring. Max 1024. */
  segments?: number;
  /** Radians. */
  rotation?: number;
  wobble?: number;
  /** Integer number of waves around the ring. */
  lobes?: number;
  phase?: number;
  spectrum?: ArrayLike<number>;
  reactivity?: number;
}
interface PointOptions {
  color?: VisualColor;
  /** Diameter in CSS pixels. */
  size?: number;
  opacity?: number;
}
/** GPU-backed drawing commands. Shapes glow and add together in drawing order. */
interface VisualDraw {
  background(color?: VisualColor): void;
  path(points: VisualPoint[], options?: Stroke & { closed?: boolean }): void;
  ring(options?: RingOptions): void;
  points(points: VisualPoint[], options?: PointOptions): void;
  waveform(
    samples: ArrayLike<number>,
    options?: Stroke & {
      x?: number;
      y?: number;
      span?: number;
      amplitude?: number;
    },
  ): void;
  particles(
    options?: PointOptions & {
      /** Give each particle layer a unique id. */ id?: string;
      count?: number;
      speed?: number;
      spread?: number;
      rotation?: number;
    },
  ): void;
  tunnel(options?: {
    /** Give each tunnel layer a unique id to keep independent motion. */
    id?: string;
    speed?: number;
    zoom?: number;
    rotation?: number;
    twist?: number;
    /** Number of perspective ribs, 1–48. */
    layers?: number;
    colors?: VisualColor[];
    brightness?: number;
    /** Enable the built-in reactive center membrane. */
    membrane?: boolean;
    shockwaves?: boolean;
    particles?: boolean;
  }): void;
}
/** Context supplied to draw and onBeat; draw is only intended for the draw callback. */
interface VisualFrame<Memory extends object = Record<string, unknown>> {
  time: number;
  /** Animation seconds after the live speed control; audio timing stays in real seconds. */
  dt: number;
  audio: VisualAudio;
  memory: Memory;
  /** Live on-screen knobs. Built-in scenes use detail/shape; use them in your own scene too. */
  controls: {
    size: number;
    speed: number;
    brightness: number;
    hue: number;
    detail: number;
    shape: number;
  };
  draw: VisualDraw;
  /** Current two-color palette selected with C. */
  palette: VisualColor[];
  width: number;
  height: number;
  aspect: number;
}
interface VisualScene<Memory extends object> {
  features?: AudioFeature[];
  /** Allocate your state once. Saving visual.js resets it. */
  setup?: () => Memory;
  onBeat?: (frame: VisualFrame<Memory>) => void;
  draw: (frame: VisualFrame<Memory>) => void;
}
/** Live visual-composition library. Rendering and audio capture are managed for you. */
declare const Resonance: {
  define<Memory extends object = Record<string, unknown>>(
    scene: VisualScene<Memory>,
  ): void;
  mix(a: VisualColor, b: VisualColor, amount: number): number[];
  hsl(hueDegrees: number, saturation?: number, lightness?: number): number[];
  readonly featureNames: AudioFeature[];
  readonly requestedFeatures: AudioFeature[];
  readonly palettes: VisualColor[][];
};
