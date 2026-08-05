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
    fx:   { label: 'FX',   color: 'var(--fx)',  pitched: false, fxkind: true },
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
      vol.setAttribute('aria-label', meta.label + ' level');
      vol.title = meta.label + ' level';
      vol.addEventListener('input', () => engine.setTrackLevel(track, vol.value / 100));

      const mute = document.createElement('button');
      mute.className = 'mute-btn';
      mute.textContent = 'M';
      mute.title = 'Mute ' + meta.label;
      mute.setAttribute('aria-label', 'Mute ' + meta.label);
      mute.setAttribute('aria-pressed', 'false');
      mute.addEventListener('click', () => {
        const m = !engine.mutes[track];
        engine.setMute(track, m);
        mute.classList.toggle('muted', m);
        mute.setAttribute('aria-pressed', String(m));
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
          pushUndo(true);
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
        // right-click cycles ratchet: 1 -> 2 -> 3 -> 4 hits per step
        cell.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          const st = seq.pattern[track][i];
          if (!st.on) return;
          pushUndo(true);
          st.ratchet = ((st.ratchet || 1) % 4) + 1;
          renderCell(track, i);
        });
        cell.addEventListener('wheel', (e) => {
          e.preventDefault();
          pushUndo(true);
          const st = seq.pattern[track][i];
          if (e.metaKey || e.ctrlKey) {
            // cmd/ctrl+scroll cycles step probability: 100/75/50/25%
            if (!st.on) return;
            const seqP = [1, 0.75, 0.5, 0.25];
            const cur = seqP.indexOf(st.prob === undefined ? 1 : st.prob);
            st.prob = seqP[(cur + (e.deltaY < 0 ? 3 : 1)) % 4];
            renderCell(track, i);
            return;
          }
          if (!meta.pitched && !meta.slice && !meta.fxkind) return;
          const d = e.deltaY < 0 ? 1 : -1;
          const max = meta.fxkind ? PSY.Sequencer.FX_KINDS.length - 1 : meta.slice ? 7 : PSY.MAX_DEGREE;
          st.note = Math.max(0, Math.min(max, st.note + d));
          renderCell(track, i);
        }, { passive: false });

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
    el.dataset.ratchet = st.on && (st.ratchet || 1) > 1 ? st.ratchet : '';
    const prob = st.prob === undefined ? 1 : st.prob;
    el.style.opacity = st.on && prob < 1 ? String(0.45 + 0.55 * prob) : '';
    const meta = TRACK_META[track];
    if (meta.pitched) {
      const base = track === 'bass' ? seq.rootMidi : seq.rootMidi + 24;
      const midi = base + PSY.degreeToSemis(st.note, seq.scale);
      let label = PSY.midiName(midi);
      if (meta.vox) label += '·' + PSY.VOWEL_CHAR[st.vowel || 'ah'];
      el.firstChild.textContent = label;
    } else if (meta.slice) {
      el.firstChild.textContent = 'S' + (st.note + 1);
    } else if (meta.fxkind) {
      const k = PSY.Sequencer.FX_KINDS[st.note] || 'zap';
      el.firstChild.textContent = k === 'zap' ? '' : k.slice(0, 3).toUpperCase();
    }
  }

  function renderAll() {
    for (const track of PSY.Sequencer.TRACKS) {
      for (let i = 0; i < 16; i++) renderCell(track, i);
    }
  }

  /* ---------- arrange: pattern slots + song chain ---------- */

  const slotBtns = {};

  /* chain drag & drop: drag A–D tabs in to insert, drag blocks to reorder */

  let dropIndex = -1;
  let chainStash = null; // last removed chain bars, for the restore button

  function clearDropMarks() {
    dropIndex = -1;
    const chain = $('chain');
    chain.classList.remove('drop-end');
    for (const b of chain.children) b.classList.remove('drop-before');
  }

  function chainInsert(slot, idx) {
    pushUndo();
    idx = Math.max(0, Math.min(seq.chain.length, idx));
    seq.chain.splice(idx, 0, { s: slot, t: 0 });
    renderChain();
  }

  function chainMove(from, to) {
    pushUndo();
    if (from < 0 || from >= seq.chain.length) return;
    const s = seq.chain.splice(from, 1)[0];
    if (to > from) to--;
    seq.chain.splice(Math.max(0, Math.min(seq.chain.length, to)), 0, s);
    renderChain();
  }

  function wireChainDnd() {
    const chain = $('chain');

    chain.addEventListener('dragover', (e) => {
      const types = e.dataTransfer.types;
      if (!types.includes('text/psy-slot') && !types.includes('text/psy-move')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = types.includes('text/psy-move') ? 'move' : 'copy';
      const blocks = [...chain.querySelectorAll('.chain-block')];
      let idx = blocks.length;
      for (let i = 0; i < blocks.length; i++) {
        const r = blocks[i].getBoundingClientRect();
        if (e.clientX < r.left + r.width / 2) {
          idx = i;
          break;
        }
      }
      dropIndex = idx;
      blocks.forEach((b, i) => b.classList.toggle('drop-before', i === idx));
      chain.classList.toggle('drop-end', idx === blocks.length);
    });

    chain.addEventListener('dragleave', (e) => {
      if (!chain.contains(e.relatedTarget)) clearDropMarks();
    });

    chain.addEventListener('drop', (e) => {
      e.preventDefault();
      const slot = e.dataTransfer.getData('text/psy-slot');
      const moveFrom = e.dataTransfer.getData('text/psy-move');
      const idx = dropIndex < 0 ? seq.chain.length : dropIndex;
      if (slot) chainInsert(slot, idx);
      else if (moveFrom !== '') chainMove(+moveFrom, idx);
      clearDropMarks();
    });
  }

  function buildArrange() {
    const tabs = $('slot-tabs');
    for (const s of PSY.Sequencer.SLOTS) {
      const b = document.createElement('button');
      b.className = 'slot-tab';
      b.textContent = s;
      b.title = 'Edit pattern ' + s + ' (key ' + (PSY.Sequencer.SLOTS.indexOf(s) + 1) + ') — drag into the SONG chain to add a bar';
      b.draggable = true;
      b.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/psy-slot', s);
        e.dataTransfer.effectAllowed = 'copy';
      });
      b.addEventListener('click', () => selectSlot(s));
      tabs.appendChild(b);
      slotBtns[s] = b;
    }
    wireChainDnd();

    $('dup').addEventListener('click', () => {
      pushUndo();
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
        seq.chain.push({ s, t: 0 });
        renderChain();
      });
      add.appendChild(b);
    }
    const clr = document.createElement('button');
    clr.className = 'mini-btn';
    clr.textContent = 'CLR';
    clr.title = 'Clear the chain';
    clr.addEventListener('click', () => {
      chainStash = { entries: seq.chain.slice(), at: 0 };
      pushUndo();
      seq.chain.length = 0;
      renderChain();
    });
    add.appendChild(clr);

    // restore the last removed bar(s) — a 26px block is an easy misclick
    const undoChain = document.createElement('button');
    undoChain.className = 'mini-btn';
    undoChain.id = 'chain-restore';
    undoChain.innerHTML = '&#8635;';
    undoChain.title = 'Restore the bars you just removed';
    undoChain.disabled = true;
    undoChain.addEventListener('click', () => {
      if (!chainStash) return;
      seq.chain.splice(chainStash.at, 0, ...chainStash.entries);
      chainStash = null;
      renderChain();
    });
    add.appendChild(undoChain);
  }

  function selectSlot(s) {
    seq.currentSlot = s;
    for (const k of PSY.Sequencer.SLOTS) {
      slotBtns[k].classList.toggle('active', k === s);
      slotBtns[k].setAttribute('aria-pressed', String(k === s));
    }
    renderAll();
  }

  function renderChain() {
    const el = $('chain');
    el.innerHTML = '';
    const restore = $('chain-restore');
    if (restore) restore.disabled = !chainStash;
    // normalize legacy string entries to {s, t} objects in place
    seq.chain.forEach((c, i) => {
      if (typeof c === 'string') seq.chain[i] = { s: c, t: 0 };
    });
    seq.chain.forEach((entry, idx) => {
      const s = entry.s;
      const b = document.createElement('button');
      b.className = 'chain-block slot-' + s;
      b.textContent = s;
      if (entry.t) {
        const badge = document.createElement('i');
        badge.className = 'tbadge';
        badge.textContent = (entry.t > 0 ? '+' : '') + entry.t;
        b.appendChild(badge);
      }
      b.title = 'bar ' + (idx + 1) + (entry.t ? ' (key ' + (entry.t > 0 ? '+' : '') + entry.t + ' st)' : '') +
        ' — drag to move, click to remove, scroll to shift key';
      b.addEventListener('wheel', (e) => {
        e.preventDefault();
        entry.t = Math.max(-12, Math.min(12, (entry.t || 0) + (e.deltaY < 0 ? 1 : -1)));
        renderChain();
      }, { passive: false });
      b.draggable = true;
      b.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/psy-move', String(idx));
        e.dataTransfer.effectAllowed = 'move';
        b.classList.add('dragging');
      });
      b.addEventListener('dragend', () => {
        b.classList.remove('dragging');
        clearDropMarks();
      });
      b.addEventListener('click', () => {
        chainStash = { entries: [seq.chain[idx]], at: idx };
        pushUndo();
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

  /* ---------- generators: euclidean rhythms + melody dice + automation ---------- */

  let autoRec = false;

  function wireGenerators() {
    const trackSel = $('gen-track');
    for (const t of PSY.Sequencer.TRACKS) {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = TRACK_META[t].label;
      trackSel.appendChild(opt);
    }

    $('gen-euclid').addEventListener('click', () => {
      pushUndo();
      const track = trackSel.value;
      const hits = Math.max(1, Math.min(16, +$('gen-hits').value || 5));
      const rot = Math.max(0, Math.min(15, +$('gen-rot').value || 0));
      const rhythm = PSY.euclid(hits, 16, rot);
      seq.pattern[track].forEach((st, i) => (st.on = rhythm[i]));
      renderAll();
    });

    $('gen-dice').addEventListener('click', () => {
      pushUndo();
      // scale-locked random melody: euclidean rhythm + mostly stepwise walk
      const hits = 6 + Math.floor(Math.random() * 5);
      const rhythm = PSY.euclid(hits, 16, Math.floor(Math.random() * 16));
      let deg = 4 + Math.floor(Math.random() * 4);
      seq.pattern.lead.forEach((st, i) => {
        st.on = rhythm[i];
        if (!rhythm[i]) return;
        const r = Math.random();
        deg += r < 0.4 ? -1 : r < 0.75 ? 1 : r < 0.85 ? -3 : r < 0.95 ? 2 : 4;
        deg = Math.max(0, Math.min(PSY.MAX_DEGREE, deg));
        st.note = deg;
        st.vel = i % 4 === 0 ? 1.2 : 0.85;
      });
      renderAll();
    });

    $('auto-rec').addEventListener('click', () => {
      autoRec = !autoRec;
      $('auto-rec').classList.toggle('armed', autoRec);
    });

    $('auto-clr').addEventListener('click', () => {
      pushUndo();
      seq.pattern.auto = {};
      document.querySelectorAll('.macro.automated').forEach((m) => m.classList.remove('automated'));
    });
  }

  // macro slider binding with optional automation capture
  // Numeric macros only — each is automatable, so `bindMacro` writes to
  // pattern.auto and the sequencer replays it live and offline. Style selects
  // deliberately stay out: a string in an automation lane would render as NaN.
  const MACRO_MAP = {
    'm-cutoff': { param: 'bassCutoff', scale: 1 },
    'm-decay': { param: 'bassDecay', scale: 1 / 1000 },
    'm-res': { param: 'leadRes', scale: 1 },
    'm-delay': { param: 'delayMix', scale: 1 / 100 },
    'm-drive': { param: 'drive', scale: 1 / 100 },
    // right = deeper pump, so the slider reads the way producers think
    'm-pump': { param: 'duckDepth', scale: 1 / 100, invert: true },
    'm-kickchar': { param: 'kickAttack', scale: 1 },
  };

  function bindMacro(id) {
    const { param, scale, invert } = MACRO_MAP[id];
    $(id).addEventListener('input', (e) => {
      const raw = +e.target.value * scale;
      const value = invert ? 1 - raw : raw;
      engine.setParam(param, value);
      if (autoRec && seq.playing && engine.ctx) {
        const k = seq.step + Math.round((engine.ctx.currentTime - seq.nextTime) / seq.stepDur);
        const idx = ((k % 16) + 16) % 16;
        if (!seq.pattern.auto[param]) seq.pattern.auto[param] = Array(16).fill(null);
        seq.pattern.auto[param][idx] = value;
        e.target.closest('.macro').classList.add('automated');
      }
    });
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
      pad.addEventListener('pointerdown', (e) => {
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
      pad.addEventListener('pointerdown', (e) => {
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

    wireFredFileDrop();
  }

  // drag an audio file (voice memo, sample) from the desktop onto FRED MODE
  function wireFredFileDrop() {
    const zone = document.querySelector('.fredmode');
    const hasFiles = (e) => [...e.dataTransfer.types].includes('Files');

    for (const ev of ['dragover', 'dragenter']) {
      zone.addEventListener(ev, (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        zone.classList.add('dropping');
      });
    }
    zone.addEventListener('dragleave', (e) => {
      if (!zone.contains(e.relatedTarget)) zone.classList.remove('dropping');
    });
    zone.addEventListener('drop', async (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      zone.classList.remove('dropping');
      const file = e.dataTransfer.files[0];
      if (!file || !/^audio\//.test(file.type)) return;
      try {
        engine.init();
        const raw = await file.arrayBuffer();
        let audio = await engine.ctx.decodeAudioData(raw);
        if (audio.duration > 20) audio = trimBuffer(audio, 20);
        engine.setVoiceBuffer(audio);
        drawVoiceWave(audio);
        $('mic-btn').textContent = '● RE-RECORD';
        voicePads.forEach((p) => p.classList.add('loaded'));
      } catch (err) {
        console.error('dropped file decode failed:', err);
      }
    });

    // don't let a missed drop navigate the page away to the audio file
    document.addEventListener('dragover', (e) => {
      if (hasFiles(e)) e.preventDefault();
    });
    document.addEventListener('drop', (e) => {
      if (hasFiles(e)) e.preventDefault();
    });
  }

  function trimBuffer(buf, secs) {
    const len = Math.min(buf.length, Math.floor(secs * buf.sampleRate));
    const out = engine.ctx.createBuffer(buf.numberOfChannels, len, buf.sampleRate);
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      out.getChannelData(ch).set(buf.getChannelData(ch).subarray(0, len));
    }
    return out;
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
    seq.chain = ['B', 'B', 'A', 'A', 'D', 'D', 'D', 'D', 'C', 'C', 'D', 'D']
      .map((s) => ({ s, t: 0 }));

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
    $('viz-preset').textContent = p.name + ' — ' + p.artist;
    $('about-text').innerHTML = p.desc;

    syncControls();
    selectSlot('A');
    renderChain();
    renderPads();
  }

  // Push engine/sequencer state OUT to every control. Reads from the live
  // engine rather than a preset object, so it also serves session restore and
  // shared links (where there is no preset to read from).
  function syncControls() {
    const P = engine.params;
    $('bpm').value = seq.bpm;
    $('bpm-val').textContent = seq.bpm;
    $('root').value = seq.rootMidi;
    $('scale').value = seq.scale;
    $('swing').value = Math.round(seq.swing * 100);
    $('swing-val').textContent = Math.round(seq.swing * 100) + '%';
    $('master').value = Math.round(P.master * 100);
    $('master-val').textContent = Math.round(P.master * 100);
    $('m-cutoff').value = P.bassCutoff;
    $('m-decay').value = Math.round(P.bassDecay * 1000);
    $('m-res').value = P.leadRes;
    $('m-delay').value = Math.round(P.delayMix * 100);
    $('m-drive').value = Math.round(P.drive * 100);
    $('bass-style').value = P.bassStyle;
    $('lead-style').value = P.leadStyle;
    $('m-pump').value = Math.round((1 - P.duckDepth) * 100);
    $('m-kickchar').value = P.kickAttack;
    $('vpitch').value = P.voicePitch;
    $('vpitch-val').textContent = P.voicePitch;
    $('mode').textContent = seq.mode.toUpperCase();
    $('mode').classList.toggle('song', seq.mode === 'song');
    $('mode').setAttribute('aria-pressed', String(seq.mode === 'song'));

    document.querySelectorAll('.track-vol').forEach((vol, idx) => {
      const t = PSY.Sequencer.TRACKS[idx];
      vol.value = Math.round(engine.levels[t] * 100);
    });
    document.querySelectorAll('.mute-btn').forEach((btn, idx) => {
      const t = PSY.Sequencer.TRACKS[idx];
      btn.classList.toggle('muted', !!engine.mutes[t]);
      btn.setAttribute('aria-pressed', String(!!engine.mutes[t]));
    });
  }

  /* ---------- undo (intent-level snapshots) ---------- */

  const undoStack = [];
  const redoStack = [];
  let undoCoalesceAt = 0;

  function snapshot() {
    return {
      patterns: JSON.parse(JSON.stringify(seq.patterns)),
      chain: JSON.parse(JSON.stringify(seq.chain)),
      currentSlot: seq.currentSlot,
      mode: seq.mode,
      rootMidi: seq.rootMidi,
      scale: seq.scale,
      bpm: seq.bpm,
      swing: seq.swing,
    };
  }

  function restoreSnapshot(s) {
    seq.patterns = JSON.parse(JSON.stringify(s.patterns));
    seq.chain = JSON.parse(JSON.stringify(s.chain));
    seq.currentSlot = s.currentSlot;
    seq.mode = s.mode;
    seq.rootMidi = s.rootMidi;
    seq.scale = s.scale;
    seq.setBpm(s.bpm);
    seq.swing = s.swing;
    syncControls();
    selectSlot(s.currentSlot);
    renderChain();
  }

  // Call BEFORE mutating. `coalesce` merges rapid same-gesture edits (drag
  // painting) into one undo entry.
  function pushUndo(coalesce) {
    const now = performance.now();
    if (coalesce && now - undoCoalesceAt < 400 && undoStack.length) {
      undoCoalesceAt = now;
      return;
    }
    undoCoalesceAt = now;
    undoStack.push(snapshot());
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
    updateUndoUi();
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    restoreSnapshot(undoStack.pop());
    updateUndoUi();
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    restoreSnapshot(redoStack.pop());
    updateUndoUi();
  }

  function updateUndoUi() {
    $('undo').disabled = !undoStack.length;
    $('redo').disabled = !redoStack.length;
  }

  /* ---------- session persistence + share links ---------- */

  const SAVE_KEY = 'psyforge.v1';

  function serialize() {
    return {
      v: 1,
      presetId: $('preset').value,
      bpm: seq.bpm,
      rootMidi: seq.rootMidi,
      scale: seq.scale,
      swing: seq.swing,
      mode: seq.mode,
      currentSlot: seq.currentSlot,
      chain: seq.chain,
      patterns: seq.patterns,
      params: engine.params,
      levels: engine.levels,
      mutes: engine.mutes,
      viz: { styleIndex: viz.styleIndex, word: viz.word },
      // the FRED take is an AudioBuffer — too big for storage and not ours to
      // keep without asking, so we only remember that the beat expects one
      needsVoice: PSY.Sequencer.SLOTS.some((s) => seq.patterns[s].voice.some((st) => st.on)),
    };
  }

  function deserialize(d) {
    if (!d || d.v !== 1) return false;
    const p = PSY.getPreset(d.presetId);
    $('preset').value = d.presetId;
    $('viz-preset').textContent = p.name + ' — ' + p.artist;
    $('about-text').innerHTML = p.desc;
    viz.setPalette(p.palette);

    for (const s of PSY.Sequencer.SLOTS) {
      if (d.patterns[s]) seq.patterns[s] = PSY.Sequencer.copyPattern(d.patterns[s]);
    }
    seq.chain = (d.chain || []).map((c) => (typeof c === 'string' ? { s: c, t: 0 } : { ...c }));
    seq.mode = d.mode === 'song' ? 'song' : 'loop';
    seq.rootMidi = d.rootMidi;
    seq.scale = d.scale;
    seq.swing = d.swing || 0;
    seq.setBpm(d.bpm);
    viz.bpm = d.bpm;

    Object.assign(engine.params, PSY.Engine.DEFAULTS, d.params || {});
    engine._updateDrive();
    for (const [t, v] of Object.entries(d.levels || {})) engine.setTrackLevel(t, v);
    for (const [t, m] of Object.entries(d.mutes || {})) engine.setMute(t, m);
    if (d.viz) {
      viz.styleIndex = d.viz.styleIndex || 0;
      $('viz-style').innerHTML = '&#10022; ' + PSY.Visualizer.STYLES[viz.styleIndex];
      if (d.viz.word) {
        $('word').value = d.viz.word;
        viz.setWord(d.viz.word);
      }
    }

    syncControls();
    selectSlot(d.currentSlot || 'A');
    renderChain();
    renderPads();
    if (d.needsVoice && !engine.voiceBuffer) flashBanner('This beat uses a voice note — record your own in FRED MODE');
    return true;
  }

  function autosave() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(serialize()));
    } catch (err) {
      /* private mode / quota — losing autosave is not worth breaking playback */
    }
  }

  function flashBanner(msg, ms = 6000) {
    const b = $('banner');
    b.textContent = msg;
    b.classList.add('show');
    clearTimeout(flashBanner._t);
    flashBanner._t = setTimeout(() => b.classList.remove('show'), ms);
  }

  // share link: JSON -> deflate-raw -> base64url in the hash
  const b64u = {
    enc: (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
    dec: (s) => {
      const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
      return Uint8Array.from(b, (c) => c.charCodeAt(0));
    },
  };

  async function makeShareLink() {
    const json = new TextEncoder().encode(JSON.stringify(serialize()));
    let bytes = json;
    if (window.CompressionStream) {
      const cs = new CompressionStream('deflate-raw');
      const w = cs.writable.getWriter();
      w.write(json);
      w.close();
      bytes = new Uint8Array(await new Response(cs.readable).arrayBuffer());
    }
    return location.origin + location.pathname + '#1.' + b64u.enc(bytes);
  }

  async function loadFromHash() {
    const h = location.hash;
    if (!h.startsWith('#1.')) return false;
    try {
      let bytes = b64u.dec(h.slice(3));
      if (window.DecompressionStream) {
        const ds = new DecompressionStream('deflate-raw');
        const w = ds.writable.getWriter();
        w.write(bytes);
        w.close();
        bytes = new Uint8Array(await new Response(ds.readable).arrayBuffer());
      }
      return deserialize(JSON.parse(new TextDecoder().decode(bytes)));
    } catch (err) {
      console.warn('shared link could not be read:', err);
      return false;
    }
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
      $('build').disabled = !seq.playing;
      if (!seq.playing) {
        clearPlayhead();
        setChainPlaying(-1);
        resetBuildBtn();
      }
    });

    // Track focus modality so Space can activate a keyboard-focused button
    // instead of always hitting the transport. Gating on tagName alone would
    // kill every shortcut whenever a mouse click left focus on a button.
    let kbdNav = false;
    document.addEventListener('keydown', (e) => { if (e.key === 'Tab') kbdNav = true; }, true);
    document.addEventListener('mousedown', () => { kbdNav = false; }, true);

    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if (mod) return; // leave browser shortcuts alone
      const ae = document.activeElement;
      if (kbdNav && ae && ae.tagName === 'BUTTON' && ae !== playBtn) return;
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
    const genreLabels = {
      psy: 'PSYTRANCE',
      edm: 'ELECTRONIC / EDM',
      bass: 'BASS & BREAKS',
      global: 'GLOBAL GROOVES',
      desi: 'DESI / PUNJABI',
    };
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

    // macros (with automation capture when AUTO is armed)
    for (const id of Object.keys(MACRO_MAP)) bindMacro(id);

    // Voice selects: swap the synth topology without reloading a preset (which
    // would overwrite all four slots). Both params are read at trigger time and
    // export.js deep-copies engine.params, so the WAV follows automatically.
    // Changing a voice also snaps its paired envelope macro — a reese/log gate
    // is floored well above a psy 16th, so keeping the psy decay would drone.
    const STYLE_PAIRS = {
      bassStyle: { roll: 55, reese: 300, log: 130, reverse: 300 },
      leadStyle: { acid: 13, saws: 5, fm: 8, pluck: 3, chord: 2, tumbi: 4, cowbell: 4, screech: 8 },
    };
    $('bass-style').addEventListener('change', (e) => {
      engine.setParam('bassStyle', e.target.value);
      const dec = STYLE_PAIRS.bassStyle[e.target.value];
      if (dec) {
        engine.setParam('bassDecay', dec / 1000);
        $('m-decay').value = dec;
      }
    });
    $('lead-style').addEventListener('change', (e) => {
      engine.setParam('leadStyle', e.target.value);
      const res = STYLE_PAIRS.leadStyle[e.target.value];
      if (res) {
        engine.setParam('leadRes', res);
        $('m-res').value = res;
      }
    });

    // undo / redo
    $('undo').addEventListener('click', undo);
    $('redo').addEventListener('click', redo);

    // share link
    $('share').addEventListener('click', async () => {
      const btn = $('share');
      const url = await makeShareLink();
      history.replaceState(null, '', url);
      try {
        await navigator.clipboard.writeText(url);
        btn.textContent = 'LINK COPIED';
      } catch (err) {
        btn.textContent = 'LINK IN URL BAR';
      }
      flashBanner('Shareable link ready — it carries your patterns, chain and sound settings.');
      setTimeout(() => (btn.innerHTML = '&#128279; SHARE'), 2600);
    });

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
        const reps = Math.max(1, Math.min(64, +$('export-reps').value || 1));
        const blob = await PSY.exportWav(seq, engine, { repeat: reps });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const mode = seq.mode === 'song' && seq.chain.length ? 'song' : 'loop';
        a.download = 'psyforge-' + $('preset').value + '-' + mode + '-' + seq.bpm + 'bpm.wav';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      } catch (err) {
        console.error('WAV export failed:', err);
        btn.textContent = '\u26a0 EXPORT FAILED';
        btn.title = String(err);
        btn.disabled = false;
        setTimeout(() => {
          btn.innerHTML = old;
          btn.title = 'Render to WAV';
        }, 3000);
        return;
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
      const on = !viz.enabled;
      wrap.classList.toggle('hidden-viz', !on);
      viz.setEnabled(on);
      e.target.textContent = on ? 'VIZ ON' : 'VIZ OFF';
      e.target.setAttribute('aria-pressed', String(on));
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
        case 'auto': {
          // keep the macro sliders visually following recorded automation
          for (const [id, m] of Object.entries(MACRO_MAP)) {
            if (m.param === e.param) {
              $(id).value = (m.invert ? 1 - e.value : e.value) / m.scale;
            }
          }
          break;
        }
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
  wireGenerators();
  wireControls();

  // Always boot the curated hero preset so a first visit (and a demo) is the
  // intended sound, then offer a restore instead of silently resurrecting a
  // half-finished session.
  applyPreset('fullon');
  updateUndoUi();

  // A shared link wins over the local session — it is an explicit intent.
  loadFromHash().then((fromLink) => {
    if (fromLink) {
      flashBanner('Loaded a shared beat. Edit freely — nothing here overwrites the sender.');
      return;
    }
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    } catch (err) { /* ignore unreadable storage */ }
    if (!saved) return;
    const btn = $('restore');
    btn.hidden = false;
    btn.addEventListener('click', () => {
      if (deserialize(saved)) {
        btn.hidden = true;
        flashBanner('Session restored.');
      }
    });
  });

  // Respect the OS reduced-motion setting: park the visualizer rather than
  // strobing an unwilling viewer. It is one click to turn back on.
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) {
    $('viz-toggle').click();
  }

  window.addEventListener('pagehide', autosave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') autosave();
  });
  setInterval(autosave, 20000);

  requestAnimationFrame(loop);
})();
