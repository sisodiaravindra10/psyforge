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

  const TRACKS = ['kick', 'clap', 'bass', 'chat', 'ohat', 'lead', 'vox', 'fx'];
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

    static emptyPattern() {
      const p = {};
      for (const t of TRACKS) {
        p[t] = Array.from({ length: 16 }, () => ({ on: false, vel: 0.85, note: 0, vowel: 'ah' }));
      }
      return p;
    }

    static copyPattern(pat) {
      const p = {};
      for (const t of TRACKS) p[t] = pat[t].map((s) => ({ ...s }));
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

    slotForBar(bar) {
      if (this.mode === 'song' && this.chain.length) {
        return this.chain[bar % this.chain.length];
      }
      return this.currentSlot;
    }

    patternForBar(bar) {
      return this.patterns[this.slotForBar(bar)];
    }

    start() {
      if (this.playing) return;
      this.engine.init();
      const ctx = this.engine.ctx;
      if (ctx.state === 'suspended') ctx.resume();
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
      this._trigger(pat, i, t);

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

    // trigger one step of a pattern — also used by the offline WAV renderer
    _trigger(pat, i, t) {
      const eng = this.engine;
      if (pat.kick[i].on) {
        eng.kick(t, pat.kick[i].vel);
        this.events.push({ type: 'kick', time: t, vel: pat.kick[i].vel });
      }
      if (pat.clap[i].on) {
        eng.clap(t, pat.clap[i].vel);
        this.events.push({ type: 'clap', time: t, vel: pat.clap[i].vel });
      }
      if (pat.bass[i].on) {
        const midi = this.rootMidi + PSY.degreeToSemis(pat.bass[i].note, this.scale);
        eng.bass(t, PSY.midiToFreq(midi), pat.bass[i].vel);
        this.events.push({ type: 'bass', time: t, vel: pat.bass[i].vel });
      }
      if (pat.chat[i].on) {
        eng.hat(t, pat.chat[i].vel, false);
        this.events.push({ type: 'chat', time: t, vel: pat.chat[i].vel });
      }
      if (pat.ohat[i].on) {
        eng.hat(t, pat.ohat[i].vel, true);
        this.events.push({ type: 'ohat', time: t, vel: pat.ohat[i].vel });
      }
      if (pat.lead[i].on) {
        const deg = pat.lead[i].note;
        if (eng.params.leadStyle === 'chord') {
          // stack a triad within the current scale on the step's degree
          const freqs = [deg, deg + 2, deg + 4].map((d) =>
            PSY.midiToFreq(this.rootMidi + 24 + PSY.degreeToSemis(d, this.scale))
          );
          eng.lead(t, freqs, pat.lead[i].vel);
        } else {
          const midi = this.rootMidi + 24 + PSY.degreeToSemis(deg, this.scale);
          const prev = pat.lead[(i + 15) % 16];
          eng.lead(t, PSY.midiToFreq(midi), pat.lead[i].vel, prev.on); // auto-glide off consecutive notes
        }
        this.events.push({ type: 'lead', time: t, vel: pat.lead[i].vel, note: deg });
      }
      if (pat.vox[i].on) {
        const deg = pat.vox[i].note;
        const midi = this.rootMidi + 24 + PSY.degreeToSemis(deg, this.scale);
        const prev = pat.vox[(i + 15) % 16];
        eng.vox(t, PSY.midiToFreq(midi), pat.vox[i].vel, this.stepDur * 1.7, pat.vox[i].vowel, prev.on);
        this.events.push({ type: 'vox', time: t, vel: pat.vox[i].vel, note: deg });
      }
      if (pat.fx[i].on) {
        eng.zap(t, pat.fx[i].vel, i);
        this.events.push({ type: 'fx', time: t, vel: pat.fx[i].vel });
      }
    }

    // pop all events whose scheduled time has arrived (called from rAF)
    popDue() {
      if (!this.engine.ctx) return [];
      const now = this.engine.ctx.currentTime;
      const due = [];
      while (this.events.length && this.events[0].time <= now) {
        due.push(this.events.shift());
      }
      // drop stale backlog if the tab was hidden for a while
      if (this.events.length > 400) this.events.length = 0;
      return due;
    }
  }

  PSY.Sequencer = Sequencer;
})();
