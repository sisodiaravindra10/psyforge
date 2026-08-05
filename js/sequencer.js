/* PSYFORGE — lookahead step sequencer.
   setInterval polls every 25ms and schedules everything falling in the next
   120ms on the AudioContext clock (the standard "tale of two clocks" pattern),
   so timing is sample-accurate regardless of UI jank.

   Patterns live in four slots (A–D). In LOOP mode the current slot repeats;
   in SONG mode the chain (a list of slot letters, one bar each) plays through.
   Odd 16ths can be swung, and a 2-bar accelerating snare-roll build can be
   armed to start at the next bar boundary. */
(function () {
  const PSY = (window.PSY = window.PSY || {});

  const TRACKS = ['kick', 'clap', 'bass', 'chat', 'ohat', 'lead', 'vox', 'voice', 'fx'];
  const SLOTS = ['A', 'B', 'C', 'D'];

  class Sequencer {
    constructor(engine) {
      this.engine = engine;
      this.bpm = 145;
      this.rootMidi = 28; // E1
      this.scale = 'phrygian';
      this.swing = 0; // 0..0.4 of a step on odd 16ths
      this.playing = false;
      this.step = 0;
      this.absStep = 0;
      this.nextTime = 0;
      this.timer = null;
      this.lookaheadMs = 25;
      this.scheduleAhead = 0.12;
      this.events = []; // {type, time, ...} consumed by UI/viz

      this.patterns = {};
      for (const s of SLOTS) this.patterns[s] = Sequencer.emptyPattern();
      this.currentSlot = 'A';
      this.chain = []; // e.g. ['A','A','B','D'] — one bar per entry
      this.mode = 'loop'; // 'loop' | 'song'

      this.buildPending = false;
      this.buildActive = false;
      this.buildStartBar = 0;
      this.buildBars = 2;
    }

    static get TRACKS() {
      return TRACKS;
    }

    static get SLOTS() {
      return SLOTS;
    }

    // fx one-shots, indexed by the fx step's `note` field (0 = the legacy zap)
    static get FX_KINDS() {
      return ['zap', 'snare', 'riser', 'crash'];
    }

    static emptyPattern() {
      const p = {};
      for (const t of TRACKS) {
        p[t] = Array.from({ length: 16 }, () => ({ on: false, vel: 0.85, note: 0, vowel: 'ah' }));
      }
      p.auto = {}; // recorded macro automation: {param: [16 values or null]}
      return p;
    }

    static copyPattern(pat) {
      const p = {};
      for (const t of TRACKS) {
        // presets may omit newer tracks (e.g. voice) — fall back to empty
        p[t] = pat[t]
          ? pat[t].map((s) => ({ ...s }))
          : Array.from({ length: 16 }, () => ({ on: false, vel: 0.85, note: 0, vowel: 'ah' }));
      }
      p.auto = pat.auto ? JSON.parse(JSON.stringify(pat.auto)) : {};
      return p;
    }

    // the pattern currently being edited/looped
    get pattern() {
      return this.patterns[this.currentSlot];
    }

    loadTracks(tracks) {
      this.patterns[this.currentSlot] = Sequencer.copyPattern(tracks);
    }

    get stepDur() {
      return 60 / this.bpm / 4;
    }

    get barDur() {
      return this.stepDur * 16;
    }

    // chain entries are {s: 'A', t: semitones} — tolerate legacy plain strings
    chainEntry(bar) {
      const c = this.chain[bar % this.chain.length];
      return typeof c === 'string' ? { s: c, t: 0 } : c;
    }

    slotForBar(bar) {
      if (this.mode === 'song' && this.chain.length) {
        return this.chainEntry(bar).s;
      }
      return this.currentSlot;
    }

    // per-bar chord movement: the whole bar's bass/lead/vox transpose
    transposeForBar(bar) {
      if (this.mode === 'song' && this.chain.length) {
        return this.chainEntry(bar).t || 0;
      }
      return 0;
    }

    patternForBar(bar) {
      return this.patterns[this.slotForBar(bar)];
    }

    start() {
      if (this.playing) return;
      const fresh = !this.engine.ctx;
      this.engine.init();
      const ctx = this.engine.ctx;
      if (ctx.state === 'suspended') ctx.resume();
      // on a brand-new context init() already used the hard-set branch at
      // 145 BPM; clear it so the real tempo lands instantly instead of gliding
      if (fresh) this.engine._tempoInit = false;
      this.engine.setTempo(this.bpm);
      this.playing = true;
      this.step = 0;
      this.absStep = 0;
      this.buildPending = false;
      this.buildActive = false;
      this.nextTime = ctx.currentTime + 0.08;
      this.timer = setInterval(() => this._tick(), this.lookaheadMs);
    }

    stop() {
      this.playing = false;
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this.buildPending = false;
      this.buildActive = false;
      this.events.length = 0;
    }

    toggle() {
      this.playing ? this.stop() : this.start();
    }

    setBpm(bpm) {
      this.bpm = bpm;
      if (this.engine.ctx) this.engine.setTempo(bpm);
    }

    // queue a snare-roll build starting at the next bar boundary
    armBuild() {
      if (this.playing && !this.buildActive) this.buildPending = true;
    }

    _tick() {
      const ctx = this.engine.ctx;
      // Resync if the main thread stalled past our lookahead. Without this we
      // schedule every missed step at a time already in the past and Web Audio
      // fires them all at once (a machine-gun burst), and the live-quantize
      // math in the UI (which derives the current step from nextTime) breaks.
      if (this.nextTime < ctx.currentTime) {
        const missed = Math.floor((ctx.currentTime - this.nextTime) / this.stepDur) + 1;
        this.step = (this.step + missed) % 16;
        this.absStep += missed;
        this.nextTime += missed * this.stepDur;
      }
      while (this.nextTime < ctx.currentTime + this.scheduleAhead) {
        this._scheduleStep(this.step, this.nextTime);
        this.nextTime += this.stepDur;
        this.step = (this.step + 1) % 16;
        this.absStep++;
      }
    }

    _scheduleStep(i, baseT) {
      const t = i % 2 ? baseT + this.swing * this.stepDur : baseT;
      const bar = Math.floor(this.absStep / 16);
      const pat = this.patternForBar(bar);

      if (i === 0) {
        const chainIndex =
          this.mode === 'song' && this.chain.length ? bar % this.chain.length : -1;
        this.events.push({ type: 'bar', time: t, slot: this.slotForBar(bar), chainIndex });

        if (this.buildActive && bar >= this.buildStartBar + this.buildBars) {
          // the drop
          this.buildActive = false;
          this.engine.crash(t);
          this.engine.zap(t, 1.1, 0);
          this.events.push({ type: 'drop', time: t });
        }
        if (this.buildPending && !this.buildActive) {
          this.buildPending = false;
          this.buildActive = true;
          this.buildStartBar = bar;
          const dur = this.buildBars * this.barDur;
          this.engine.riser(t, dur);
          this.events.push({ type: 'buildstart', time: t, dur });
        }
      }

      this.events.push({ type: 'step', index: i, time: t });
      this._applyAuto(pat, i, t);
      this._trigger(pat, i, t, this.transposeForBar(bar));

      if (this.buildActive) {
        // accelerating roll: 8ths -> 16ths -> 32nds, rising velocity/pitch
        const into = (bar - this.buildStartBar) * 16 + i;
        const p = into / (this.buildBars * 16);
        const vel = 0.45 + 0.75 * p;
        if (into < 16) {
          if (i % 2 === 0) this._snare(t, vel);
        } else if (into < 24) {
          this._snare(t, vel);
        } else {
          this._snare(t, vel);
          this._snare(t + this.stepDur / 2, Math.min(1.3, vel + 0.06));
        }
      }
    }

    _snare(t, vel) {
      this.engine.snare(t, vel);
      this.events.push({ type: 'snare', time: t, vel });
    }

    // replay recorded macro automation for this step (shared with export)
    _applyAuto(pat, i, t) {
      if (!pat.auto) return;
      for (const param in pat.auto) {
        const v = pat.auto[param][i];
        if (v != null) {
          // pass `t` so the value lands on the audio clock at the step, not up
          // to a lookahead early — and so offline renders schedule it at all
          this.engine.setParam(param, v, t);
          this.events.push({ type: 'auto', time: t, param, value: v });
        }
      }
    }

    // trigger one step of a pattern — also used by the offline WAV renderer.
    // Each step honors probability (skip chance) and ratchet (N retrigger
    // sub-hits within the step); `trans` is the bar's chord-movement offset.
    _trigger(pat, i, t, trans = 0) {
      const eng = this.engine;
      const stepDur = this.stepDur;

      // fire fn once per ratchet sub-hit; returns false if probability skips
      const each = (st, fn) => {
        const prob = st.prob === undefined ? 1 : st.prob;
        if (prob < 1 && Math.random() > prob) return false;
        const n = st.ratchet || 1;
        for (let r = 0; r < n; r++) {
          fn(t + (r * stepDur) / n, Math.max(0.2, st.vel * (1 - r * 0.12)));
        }
        return true;
      };

      if (pat.kick[i].on && each(pat.kick[i], (tt, vv) => eng.kick(tt, vv))) {
        this.events.push({ type: 'kick', time: t, vel: pat.kick[i].vel });
      }
      if (pat.clap[i].on && each(pat.clap[i], (tt, vv) => eng.clap(tt, vv))) {
        this.events.push({ type: 'clap', time: t, vel: pat.clap[i].vel });
      }
      if (pat.bass[i].on) {
        const midi = this.rootMidi + trans + PSY.degreeToSemis(pat.bass[i].note, this.scale);
        const freq = PSY.midiToFreq(midi);
        if (each(pat.bass[i], (tt, vv) => eng.bass(tt, freq, vv, stepDur))) {
          this.events.push({ type: 'bass', time: t, vel: pat.bass[i].vel });
        }
      }
      if (pat.chat[i].on && each(pat.chat[i], (tt, vv) => eng.hat(tt, vv, false))) {
        this.events.push({ type: 'chat', time: t, vel: pat.chat[i].vel });
      }
      if (pat.ohat[i].on && each(pat.ohat[i], (tt, vv) => eng.hat(tt, vv, true))) {
        this.events.push({ type: 'ohat', time: t, vel: pat.ohat[i].vel });
      }
      if (pat.lead[i].on) {
        const deg = pat.lead[i].note;
        let fired;
        if (eng.params.leadStyle === 'chord') {
          // stack a triad within the current scale on the step's degree
          const freqs = [deg, deg + 2, deg + 4].map((d) =>
            PSY.midiToFreq(this.rootMidi + 24 + trans + PSY.degreeToSemis(d, this.scale))
          );
          fired = each(pat.lead[i], (tt, vv) => eng.lead(tt, freqs, vv));
        } else {
          const midi = this.rootMidi + 24 + trans + PSY.degreeToSemis(deg, this.scale);
          const freq = PSY.midiToFreq(midi);
          const prev = pat.lead[(i + 15) % 16];
          fired = each(pat.lead[i], (tt, vv) => eng.lead(tt, freq, vv, prev.on)); // auto-glide off consecutive notes
        }
        if (fired) this.events.push({ type: 'lead', time: t, vel: pat.lead[i].vel, note: deg });
      }
      if (pat.vox[i].on) {
        const deg = pat.vox[i].note;
        const midi = this.rootMidi + 24 + trans + PSY.degreeToSemis(deg, this.scale);
        const freq = PSY.midiToFreq(midi);
        const prev = pat.vox[(i + 15) % 16];
        if (each(pat.vox[i], (tt, vv) => eng.vox(tt, freq, vv, stepDur * 1.7, pat.vox[i].vowel, prev.on))) {
          this.events.push({ type: 'vox', time: t, vel: pat.vox[i].vel, note: deg });
        }
      }
      if (pat.voice[i].on && each(pat.voice[i], (tt, vv) => eng.voice(tt, pat.voice[i].note, vv))) {
        this.events.push({ type: 'voice', time: t, vel: pat.voice[i].vel, note: pat.voice[i].note });
      }
      if (pat.fx[i].on) {
        // The fx step's `note` selects which one-shot fires. 0 = zap keeps every
        // shipped preset byte-identical; the build voices live here too so they
        // render offline (export.js only walks _trigger, never _scheduleStep).
        const kind = Sequencer.FX_KINDS[pat.fx[i].note] || 'zap';
        const dur = this.barDur * this.buildBars;
        const fire =
          kind === 'snare' ? (tt, vv) => eng.snare(tt, vv)
          : kind === 'riser' ? (tt) => eng.riser(tt, dur)
          : kind === 'crash' ? (tt, vv) => eng.crash(tt, vv)
          : (tt, vv) => eng.zap(tt, vv, i);
        if (each(pat.fx[i], fire)) {
          this.events.push({ type: 'fx', time: t, vel: pat.fx[i].vel, kind });
        }
      }
    }

    // pop all events whose scheduled time has arrived (called from rAF)
    popDue() {
      if (!this.engine.ctx) return [];
      // Collapse a hidden-tab backlog BEFORE draining, keeping the newest tail.
      // (The old guard ran after the drain, where only the not-yet-due handful
      // remained, so it never fired and a 30-minute backlog replayed in one
      // frame.) Splicing from the head preserves order, so the retained tail
      // still lands the correct playhead and chain highlight.
      if (this.events.length > 400) {
        this.events.splice(0, this.events.length - 32);
      }
      const now = this.engine.ctx.currentTime;
      const due = [];
      while (this.events.length && this.events[0].time <= now) {
        due.push(this.events.shift());
      }
      return due;
    }
  }

  PSY.Sequencer = Sequencer;
})();
