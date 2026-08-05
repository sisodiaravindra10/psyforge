/* PSYFORGE — beat-reactive psychedelic visualizer, two layers:

   1. WebGL fragment shader (bottom): infinite kaleidoscopic tunnel — rings
      flying past, petal folds, interference plasma, live waveform ring,
      build strobe and drop shockwave, all computed per-pixel from audio
      uniforms (bass/mid/high bands + exact kick/build/drop envelopes).
   2. Canvas 2D (top, additive, transparent): rotating mandala arms,
      kick-spawned polygon rings, pitch-mapped lead particles, snare shake.

   Falls back to 2D-only if WebGL is unavailable. Palette follows the preset. */
(function () {
  const PSY = (window.PSY = window.PSY || {});
  const TAU = Math.PI * 2;

  const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

  const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uTravel;
uniform float uKick;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uHue;
uniform float uHue2;
uniform float uSym;
uniform float uBuild;
uniform float uBuildPhase;
uniform float uDrop;
uniform float uMode;
uniform sampler2D uWave;

const float TAU = 6.28318530718;

vec3 hsv(float h, float s, float v) {
  vec3 k = vec3(1.0, 2.0 / 3.0, 1.0 / 3.0);
  vec3 p = abs(fract(vec3(h) + k) * 6.0 - 3.0);
  return v * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), s);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

/* ---- style 0: TUNNEL — kaleidoscopic neon tunnel + live waveform ring ---- */
vec3 modeTunnel(vec2 uv) {
  float r = length(uv);
  float ang = atan(uv.y, uv.x);
  float seg = TAU / uSym;
  float ka = mod(ang + uTime * 0.03, seg);
  ka = abs(ka - seg * 0.5);

  float depth = uTravel + 0.45 / (r + 0.15);
  float twist = ka * uSym * 0.5 + sin(depth * 2.0) * 0.8;

  float rings = sin(depth * TAU * 1.25) * 0.5 + 0.5;
  rings = pow(rings, 2.2 - uBass * 1.2);
  float petals = sin(twist * 3.0 + depth * 4.0) * 0.5 + 0.5;
  petals = pow(petals, 3.0 - uMid * 1.5);
  float plasma = sin(uv.x * 7.0 + sin(depth * 3.0 + uTime * 0.7) * 2.0)
               * sin(uv.y * 7.0 - uTime * 0.5);
  plasma = plasma * 0.5 + 0.5;

  float glow = 0.5 * rings + 0.35 * petals + 0.25 * plasma * rings;
  glow *= 0.8 + uKick * 0.6;

  vec3 col = hsv(fract(uHue + depth * 0.045 + petals * 0.06), 0.8, glow);
  col += hsv(uHue2, 0.65, pow(rings, 5.0) * (0.3 + uKick * 0.8));

  float wv = texture2D(uWave, vec2(ang / TAU + 0.5, 0.5)).r - 0.5;
  float wr = 0.58 + uBass * 0.08;
  float d = abs(r - (wr + wv * (0.22 + uBass * 0.25)));
  col += hsv(uHue2, 0.45, 0.010 / (d + 0.004) * (0.35 + uBass * 0.65));

  col += (hash(uv * vec2(uTime * 7.0, uTime * 9.0)) - 0.5) * uHigh * 0.22;
  col += hsv(uHue, 0.55, 0.035 / (r + 0.05) * (0.4 + uKick * 0.6));
  col *= smoothstep(1.75, 0.35, r);
  return col;
}

/* ---- style 1: HYPNO — bold rainbow spiral rings into an off-center hole ---- */
vec3 modeHypno(vec2 uv) {
  vec2 c = vec2(sin(uTime * 0.10) * 0.25, cos(uTime * 0.07) * 0.20);
  vec2 p = uv - c;
  float pr = length(p) + 0.001;
  float pa = atan(p.y, p.x);

  // spiral tunnel: rings compress toward the hole, twist once per turn
  float d = uTravel * 1.6 + 0.32 / pr + pa / TAU;
  float ring = sin(d * TAU * 3.0);
  float bright = 0.62 + 0.38 * ring;
  bright *= 1.0 + uKick * 0.35;

  // hue period must be an integer multiple of the spiral's angular jump (1.0)
  // or the atan wrap paints a hard seam
  vec3 col = hsv(fract(d + uHue), 0.9 - uKick * 0.2, bright);
  col += vec3(pow(max(ring, 0.0), 8.0)) * (0.35 + uKick * 0.5); // hot white band edges

  float wv = texture2D(uWave, vec2(pa / TAU + 0.5, 0.5)).r - 0.5;
  col *= 1.0 + wv * uBass * 0.8;
  col *= smoothstep(0.0, 0.05, pr);
  return col;
}

/* ---- style 2: HYPERMAZE — stepped neon zigzag labyrinth (DMT blotter) ---- */
vec3 modeMaze(vec2 uv) {
  float qz = 30.0;
  vec2 uq = floor(uv * qz) / qz; // blocky quantized steps
  float a = atan(uq.y, uq.x);
  float seg = TAU / 4.0;
  float ka = abs(mod(a, seg) - seg * 0.5);
  float rad = abs(uq.x) + abs(uq.y); // manhattan distance = diamond rings
  float zig = abs(fract(ka * 6.0 / seg + uTime * 0.02) - 0.5) * 2.0;

  float field = rad * (3.2 + uBass * 0.6) + zig * 0.55 - uTravel * 0.7;
  float f2 = field * 2.0;
  float band = fract(f2);
  float id = floor(f2);

  float line = smoothstep(0.27, 0.14, abs(band - 0.5));
  vec3 col = hsv(fract(id * 0.11 + uHue + uTime * 0.01), 0.92, 0.95)
           * line * (0.65 + uKick * 0.5 + uHigh * 0.3);

  // offset second layer doubles the meander density
  float band2 = fract(f2 + 0.5);
  float line2 = smoothstep(0.24, 0.12, abs(band2 - 0.5));
  col += hsv(fract(id * 0.11 + uHue + 0.45), 0.9, 0.55) * line2 * 0.35;

  col += hsv(uHue2, 0.7, 0.05); // faint violet bed
  return col;
}

/* ---- style 3: MANDALA — ornate concentric petal kaleidoscope ---- */
vec3 modeMandala(vec2 uv) {
  float r = length(uv);
  float a = atan(uv.y, uv.x) + uTime * 0.03;

  float rr = r * (4.2 + uBass * 0.3) - uTravel * 0.3;
  float ring = floor(rr);
  float fr = fract(rr);
  float n = 6.0 + mod(ring, 4.0) * 6.0;             // petal counts cycle 6/12/18/24
  float sharp = 2.0 + 6.0 * fract(ring * 0.37);     // varied petal sharpness per ring
  float petal = pow(abs(cos(a * n * 0.5)), sharp);

  float band = smoothstep(0.10, 0.42, fr) * smoothstep(1.0, 0.70, fr);
  float v = band * (0.30 + 0.70 * petal);

  vec3 col = hsv(fract(0.02 + ring * 0.09 + uHue * 0.4 + uTime * 0.004), 0.85, 0.22 + 0.78 * v);
  col *= 0.3 + 0.7 * smoothstep(0.015, 0.1, fr) * smoothstep(0.99, 0.9, fr); // inked ring outlines
  col += hsv(fract(uHue + 0.08), 0.75, 0.5) * smoothstep(0.22, 0.0, r) * (0.5 + uKick * 0.5);
  col *= 1.0 + uKick * 0.22;
  col *= smoothstep(1.9, 0.9, r * 0.6);
  return col;
}

/* ================= 3D: raymarched modes ================= */

mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float sdBox(vec3 p, vec3 b) {
  vec3 d = abs(p) - b;
  return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
}

/* ---- style 4: MAZE RUN — fly a winding corridor through an endless maze ----
   The maze is an infinite grid of blocks keyed off a hash of the cell, with a
   snaking corridor carved through it that the camera follows. */

const float CELL = 3.0;

// Which x-cell the corridor occupies at a given z-cell. Quantized so the
// corridor turns at right angles like a real maze. The source wave is
// deliberately slow: its slope stays under 1 cell per step, which guarantees
// consecutive cells are at most one apart and the maze is always walkable.
float corridorX(float cz) {
  return floor(sin(cz * 0.21) * 1.7 + sin(cz * 0.058) * 1.9 + 0.5);
}

// One carved cell, widened in x to span its neighbours. Two cells that step
// diagonally would otherwise touch only at an edge, leaving no way through.
float corridorCell(vec3 p, float cz) {
  float xp = corridorX(cz - 1.0);
  float x0 = corridorX(cz);
  float xn = corridorX(cz + 1.0);
  float lo = min(x0, min(xp, xn));
  float hi = max(x0, max(xp, xn));
  vec3 c = vec3((lo + hi) * 0.5 * CELL, 0.35, cz * CELL);
  // Depth 0.8 rather than 0.5 so consecutive cells OVERLAP. Boxes that merely
  // touch make min() of the union collapse to ~0 along the shared face, and
  // the marcher reads a phantom wall at every cell boundary.
  vec3 h = vec3((hi - lo + 1.0) * CELL * 0.5, 1.7, CELL * 0.8);
  float d = sdBox(p - c, h);
  // dead-end alcoves off the side: reads as a maze rather than a tube
  float hs = hash21(vec2(cz, 7.0));
  if (hs > 0.66) {
    float dir = hs > 0.83 ? 1.0 : -1.0;
    vec3 b = vec3((x0 + dir * 1.4) * CELL, 0.2, cz * CELL);
    d = min(d, sdBox(p - b, vec3(CELL * 1.1, 1.3, CELL * 0.3)));
  }
  return d;
}

// The world is solid rock and the corridor is carved out of it. Negating an
// exact union of open cells keeps the field valid; the earlier per-cell block
// test was not a distance field at all and tore the geometry apart.
float mapMaze3(vec3 p) {
  float cz = floor(p.z / CELL + 0.5);
  float open = corridorCell(p, cz);
  open = min(open, corridorCell(p, cz - 1.0));
  open = min(open, corridorCell(p, cz + 1.0));
  return -open;
}

// Camera path: ride the quantized corridor, easing across in the back half of
// each cell so the turn is visible but never leaves the carved volume.
float camX(float z) {
  float f = z / CELL + 0.5;
  float cz = floor(f);
  return mix(corridorX(cz), corridorX(cz + 1.0), smoothstep(0.55, 1.0, fract(f))) * CELL;
}

vec3 mazeNormal(vec3 p) {
  vec2 e = vec2(0.0025, 0.0);
  return normalize(vec3(
    mapMaze3(p + e.xyy) - mapMaze3(p - e.xyy),
    mapMaze3(p + e.yxy) - mapMaze3(p - e.yxy),
    mapMaze3(p + e.yyx) - mapMaze3(p - e.yyx)));
}

vec3 modeMazeRun(vec2 uv) {
  float t = uTravel * 2.6;
  vec3 ro = vec3(camX(t), sin(t * 0.35) * 0.18, t);
  vec3 ta = vec3(camX(t + 2.5), 0.0, t + 2.5);
  vec3 fw = normalize(ta - ro);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, rt);
  // bank into the turns, plus a slow roll
  // bank into the turn plus a gentle sway. Must oscillate, not accumulate:
  // a uTime term would slowly roll the corridor upside down.
  float bank = (camX(t + 2.5) - camX(t)) * 0.05 + sin(uTime * 0.09) * 0.22;
  vec2 suv = uv * rot2(bank);
  vec3 rd = normalize(suv.x * rt + suv.y * up + fw * (1.45 - uBass * 0.3));

  float dist = 0.15;
  bool hit = false;
  for (int i = 0; i < 72; i++) {
    float d = mapMaze3(ro + rd * dist);
    if (d < 0.0035 * dist + 0.0015) { hit = true; break; }
    dist += d * 0.85;
    if (dist > 34.0) break;
  }

  vec3 col = vec3(0.0);
  if (hit) {
    vec3 p = ro + rd * dist;
    vec3 n = mazeNormal(p);
    vec3 g = abs(fract(p / CELL) - 0.5);
    // wide soft seams, not hairlines: the surfaces should feel lit from within
    float seam = smoothstep(0.32, 0.5, max(g.x, max(g.y * 0.55, g.z)));
    float band = smoothstep(0.55, 1.0, sin(p.z * 2.1 - uTime * 3.0) * 0.5 + 0.5);
    float sheet = smoothstep(0.2, 0.5, max(g.x, g.z)); // broad glowing panels

    float hue = fract(uHue + p.z * 0.02 + hash21(floor(p.xz / CELL)) * 0.16);
    float lam = 0.45 + 0.55 * max(dot(n, normalize(vec3(0.3, 0.8, -0.5))), 0.0);
    // emissive walls: saturated colour at real brightness, not a dark surface
    vec3 wall = hsv(hue, 0.85, 0.62) * lam;
    wall += hsv(fract(hue + 0.08), 0.7, 0.55) * sheet * (0.6 + uBass * 0.5);
    wall += hsv(fract(hue + 0.12), 0.95, 1.0) * seam * (0.5 + uKick * 1.2);
    wall += hsv(fract(hue + 0.5), 0.85, 0.9) * band * (0.3 + uMid * 0.7);
    wall += hsv(fract(uHue2), 0.75, 0.9) * pow(1.0 - abs(dot(n, rd)), 2.0) * 0.8;
    col = wall * (1.0 + uKick * 0.5);
  }

  // thick coloured haze — the atmosphere is half the look, so it fogs into a
  // saturated hue rather than into black
  float fog = 1.0 - exp(-dist * 0.115);
  vec3 haze = hsv(fract(uHue2 + 0.02), 0.8, 0.34 + uBass * 0.22 + uKick * 0.1);
  col = mix(col, haze, fog);
  // glow pouring out of the depths + the light you carry
  col += hsv(fract(uHue), 0.7, 0.30) * exp(-length(uv) * 1.5) * (0.55 + uKick * 0.8);
  col += hsv(fract(uHue2 + 0.12), 0.6, 0.16) * exp(-dist * 0.06);
  col *= 1.0 - 0.28 * smoothstep(0.8, 2.0, length(uv));
  return col;
}

