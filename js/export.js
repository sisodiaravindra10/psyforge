/* PSYFORGE — offline WAV rendering.
   Rebuilds the identical synth graph on an OfflineAudioContext, schedules the
   loop (8 bars) or the whole song chain through the same trigger path the live
   sequencer uses, renders, and encodes 16-bit stereo PCM. */
(function () {
  const PSY = (window.PSY = window.PSY || {});

  PSY.exportWav = async function (seq, engine, opts = {}) {
    const bpm = seq.bpm;
    const stepDur = 60 / bpm / 4;
    const barDur = stepDur * 16;
    const useSong = seq.mode === 'song' && seq.chain.length > 0;
    const reps = Math.max(1, Math.min(64, Math.round(opts.repeat || 1)));
    const bars = (useSong ? seq.chain.length : 8) * reps;
    const lead = 0.1; // pre-roll silence
    const tail = 3.5; // let delay feedback + a crash ring out
    const sr = 44100;

    const off = new OfflineAudioContext(2, Math.ceil((lead + bars * barDur + tail) * sr), sr);

    const eng2 = new PSY.Engine();
    eng2.params = JSON.parse(JSON.stringify(engine.params));
    eng2.levels = { ...engine.levels };
    eng2.mutes = { ...engine.mutes };
    eng2.voiceBuffer = engine.voiceBuffer; // voice-note slices render offline too
    eng2.init(off);
    // init() consumes the first-call branch that hard-sets delay times, so clear
    // the flag: otherwise every render glides the delay in from 145 BPM
    eng2._tempoInit = false;
    eng2.setTempo(bpm);

    const seq2 = new PSY.Sequencer(eng2);
    seq2.bpm = bpm;
    seq2.rootMidi = seq.rootMidi;
    seq2.scale = seq.scale;
    seq2.swing = seq.swing;
    seq2.mode = useSong ? 'song' : 'loop';
    seq2.chain = seq.chain.map((c) => (typeof c === 'string' ? { s: c, t: 0 } : { ...c }));
    seq2.currentSlot = seq.currentSlot;
    for (const s of PSY.Sequencer.SLOTS) {
      seq2.patterns[s] = PSY.Sequencer.copyPattern(seq.patterns[s]);
    }

    for (let bar = 0; bar < bars; bar++) {
      const pat = seq2.patternForBar(bar);
      const trans = seq2.transposeForBar(bar);
      for (let i = 0; i < 16; i++) {
        const t = lead + bar * barDur + i * stepDur + (i % 2 ? seq2.swing * stepDur : 0);
        seq2._applyAuto(pat, i, t);
        seq2._trigger(pat, i, t, trans);
      }
    }
    seq2.events.length = 0;

    const buffer = await off.startRendering();
    return encodeWav(buffer);
  };

  function encodeWav(buffer) {
    const numCh = buffer.numberOfChannels;
    const sr = buffer.sampleRate;
    const len = buffer.length;
    const bytesPerSample = 2;
    const dataSize = len * numCh * bytesPerSample;
    const out = new ArrayBuffer(44 + dataSize);
    const view = new DataView(out);

    const writeStr = (off, s) => {
      for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numCh, true);
    view.setUint32(24, sr, true);
    view.setUint32(28, sr * numCh * bytesPerSample, true);
    view.setUint16(32, numCh * bytesPerSample, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);

    const chans = [];
    for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
    let off = 44;
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < numCh; c++) {
        const s = Math.max(-1, Math.min(1, chans[c][i]));
        view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        off += 2;
      }
    }
    return new Blob([out], { type: 'audio/wav' });
  }
})();
