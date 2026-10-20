"use strict";
const $ = (id) => document.getElementById(id);
const canvas = $("visual");
const gl = canvas.getContext("webgl", {
  antialias: false,
  alpha: false,
  powerPreference: "high-performance",
});
const state = {
  low: 0,
  mid: 0,
  high: 0,
  rms: 0,
  callbacks: 0,
  mode: "ambient",
  palette: 0,
  frames: 0,
  beats: 0,
  beatTime: -10,
  bands: new Float32Array(64),
  features: {},
  sampleRate: 48000,
  flux: 0,
};
// Read-only snapshots help diagnose audio and rendering on the installed display.
window.resonance = {
  snapshot: () => ({
    ...state,
    bands: Array.from(state.bands ?? []),
    context: session?.context.state ?? "none",
    audioTracks:
      session?.stream?.getAudioTracks().map((track) => ({
        label: track.label,
        readyState: track.readyState,
        muted: track.muted,
      })) ?? [],
    width: canvas.width,
    height: canvas.height,
  }),
};
let session = null,
  busy = false,
  gain = 1;
function message(text) {
  $("message").textContent = text;
}
window.resonanceConfigureFeatures = () =>
  session?.analyzer?.start(window.Resonance.requestedFeatures);
function startVisual() {
  const previous = window.resonanceRenderer;
  try {
    const replacement = new window.ResonanceVisual(
      canvas,
      () => state,
      () => gain,
    );
    previous?.dispose();
    window.resonanceRenderer = replacement;
    window.resonanceConfigureFeatures();
  } catch (error) {
    if (previous?.scene) window.Resonance.definition = previous.scene;
    throw error;
  }
}
window.resonanceReloadVisual = startVisual;
function stopAudio() {
  clearTimeout(hideControlsTimer);
  const old = session;
  session = null;
  if (old) {
    old.analyzer?.stop();
    old.source?.disconnect();
    old.stream?.getTracks().forEach((t) => t.stop());
    old.context.close();
    if (old.url) URL.revokeObjectURL(old.url);
  }
  $("player").pause();
  $("player").removeAttribute("src");
  $("player").hidden = true;
  state.mode = "ambient";
  state.low = state.mid = state.high = state.rms = state.beats = 0;
  state.beatTime = -10;
  state.bands = new Float32Array(64);
  state.features = {};
  state.flux = 0;
  document.body.classList.remove("live");
  $("state").textContent = "AMBIENT · CHOOSE AN AUDIO SOURCE";
  $("source").textContent = "ALL AUDIO STAYS ON THIS DEVICE";
  $("stop").hidden = true;
}
function analyze(s, label) {
  const features = new window.ResonanceFeatures();
  s.analyzer = Meyda.createMeydaAnalyzer({
    audioContext: s.context,
    source: s.source,
    bufferSize: 1024,
    hopSize: 512,
    featureExtractors: window.Resonance.requestedFeatures,
    callback: (f) => {
      if (session !== s) return;
      Object.assign(
        state,
        features.update(f, s.context.sampleRate, performance.now() / 1000),
      );
      state.callbacks++;
    },
  });
  s.analyzer.start();
  state.mode = label;
  document.body.classList.add("live");
  $("state").textContent = "LISTENING · " + label.toUpperCase();
  $("source").textContent = "LIVE AUDIO ANALYSIS · LOCAL ONLY";
  $("stop").hidden = false;
  revealControls();
}
async function startAudio(kind, file) {
  if (busy) return;
  busy = true;
  stopAudio();
  const s = { context: new AudioContext() };
  session = s;
  ["share", "file", "demo"].forEach((id) => ($(id).disabled = true));
  try {
    await s.context.resume();
    if (kind === "computer audio") {
      message(
        "Choose Entire Screen, enable “Also share system audio”, then Share.",
      );
      s.stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "monitor", frameRate: 1 },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          suppressLocalAudioPlayback: false,
        },
        systemAudio: "include",
        windowAudio: "system",
        selfBrowserSurface: "exclude",
        surfaceSwitching: "exclude",
      });
      if (session !== s) {
        s.stream.getTracks().forEach((t) => t.stop());
        return;
      }
      if (!s.stream.getAudioTracks().length)
        throw new Error(
          "No computer audio was shared. Select Entire Screen and enable “Also share system audio”, then try again.",
        );
      // Only the audio tracks enter the analysis graph; screen frames are never processed or saved.
      s.source = s.context.createMediaStreamSource(
        new MediaStream(s.stream.getAudioTracks()),
      );
      const surface = s.stream
        .getVideoTracks()[0]
        ?.getSettings().displaySurface;
      if (surface === "browser") kind = "tab audio";
      s.stream.getTracks().forEach((track) =>
        track.addEventListener("ended", () => {
          if (session === s) {
            stopAudio();
            message("Audio sharing ended. Choose a source to reconnect.");
          }
        }),
      );
      // Live capture is analysis-only to avoid feedback through the speakers.
    } else if (kind === "music file") {
      s.url = URL.createObjectURL(file);
      const player = $("player");
      player.src = s.url;
      player.hidden = false;
      player.loop = true;
      s.source = s.context.createMediaElementSource(player);
      s.source.connect(s.context.destination);
      await player.play();
    } else {
      const rate = s.context.sampleRate,
        duration = 8,
        buffer = s.context.createBuffer(1, rate * duration, rate),
        data = buffer.getChannelData(0);
      const notes = [110, 130.81, 164.81, 146.83];
      for (let i = 0; i < data.length; i++) {
        const t = i / rate,
          beat = t % 0.5,
          kick =
            Math.sin(
              2 * Math.PI * (48 * beat + 8 * (1 - Math.exp(-beat * 30))),
            ) * Math.exp(-beat * 15);
        const note = notes[Math.floor(t / 2) % 4],
          env = Math.sin(Math.PI * ((t % 0.25) / 0.25)) ** 2;
        const arp =
          Math.sin(
            2 * Math.PI * note * [1, 1.5, 2, 3][Math.floor(t * 4) % 4] * t,
          ) *
          env *
          0.12;
        const hat =
          (Math.random() * 2 - 1) * Math.exp(-(t % 0.25) * 100) * 0.08;
        data[i] =
          kick * 0.35 + arp + hat + Math.sin(2 * Math.PI * note * t) * 0.04;
      }
      s.source = s.context.createBufferSource();
      s.source.buffer = buffer;
      s.source.loop = true;
      const volume = s.context.createGain();
      volume.gain.value = 0.35;
      s.source.connect(volume);
      volume.connect(s.context.destination);
      s.source.start();
    }
    if (session !== s) return;
    analyze(s, kind);
    message(
      kind === "music file"
        ? file.name
        : kind === "demo"
          ? "An original synthesized loop. Every movement comes from real audio analysis."
          : "System output connected. Bass drives the tunnel; kicks launch shockwaves.",
    );
  } catch (error) {
    if (session === s) {
      stopAudio();
      message(
        error.name === "NotAllowedError"
          ? "Audio permission was declined. Allow access in browser / macOS settings, or choose Open music."
          : error.message,
      );
    }
  } finally {
    busy = false;
    ["share", "file", "demo"].forEach((id) => ($(id).disabled = false));
  }
}
$("share").onclick = () => startAudio("computer audio");
$("demo").onclick = () => startAudio("demo");
$("file").onclick = () => $("upload").click();
$("upload").onchange = (e) => {
  const file = e.target.files[0];
  if (file) startAudio("music file", file);
  e.target.value = "";
};
$("stop").onclick = () => {
  stopAudio();
  message("Audio stopped. The sculpture is drifting in ambient mode.");
};
$("gain").oninput = (e) => {
  gain = Number(e.target.value);
};
$("palette").onclick = () => {
  state.palette = (state.palette + 1) % 3;
  $("palette").textContent = ["ION ↗", "ACID ↗", "CHROMA ↗"][state.palette];
};
async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    message("Use your browser’s View → Enter Full Screen command.");
  }
}
$("fullscreen").onclick = fullscreen;
$("reveal").onclick = () => document.body.classList.remove("clean");
document.addEventListener("keydown", (e) => {
  if (
    e.target.matches("input,button,audio") ||
    e.metaKey ||
    e.ctrlKey ||
    e.altKey
  )
    return;
  if (e.key.toLowerCase() === "f") fullscreen();
  if (e.key.toLowerCase() === "h") document.body.classList.toggle("clean");
  if (e.key.toLowerCase() === "c") $("palette").click();
  if (e.key === "Escape") document.body.classList.remove("clean");
});
canvas.addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  message("Graphics context was lost. Reload to restart the visualizer.");
});
window.addEventListener("beforeunload", stopAudio);
window.Resonance.loadScene()
  .then(startVisual)
  .catch((error) => message(error.message));

// Live controls disappear while listening; pointer movement reveals them again.
let hideControlsTimer;
function revealControls() {
  document.body.classList.remove("clean");
  clearTimeout(hideControlsTimer);
  if (state.mode !== "ambient")
    hideControlsTimer = setTimeout(
      () => document.body.classList.add("clean"),
      3500,
    );
}
document.addEventListener("pointermove", revealControls);
document.addEventListener("pointerdown", revealControls);