/* ---- style 5: FRACTAL — kaleidoscopic IFS, folded infinite temple ----
   A rotated Sierpinski fold. Its distance estimator is essentially exact, so
   unlike a mandelbox it resolves cleanly at these step counts instead of
   boiling into speckle, and the fold rotation animates beautifully. */

float mapFractal(vec3 p) {
  // The fold angle MUST stay small and bounded. Past about 0.6 rad the folds
  // scatter the attractor and the whole structure disappears from view, so an
  // unbounded uTime term here empties the screen a few seconds in. Oscillate.
  float a = sin(uTime * 0.06) * 0.42 + uMid * 0.12;
  float scale = 1.92 + sin(uTime * 0.07) * 0.08 + uBass * 0.04;
  mat2 rxy = rot2(a);
  mat2 ryz = rot2(a * 0.63);
  for (int i = 0; i < 6; i++) {
    p = abs(p);
    p.xy = rxy * p.xy;
    if (p.x + p.y < 0.0) p.xy = -p.yx;
    if (p.x + p.z < 0.0) p.xz = -p.zx;
    if (p.y + p.z < 0.0) p.zy = -p.yz;
    p.yz = ryz * p.yz;
    p = p * scale - vec3(1.0, 0.62, 0.9) * (scale - 1.0);
  }
  // Terminating on a solid box instead of length(p) turns a dust-thin
  // attractor into carved architecture with real surfaces to light.
  return sdBox(p, vec3(1.0, 1.45, 1.0)) * pow(scale, -6.0);
}

