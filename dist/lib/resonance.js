(() => {
  const TAU = Math.PI * 2;
  const palettes = [
    ["#0da6ff", "#ff2906"],
    ["#361fff", "#a1ff09"],
    ["#ff0942", "#29dbff"],
  ];
  const previous = globalThis.Resonance;
  const colorCache = new Map();
  let colorContext;
  /** Convert CSS colors or RGB triples to GPU color values. */
  function rgb(color) {
    if (Array.isArray(color) && color.length === 3) return color;
    if (colorCache.has(color)) return colorCache.get(color);
    if (typeof color !== "string")
      throw Error("Use a CSS color or [r, g, b] in 0–1.");
    let result;
    if (/^#([\da-f]{3}|[\da-f]{6})$/i.test(color)) {
      const hex =
        color.length === 4
          ? color
              .slice(1)
              .split("")
              .map((c) => c + c)
              .join("")
          : color.slice(1);
      result = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    } else if (globalThis.CSS?.supports("color", color)) {
      colorContext ??= new OffscreenCanvas(1, 1).getContext("2d", {
        willReadFrequently: true,
      });
      colorContext.clearRect(0, 0, 1, 1);
      colorContext.fillStyle = color;
      colorContext.fillRect(0, 0, 1, 1);
      const data = colorContext.getImageData(0, 0, 1, 1).data;
      result = [data[0], data[1], data[2]].map(
        (value) => ((value / 255) * data[3]) / 255,
      );
    } else throw Error("Unknown CSS color: " + color);
    colorCache.set(color, result);
    return result;
  }
  /** Mix two colors. Useful for reacting to brightness, pitch class, or volume. */
  function mix(a, b, amount) {
    const x = rgb(a),
      y = rgb(b),
      t = Math.max(0, Math.min(1, amount));
    return x.map((v, i) => v + (y[i] - v) * t);
  }
  /** Convert hue (degrees), saturation, and lightness (0–1) to an RGB color. */
  function hsl(h, s = 1, l = 0.5) {
    const a = s * Math.min(l, 1 - l);
    return [0, 8, 4].map((n) => {
      const k = (((n + h / 30) % 12) + 12) % 12;
      return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    });
  }
  const featureNames = Object.keys(
    globalThis.Meyda?.featureExtractors ?? {},
  ).filter((name) => name !== "spectralFlux");
  /** Public scene API. User visuals need no WebGL, shaders, buffers, or uniforms. */
  const api = {
    palettes,
    mix,
    hsl,
    featureNames,
    definition: previous?.definition,
    /** Register the scene to render. Save visual.js to install it on Clipper. */
    define(scene) {
      if (typeof scene?.draw !== "function")
        throw Error("Resonance.define needs a draw(frame) function.");
      for (const feature of scene.features ?? [])
        if (!featureNames.includes(feature))
          throw Error(
            feature === "spectralFlux"
              ? "Meyda 5.6.3 spectralFlux is broken; use audio.flux instead."
              : "Unknown Meyda feature: " + feature,
          );
      this.definition = scene;
      if (typeof globalThis.dispatchEvent === "function")
        globalThis.dispatchEvent(
          new CustomEvent("resonance:scene-defined", { detail: scene }),
        );
    },
    /** Load a scene in its own scope so top-level let/const work on every save. */
    async loadScene(url = "visual.js") {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok)
        throw Error("Could not load visual.js (" + response.status + ")");
      const source = await response.text();
      new Function(
        source + "\n//# sourceURL=" + new URL(url, location.href).href,
      )();
    },
    /** Required analysis plus the optional Meyda features chosen by your scene. */
    get requestedFeatures() {
      return [
        ...new Set([
          "rms",
          "amplitudeSpectrum",
          "buffer",
          ...(this.definition?.features ?? []),
          ...(globalThis.ResonanceGallery?.features ?? []),
        ]),
      ];
    },
  };
  globalThis.Resonance = api;

  class Renderer {
    constructor(canvas, getState, getGain) {
      if (!api.definition) throw Error("Define a scene in visual.js first.");
      this.canvas = canvas;
      this.getState = getState;
      this.getGain = getGain;
      this.scene = api.definition;
      this.gl = canvas.getContext("webgl", { alpha: false, antialias: false });
      if (!this.gl)
        throw Error("WebGL is unavailable. Enable graphics acceleration.");
      this.maxAttributes = this.gl.getParameter(this.gl.MAX_VERTEX_ATTRIBS);
      this.resources = [];
      this.motion = new Map();
      this.audio = new ResonanceAudio(getState().beats ?? 0);
      this.memory = this.scene.setup?.() ?? {};
      this.time = performance.now() / 1000;
      this.last = this.time;
      this.visualTime = this.time;
      this.effects = { scale: 1, speed: 1, brightness: 1, hue: 0 };
      this.disposed = false;
      const gl = this.gl;
      try {
        this.lines = this.program(
          `attribute vec2 position;attribute float edge;uniform vec2 aspect;varying float distanceToLine;void main(){gl_Position=vec4(position/aspect,0.,1.);distanceToLine=edge;}`,
          `precision mediump float;uniform vec3 color;uniform float opacity;varying float distanceToLine;void main(){float glow=exp(-distanceToLine*distanceToLine*9.)+.18*exp(-distanceToLine*distanceToLine*2.);gl_FragColor=vec4(color*glow*opacity,1.);}`,
        );
        this.dots = this.program(
          `attribute vec2 position;uniform vec2 aspect;uniform float size;void main(){gl_Position=vec4(position/aspect,0.,1.);gl_PointSize=size;}`,
          `precision mediump float;uniform vec3 color;uniform float opacity;void main(){float r=length(gl_PointCoord-.5)*2.;float glow=exp(-r*r*9.)*(1.-smoothstep(.7,1.,r));gl_FragColor=vec4(color*glow*opacity,1.);}`,
        );
        this.tunnelProgram = this.program(
          "attribute vec2 position;void main(){gl_Position=vec4(position,0.,1.);}",
          TUNNEL_FRAGMENT,
        );
        this.buffer = gl.createBuffer();
        this.resources.push(() => gl.deleteBuffer(this.buffer));
        this.quad = gl.createBuffer();
        this.resources.push(() => gl.deleteBuffer(this.quad));
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
          gl.STATIC_DRAW,
        );
        this.texture = gl.createTexture();
        this.resources.push(() => gl.deleteTexture(this.texture));
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this.pixels = new Uint8Array(64);
        this.draw = {
          background: this.background.bind(this),
          path: this.path.bind(this),
          ring: this.ring.bind(this),
          points: this.points.bind(this),
          waveform: this.waveform.bind(this),
          particles: this.particles.bind(this),
          tunnel: this.tunnel.bind(this),
        };
        // Render once before taking over, so a bad live edit keeps the old scene.
        this.render(this.time, 0);
      } catch (error) {
        this.dispose();
        throw error;
      }
      this.tick = (now) => {
        if (this.disposed) return;
        const time = now / 1000,
          dt = Math.min(0.05, time - this.last);
        this.last = time;
        if (!document.hidden) {
          try {
            this.render(time, dt);
          } catch (error) {
            this.report(error);
            this.dispose();
            return;
          }
        }
        this.raf = requestAnimationFrame(this.tick);
      };
      this.raf = requestAnimationFrame(this.tick);
    }
    program(vertex, fragment) {
      const gl = this.gl,
        program = gl.createProgram();
      this.resources.push(() => gl.deleteProgram(program));
      for (const [type, source] of [
        [gl.VERTEX_SHADER, vertex],
        [gl.FRAGMENT_SHADER, fragment],
      ]) {
        const shader = gl.createShader(type);
        this.resources.push(() => gl.deleteShader(shader));
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw Error(gl.getShaderInfoLog(shader));
        gl.attachShader(program, shader);
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw Error(gl.getProgramInfoLog(program));
      return { program, uniforms: new Map() };
    }
    uniform(program, name, value) {
      const gl = this.gl;
      if (!program.uniforms.has(name))
        program.uniforms.set(
          name,
          gl.getUniformLocation(program.program, name),
        );
      const loc = program.uniforms.get(name);
      if (Array.isArray(value)) {
        if (value.length === 2) gl.uniform2fv(loc, value);
        else gl.uniform3fv(loc, value);
      } else gl.uniform1f(loc, value);
    }
    use(program) {
      const gl = this.gl;
      gl.useProgram(program.program);
      for (let i = 0; i < this.maxAttributes; i++)
        gl.disableVertexAttribArray(i);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
    }
    attribute(program, name, size, stride, offset) {
      const gl = this.gl,
        location = gl.getAttribLocation(program.program, name);
      if (location < 0) return;
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset);
    }
    render(time, dt) {
      const gl = this.gl,
        canvas = this.canvas,
        s = this.getState();
      const ratio = Math.min(devicePixelRatio, 1.25);
      const w = Math.round(canvas.clientWidth * ratio),
        h = Math.round(canvas.clientHeight * ratio);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      this.aspect = [w / Math.min(w, h), h / Math.min(w, h)];
      const audio = this.audio.read(s, time, dt, this.getGain());
      const target = globalThis.ResonanceGallery?.modulation(audio) ?? {
        scale: 1,
        speed: 1,
        brightness: 1,
        hue: 0,
      };
      for (const key of Object.keys(target)) {
        this.effects[key] +=
          (target[key] - this.effects[key]) *
          (dt === 0 ? 1 : 1 - Math.exp(-dt * 18));
      }
      this.visualTime += dt * this.effects.speed;
      this.frame = {
        time: this.visualTime,
        dt: dt * this.effects.speed,
        controls: globalThis.ResonanceGallery?.controls ?? {
          size: 1,
          speed: 1,
          brightness: 1,
          hue: 0,
          detail: 0.5,
          shape: 0.42,
        },
        audio,
        memory: this.memory,
        draw: this.draw,
        palette: palettes[s.palette % palettes.length],
        width: w,
        height: h,
        aspect: w / h,
      };
      this.background("#010207");
      if (audio.beat) this.scene.onBeat?.(this.frame);
      this.scene.draw(this.frame);
      s.frames++;
      s.renderHit = audio.pulse;
      s.renderBass = audio.bass;
      for (const [key, level] of [
        ["low", audio.bass],
        ["mid", audio.mids],
        ["high", audio.treble],
      ]) {
        const meter = document.getElementById(key);
        if (meter) meter.style.transform = "scaleX(" + Math.min(1, level) + ")";
      }
      document.documentElement.style.setProperty("--beat", String(audio.pulse));
      const badge = document.getElementById("beat");
      if (badge) badge.textContent = String(audio.beatCount).padStart(3, "0");
    }
    /** Rotate a drawing color in HSV space while retaining its saturation and value. */
    visualColor(color) {
      const [r, g, b] = rgb(color),
        max = Math.max(r, g, b),
        min = Math.min(r, g, b),
        delta = max - min;
      if (delta === 0 || this.effects.hue === 0) return [r, g, b];
      const base =
        max === r
          ? (g - b) / delta
          : max === g
            ? (b - r) / delta + 2
            : (r - g) / delta + 4;
      const hue = (((base + this.effects.hue / 60) % 6) + 6) % 6;
      const x = delta * (1 - Math.abs((hue % 2) - 1));
      const channels =
        hue < 1
          ? [delta, x, 0]
          : hue < 2
            ? [x, delta, 0]
            : hue < 3
              ? [0, delta, x]
              : hue < 4
                ? [0, x, delta]
                : hue < 5
                  ? [x, 0, delta]
                  : [delta, 0, x];
      return channels.map((value) => value + min);
    }
    /** Clear the frame; subsequent drawing commands layer in call order. */
    background(color = "#010207") {
      const gl = this.gl;
      gl.clearColor(...rgb(color), 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    /** Draw any polyline using centered screen coordinates; +/-1 is half the short edge. */
    path(
      points,
      { color = "#ffffff", width = 0.003, opacity = 1, closed = false } = {},
    ) {
      if (points.length < 2 || opacity <= 0 || width <= 0) return;
      const gl = this.gl,
        p = this.lines;
      this.use(p);
      const vertices = [],
        segments = closed ? points.length : points.length - 1;
      for (let i = 0; i < segments; i++) {
        const a = points[i],
          b = points[(i + 1) % points.length],
          dx = b[0] - a[0],
          dy = b[1] - a[1],
          length = Math.hypot(dx, dy);
        if (length === 0) continue;
        const nx = (-dy / length) * width * 3,
          ny = (dx / length) * width * 3;
        vertices.push(
          a[0] + nx,
          a[1] + ny,
          1,
          a[0] - nx,
          a[1] - ny,
          -1,
          b[0] + nx,
          b[1] + ny,
          1,
          b[0] + nx,
          b[1] + ny,
          1,
          a[0] - nx,
          a[1] - ny,
          -1,
          b[0] - nx,
          b[1] - ny,
          -1,
        );
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array(vertices),
        gl.DYNAMIC_DRAW,
      );
      this.attribute(p, "position", 2, 12, 0);
      this.attribute(p, "edge", 1, 12, 8);
      this.uniform(
        p,
        "aspect",
        this.aspect.map((value) => value / this.effects.scale),
      );
      this.uniform(p, "color", this.visualColor(color));
      this.uniform(p, "opacity", opacity * this.effects.brightness);
      gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 3);
    }
    /** Draw a circle, a polygon, or a spectrum-deformed ring. */
    ring({
      x = 0,
      y = 0,
      radius = 0.3,
      segments = 192,
      rotation = 0,
      wobble = 0,
      lobes = 3,
      phase = 0,
      spectrum,
      reactivity = 0.05,
      ...style
    } = {}) {
      const count = Math.max(3, Math.min(1024, Math.round(segments))),
        points = [];
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * TAU,
          band = spectrum?.[Math.floor((i / count) * spectrum.length)] ?? 0;
        const r =
          radius + wobble * Math.sin(angle * lobes + phase) + band * reactivity;
        points.push([
          x + Math.cos(angle + rotation) * r,
          y + Math.sin(angle + rotation) * r,
        ]);
      }
      this.path(points, { ...style, closed: true });
    }
    /** Draw glowing point sprites. size is in CSS pixels. */
    points(points, { color = "#ffffff", size = 5, opacity = 1 } = {}) {
      if (!points.length || opacity <= 0) return;
      const gl = this.gl,
        p = this.dots;
      this.use(p);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array(points.flat()),
        gl.DYNAMIC_DRAW,
      );
      this.attribute(p, "position", 2, 8, 0);
      this.uniform(
        p,
        "aspect",
        this.aspect.map((value) => value / this.effects.scale),
      );
      this.uniform(
        p,
        "size",
        Math.min(
          128,
          size * this.effects.scale * Math.min(devicePixelRatio, 1.25),
        ),
      );
      this.uniform(p, "color", this.visualColor(color));
      this.uniform(p, "opacity", opacity * this.effects.brightness);
      gl.drawArrays(gl.POINTS, 0, points.length);
    }
    /** Draw sampled audio as a line; position/scale are in centered screen coordinates. */
    waveform(
      samples,
      { x = 0, y = 0, span = 1.6, amplitude = 0.3, ...style } = {},
    ) {
      const points = [],
        stride = Math.max(1, Math.ceil(samples.length / 512));
      for (let i = 0; i < samples.length; i += stride)
        points.push([
          x + (i / Math.max(1, samples.length - 1) - 0.5) * span,
          y + samples[i] * amplitude,
        ]);
      this.path(points, style);
    }
    /** Animate a stable star field; id keeps independent layers' motion separate. */
    particles({
      id = "particles",
      count = 180,
      speed = 0.4,
      spread = 2.4,
      rotation = 0,
      ...style
    } = {}) {
      const distance = (this.motion.get(id) ?? 0) + speed * this.frame.dt;
      this.motion.set(id, distance);
      const points = [];
      for (let i = 0; i < Math.min(4000, count); i++) {
        const seed = (((Math.sin(i * 127.1 + 3) * 43758.5453) % 1) + 1) % 1,
          angle = i * 2.39996 + rotation,
          r = ((seed + distance * (0.2 + seed * 0.3)) % 1) * spread;
        points.push([Math.cos(angle) * r, Math.sin(angle) * r]);
      }
      this.points(points, style);
    }
    /** Built-in twisted tunnel; all controls are ordinary JS values. */
    tunnel(options = {}) {
      const { audio, time, dt, palette } = this.frame;
      const {
        id = "tunnel",
        speed = 0.16 + audio.bass * 2.5 + audio.pulse * 5,
        zoom = 1 + audio.bass * 0.18 + audio.pulse * 0.22,
        rotation = audio.beatCount * 0.067,
        twist = 2.5,
        layers = 22,
        colors = palette,
        brightness = 0.4 + audio.energy * 0.8 + audio.pulse * 0.65,
        membrane = true,
        shockwaves = true,
        particles = true,
      } = options;
      const distance = (this.motion.get(id) ?? 0) + speed * dt;
      this.motion.set(id, distance);
      const gl = this.gl,
        p = this.tunnelProgram;
      this.use(p);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
      this.attribute(p, "position", 2, 8, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      for (let i = 0; i < 64; i++)
        this.pixels[i] = Math.min(
          255,
          (audio.spectrum[i] ?? 0) * 255 * this.getGain(),
        );
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.LUMINANCE,
        64,
        1,
        0,
        gl.LUMINANCE,
        gl.UNSIGNED_BYTE,
        this.pixels,
      );
      gl.uniform1i(gl.getUniformLocation(p.program, "spectrum"), 0);
      const values = {
        resolution: [this.canvas.width, this.canvas.height],
        time,
        bass: audio.bass,
        mid: audio.mids,
        high: audio.treble,
        hit: audio.pulse,
        age: Math.min(10, audio.beatAge),
        travel: distance,
        turn: audio.beatCount * 0.42,
        energy: audio.energy,
        zoom: zoom * this.effects.scale,
        rotation,
        twist,
        layers: Math.max(1, Math.min(48, layers)),
        brightness: brightness * this.effects.brightness,
        membrane: Number(membrane),
        shockwaves: Number(shockwaves),
        dustAmount: Number(particles),
        colorA: this.visualColor(colors[0]),
        colorB: this.visualColor(colors[1]),
      };
      for (const [name, value] of Object.entries(values))
        this.uniform(p, name, value);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    report(error) {
      let box = document.getElementById("live-edit-error");
      if (!box) {
        box = document.createElement("pre");
        box.id = "live-edit-error";
        box.style.cssText =
          "position:fixed;z-index:99;bottom:24px;left:24px;max-width:80vw;white-space:pre-wrap;padding:16px;background:#250c13;color:#ffbdc4;border:1px solid #ef5b75;font:13px monospace";
        document.body.append(box);
      }
      box.textContent =
        "Visual error: " + error.message + "\nFix visual.js and save to retry.";
      console.error(error);
    }
    /** Stop rendering and release this instance's GPU resources. */
    dispose() {
      this.disposed = true;
      cancelAnimationFrame(this.raf);
      this.resources.forEach((cleanup) => cleanup());
      this.resources = [];
    }
  }
  const TUNNEL_FRAGMENT = `
precision highp float;
uniform vec2 resolution;
uniform float time,bass,mid,high,hit,age,travel,turn,energy;
uniform float zoom,rotation,twist,layers,brightness,membrane,shockwaves,dustAmount;
uniform vec3 colorA,colorB;
uniform sampler2D spectrum;
#define PI 3.14159265359
mat2 rotate(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
vec3 ink(float t){return mix(colorA,colorB,.5+.5*sin(t*4.7));}
void main(){
 vec2 uv=(gl_FragCoord.xy*2.-resolution)/min(resolution.x,resolution.y);
 vec2 original=uv;
 uv*=rotate(rotation);
 uv/=zoom;
 uv+=vec2(sin(time*19.),cos(time*23.))*hit*.007;
 float r=length(uv),a=atan(uv.y,uv.x);
 vec3 col=vec3(.002,.003,.009);
 // Twisted perspective ribs. Each layer samples a different part of the spectrum.
 for(int j=0;j<48;j++){
  if(float(j)>=layers)break;
  float i=float(j),z=fract(i/layers+travel*.035);
  float radius=.10+z*z*2.6;
  float depth=1.-z;
  vec2 p=uv-vec2(sin(time*.21+z*4.),cos(time*.18+z*3.))*.13*depth;
  p*=rotate(z*twist+turn*.1+sin(time*.22)*.3);
  float angle=atan(p.y,p.x),rad=length(p);
  float freq=texture2D(spectrum,vec2((.5+.5*sin(angle*2.+z*2.)),.5)).r;
  float folds=.5+.5*sin(turn*.12);
  float shape=1.+.15*mix(cos(angle*6.+z*6.+time*.22),cos(angle*8.+z*6.+time*.22),folds)+.07*sin(angle*3.-time*.4+z*11.);
  shape+=freq*(.06+mid*.12)*sin(angle*17.+time);
  float d=abs(rad-radius*shape);
  float width=.0015+z*.0016+high*.001;
  float line=width/(d+width);
  float shade=(.15+.85*pow(z,.7))*(.45+.55*sin(angle*2.+z*8.+time*.2));
  vec3 c=ink(z*.8+sin(angle)*.3+turn*.025);
  col+=c*(pow(line,2.)*1.6+pow(line,.72)*.022)*shade*brightness;
  // Broken crystalline highlights slide along the ribs.
  float sparks=pow(max(0.,sin(angle*41.+z*73.+time*(.3+high))),24.);
  col+=mix(c,vec3(.8,.95,1.),.6)*sparks*pow(line,3.)*(high*.8+hit*.7);
 }
 // A low-frequency membrane with sharply defined folds, not a constant round outline.
 float freq=texture2D(spectrum,vec2(abs(a)/PI,.5)).r;
 float core=.19+bass*.17;
 for(int j=0;j<6;j++){
  float i=float(j);
  float edge=core+i*.013+sin(a*3.+time*.7+i*.4)*(.025+mid*.04);
  edge+=sin(a*7.-time*.4+i*.3)*(.01+freq*.04);
  float d=abs(r-edge);
  float line=.002/(d+.002);
  col+=ink(sin(a)*.3+i*.09+turn*.035)*(pow(line,2.)*1.5+line*.025)*(energy+.12)*membrane;
 }
 // An onset launches an outward wave; it fades between kicks.
 float shock=.22+age*1.9;
 float wave=exp(-abs(r-shock)*85.)*exp(-age*3.2);
 col+=mix(ink(turn*.07),vec3(.85,.95,1.),.55)*wave*.65*shockwaves;
 // Radial dust accelerates with bass, giving the impacts physical depth.
 float sector=floor((a+PI)*90.);
 float seed=fract(sin(sector*127.1)*43758.5453);
 float sparkR=fract(seed+travel*(.08+seed*.1))*2.8;
 float angular=abs(fract((a+PI)*90.)-.5);
 float dust=exp(-angular*angular*180.)*exp(-abs(r-sparkR)*65.);
 col+=ink(seed+turn*.02)*dust*(.04+high*.45+hit*.25)*smoothstep(.3,1.,r)*dustAmount;
 col+=ink(sin(a)*.2+turn*.04)*exp(-abs(r-core)*5.)*.025*energy;
 col*=1.-smoothstep(.65,1.8,length(original))*.75;
 col=1.-exp(-col*1.35);
 gl_FragColor=vec4(pow(col,vec3(.9)),1.);
}`;
  globalThis.ResonanceVisual = Renderer;
})();
