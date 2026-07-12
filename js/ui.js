/* PSYFORGE — UI wiring: grid, transport, arrange (slots + song chain),
   macros, presets, build/export, rAF loop. */
(function () {
  const PSY = window.PSY;

  const engine = new PSY.Engine();
  const seq = new PSY.Sequencer(engine);
  const viz = new PSY.Visualizer(
    document.getElementById('viz'),
    document.getElementById('viz-gl'),
    engine
  );
  PSY.app = { engine, seq, viz }; // console/debug access

  const TRACK_META = {
    kick: { label: 'KICK', color: 'var(--kick)', pitched: false },
    clap: { label: 'CLAP', color: 'var(--clap)', pitched: false },
    bass: { label: 'BASS', color: 'var(--bass)', pitched: true },
    chat: { label: 'HAT',  color: 'var(--chat)', pitched: false },
    ohat: { label: 'OHAT', color: 'var(--ohat)', pitched: false },
    lead: { label: 'LEAD', color: 'var(--lead)', pitched: true },
    vox:  { label: 'VOX',  color: 'var(--vox)',  pitched: true, vox: true },
    voice: { label: 'VOICE', color: 'var(--voice)', pitched: false, slice: true },
    fx:   { label: 'FX',   color: 'var(--fx)',  pitched: false },
  };

  const $ = (id) => document.getElementById(id);
  const cells = {}; // cells[track][step] -> element
  const chips = {}; // chips[track] -> VU chip element
  const chipTimers = {};
  let playingSlot = 'A';
  let playingChainIndex = -1;

  function chipFlash(track) {
    const el = chips[track];
    if (!el) return;
    el.classList.add('hit');
    clearTimeout(chipTimers[track]);
    chipTimers[track] = setTimeout(() => el.classList.remove('hit'), 70);
  }

  /* ---------- grid ---------- */

  function buildGrid() {
    const grid = $('grid');
    grid.innerHTML = '';
    let paint = null; // {track, state} while dragging

    for (const track of PSY.Sequencer.TRACKS) {
      const meta = TRACK_META[track];
      const row = document.createElement('div');
      row.className = 'track-row';
      row.style.setProperty('--tc', meta.color);

      const head = document.createElement('div');
      head.className = 'track-head';

      const chip = document.createElement('span');
      chip.className = 'track-chip';
      chips[track] = chip;
      const name = document.createElement('span');
      name.className = 'track-name';
      name.textContent = meta.label;

      const vol = document.createElement('input');
      vol.type = 'range';
      vol.className = 'track-vol';
      vol.min = 0;
      vol.max = 100;
      vol.value = Math.round(engine.levels[track] * 100);
      vol.addEventListener('input', () => engine.setTrackLevel(track, vol.value / 100));

      const mute = document.createElement('button');
      mute.className = 'mute-btn';
      mute.textContent = 'M';
      mute.title = 'Mute';
      mute.addEventListener('click', () => {
        const m = !engine.mutes[track];
        engine.setMute(track, m);
        mute.classList.toggle('muted', m);
      });

      head.append(chip, name, vol, mute);
      row.appendChild(head);

      cells[track] = [];
      for (let i = 0; i < 16; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell' + (Math.floor(i / 4) % 2 ? ' g1' : '');
        const label = document.createElement('span');
        label.className = 'note-label';
        cell.appendChild(label);

        cell.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const st = seq.pattern[track][i];
          if (e.altKey && meta.vox && st.on) {
            // cycle the vowel: ah -> oh -> oo -> eh -> ee
            const v = PSY.VOWELS;
            st.vowel = v[(v.indexOf(st.vowel) + 1) % v.length];
          } else if (e.shiftKey && st.on) {
            st.vel = st.vel > 1 ? 0.85 : 1.2;
          } else {
            st.on = !st.on;
            paint = { track, state: st.on };
          }
          renderCell(track, i);
        });
        cell.addEventListener('mouseenter', () => {
          if (paint && paint.track === track) {
            seq.pattern[track][i].on = paint.state;
            renderCell(track, i);
          }
        });
        if (meta.pitched || meta.slice) {
          cell.addEventListener('wheel', (e) => {
            e.preventDefault();
            const st = seq.pattern[track][i];
            const d = e.deltaY < 0 ? 1 : -1;
            const max = meta.slice ? 7 : PSY.MAX_DEGREE;
            st.note = Math.max(0, Math.min(max, st.note + d));
            renderCell(track, i);
          }, { passive: false });
        }

        row.appendChild(cell);
        cells[track].push(cell);
      }
      grid.appendChild(row);
    }
    window.addEventListener('mouseup', () => (paint = null));
    grid.addEventListener('mouseleave', () => (paint = null));
  }

  function renderCell(track, i) {
    const st = seq.pattern[track][i];
    const el = cells[track][i];
    el.classList.toggle('on', st.on);
    el.classList.toggle('accent', st.on && st.vel > 1);
    const meta = TRACK_META[track];
    if (meta.pitched) {
      const base = track === 'bass' ? seq.rootMidi : seq.rootMidi + 24;
      const midi = base + PSY.degreeToSemis(st.note, seq.scale);
      let label = PSY.midiName(midi);
      if (meta.vox) label += '·' + PSY.VOWEL_CHAR[st.vowel || 'ah'];
      el.firstChild.textContent = label;
    } else if (meta.slice) {
      el.firstChild.textContent = 'S' + (st.note + 1);
    }
  }

  function renderAll() {
    for (const track of PSY.Sequencer.TRACKS) {
      for (let i = 0; i < 16; i++) renderCell(track, i);
    }
  }

  /* ---------- arrange: pattern slots + song chain ---------- */

  const slotBtns = {};

  function buildArrange() {
    const tabs = $('slot-tabs');
    for (const s of PSY.Sequencer.SLOTS) {
      const b = document.createElement('button');
      b.className = 'slot-tab';
      b.textContent = s;
      b.title = 'Edit pattern ' + s + ' (key ' + (PSY.Sequencer.SLOTS.indexOf(s) + 1) + ')';
      b.addEventListener('click', () => selectSlot(s));
      tabs.appendChild(b);
      slotBtns[s] = b;
    }

    $('dup').addEventListener('click', () => {
      const slots = PSY.Sequencer.SLOTS;
      const next = slots[(slots.indexOf(seq.currentSlot) + 1) % slots.length];
      seq.patterns[next] = PSY.Sequencer.copyPattern(seq.pattern);
      selectSlot(next);
    });

    $('mode').addEventListener('click', () => {
      seq.mode = seq.mode === 'loop' ? 'song' : 'loop';
      const btn = $('mode');
      btn.textContent = seq.mode.toUpperCase();
      btn.classList.toggle('song', seq.mode === 'song');
      setChainPlaying(-1);
    });

    const add = $('chain-add');
    for (const s of PSY.Sequencer.SLOTS) {
      const b = document.createElement('button');
      b.className = 'mini-btn';
      b.textContent = '+' + s;
      b.title = 'Append one bar of pattern ' + s;
      b.addEventListener('click', () => {
        seq.chain.push(s);
        renderChain();
      });
      add.appendChild(b);
    }
    const clr = document.createElement('button');
    clr.className = 'mini-btn';
    clr.textContent = 'CLR';
    clr.title = 'Clear the chain';
    clr.addEventListener('click', () => {
      seq.chain.length = 0;
      renderChain();
    });
    add.appendChild(clr);
  }

  function selectSlot(s) {
    seq.currentSlot = s;
    for (const k of PSY.Sequencer.SLOTS) {
      slotBtns[k].classList.toggle('active', k === s);
    }
    renderAll();
  }

  function renderChain() {
    const el = $('chain');
    el.innerHTML = '';
    seq.chain.forEach((s, idx) => {
      const b = document.createElement('button');
      b.className = 'chain-block slot-' + s;
      b.textContent = s;
      b.title = 'bar ' + (idx + 1) + ' — click to remove';
      b.addEventListener('click', () => {
        seq.chain.splice(idx, 1);
        renderChain();
      });
      el.appendChild(b);
    });
  }

  function setChainPlaying(idx) {
    playingChainIndex = idx;
    const blocks = $('chain').children;
    for (let i = 0; i < blocks.length; i++) {
      blocks[i].classList.toggle('playing', i === idx);
    }
  }

  /* ---------- VOX pad: play voices live, optionally record into the grid ---------- */

  const PAD_KEYS = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i'];
  const padState = []; // {deg, vowel, el}
  let padRec = false;

  function buildPads() {
    const wrap = $('pads');
    const defaultVowels = ['ah', 'oh', 'oo', 'eh', 'ee', 'ah', 'oh', 'oo'];
    for (let i = 0; i < 8; i++) {
      const pad = document.createElement('button');
      pad.className = 'pad';
      const note = document.createElement('span');
      note.className = 'pad-note';
      const vow = document.createElement('span');
      vow.className = 'pad-vowel';
      const key = document.createElement('span');
      key.className = 'pad-key';
      key.textContent = PAD_KEYS[i].toUpperCase();
      pad.append(note, vow, key);
      pad.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (e.altKey) {
          const v = PSY.VOWELS;
          padState[i].vowel = v[(v.indexOf(padState[i].vowel) + 1) % v.length];
          renderPads();
        } else {
          padTrigger(i);
        }
      });
      wrap.appendChild(pad);
      padState.push({ deg: i, vowel: defaultVowels[i], el: pad });
    }

    $('pad-rec').addEventListener('click', () => {
      padRec = !padRec;
      $('pad-rec').classList.toggle('armed', padRec);
    });

    renderPads();
  }

  function renderPads() {
    for (const p of padState) {
      const midi = seq.rootMidi + 24 + PSY.degreeToSemis(p.deg, seq.scale);
      p.el.querySelector('.pad-note').textContent = PSY.midiName(midi);
      p.el.querySelector('.pad-vowel').textContent = p.vowel;
    }
  }

  function padTrigger(i) {
    const p = padState[i];
    engine.init();
    const ctx = engine.ctx;
    if (ctx.state === 'suspended') ctx.resume();
    const midi = seq.rootMidi + 24 + PSY.degreeToSemis(p.deg, seq.scale);
    const freq = PSY.midiToFreq(midi);
    engine.vox(ctx.currentTime, freq, 1, seq.stepDur * 1.7, p.vowel, false);
    viz.onEvent({ type: 'vox', time: ctx.currentTime, vel: 1, note: p.deg });

    p.el.classList.add('hit');
    setTimeout(() => p.el.classList.remove('hit'), 130);

    // quantize the hit into the VOX row of the editing pattern, deriving the
    // nearest step from the scheduler clock (seq.nextTime = time of seq.step)
    if (padRec && seq.playing) {
      const k = seq.step + Math.round((ctx.currentTime - seq.nextTime) / seq.stepDur);
      const idx = ((k % 16) + 16) % 16;
      const st = seq.pattern.vox[idx];
      st.on = true;
      st.vel = 0.95;
      st.note = p.deg;
      st.vowel = p.vowel;
      renderCell('vox', idx);
    }
  }

  /* ---------- FRED MODE: real voice notes, sliced and sequenced ---------- */

  let fredRec = false; // grid-record toggle for slice pads
  let micRecorder = null;
  let micStopTimer = null;
  const voicePads = [];

  function buildFred() {
    const wrap = $('voice-pads');
    for (let i = 0; i < 8; i++) {
      const pad = document.createElement('button');
      pad.className = 'pad voice-pad';
      pad.innerHTML = `<span class="pad-note">S${i + 1}</span><span class="pad-vowel">slice</span>`;
      pad.addEventListener('mousedown', (e) => {
        e.preventDefault();
        voiceTrigger(i);
      });
      wrap.appendChild(pad);
      voicePads.push(pad);
    }

    $('voice-rec').addEventListener('click', () => {
      fredRec = !fredRec;
      $('voice-rec').classList.toggle('armed', fredRec);
    });

    $('vpitch').addEventListener('input', (e) => {
      engine.params.voicePitch = +e.target.value;
      $('vpitch-val').textContent = e.target.value;
    });

    $('mic-btn').addEventListener('click', () => {
      micRecorder ? stopMic() : startMic();
    });

    // TTS fallback — a typed line spoken by the OS voice (live layer only)
    $('tts-speak').addEventListener('click', () => {
      const line = $('tts-line').value.trim();
      if (!line || !window.speechSynthesis) return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(line.slice(0, 140));
      u.rate = 1.0;
      speechSynthesis.speak(u);
    });
  }

  async function startMic() {
    const btn = $('mic-btn');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const chunks = [];
      micRecorder = new MediaRecorder(stream);
      micRecorder.ondataavailable = (e) => chunks.push(e.data);
      micRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        try {
          engine.init();
          const buf = await new Blob(chunks).arrayBuffer();
          const audio = await engine.ctx.decodeAudioData(buf);
          engine.setVoiceBuffer(audio);
          drawVoiceWave(audio);
          btn.textContent = '● RE-RECORD';
          voicePads.forEach((p) => p.classList.add('loaded'));
        } catch (err) {
          console.error('voice decode failed:', err);
          btn.textContent = '⚠ FAILED — RETRY';
        }
        micRecorder = null;
      };
      micRecorder.start();
      btn.classList.add('armed');
      let left = 10;
      btn.textContent = `■ STOP (${left}s)`;
      micStopTimer = setInterval(() => {
        left--;
        btn.textContent = `■ STOP (${left}s)`;
        if (left <= 0) stopMic();
      }, 1000);
    } catch (err) {
      btn.textContent = '⚠ MIC BLOCKED';
      setTimeout(() => (btn.textContent = '🎤 REC LINE'), 2500);
    }
  }

  function stopMic() {
    clearInterval(micStopTimer);
    $('mic-btn').classList.remove('armed');
    if (micRecorder && micRecorder.state !== 'inactive') micRecorder.stop();
  }

  function drawVoiceWave(buffer) {
    const cv = $('voice-wave');
    const c = cv.getContext('2d');
    const W = cv.width;
    const H = cv.height;
    c.clearRect(0, 0, W, H);
    const data = buffer.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / W));
    c.strokeStyle = 'rgba(61, 255, 192, 0.9)';
    c.lineWidth = 1;
    c.beginPath();
    for (let x = 0; x < W; x++) {
      let min = 1, max = -1;
      for (let j = 0; j < step; j++) {
        const v = data[x * step + j] || 0;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      c.moveTo(x, (H / 2) * (1 + min));
      c.lineTo(x, (H / 2) * (1 + max) + 0.5);
    }
    c.stroke();
    // slice boundaries
    c.strokeStyle = 'rgba(207, 200, 238, 0.35)';
    for (let s = 1; s < 8; s++) {
      const x = (W / 8) * s;
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, H);
      c.stroke();
    }
  }

  function voiceTrigger(i) {
    if (!engine.voiceBuffer) {
      const btn = $('mic-btn');
      btn.classList.add('nudge');
      setTimeout(() => btn.classList.remove('nudge'), 400);
      return;
    }
    engine.init();
    const ctx = engine.ctx;
    if (ctx.state === 'suspended') ctx.resume();
    engine.voice(ctx.currentTime, i, 1);
    viz.onEvent({ type: 'voice', time: ctx.currentTime, vel: 1, note: i });

    voicePads[i].classList.add('hit');
    setTimeout(() => voicePads[i].classList.remove('hit'), 130);

    if (fredRec && seq.playing) {
      const k = seq.step + Math.round((ctx.currentTime - seq.nextTime) / seq.stepDur);
      const idx = ((k % 16) + 16) % 16;
      const st = seq.pattern.voice[idx];
      st.on = true;
      st.vel = 0.95;
      st.note = i;
      renderCell('voice', idx);
    }
  }

  /* ---------- presets ---------- */

  // auto-generate B/C/D arrangement variations from the core pattern
  function makeVariations(A) {
    const B = PSY.Sequencer.copyPattern(A); // groove: strip lead + vox + fx
    for (const s of B.lead) s.on = false;
    for (const s of B.vox) s.on = false;
    for (const s of B.fx) s.on = false;

    const C = PSY.Sequencer.copyPattern(A); // breakdown: drums out, voices + melody stay
    for (const s of C.kick) s.on = false;
    for (const s of C.clap) s.on = false;
    for (const s of C.bass) s.on = false;
    for (const s of C.chat) s.on = false;
    if (!C.lead.some((s) => s.on) && !C.vox.some((s) => s.on) && !C.fx.some((s) => s.on)) {
      [1, 5, 9, 13].forEach((i) => (C.fx[i].on = true)); // keep breakdowns alive for melody-less presets
    }

    const D = PSY.Sequencer.copyPattern(A); // peak: extra fx + accented lead/vox
    [3, 11].forEach((i) => (D.fx[i].on = true));
    for (const s of D.lead) if (s.on) s.vel = 1.2;
    for (const s of D.vox) if (s.on) s.vel = 1.2;

    return { B, C, D };
  }

  function applyPreset(id) {
    const p = PSY.getPreset(id);
    seq.currentSlot = 'A';
    seq.loadTracks(p.tracks);
    const { B, C, D } = makeVariations(seq.patterns.A);
    seq.patterns.B = B;
    seq.patterns.C = C;
    seq.patterns.D = D;
    seq.chain = ['B', 'B', 'A', 'A', 'D', 'D', 'D', 'D', 'C', 'C', 'D', 'D'];

    seq.rootMidi = p.rootMidi;
    seq.scale = p.scale;
    seq.setBpm(p.bpm);
    seq.swing = p.swing || 0;
    $('swing').value = Math.round(seq.swing * 100);
    $('swing-val').textContent = Math.round(seq.swing * 100) + '%';

    // reset to genre-neutral defaults first so presets only carry overrides
    // (master + voice pitch are performance controls — preserve them)
    const master = engine.params.master;
    const voicePitch = engine.params.voicePitch;
    Object.assign(engine.params, PSY.Engine.DEFAULTS, p.engine, { master, voicePitch });
    engine._updateDrive();
    for (const [t, v] of Object.entries(p.levels)) engine.setTrackLevel(t, v);

    viz.setPalette(p.palette);
    viz.bpm = p.bpm;

    // sync controls
    $('bpm').value = p.bpm;
    $('bpm-val').textContent = p.bpm;
    $('root').value = p.rootMidi;
    $('scale').value = p.scale;
    $('m-cutoff').value = p.engine.bassCutoff;
    $('m-decay').value = Math.round(p.engine.bassDecay * 1000);
    $('m-res').value = p.engine.leadRes;
    $('m-delay').value = Math.round(p.engine.delayMix * 100);
    $('m-drive').value = Math.round(p.engine.drive * 100);
    $('viz-preset').textContent = p.name + ' — ' + p.artist;
    $('about-text').innerHTML = p.desc;

    document.querySelectorAll('.track-vol').forEach((vol, idx) => {
      const t = PSY.Sequencer.TRACKS[idx];
      vol.value = Math.round(engine.levels[t] * 100);
    });

    selectSlot('A');
    renderChain();
    renderPads();
  }

  /* ---------- transport & controls ---------- */

  function resetBuildBtn() {
    const b = $('build');
    b.textContent = 'BUILD';
    b.classList.remove('armed', 'building');
  }

  function wireControls() {
    const playBtn = $('play');
    playBtn.addEventListener('click', () => {
      seq.toggle();
      playBtn.classList.toggle('playing', seq.playing);
      playBtn.querySelector('.play-label').textContent = seq.playing ? 'STOP' : 'PLAY';
      playBtn.querySelector('.play-icon').innerHTML = seq.playing ? '&#9632;' : '&#9654;';
      if (!seq.playing) {
        clearPlayhead();
        setChainPlaying(-1);
        resetBuildBtn();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        playBtn.click();
      } else if (e.key === 'b' || e.key === 'B') {
        $('build').click();
      } else if (e.key === 'v' || e.key === 'V') {
        $('viz-style').click();
      } else if (e.key >= '1' && e.key <= '4') {
        selectSlot(PSY.Sequencer.SLOTS[+e.key - 1]);
      } else {
        const pi = PAD_KEYS.indexOf(e.key.toLowerCase());
        if (pi >= 0 && !e.repeat) padTrigger(pi);
      }
    });

    $('bpm').addEventListener('input', (e) => {
      const v = +e.target.value;
      seq.setBpm(v);
      viz.bpm = v;
      $('bpm-val').textContent = v;
    });

    $('swing').addEventListener('input', (e) => {
      seq.swing = +e.target.value / 100;
      $('swing-val').textContent = e.target.value + '%';
    });

    $('master').addEventListener('input', (e) => {
      engine.setParam('master', e.target.value / 100);
      $('master-val').textContent = e.target.value;
    });

    $('root').addEventListener('change', (e) => {
      seq.rootMidi = +e.target.value;
      renderAll();
      renderPads();
    });
    $('scale').addEventListener('change', (e) => {
      seq.scale = e.target.value;
      renderAll();
      renderPads();
    });

    const presetSel = $('preset');
    const genreLabels = { psy: 'PSYTRANCE', edm: 'ELECTRONIC / EDM', desi: 'DESI / PUNJABI' };
    const groups = {};
    for (const p of PSY.PRESETS) {
      if (!groups[p.genre]) {
        groups[p.genre] = document.createElement('optgroup');
        groups[p.genre].label = genreLabels[p.genre] || p.genre.toUpperCase();
        presetSel.appendChild(groups[p.genre]);
      }
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name + ' · ' + p.bpm;
      groups[p.genre].appendChild(opt);
    }
    presetSel.addEventListener('change', (e) => applyPreset(e.target.value));

    // macros
    $('m-cutoff').addEventListener('input', (e) => engine.setParam('bassCutoff', +e.target.value));
    $('m-decay').addEventListener('input', (e) => engine.setParam('bassDecay', +e.target.value / 1000));
    $('m-res').addEventListener('input', (e) => engine.setParam('leadRes', +e.target.value));
    $('m-delay').addEventListener('input', (e) => engine.setParam('delayMix', +e.target.value / 100));
    $('m-drive').addEventListener('input', (e) => engine.setParam('drive', +e.target.value / 100));

    // build
    $('build').addEventListener('click', () => {
      if (!seq.playing || seq.buildActive || seq.buildPending) return;
      seq.armBuild();
      const b = $('build');
      b.textContent = 'QUEUED';
      b.classList.add('armed');
    });

    // WAV export
    $('export').addEventListener('click', async () => {
      const btn = $('export');
      if (btn.disabled) return;
      btn.disabled = true;
      const old = btn.innerHTML;
      btn.textContent = 'RENDERING…';
      try {
        const blob = await PSY.exportWav(seq, engine);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const mode = seq.mode === 'song' && seq.chain.length ? 'song' : 'loop';
        a.download = 'psyforge-' + $('preset').value + '-' + mode + '-' + seq.bpm + 'bpm.wav';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      } catch (err) {
        console.error('WAV export failed:', err);
      }
      btn.innerHTML = old;
      btn.disabled = false;
    });

    // pixel word input
    $('word').addEventListener('input', (e) => {
      const clean = e.target.value.toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 12);
      e.target.value = clean;
      viz.setWord(clean);
    });

    // viz buttons
    const wrap = $('viz-wrap');
    $('viz-style').addEventListener('click', () => {
      $('viz-style').innerHTML = '&#10022; ' + viz.cycleStyle();
    });
    $('viz-toggle').addEventListener('click', (e) => {
      viz.enabled = !viz.enabled;
      wrap.classList.toggle('hidden-viz', !viz.enabled);
      e.target.textContent = viz.enabled ? 'VIZ ON' : 'VIZ OFF';
      if (viz.enabled) viz._resize();
    });
    $('viz-full').addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else wrap.requestFullscreen && wrap.requestFullscreen();
    });
  }

  /* ---------- playhead + rAF loop ---------- */

  let lastPlayhead = -1;

  function clearPlayhead() {
    if (lastPlayhead >= 0) {
      for (const track of PSY.Sequencer.TRACKS) {
        cells[track][lastPlayhead].classList.remove('playhead');
      }
      lastPlayhead = -1;
    }
  }

  function setPlayhead(i) {
    if (i === lastPlayhead) return;
    clearPlayhead();
    for (const track of PSY.Sequencer.TRACKS) {
      cells[track][i].classList.add('playhead');
    }
    lastPlayhead = i;
  }

  let thumpTimer = null;

  function loop() {
    const due = seq.popDue();
    for (const e of due) {
      switch (e.type) {
        case 'step':
          // only track the playhead on the grid we're actually looking at
          if (seq.mode === 'song' && playingSlot !== seq.currentSlot) clearPlayhead();
          else setPlayhead(e.index);
          break;
        case 'bar':
          playingSlot = e.slot;
          if (seq.mode === 'song') setChainPlaying(e.chainIndex);
          viz.onEvent(e); // drives the word's bar-progress sweep
          break;
        case 'kick':
          viz.onEvent(e);
          chipFlash('kick');
          document.body.classList.add('thump');
          clearTimeout(thumpTimer);
          thumpTimer = setTimeout(() => document.body.classList.remove('thump'), 90);
          break;
        case 'bass':
          viz.onEvent(e);
          chipFlash('bass');
          break;
        case 'clap':
          viz.onEvent(e);
          chipFlash('clap');
          break;
        case 'vox':
          viz.onEvent(e);
          chipFlash('vox');
          break;
        case 'voice':
          viz.onEvent(e);
          chipFlash('voice');
          break;
        case 'chat':
          chipFlash('chat');
          break;
        case 'ohat':
          viz.onEvent(e);
          chipFlash('ohat');
          break;
        case 'lead':
          viz.onEvent(e);
          chipFlash('lead');
          break;
        case 'fx':
          viz.onEvent(e);
          chipFlash('fx');
          break;
        case 'buildstart': {
          viz.onEvent(e);
          const b = $('build');
          b.textContent = 'BUILDING';
          b.classList.remove('armed');
          b.classList.add('building');
          break;
        }
        case 'drop':
          viz.onEvent(e);
          resetBuildBtn();
          break;
        default:
          viz.onEvent(e);
      }
    }
    viz.frame();
    requestAnimationFrame(loop);
  }

  /* ---------- boot ---------- */

  buildGrid();
  buildArrange();
  buildPads();
  buildFred();
  wireControls();
  applyPreset('fullon');
  requestAnimationFrame(loop);
})();