vec3 fractalNormal(vec3 p) {
  vec2 e = vec2(0.0012, 0.0);
  return normalize(vec3(
    mapFractal(p + e.xyy) - mapFractal(p - e.xyy),
    mapFractal(p + e.yxy) - mapFractal(p - e.yxy),
    mapFractal(p + e.yyx) - mapFractal(p - e.yyx)));
}

vec3 modeFractal(vec2 uv) {
  float t = uTravel * 0.42;
  vec3 ro = vec3(sin(t * 0.3) * 0.35, cos(t * 0.23) * 0.28, -2.35 + sin(t * 0.4) * 0.4 - uKick * 0.18);
  vec3 rd = normalize(vec3(uv * (1.2 - uBass * 0.15), 1.7));
  float ay = t * 0.33, ax = t * 0.19;
  ro.xz = rot2(ay) * ro.xz; rd.xz = rot2(ay) * rd.xz;
  ro.yz = rot2(ax) * ro.yz; rd.yz = rot2(ax) * rd.yz;

  float dist = 0.0;
  float steps = 0.0;
  bool hit = false;
  for (int i = 0; i < 80; i++) {
    vec3 p = ro + rd * dist;
    float d = mapFractal(p);
    if (d < 0.0009 * dist + 0.0005) { hit = true; break; }
    dist += d * 0.72;         // fractal DEs need conservative stepping
    steps += 1.0;
    if (dist > 7.0) break;
  }

  vec3 col;
  if (hit) {
    vec3 p = ro + rd * dist;
    vec3 n = fractalNormal(p);
    // steps taken is a free ambient-occlusion term: creases take more steps
    float ao = 1.0 - steps / 80.0;
    float key = max(dot(n, normalize(vec3(0.5, 0.7, -0.5))), 0.0);
    float fill = max(dot(n, normalize(vec3(-0.6, -0.2, -0.5))), 0.0);
    float rim = pow(1.0 - abs(dot(n, rd)), 2.0);
    float hue = fract(uHue + dist * 0.13 + ao * 0.2);
    // emissive, not lambert-dark: the surface glows in its own colour
    col = hsv(hue, 0.82, 0.30 + key * 0.85) * (0.9 + uKick * 0.6);
    col += hsv(fract(hue + 0.42), 0.85, 0.75) * fill * 0.55;
    col += hsv(fract(hue + 0.15), 0.9, 1.0) * rim * (0.55 + uMid * 0.8);
    col *= 0.55 + 0.45 * ao;
  } else {
    col = vec3(0.0);
  }
  // saturated volumetric bed so the silhouette floats in colour, not black
  float depthMix = hit ? 1.0 - exp(-dist * 0.42) : 1.0;
  vec3 haze = hsv(fract(uHue2 + 0.02), 0.8, 0.26 + uBass * 0.2 + uKick * 0.08);
  col = mix(col, haze, depthMix * 0.75);
  col += hsv(fract(uHue), 0.7, 0.28) * exp(-length(uv) * 1.4) * (0.5 + uKick * 0.8);
  col *= 1.0 - 0.28 * smoothstep(0.7, 1.9, length(uv));
  return col;
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / min(uRes.x, uRes.y);

  vec3 col;
  if (uMode < 0.5) col = modeTunnel(uv);
  else if (uMode < 1.5) col = modeHypno(uv);
  else if (uMode < 2.5) col = modeMaze(uv);
  else if (uMode < 3.5) col = modeMandala(uv);
  else if (uMode < 4.5) col = modeMazeRun(uv);
  else col = modeFractal(uv);

  // common: build strobe (accelerating) and drop whiteout + shockwave
  // Build flash. The phase is accumulated on the CPU and passed in: writing
  // sin(uTime * rate) made the instantaneous frequency scale with page uptime
  // (measured ~1200 Hz after 6 minutes), which is both a seizure risk and
  // visually wrong. Fixed 2.5 Hz; the escalation comes from the amplitude ramp.
  col *= 1.0 + uBuild * (0.35 + 0.45 * sin(uBuildPhase));
  float r = length(uv);
  float shock = abs(r - (1.0 - uDrop) * 1.5);
  col += hsv(uHue2, 0.25, 0.02 / (shock + 0.012)) * uDrop;
  col += vec3(uDrop * uDrop * 0.6);

  gl_FragColor = vec4(col, 1.0);
}
`;

  class Visualizer {
    constructor(canvas2d, canvasGL, engine) {
      this.canvas = canvas2d;
      this.cx2d = canvas2d.getContext('2d');
      this.canvasGL = canvasGL;
      this.engine = engine;
      this.enabled = true;

      this.palette = { h1: 300, h2: 185, sym: 8 };
      this.bpm = 145;
      this.styleIndex = 0; // index into Visualizer.STYLES
      this.word = ''; // pixel-font word rendered over the shader
      this.wordPixels = []; // spring-physics particles, one per lit font bit
      this.letterEnv = []; // per-letter kick-chase pulse envelopes
      this.kickCount = 0;
      this.barTime = 0; // exact scheduled start of the current bar

      this.rot = 0;
      this.hueShift = 0;
      this.kickEnv = 0;
      this.bassEnv = 0;
      this.fxFlash = 0;
      this.shake = 0;
      this.buildPhase = 0; // CPU-accumulated strobe phase (see FRAG)
      this.dropEnv = 0;
      this.travel = 0;
      this.buildUntil = 0;
      this.buildDur = 1;
      this.rings = [];
      this.particles = [];
      this.quality = 2; // 2 full, 1 reduced, 0 minimal
      this._slowFrames = 0;
      this._fastFrames = 0;
      this._downSteps = 0;
      this._lastT = performance.now();

      this.freqData = null;
      this.waveData = null;
      this.waveTexData = new Uint8Array(512);

      this._initGL();
      this._resize();
      window.addEventListener('resize', () => this._resize());
      document.addEventListener('fullscreenchange', () => this._resize());
    }

    /* ---------- WebGL layer ---------- */

    _initGL() {
      const gl = this.canvasGL.getContext('webgl', {
        antialias: false,
        alpha: false,
        depth: false,
        powerPreference: 'high-performance',
      });
      if (!gl) {
        this.gl = null;
        return;
      }

      const compile = (type, src) => {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
          console.error('shader:', gl.getShaderInfoLog(sh));
          return null;
        }
        return sh;
      };

      const vs = compile(gl.VERTEX_SHADER, VERT);
      const fs = compile(gl.FRAGMENT_SHADER, FRAG);
      if (!vs || !fs) {
        this.gl = null;
        return;
      }

      const prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error('program:', gl.getProgramInfoLog(prog));
        this.gl = null;
        return;
      }
      gl.useProgram(prog);

      const quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const aPos = gl.getAttribLocation(prog, 'aPos');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      this.u = {};
      for (const name of [
        'uRes', 'uTime', 'uTravel', 'uKick', 'uBass', 'uMid', 'uHigh',
        'uHue', 'uHue2', 'uSym', 'uBuild', 'uBuildPhase', 'uDrop', 'uMode', 'uWave',
      ]) {
        this.u[name] = gl.getUniformLocation(prog, name);
      }

      // 512x1 waveform texture, wrapping so the ring closes seamlessly
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 512, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, this.waveTexData);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(this.u.uWave, 0);

      this.gl = gl;
      this.glStart = performance.now();
    }

    _resize() {
      // cap harder in fullscreen — the shader is fill-rate bound and a retina
      // phone at 1.6x fullscreen is several times the windowed pixel count
      const dpr = Math.min(window.devicePixelRatio || 1, document.fullscreenElement ? 1.2 : 1.6);
      const r = this.canvas.getBoundingClientRect();
      this.canvas.width = Math.max(2, Math.round(r.width * dpr));
      this.canvas.height = Math.max(2, Math.round(r.height * dpr));
      this.dpr = dpr;
      if (this.gl) {
        // Raymarching costs far more per pixel, so the 3D modes get their own
        // ladder rather than multiplying the 2D one — stacking the factors put
        // the low tier at 0.31x, which is an unreadable smear.
        const scale = this.is3D
          ? [0.55, 0.68, 0.82][this.quality]
          : [0.5, 0.72, 1][this.quality];
        this.canvasGL.width = Math.max(2, Math.round(r.width * dpr * scale));
        this.canvasGL.height = Math.max(2, Math.round(r.height * dpr * scale));
        this.gl.viewport(0, 0, this.canvasGL.width, this.canvasGL.height);
      }
    }

    static get STYLES() {
      return ['TUNNEL', 'HYPNO', 'HYPERMAZE', 'MANDALA', 'MAZE RUN', 'FRACTAL'];
    }

    // raymarched styles: far more expensive per pixel, so they render smaller
    get is3D() {
      return this.styleIndex >= 4;
    }

    // 5x5 pixel font (rows top->bottom, 5 bits each, MSB = left column)
    static get FONT() {
      return {
        A: [0b01110, 0b10001, 0b11111, 0b10001, 0b10001],
        B: [0b11110, 0b10001, 0b11110, 0b10001, 0b11110],
        C: [0b01111, 0b10000, 0b10000, 0b10000, 0b01111],
        D: [0b11110, 0b10001, 0b10001, 0b10001, 0b11110],
        E: [0b11111, 0b10000, 0b11110, 0b10000, 0b11111],
        F: [0b11111, 0b10000, 0b11110, 0b10000, 0b10000],
        G: [0b01111, 0b10000, 0b10011, 0b10001, 0b01111],
        H: [0b10001, 0b10001, 0b11111, 0b10001, 0b10001],
        I: [0b11111, 0b00100, 0b00100, 0b00100, 0b11111],
        J: [0b00111, 0b00010, 0b00010, 0b10010, 0b01100],
        K: [0b10010, 0b10100, 0b11000, 0b10100, 0b10010],
        L: [0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
        M: [0b10001, 0b11011, 0b10101, 0b10001, 0b10001],
        N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001],
        O: [0b01110, 0b10001, 0b10001, 0b10001, 0b01110],
        P: [0b11110, 0b10001, 0b11110, 0b10000, 0b10000],
        Q: [0b01110, 0b10001, 0b10101, 0b10010, 0b01101],
        R: [0b11110, 0b10001, 0b11110, 0b10100, 0b10010],
        S: [0b01111, 0b10000, 0b01110, 0b00001, 0b11110],
        T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100],
        U: [0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
        V: [0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
        W: [0b10001, 0b10001, 0b10101, 0b11011, 0b10001],
        X: [0b10001, 0b01010, 0b00100, 0b01010, 0b10001],
        Y: [0b10001, 0b01010, 0b00100, 0b00100, 0b00100],
        Z: [0b11111, 0b00010, 0b00100, 0b01000, 0b11111],
        0: [0b01110, 0b10011, 0b10101, 0b11001, 0b01110],
        1: [0b00100, 0b01100, 0b00100, 0b00100, 0b01110],
        2: [0b01110, 0b10001, 0b00110, 0b01000, 0b11111],
        3: [0b11110, 0b00001, 0b00110, 0b00001, 0b11110],
        4: [0b00110, 0b01010, 0b10010, 0b11111, 0b00010],
        5: [0b11111, 0b10000, 0b11110, 0b00001, 0b11110],
        6: [0b01110, 0b10000, 0b11110, 0b10001, 0b01110],
        7: [0b11111, 0b00010, 0b00100, 0b01000, 0b10000],
        8: [0b01110, 0b10001, 0b01110, 0b10001, 0b01110],
        9: [0b01110, 0b10001, 0b01111, 0b00001, 0b01110],
        ' ': [0, 0, 0, 0, 0],
      };
    }

    // (re)build the word's pixel particles — scattered, so they fly in and
    // assemble under spring physics every time the word changes
    setWord(w) {
      this.word = (w || '').toUpperCase().slice(0, 12);
      const F = Visualizer.FONT;
      this.wordPixels = [];
      const chars = this.word.split('');
      chars.forEach((ch, li) => {
        const glyph = F[ch] || F[' '];
        for (let row = 0; row < 5; row++) {
          for (let col = 0; col < 5; col++) {
            if (!(glyph[row] & (1 << (4 - col)))) continue;
            this.wordPixels.push({
              gc: li * 6 + col, row, li,
              // offsets from home in cell units — start scattered
              ox: (Math.random() - 0.5) * 50,
              oy: (Math.random() - 0.5) * 30,
              vx: 0, vy: 0,
            });
          }
        }
      });
      this.letterEnv = chars.map(() => 0);
    }

    // which 2D overlay elements each style wants on top of the shader
    get overlay() {
      const s = this.styleIndex;
      return {
        arms: s === 0,
        rings: s === 0 || s === 2,
        core: s === 0,
        // the 3D modes already fill the frame; line art on top just muddies it
        particles: !this.is3D,
        wave2d: !this.gl, // 2D waveform ring only in the no-WebGL fallback
      };
    }

    cycleStyle() {
      this.styleIndex = (this.styleIndex + 1) % Visualizer.STYLES.length;
      this._resize(); // 2D and 3D modes render at different scales
      return Visualizer.STYLES[this.styleIndex];
    }

    // Disabling clears both layers once and then early-returns from frame(), so
    // VIZ OFF really costs nothing (it used to keep sampling the analyser and
    // running both draw passes, and kept a full-size backing store behind the
    // collapsed 46px box because _resize only ran on enable).
    setEnabled(on) {
      this.enabled = on;
      if (!on) {
        const c = this.cx2d;
        c.globalCompositeOperation = 'source-over';
        c.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (this.gl) {
          this.gl.clearColor(0.01, 0.004, 0.03, 1);
          this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        }
        this.rings.length = 0;
        this.particles.length = 0;
      }
      // run after the CSS class flip so the collapsed/expanded size is current
      requestAnimationFrame(() => this._resize());
    }

    setPalette(p) {
      this.palette = { ...p };
    }

    /* ---------- events from the sequencer (exact scheduled beat times) ---------- */

    onEvent(e) {
      if (e.type === 'kick') {
        this.kickEnv = 1;
        this.rings.push({ r: 10, v: 260 + 200 * e.vel, hue: this.palette.h2 });
        if (this.rings.length > 24) this.rings.shift();
        // letter-chase: each kick pulses the next letter of the word
        if (this.letterEnv.length) {
          this.kickCount++;
          this.letterEnv[this.kickCount % this.letterEnv.length] = 1;
        }
      } else if (e.type === 'bar') {
        this.barTime = e.time;
      } else if (e.type === 'bass') {
        this.bassEnv = Math.min(1.2, this.bassEnv + 0.55 * e.vel);
      } else if (e.type === 'lead') {
        this._spawnParticles(e.note || 0, e.vel);
      } else if (e.type === 'vox') {
        this._spawnParticles(e.note || 0, e.vel, true); // soft slow halo for voices
      } else if (e.type === 'voice') {
        this._spawnParticles((e.note || 0) * 2, e.vel, true); // voice-note slices
        this.shake = Math.min(1.2, this.shake + 0.1 * e.vel);
      } else if (e.type === 'clap') {
        this.shake = Math.min(1.2, this.shake + 0.14 * e.vel);
      } else if (e.type === 'fx') {
        this.fxFlash = 1;
      } else if (e.type === 'snare') {
        this.shake = Math.min(1.2, this.shake + 0.28 * e.vel);
      } else if (e.type === 'buildstart') {
        this.buildDur = e.dur;
        this.buildUntil = (this.engine.ctx ? this.engine.ctx.currentTime : 0) + e.dur;
        // rings collapsing inward for the length of the build
        const maxR = Math.hypot(this.canvas.width, this.canvas.height) * 0.5;
        for (let k = 0; k < 8; k++) {
          this.rings.push({
            r: maxR * (0.35 + k * 0.1),
            v: -(maxR * (0.35 + k * 0.1)) / (e.dur * (0.6 + k * 0.06)),
            hue: this.palette.h2 + k * 12,
          });
        }
      } else if (e.type === 'drop') {
        this.buildUntil = 0;
        this.dropEnv = 1;
        this.kickEnv = 1.6;
        this.fxFlash = 1;
        this.hueShift += 70;
        for (let k = 0; k < 5; k++) {
          this.rings.push({ r: 12 + k * 8, v: 320 + k * 140, hue: this.palette.h1 + k * 20 });
        }
        // the word explodes radially, then the springs haul it back together
        const cols = this.word.length * 6 - 1;
        for (const p of this.wordPixels) {
          const a = Math.atan2(p.row - 2.5, p.gc - cols / 2) + (Math.random() - 0.5) * 0.6;
          const sp = 40 + Math.random() * 50;
          p.vx += Math.cos(a) * sp;
          p.vy += Math.sin(a) * sp;
        }
      }
    }

    _spawnParticles(deg, vel, soft = false) {
      if (this.quality === 0) return;
      const count = soft ? 5 : this.quality === 2 ? 7 : 4;
      const baseAngle = (deg / (PSY.MAX_DEGREE + 1)) * TAU - Math.PI / 2;
      for (let i = 0; i < count; i++) {
        const a = baseAngle + (Math.random() - 0.5) * (soft ? 1.4 : 0.7);
        const sp = (90 + Math.random() * 180) * (0.6 + vel * 0.5) * (soft ? 0.45 : 1);
        this.particles.push({
          x: 0, y: 0,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: soft ? 1.5 : 1, spin: (Math.random() - 0.5) * (soft ? 2 : 5),
          hue: (soft ? this.palette.h2 : this.palette.h1) + deg * 9,
        });
      }
      if (this.particles.length > 120) this.particles.splice(0, this.particles.length - 120);
    }

    _bands() {
      const an = this.engine.analyser;
      if (!an) return { bass: 0, mid: 0, high: 0 };
      if (!this.freqData || this.freqData.length !== an.frequencyBinCount) {
        this.freqData = new Uint8Array(an.frequencyBinCount);
        this.waveData = new Uint8Array(an.fftSize);
      }
      an.getByteFrequencyData(this.freqData);
      an.getByteTimeDomainData(this.waveData);
      const avg = (a, b) => {
        let s = 0;
        for (let i = a; i < b; i++) s += this.freqData[i];
        return s / ((b - a) * 255);
      };
      // ~23Hz per bin at 48k/2048
      return { bass: avg(1, 9), mid: avg(9, 60), high: avg(60, 220) };
    }

    _buildProgress() {
      if (!this.buildUntil || !this.engine.ctx) return 0;
      const left = this.buildUntil - this.engine.ctx.currentTime;
      if (left <= 0) return 0;
      return Math.min(1, Math.max(0, 1 - left / this.buildDur));
    }

    // kinetic-typography word: every pixel is a spring particle in cell units.
    // Type -> pixels fly in and assemble (with overshoot wobble). Kick -> a
    // pulse chases letter to letter. Build -> escalating tremble. Drop -> the
    // word explodes and springs back. A bar-progress line sweeps underneath.
    _drawWord(c, W, H, dt, bass, high) {
      const word = this.word;
      if (!word || !this.wordPixels.length) return;
      const cols = word.length * 6 - 1; // 5px glyphs + 1px gaps
      const cell = Math.min((W * 0.88) / cols, (H * 0.34) / 5);
      const scale = 1 + 0.07 * this.kickEnv;
      const x0 = (-cols * cell) / 2;
      const y0 = (-5 * cell) / 2;
      const build = this._buildProgress();

      for (let i = 0; i < this.letterEnv.length; i++) {
        this.letterEnv[i] *= Math.exp(-dt * 7);
      }

      // spring physics (underdamped -> assemble/return overshoot reads as mograph)
      const k = 50;
      const damp = 9;
      for (const p of this.wordPixels) {
        if (build > 0) {
          p.vx += (Math.random() - 0.5) * 500 * build * dt;
          p.vy += (Math.random() - 0.5) * 500 * build * dt;
        }
        p.vx += (-k * p.ox - damp * p.vx) * dt;
        p.vy += (-k * p.oy - damp * p.vy) * dt;
        p.ox += p.vx * dt;
        p.oy += p.vy * dt;
      }

      c.save();
      c.scale(scale, scale);
      for (const p of this.wordPixels) {
        const wob = Math.sin(this.rot * 2.2 + p.gc * 0.45) * 0.22 * (0.25 + bass);
        const le = this.letterEnv[p.li] || 0;
        const x = x0 + (p.gc + p.ox) * cell;
        const y = y0 + (p.row + p.oy + wob) * cell;
        const hue = this.palette.h1 + this.hueShift + p.gc * 5 + le * 40;
        const lum = 58 + this.kickEnv * 16 + high * 12 + le * 14;
        c.fillStyle = `hsla(${hue}, 100%, ${lum}%, 0.92)`;
        const s = cell * 0.82 * (1 + 0.22 * le);
        const off = (cell - s) / 2;
        const rr = s * 0.25;
        const px = x + off;
        const py = y + off;
        c.beginPath();
        c.moveTo(px + rr, py);
        c.arcTo(px + s, py, px + s, py + s, rr);
        c.arcTo(px + s, py + s, px, py + s, rr);
        c.arcTo(px, py + s, px, py, rr);
        c.arcTo(px, py, px + s, py, rr);
        c.fill();
      }

      // bar-progress sweep under the word
      if (this.barTime && this.engine.ctx) {
        const barDur = 240 / this.bpm;
        const prog = (this.engine.ctx.currentTime - this.barTime) / barDur;
        if (prog >= 0 && prog <= 1.02) {
          const h2 = this.palette.h2 + this.hueShift * 0.6;
          const yLine = y0 + 5 * cell + cell * 0.9;
          const xEnd = x0 + cols * cell * Math.min(1, prog);
          c.strokeStyle = `hsla(${h2}, 100%, 62%, 0.7)`;
          c.lineWidth = cell * 0.16;
          c.lineCap = 'round';
          c.beginPath();
          c.moveTo(x0, yLine);
          c.lineTo(xEnd, yLine);
          c.stroke();
          c.fillStyle = `hsla(${h2}, 100%, 78%, 0.95)`;
          c.beginPath();
          c.arc(xEnd, yLine, cell * 0.2 * (1 + 0.5 * this.kickEnv), 0, TAU);
          c.fill();
        }
      }
      c.restore();
    }

    /* ---------- per-frame render ---------- */

    frame() {
      const now = performance.now();
      const dt = Math.min(0.05, (now - this._lastT) / 1000);
      this._lastT = now;
      if (!this.enabled) return; // cleared once by setEnabled; cost nothing here

      // Adaptive quality, both directions. Demotion used to be a one-way
      // ratchet: a single rough patch pinned a device at half resolution for
      // the rest of the session. _downSteps bounds the promotions so it can't
      // oscillate between tiers forever.
      if (dt > 0.028) {
        this._fastFrames = 0;
        if (++this._slowFrames > 30 && this.quality > 0) {
          this.quality--;
          this._downSteps = (this._downSteps || 0) + 1;
          this._slowFrames = 0;
          this._resize();
        }
      } else {
        if (this._slowFrames > 0) this._slowFrames--;
        // 0.023 ≈ 43fps: loose enough that a machine sitting in the 45-55 range
        // can climb back out, rather than parking at the low tier forever
        if (dt < 0.023 && this.quality < 2 && (this._downSteps || 0) < 4) {
          if (++this._fastFrames > 150) {
            this.quality++;
            this._fastFrames = 0;
            this._resize();
          }
        }
      }

      const { bass, mid, high } = this._bands();

      this.kickEnv *= Math.exp(-dt * 7);
      this.bassEnv *= Math.exp(-dt * 10);
      this.fxFlash *= Math.exp(-dt * 9);
      this.shake *= Math.exp(-dt * 6);
      this.dropEnv *= Math.exp(-dt * 2.2);
      const build = this._buildProgress();
      if (build > 0) this.buildPhase += dt * TAU * 2.5; // deterministic 2.5 Hz
      this.travel += dt * (0.22 + bass * 0.5 + this.kickEnv * 0.35 + build * 1.4);
      this.rot += dt * (0.25 + 0.5 * (this.bpm / 145)) * (1 + this.kickEnv * 0.8);
      this.hueShift += dt * (8 + this.kickEnv * 40);

      this._drawGL(bass, mid, high, build);
      this._draw2D(dt, bass, mid, high);
    }

    _drawGL(bass, mid, high, build) {
      const gl = this.gl;
      if (!gl) return;
      if (!this.enabled) {
        gl.clearColor(0.01, 0.004, 0.03, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        return;
      }

      // waveform -> 512x1 texture
      if (this.waveData) {
        const stride = Math.floor(this.waveData.length / 512);
        for (let i = 0; i < 512; i++) this.waveTexData[i] = this.waveData[i * stride];
      } else {
        this.waveTexData.fill(128);
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 512, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, this.waveTexData);

      gl.uniform2f(this.u.uRes, this.canvasGL.width, this.canvasGL.height);
      gl.uniform1f(this.u.uTime, (performance.now() - this.glStart) / 1000);
      gl.uniform1f(this.u.uTravel, this.travel);
      gl.uniform1f(this.u.uKick, this.kickEnv);
      gl.uniform1f(this.u.uBass, bass);
      gl.uniform1f(this.u.uMid, mid);
      gl.uniform1f(this.u.uHigh, high);
      gl.uniform1f(this.u.uHue, ((this.palette.h1 + this.hueShift * 0.5) % 360) / 360);
      gl.uniform1f(this.u.uHue2, ((this.palette.h2 + this.hueShift * 0.3) % 360) / 360);
      gl.uniform1f(this.u.uSym, this.palette.sym);
      gl.uniform1f(this.u.uBuild, build);
      gl.uniform1f(this.u.uBuildPhase, this.buildPhase);
      gl.uniform1f(this.u.uDrop, this.dropEnv);
      gl.uniform1f(this.u.uMode, this.styleIndex);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    _draw2D(dt, bass, mid, high) {
      const c = this.cx2d;
      const W = this.canvas.width;
      const H = this.canvas.height;

      // trail fade: erase toward transparency over the GL layer,
      // or paint dark if we're the only layer (no WebGL)
      if (this.gl) {
        c.globalCompositeOperation = 'destination-out';
        c.fillStyle = 'rgba(0, 0, 0, 0.26)';
        c.fillRect(0, 0, W, H);
      } else {
        c.globalCompositeOperation = 'source-over';
        c.fillStyle = 'rgba(3, 1, 8, 0.22)';
        c.fillRect(0, 0, W, H);
      }

      if (!this.enabled) return;

      const cx = W / 2;
      const cy = H / 2;
      const minDim = Math.min(W, H);
      const R = minDim * 0.14 * (1 + 0.45 * this.kickEnv + 0.35 * bass);
      const sym = this.palette.sym;
      const h1 = this.palette.h1 + this.hueShift;
      const h2 = this.palette.h2 + this.hueShift * 0.6;

      c.globalCompositeOperation = 'lighter';
      c.save();
      const shakePx = this.shake * 9 * this.dpr;
      c.translate(
        cx + (Math.random() - 0.5) * shakePx,
        cy + (Math.random() - 0.5) * shakePx
      );

      // ---- kick-spawned polygon rings ----
      const show = this.overlay;
      const maxR = Math.hypot(W, H) * 0.55;
      if (!show.rings) this.rings.length = 0;
      for (let i = this.rings.length - 1; i >= 0; i--) {
        const ring = this.rings[i];
        ring.r += ring.v * dt * (ring.v > 0 ? (1 + bass * 0.8) * this.dpr : 1);
        if (ring.r > maxR || ring.r < 8) {
          this.rings.splice(i, 1);
          continue;
        }
        const alpha = Math.max(0, 1 - ring.r / maxR) * 0.45;
        c.strokeStyle = `hsla(${ring.hue + this.hueShift}, 100%, 62%, ${alpha})`;
        c.lineWidth = (1.5 + this.kickEnv * 2.5) * this.dpr;
        c.beginPath();
        const sides = Math.max(3, sym);
        for (let s = 0; s <= sides; s++) {
          const a = this.rot * 0.5 + (s / sides) * TAU;
          c[s === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * ring.r, Math.sin(a) * ring.r);
        }
        c.stroke();
      }

      // ---- mandala (N-fold mirrored geometry) ----
      const arms = !show.arms ? 0 : this.quality === 0 ? Math.min(sym, 6) : sym;
      const armLen = R * 2.1 * (1 + mid * 0.5);
      const elbow = R * (1.1 + mid * 0.9);
      const wob = Math.sin(this.rot * 3) * R * 0.25;
      for (let k = 0; k < arms; k++) {
        for (let m = 0; m < 2; m++) {
          c.save();
          c.rotate((k / arms) * TAU + this.rot * (m ? -1 : 1));
          if (m) c.scale(1, -1);
          c.strokeStyle = `hsla(${h1 + k * 6}, 100%, ${58 + this.kickEnv * 18}%, 0.55)`;
          c.lineWidth = (1.2 + this.kickEnv * 1.8) * this.dpr;
          c.beginPath();
          c.moveTo(R * 0.25, 0);
          c.quadraticCurveTo(elbow, wob, armLen, R * 0.4);
          c.stroke();
          // node triangle at the arm tip
          c.fillStyle = `hsla(${h2 + k * 8}, 100%, 60%, ${0.3 + this.kickEnv * 0.4})`;
          const ts = (4 + 7 * this.kickEnv + 5 * high) * this.dpr;
          c.beginPath();
          c.moveTo(armLen, R * 0.4 - ts);
          c.lineTo(armLen + ts, R * 0.4 + ts);
          c.lineTo(armLen - ts, R * 0.4 + ts);
          c.closePath();
          c.fill();
          c.restore();
        }
      }

      // ---- 2D-only extras when WebGL is unavailable: waveform ring ----
      if (show.wave2d && this.waveData && this.quality > 0) {
        const wr = R * 1.85;
        const N = 180;
        const stride = Math.floor(this.waveData.length / N);
        c.strokeStyle = `hsla(${h2}, 100%, 65%, 0.75)`;
        c.lineWidth = (1.4 + this.bassEnv * 1.6) * this.dpr;
        c.beginPath();
        for (let i = 0; i <= N; i++) {
          const v = (this.waveData[(i % N) * stride] - 128) / 128;
          const rad = wr + v * R * (0.55 + bass * 0.8);
          const a = (i / N) * TAU + this.rot * 0.3;
          c[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * rad, Math.sin(a) * rad);
        }
        c.closePath();
        c.stroke();
      }

      // ---- particles (lead notes, angle mapped to pitch) ----
      if (!show.particles) this.particles.length = 0;
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const pt = this.particles[i];
        pt.life -= dt * 1.3;
        if (pt.life <= 0) {
          this.particles.splice(i, 1);
          continue;
        }
        pt.x += pt.vx * dt * this.dpr;
        pt.y += pt.vy * dt * this.dpr;
        const a = Math.atan2(pt.y, pt.x) + pt.spin * dt;
        const d = Math.hypot(pt.x, pt.y);
        pt.x = Math.cos(a) * d;
        pt.y = Math.sin(a) * d;
        c.fillStyle = `hsla(${pt.hue + this.hueShift}, 100%, 68%, ${pt.life * 0.8})`;
        const sz = (1.5 + 3 * pt.life) * this.dpr;
        c.fillRect(pt.x - sz / 2, pt.y - sz / 2, sz, sz);
      }

      // ---- pixel word (kinetic typography riding the beat) ----
      this._drawWord(c, W, H, dt, bass, high);

      // ---- center core glow ----
      if (show.core) {
        const coreR = R * (0.5 + 0.3 * this.kickEnv);
        const grad = c.createRadialGradient(0, 0, 0, 0, 0, coreR * 2);
        grad.addColorStop(0, `hsla(${h1}, 100%, 70%, ${0.4 + this.kickEnv * 0.4})`);
        grad.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
        c.fillStyle = grad;
        c.beginPath();
        c.arc(0, 0, coreR * 2, 0, TAU);
        c.fill();
      }

      c.restore();

      // fx flash: brief edge glow
      if (this.fxFlash > 0.02) {
        c.strokeStyle = `hsla(${h2 + 60}, 100%, 70%, ${this.fxFlash * 0.5})`;
        c.lineWidth = 6 * this.dpr;
        c.strokeRect(3, 3, W - 6, H - 6);
      }

      c.globalCompositeOperation = 'source-over';
    }
  }

  PSY.Visualizer = Visualizer;
})();
