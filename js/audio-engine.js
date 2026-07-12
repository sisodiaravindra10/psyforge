/* PSYFORGE — Web Audio synthesis engine. Every sound is generated from
   oscillators and noise; envelope/filter numbers follow classic psytrance
   production practice (pitch-swept kick, rolling filtered bass, 303 acid). */
(function () {
  const PSY = (window.PSY = window.PSY || {});

  class Engine {
    // psy-flavored defaults; presets override per genre (EDM: boomy kick, deep pump)
    static get DEFAULTS() {
      return {
        bassCutoff: 780,
        bassDecay: 0.055,
        bassWave: 'sawtooth',
        leadStyle: 'saws', // 'acid' | 'saws' | 'fm' | 'pluck' | 'chord'
        leadRes: 6,
        leadEnv: 2600,
        delayMix: 0.22,
        drive: 0.45,
        kickTune: 50,
        kickAttack: 1700, // pitch-sweep start Hz — 1700 = psy click, ~350 = EDM boom
        kickDecay: 0.24,
        duckDepth: 0.45,  // sidechain floor — lower = deeper EDM pump
        duckRelease: 0.13,
        clapTone: 1150,   // clap bandpass center — ~2000 = dhol "ta" slap
        master: 0.85,
      };
    }

    constructor() {
      this.ctx = null;
      this.params = Engine.DEFAULTS;
      this.levels = { kick: 0.95, clap: 0.55, bass: 0.9, chat: 0.4, ohat: 0.45, lead: 0.6, vox: 0.6, fx: 0.5 };
      this.mutes = { kick: false, clap: false, bass: false, chat: false, ohat: false, lead: false, vox: false, fx: false };
      this.tracks = {};
      this.analyser = null;
      this._lastLeadFreq = null;
      this._lastVoxFreq = null;
    }

    // formant frequencies (F1/F2/F3) for the vox voice
    static get FORMANTS() {
      return {
        ah: [700, 1220, 2600],
        oh: [500, 900, 2400],
        oo: [325, 700, 2530],
        eh: [580, 1800, 2500],
        ee: [270, 2300, 3000],
      };
    }

    // pass an OfflineAudioContext to build the same graph for WAV rendering
    init(ctx) {
      if (this.ctx) return;
      ctx = this.ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();

      // master chain: tracks -> [duck] -> master -> comp -> softclip -> analyser -> out
      this.master = ctx.createGain();
      this.master.gain.value = this.params.master;

      this.comp = ctx.createDynamicsCompressor();
      this.comp.threshold.value = -12;
      this.comp.knee.value = 8;
      this.comp.ratio.value = 5;
      this.comp.attack.value = 0.003;
      this.comp.release.value = 0.16;

      this.clip = ctx.createWaveShaper();
      this.clip.curve = Engine.softClipCurve(1.4);
      this.clip.oversample = '2x';

      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;

      this.master.connect(this.comp);
      this.comp.connect(this.clip);
      this.clip.connect(this.analyser);
      this.analyser.connect(ctx.destination);

      // sidechain duck bus (bass/lead/fx/delays duck under the kick)
      this.duck = ctx.createGain();
      this.duck.connect(this.master);

      // build bus (snare rolls / risers / crash) — bypasses the duck
      this.buildGain = ctx.createGain();
      this.buildGain.gain.value = 0.9;
      this.buildGain.connect(this.master);

      for (const name of ['kick', 'clap', 'bass', 'chat', 'ohat', 'lead', 'vox', 'fx']) {
        const g = ctx.createGain();
        g.gain.value = this.mutes[name] ? 0 : this.levels[name];
        if (name === 'bass' || name === 'lead' || name === 'vox' || name === 'fx') g.connect(this.duck);
        else g.connect(this.master);
        this.tracks[name] = g;
      }

      // bass drive waveshaper feeding the bass track gain
      this.bassDrive = ctx.createWaveShaper();
      this.bassDrive.oversample = '2x';
      this.bassDrive.connect(this.tracks.bass);
      this._updateDrive();

      // ping-pong delay bus (3/16 L, 1/8 R, cross feedback) for lead & fx
      this.delayIn = ctx.createGain();
      this.delayL = ctx.createDelay(2);
      this.delayR = ctx.createDelay(2);
      const fbL = ctx.createGain();
      const fbR = ctx.createGain();
      fbL.gain.value = 0.42;
      fbR.gain.value = 0.42;
      const panL = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
      const panR = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
      if (panL.pan) { panL.pan.value = -0.65; panR.pan.value = 0.65; }
      const delayHP = ctx.createBiquadFilter();
      delayHP.type = 'highpass';
      delayHP.frequency.value = 250;

      this.delayIn.connect(delayHP);
      delayHP.connect(this.delayL);
      this.delayL.connect(fbL);
      fbL.connect(this.delayR);
      this.delayR.connect(fbR);
      fbR.connect(this.delayL);
      const dOut = ctx.createGain();
      dOut.gain.value = 0.85;
      this.delayL.connect(panL);
      this.delayR.connect(panR);
      panL.connect(dOut);
      panR.connect(dOut);
      dOut.connect(this.duck);

      // shared noise buffer for hats
      const len = ctx.sampleRate * 2;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      this.setTempo(145);
    }

    static softClipCurve(k) {
      const n = 1024;
      const curve = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        curve[i] = Math.tanh(k * x);
      }
      return curve;
    }

    _updateDrive() {
      if (!this.bassDrive) return;
      const k = 1 + this.params.drive * 6;
      this.bassDrive.curve = Engine.softClipCurve(k);
    }

    setParam(name, value) {
      this.params[name] = value;
      if (name === 'drive') this._updateDrive();
      if (name === 'master' && this.master) {
        this.master.gain.setTargetAtTime(value, this.ctx.currentTime, 0.03);
      }
    }

    setTrackLevel(name, v) {
      this.levels[name] = v;
      if (this.tracks[name] && !this.mutes[name]) {
        this.tracks[name].gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
      }
    }

    setMute(name, muted) {
      this.mutes[name] = muted;
      if (this.tracks[name]) {
        this.tracks[name].gain.setTargetAtTime(muted ? 0 : this.levels[name], this.ctx.currentTime, 0.02);
      }
    }

    setTempo(bpm) {
      if (!this.ctx) return;
      const beat = 60 / bpm;
      if (!this._tempoInit) {
        // jump directly before any audio flows (delayTime defaults to 0)
        this._tempoInit = true;
        this.delayL.delayTime.value = beat * 0.75;
        this.delayR.delayTime.value = beat * 0.5;
        return;
      }
      const now = this.ctx.currentTime;
      this.delayL.delayTime.setTargetAtTime(beat * 0.75, now, 0.1); // dotted 8th
      this.delayR.delayTime.setTargetAtTime(beat * 0.5, now, 0.1);  // 8th
    }

    /* ---------- voices ---------- */

    // kick: sine with exponential pitch sweep. High start freq (~1700 Hz) makes
    // the tight clicky psy kick; low start (~350 Hz) + long decay = EDM boom.
    kick(t, vel = 1) {
      const ctx = this.ctx;
      const p = this.params;
      const o = ctx.createOscillator();
      o.type = 'sine';
      const g = ctx.createGain();
      const tune = Math.max(35, p.kickTune);
      const start = Math.max(tune + 40, p.kickAttack);
      const dec = Math.max(0.15, p.kickDecay);
      o.frequency.setValueAtTime(start, t);
      o.frequency.exponentialRampToValueAtTime(tune, t + (start > 800 ? 0.045 : 0.03));
      o.frequency.exponentialRampToValueAtTime(Math.max(tune * 0.82, 30), t + dec * 0.85);
      g.gain.setValueAtTime(1.05 * vel, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      o.connect(g);
      g.connect(this.tracks.kick);
      o.start(t);
      o.stop(t + dec + 0.05);

      // transient click — snap for boomy kicks whose sweep alone is soft
      const click = ctx.createBufferSource();
      click.buffer = this.noiseBuf;
      const chp = ctx.createBiquadFilter();
      chp.type = 'highpass';
      chp.frequency.value = 2800;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime((start > 800 ? 0.1 : 0.3) * vel, t);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
      click.connect(chp);
      chp.connect(cg);
      cg.connect(this.tracks.kick);
      click.start(t);
      click.stop(t + 0.02);

      this.duckAt(t);
    }

    duckAt(t) {
      const g = this.duck.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(this.params.duckDepth, t);
      g.linearRampToValueAtTime(1, t + this.params.duckRelease);
    }

    // 909-style clap: three fast noise re-triggers + a body tail
    clap(t, vel = 1) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = this.params.clapTone;
      bp.Q.value = 1.1;
      const g = ctx.createGain();
      const a = 0.6 * vel;
      g.gain.setValueAtTime(a, t);
      g.gain.exponentialRampToValueAtTime(a * 0.15, t + 0.01);
      g.gain.setValueAtTime(a * 0.9, t + 0.012);
      g.gain.exponentialRampToValueAtTime(a * 0.15, t + 0.022);
      g.gain.setValueAtTime(a, t + 0.026);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      src.connect(bp);
      bp.connect(g);
      g.connect(this.tracks.clap);
      src.start(t);
      src.stop(t + 0.2);
    }

    // vox: formant-synthesized human vowel — two detuned saws with delayed
    // vibrato through three parallel bandpass filters at vowel formants.
    // The onset drift (formants sliding up into place) sells the "voice".
    vox(t, freq, vel = 1, dur = 0.2, vowel = 'ah', glide = false) {
      const ctx = this.ctx;
      const p = this.params;
      const F = Engine.FORMANTS[vowel] || Engine.FORMANTS.ah;
      const from = glide && this._lastVoxFreq ? this._lastVoxFreq : null;
      this._lastVoxFreq = freq;

      const srcMix = ctx.createGain();
      const oscs = [];
      for (const det of [-8, 8]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.detune.value = det;
        o.frequency.setValueAtTime(from || freq, t);
        if (from) o.frequency.exponentialRampToValueAtTime(freq, t + 0.07);
        o.connect(srcMix);
        oscs.push(o);
      }

      // vibrato fading in — static pitch reads synth, wobble reads singer
      const vib = ctx.createOscillator();
      vib.type = 'sine';
      vib.frequency.value = 5.2;
      const vibG = ctx.createGain();
      vibG.gain.setValueAtTime(0, t);
      vibG.gain.linearRampToValueAtTime(freq * 0.009, t + Math.min(0.35, dur));
      vib.connect(vibG);
      for (const o of oscs) vibG.connect(o.frequency);

      const amp = ctx.createGain();
      const peak = 1.15 * vel;
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(peak, t + 0.015);
      amp.gain.linearRampToValueAtTime(peak * 0.75, t + 0.06);
      amp.gain.setValueAtTime(peak * 0.75, t + dur);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.09);

      const fGains = [1.0, 0.55, 0.22];
      for (let i = 0; i < 3; i++) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(F[i] * 0.72, t);
        bp.frequency.exponentialRampToValueAtTime(F[i], t + 0.07);
        bp.Q.value = Math.max(4, F[i] / 130);
        const fg = ctx.createGain();
        fg.gain.value = fGains[i];
        srcMix.connect(bp);
        bp.connect(fg);
        fg.connect(amp);
      }

      amp.connect(this.tracks.vox);
      const send = ctx.createGain();
      send.gain.value = Math.min(0.5, p.delayMix * 0.8);
      amp.connect(send);
      send.connect(this.delayIn);

      const end = t + dur + 0.15;
      for (const o of oscs) {
        o.start(t);
        o.stop(end);
      }
      vib.start(t);
      vib.stop(end);
    }

    // rolling bass: saw/square through 24dB/oct lowpass, fast filter+amp decay
    bass(t, freq, vel = 1) {
      const ctx = this.ctx;
      const p = this.params;

      const o = ctx.createOscillator();
      o.type = p.bassWave;
      o.frequency.value = freq;

      const body = ctx.createOscillator(); // sine layer for low-end weight
      body.type = 'sine';
      body.frequency.value = freq;
      const bodyG = ctx.createGain();
      bodyG.gain.value = 0.5;

      const f1 = ctx.createBiquadFilter();
      const f2 = ctx.createBiquadFilter();
      f1.type = f2.type = 'lowpass';
      f1.Q.value = 0.8;
      f2.Q.value = 2.2;

      const peak = Math.min(4000, Math.max(150, p.bassCutoff * (0.6 + 0.55 * vel)));
      const fallTime = Math.max(0.05, p.bassDecay * 1.3);
      for (const f of [f1, f2]) {
        f.frequency.setValueAtTime(peak, t);
        f.frequency.exponentialRampToValueAtTime(100, t + fallTime);
      }

      const g = ctx.createGain();
      const decay = Math.max(0.06, p.bassDecay * 2.4);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.9 * vel, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);

      o.connect(f1);
      body.connect(bodyG);
      bodyG.connect(f1);
      f1.connect(f2);
      f2.connect(g);
      g.connect(this.bassDrive);

      o.start(t);
      body.start(t);
      const end = t + decay + 0.08;
      o.stop(end);
      body.stop(end);
    }

    // hats: filtered noise bursts; open hat = the classic psy offbeat
    hat(t, vel = 1, open = false) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      src.playbackRate.value = 1 + Math.random() * 0.04;

      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = open ? 6800 : 7900;
      hp.Q.value = 0.7;

      const g = ctx.createGain();
      const peakLevel = (open ? 0.5 : 0.4) * vel;
      const decay = open ? 0.18 : 0.045;
      g.gain.setValueAtTime(peakLevel, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);

      src.connect(hp);
      hp.connect(g);
      g.connect(this.tracks[open ? 'ohat' : 'chat']);
      src.start(t);
      src.stop(t + decay + 0.03);
    }

    // lead voice: 303 acid / detuned full-on saws / FM squelch /
    // Avicii-style pluck / supersaw chord stab (freq passed as an array)
    lead(t, freq, vel = 1, glide = false) {
      const ctx = this.ctx;
      const p = this.params;
      if (Array.isArray(freq)) return this._chord(t, freq, vel);
      const style = p.leadStyle;
      const from = glide && this._lastLeadFreq ? this._lastLeadFreq : null;
      this._lastLeadFreq = freq;

      const out = ctx.createGain();
      out.connect(this.tracks.lead);
      const send = ctx.createGain();
      send.gain.value = p.delayMix;
      out.connect(send);
      send.connect(this.delayIn);

      if (style === 'fm') {
        // FM squelch: sine carrier, modulator ~2.6x, swept index
        const car = ctx.createOscillator();
        car.type = 'sine';
        const mod = ctx.createOscillator();
        mod.type = 'sine';
        const modG = ctx.createGain();
        car.frequency.setValueAtTime(from || freq, t);
        if (from) car.frequency.exponentialRampToValueAtTime(freq, t + 0.05);
        mod.frequency.setValueAtTime((from || freq) * 2.6, t);
        if (from) mod.frequency.exponentialRampToValueAtTime(freq * 2.6, t + 0.05);
        modG.gain.setValueAtTime(freq * (4 + 9 * vel), t);
        modG.gain.exponentialRampToValueAtTime(freq * 0.3, t + 0.14);
        mod.connect(modG);
        modG.connect(car.frequency);

        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.45 * vel, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        car.connect(g);
        g.connect(out);
        car.start(t);
        mod.start(t);
        car.stop(t + 0.25);
        mod.stop(t + 0.25);
        return;
      }

      if (style === 'tumbi') {
        // tumbi: twangy high one-string pluck — grace-note bend into the pitch,
        // saw + octave square, bright filter snapping shut fast
        const o1 = ctx.createOscillator();
        o1.type = 'sawtooth';
        const o2 = ctx.createOscillator();
        o2.type = 'square';
        o2.detune.value = 1205; // octave up, slightly sharp = twang
        const g2 = ctx.createGain();
        g2.gain.value = 0.35;
        for (const o of [o1, o2]) {
          o.frequency.setValueAtTime(freq * 1.07, t);
          o.frequency.exponentialRampToValueAtTime(freq, t + 0.035);
        }

        const fil = ctx.createBiquadFilter();
        fil.type = 'lowpass';
        fil.Q.value = 3;
        fil.frequency.setValueAtTime(4200, t);
        fil.frequency.exponentialRampToValueAtTime(1600, t + 0.12);

        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.42 * vel, t + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);

        o1.connect(fil);
        o2.connect(g2);
        g2.connect(fil);
        fil.connect(g);
        g.connect(out);
        send.gain.value = Math.min(0.5, p.delayMix);
        for (const o of [o1, o2]) {
          o.start(t);
          o.stop(t + 0.3);
        }
        return;
      }

      if (style === 'pluck') {
        // Avicii pluck: bright triangle+saw pair, fast filter drop, long echo
        const o1 = ctx.createOscillator();
        o1.type = 'triangle';
        const o2 = ctx.createOscillator();
        o2.type = 'sawtooth';
        o2.detune.value = 6;
        for (const o of [o1, o2]) o.frequency.setValueAtTime(freq, t);

        const fil = ctx.createBiquadFilter();
        fil.type = 'lowpass';
        fil.Q.value = 2;
        fil.frequency.setValueAtTime(500 + p.leadEnv * (0.5 + 0.7 * vel), t);
        fil.frequency.exponentialRampToValueAtTime(320, t + 0.12);

        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.42 * vel, t + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);

        o1.connect(fil);
        o2.connect(fil);
        fil.connect(g);
        g.connect(out);
        send.gain.value = Math.min(0.6, p.delayMix * 1.25); // pluck lives on its echoes
        for (const o of [o1, o2]) {
          o.start(t);
          o.stop(t + 0.45);
        }
        return;
      }

      const oscs = [];
      const o1 = ctx.createOscillator();
      o1.type = 'sawtooth';
      oscs.push(o1);
      if (style === 'saws') {
        const o2 = ctx.createOscillator();
        o2.type = 'sawtooth';
        o2.detune.value = 9;
        o1.detune.value = -9;
        oscs.push(o2);
      }
      for (const o of oscs) {
        o.frequency.setValueAtTime(from || freq, t);
        if (from) o.frequency.exponentialRampToValueAtTime(freq, t + 0.055);
        else o.frequency.setValueAtTime(freq, t);
      }

      const fil = ctx.createBiquadFilter();
      fil.type = 'lowpass';
      fil.Q.value = style === 'acid' ? p.leadRes : Math.min(p.leadRes, 5);
      const base = 260;
      const peak = base + p.leadEnv * (0.3 + 0.7 * vel);
      fil.frequency.setValueAtTime(peak, t);
      fil.frequency.exponentialRampToValueAtTime(base, t + (style === 'acid' ? 0.16 : 0.3));

      const g = ctx.createGain();
      const lvl = (style === 'acid' ? 0.42 : 0.3) * vel;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(lvl, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (style === 'acid' ? 0.28 : 0.34));

      for (const o of oscs) {
        o.connect(fil);
        o.start(t);
        o.stop(t + 0.4);
      }
      fil.connect(g);
      g.connect(out);
    }

    // anthem-house chord stab: detuned saw pair per chord note, pumped by the duck
    _chord(t, freqs, vel = 1) {
      const ctx = this.ctx;
      const p = this.params;
      const out = ctx.createGain();
      out.connect(this.tracks.lead);
      const send = ctx.createGain();
      send.gain.value = p.delayMix * 0.8;
      out.connect(send);
      send.connect(this.delayIn);

      const fil = ctx.createBiquadFilter();
      fil.type = 'lowpass';
      fil.Q.value = 1;
      fil.frequency.setValueAtTime(900 + p.leadEnv * 0.6 * vel, t);
      fil.frequency.exponentialRampToValueAtTime(600, t + 0.3);

      const g = ctx.createGain();
      const lvl = (0.5 / Math.sqrt(freqs.length)) * vel;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(lvl, t + 0.005);
      g.gain.setValueAtTime(lvl, t + 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);

      for (const f of freqs) {
        for (const det of [-8, 8]) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = f;
          o.detune.value = det;
          o.connect(fil);
          o.start(t);
          o.stop(t + 0.4);
        }
      }
      fil.connect(g);
      g.connect(out);
    }

    // build snare: noise crack + pitched body, vel raises pitch through the roll
    snare(t, vel = 1) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1500 + 1400 * vel;
      bp.Q.value = 0.7;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.55 * vel, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      src.connect(bp);
      bp.connect(ng);
      ng.connect(this.buildGain);
      src.start(t);
      src.stop(t + 0.12);

      const body = ctx.createOscillator();
      body.type = 'sine';
      const f0 = 175 + 90 * vel;
      body.frequency.setValueAtTime(f0, t);
      body.frequency.exponentialRampToValueAtTime(f0 * 0.75, t + 0.05);
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0.4 * vel, t);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      body.connect(bg);
      bg.connect(this.buildGain);
      body.start(t);
      body.stop(t + 0.08);
    }

    // rising noise sweep spanning the whole build, cut dead at the drop
    riser(t, dur) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.4;
      bp.frequency.setValueAtTime(350, t);
      bp.frequency.exponentialRampToValueAtTime(4800, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.02, t);
      g.gain.exponentialRampToValueAtTime(0.4, t + dur);
      g.gain.setValueAtTime(0.0001, t + dur);
      const send = ctx.createGain();
      send.gain.value = 0.15;
      src.connect(bp);
      bp.connect(g);
      g.connect(this.buildGain);
      g.connect(send);
      send.connect(this.delayIn);
      src.start(t);
      src.stop(t + dur + 0.02);
    }

    // crash on the drop: long bright noise wash
    crash(t, vel = 1) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 4500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.45 * vel, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      const send = ctx.createGain();
      send.gain.value = 0.2;
      src.connect(hp);
      hp.connect(g);
      g.connect(this.buildGain);
      g.connect(send);
      send.connect(this.delayIn);
      src.start(t);
      src.stop(t + 1.4);
    }

    // dark-psy zap: FM'd fast pitch-drop laser into the delay web
    zap(t, vel = 1, seed = 0) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      o.type = 'sine';
      const startF = 1400 + (seed % 4) * 420;
      o.frequency.setValueAtTime(startF, t);
      o.frequency.exponentialRampToValueAtTime(90, t + 0.09);

      const mod = ctx.createOscillator();
      mod.type = 'square';
      mod.frequency.value = 170 + (seed % 3) * 60;
      const modG = ctx.createGain();
      modG.gain.setValueAtTime(700, t);
      modG.gain.exponentialRampToValueAtTime(1, t + 0.1);
      mod.connect(modG);
      modG.connect(o.frequency);

      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 280;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.55 * vel, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);

      const send = ctx.createGain();
      send.gain.value = Math.min(0.6, this.params.delayMix + 0.2);

      o.connect(hp);
      hp.connect(g);
      g.connect(this.tracks.fx);
      g.connect(send);
      send.connect(this.delayIn);
      o.start(t);
      mod.start(t);
      o.stop(t + 0.16);
      mod.stop(t + 0.16);
    }
  }

  PSY.Engine = Engine;
})();
