/* PSYFORGE — scales, note utilities and artist-inspired presets.
   Two genre families: psytrance (Astrix, Vini Vici, Infected Mushroom, goa,
   dark psy) and electronic/EDM (Avicii-style progressive house, big room,
   anthem house with choir chops). */
(function () {
  const PSY = (window.PSY = window.PSY || {});

  PSY.SCALES = {
    phrygian:      { name: 'Phrygian',           steps: [0, 1, 3, 5, 7, 8, 10] },
    phrygianDom:   { name: 'Phrygian Dominant',  steps: [0, 1, 4, 5, 7, 8, 10] },
    harmonicMinor: { name: 'Harmonic Minor',     steps: [0, 2, 3, 5, 7, 8, 11] },
    minor:         { name: 'Natural Minor',      steps: [0, 2, 3, 5, 7, 8, 10] },
    major:         { name: 'Major',              steps: [0, 2, 4, 5, 7, 9, 11] },
  };

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  PSY.midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
  PSY.midiName = (m) => NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);

  // scale degree (0..14, two octaves) -> semitone offset from root
  PSY.degreeToSemis = function (deg, scaleId) {
    const steps = (PSY.SCALES[scaleId] || PSY.SCALES.phrygian).steps;
    const oct = Math.floor(deg / steps.length);
    return steps[deg % steps.length] + 12 * oct;
  };

  PSY.MAX_DEGREE = 14;

  // vowels for the formant-synthesized VOX track
  PSY.VOWELS = ['ah', 'oh', 'oo', 'eh', 'ee'];
  PSY.VOWEL_CHAR = { ah: 'a', oh: 'o', oo: 'u', eh: 'e', ee: 'i' };

  /* ---------- pattern helpers ---------- */

  const KICK4 = [0, 4, 8, 12];
  const OFF8 = [2, 6, 10, 14];
  const ALL16 = Array.from({ length: 16 }, (_, i) => i);
  const ROLL = ALL16.filter((i) => !KICK4.includes(i)); // the K-B-B-B full-on roll
  const EIGHTHS = [0, 2, 4, 6, 8, 10, 12, 14];
  const CLAP24 = [4, 12]; // claps on beats 2 & 4

  // build one track's 16 steps from {on, acc, note, vowel} shorthand
  function tk(on, acc, note, vowel) {
    const accSet = new Set(acc || []);
    return Array.from({ length: 16 }, (_, i) => ({
      on: (on || []).includes(i),
      vel: accSet.has(i) ? 1.2 : 0.85,
      note: note && note[i] !== undefined ? note[i] : 0,
      vowel: vowel && vowel[i] !== undefined ? vowel[i] : 'ah',
    }));
  }

  /* ---------- presets ----------
     Patterns are original, written in the *style* of each artist/track —
     rhythm archetypes and sound-design character, not copies.
     Engine keys override psy-flavored defaults (see Engine.DEFAULTS). */

  PSY.PRESETS = [
    /* ============ PSYTRANCE ============ */
    {
      id: 'fullon',
      genre: 'psy',
      name: 'Full-On Roller',
      artist: 'Astrix-style full-on',
      bpm: 145,
      rootMidi: 28, // E1
      scale: 'phrygian',
      palette: { h1: 300, h2: 185, sym: 8 },
      desc: 'The classic festival engine, in the style of <b>Astrix</b> ("Type 1", "Closer to Heaven"). Kick on the floor, rolling K-B-B-B triplet bass on E1, offbeat open hats and a descending Phrygian lead run. This is the heartbeat of full-on psytrance at 145 BPM.',
      engine: {
        bassCutoff: 780, bassDecay: 0.055, bassWave: 'sawtooth',
        leadStyle: 'saws', leadRes: 6, delayMix: 0.22, drive: 0.45, kickTune: 50,
      },
      levels: { kick: 0.95, clap: 0.5, bass: 0.9, chat: 0.4, ohat: 0.45, lead: 0.6, vox: 0.6, fx: 0.5 },
      tracks: {
        kick: tk(KICK4, KICK4),
        clap: tk([]),
        bass: tk(ROLL, [1, 5, 9, 13]),
        chat: tk(ALL16, OFF8),
        ohat: tk(OFF8),
        lead: tk([6, 7, 11, 14, 15], [6, 14], { 6: 4, 7: 3, 11: 2, 14: 1, 15: 0 }),
        vox:  tk([]),
        fx:   tk([]),
      },
    },
    {
      id: 'tribal',
      genre: 'psy',
      name: 'Tribal Spirit',
      artist: 'Vini Vici-style prog-tribal',
      bpm: 138,
      rootMidi: 28,
      scale: 'phrygian',
      palette: { h1: 28, h2: 150, sym: 6 },
      desc: 'Prog-tribal in the style of <b>Vini Vici</b> ("Great Spirit", "The Tribe"): offbeat bass that erupts into a galloping roll-in fill at the end of the bar, sparse FM stabs like didgeridoo hits — and now a low formant-synth chant answering the drums. 138 BPM, hypnotic and huge.',
      engine: {
        bassCutoff: 640, bassDecay: 0.12, bassWave: 'sawtooth',
        leadStyle: 'fm', leadRes: 8, delayMix: 0.3, drive: 0.35, kickTune: 48,
      },
      levels: { kick: 0.95, clap: 0.5, bass: 0.9, chat: 0.32, ohat: 0.42, lead: 0.55, vox: 0.65, fx: 0.55 },
      tracks: {
        kick: tk(KICK4, KICK4),
        clap: tk([]),
        bass: tk([2, 6, 10, 13, 14, 15], [13]),
        chat: tk(EIGHTHS, OFF8),
        ohat: tk(OFF8),
        lead: tk([0, 8, 10], [0], { 0: 0, 8: 2, 10: 1 }),
        vox:  tk([0, 10], [0], { 0: 0, 10: 1 }, { 0: 'oh', 10: 'ah' }),
        fx:   tk([4]),
      },
    },
    {
      id: 'prog',
      genre: 'psy',
      name: 'Progressive Groove',
      artist: 'Neelix-style progressive',
      bpm: 138,
      rootMidi: 28,
      scale: 'minor',
      palette: { h1: 200, h2: 320, sym: 6 },
      desc: 'Club-friendly progressive psy in the style of <b>Neelix</b> and <b>Phaxe</b>: one long offbeat bass note breathing between the kicks, minimal hats, a wistful minor-key lead answering on the late 16ths, and a soft "oo" vocal pad floating in between. Groove over aggression.',
      engine: {
        bassCutoff: 560, bassDecay: 0.16, bassWave: 'sawtooth',
        leadStyle: 'saws', leadRes: 3, delayMix: 0.35, drive: 0.3, kickTune: 49,
      },
      levels: { kick: 0.95, clap: 0.5, bass: 0.95, chat: 0.3, ohat: 0.4, lead: 0.55, vox: 0.5, fx: 0.4 },
      tracks: {
        kick: tk(KICK4, KICK4),
        clap: tk([]),
        bass: tk(OFF8, OFF8),
        chat: tk(EIGHTHS),
        ohat: tk(OFF8),
        lead: tk([3, 7, 11, 15], [3], { 3: 4, 7: 3, 11: 1, 15: 2 }),
        vox:  tk([7], [], { 7: 4 }, { 7: 'oo' }),
        fx:   tk([]),
      },
    },
    {
      id: 'insane',
      genre: 'psy',
      name: 'Insane Mode',
      artist: 'Infected Mushroom-style full-on',
      bpm: 145,
      rootMidi: 29, // F1
      scale: 'phrygianDom',
      palette: { h1: 120, h2: 280, sym: 12 },
      desc: 'Twisted full-on in the style of <b>Infected Mushroom</b> ("Becoming Insane", "Saeed"): the rolling bass under a squelchy FM lead phrase in Phrygian Dominant — that flamenco-flavored b2/major-3rd tension — plus glitchy zap accents. Crank the resonance.',
      engine: {
        bassCutoff: 800, bassDecay: 0.05, bassWave: 'sawtooth',
        leadStyle: 'fm', leadRes: 10, delayMix: 0.3, drive: 0.55, kickTune: 51,
      },
      levels: { kick: 0.95, clap: 0.5, bass: 0.9, chat: 0.38, ohat: 0.42, lead: 0.62, vox: 0.6, fx: 0.5 },
      tracks: {
        kick: tk(KICK4, KICK4),
        clap: tk([]),
        bass: tk(ROLL, [1, 5, 9, 13]),
        chat: tk(ALL16, OFF8),
        ohat: tk(OFF8),
        lead: tk([2, 3, 6, 10, 11, 14], [2, 10], { 2: 0, 3: 0, 6: 3, 10: 4, 11: 3, 14: 1 }),
        vox:  tk([]),
        fx:   tk([12]),
      },
    },
    {
      id: 'goa',
      genre: 'psy',
      name: 'Goa Acid',
      artist: 'Hallucinogen / Astral Projection-style goa',
      bpm: 140,
      rootMidi: 26, // D1
      scale: 'harmonicMinor',
      palette: { h1: 40, h2: 305, sym: 12 },
      desc: 'Old-school goa in the style of <b>Hallucinogen</b> ("LSD") and <b>Astral Projection</b> ("Mahadeva"): a full 16th-note 303 acid line snaking through D harmonic minor with glides and accents, over the rolling bass. Pure 1996 Twisted Records energy.',
      engine: {
        bassCutoff: 700, bassDecay: 0.06, bassWave: 'sawtooth',
        leadStyle: 'acid', leadRes: 14, delayMix: 0.3, drive: 0.4, kickTune: 49,
      },
      levels: { kick: 0.95, clap: 0.5, bass: 0.85, chat: 0.36, ohat: 0.42, lead: 0.6, vox: 0.6, fx: 0.4 },
      tracks: {
        kick: tk(KICK4, KICK4),
        clap: tk([]),
        bass: tk(ROLL, [1, 5, 9, 13]),
        chat: tk(ALL16, OFF8),
        ohat: tk(OFF8),
        lead: tk(ALL16, KICK4, {
          0: 0, 1: 0, 2: 7, 3: 0,
          4: 3, 5: 0, 6: 7, 7: 0,
          8: 5, 9: 0, 10: 7, 11: 3,
          12: 8, 13: 7, 14: 5, 15: 3,
        }),
        vox:  tk([]),
        fx:   tk([]),
      },
    },
    {
      id: 'forest',
      genre: 'psy',
      name: 'Forest Floor',
      artist: 'Kindzadza-style dark psy',
      bpm: 150,
      rootMidi: 28,
      scale: 'phrygian',
      palette: { h1: 105, h2: 268, sym: 5 },
      desc: 'Night-time dark psy in the style of <b>Kindzadza</b> and the <b>Parvati Records</b> forest sound: a relentless static E1 roll on every 16th, no melody at all, just squelching zap FX crawling through the undergrowth at 150 BPM. Tighter, darker kick.',
      engine: {
        bassCutoff: 520, bassDecay: 0.045, bassWave: 'square',
        leadStyle: 'acid', leadRes: 12, delayMix: 0.4, drive: 0.5, kickTune: 47,
      },
      levels: { kick: 0.95, clap: 0.5, bass: 0.85, chat: 0.25, ohat: 0.3, lead: 0.5, vox: 0.55, fx: 0.6 },
      tracks: {
        kick: tk(KICK4, KICK4),
        clap: tk([]),
        bass: tk(ROLL, []),
        chat: tk(ALL16),
        ohat: tk(OFF8),
        lead: tk([]),
        vox:  tk([]),
        fx:   tk([3, 9, 14], [9]),
      },
    },

    /* ============ ELECTRONIC / EDM ============ */
    {
      id: 'levels',
      genre: 'edm',
      name: 'Levels Anthem',
      artist: 'Avicii-style progressive house',
      bpm: 126,
      rootMidi: 28, // E1
      scale: 'major',
      palette: { h1: 42, h2: 205, sym: 6 },
      desc: 'Sunrise-festival progressive house in the style of <b>Avicii</b> ("Levels", "Wake Me Up"): a boomy four-on-the-floor kick with deep sidechain pump, claps on 2 & 4, offbeat bass, a bright major-key pluck melody echoing into the sky, and vocal chops answering in the gaps. 126 BPM of pure euphoria.',
      engine: {
        kickAttack: 320, kickDecay: 0.5, kickTune: 46,
        duckDepth: 0.2, duckRelease: 0.26,
        bassCutoff: 620, bassDecay: 0.2, bassWave: 'sawtooth',
        leadStyle: 'pluck', leadRes: 3, delayMix: 0.34, drive: 0.3,
      },
      levels: { kick: 0.95, clap: 0.6, bass: 0.85, chat: 0.3, ohat: 0.4, lead: 0.62, vox: 0.62, fx: 0.4 },
      tracks: {
        kick: tk(KICK4, KICK4),
        clap: tk(CLAP24, CLAP24),
        bass: tk(OFF8),
        chat: tk(EIGHTHS),
        ohat: tk(OFF8),
        lead: tk([0, 2, 3, 6, 8, 10, 11, 14], [0, 8], { 0: 4, 2: 5, 3: 7, 6: 4, 8: 2, 10: 4, 11: 5, 14: 1 }),
        vox:  tk([7, 15], [], { 7: 7, 15: 4 }, { 7: 'oh', 15: 'ah' }),
        fx:   tk([]),
      },
    },
    {
      id: 'bigroom',
      genre: 'edm',
      name: 'Big Room Drop',
      artist: 'Martin Garrix-style big room',
      bpm: 128,
      rootMidi: 29, // F1
      scale: 'minor',
      palette: { h1: 265, h2: 190, sym: 8 },
      desc: 'Mainstage big room in the style of <b>Martin Garrix</b> ("Animals") and <b>Hardwell</b>: a cannon of a kick, minimal minor-key lead stabs bouncing between the hits, short subs, and one lonely "oh" chop before the next drop. Maximum festival, minimum subtlety. 128 BPM.',
      engine: {
        kickAttack: 380, kickDecay: 0.46, kickTune: 45,
        duckDepth: 0.25, duckRelease: 0.22,
        bassCutoff: 500, bassDecay: 0.08, bassWave: 'sawtooth',
        leadStyle: 'saws', leadRes: 4, delayMix: 0.26, drive: 0.55,
      },
      levels: { kick: 1.0, clap: 0.55, bass: 0.8, chat: 0.3, ohat: 0.38, lead: 0.65, vox: 0.58, fx: 0.45 },
      tracks: {
        kick: tk(KICK4, KICK4),
        clap: tk(CLAP24, CLAP24),
        bass: tk(OFF8),
        chat: tk(EIGHTHS),
        ohat: tk(OFF8),
        lead: tk([2, 6, 7, 10, 14], [2, 10], { 2: 0, 6: 0, 7: 2, 10: 0, 14: 3 }),
        vox:  tk([9], [], { 9: 7 }, { 9: 'oh' }),
        fx:   tk([0]),
      },
    },
    {
      id: 'choir',
      genre: 'edm',
      name: 'Festival Choir',
      artist: 'Swedish House Mafia-style anthem house',
      bpm: 126,
      rootMidi: 28, // E1
      scale: 'major',
      palette: { h1: 320, h2: 48, sym: 6 },
      desc: 'Hands-in-the-air anthem house in the style of <b>Swedish House Mafia</b> ("Don\'t You Worry Child") and <b>Alesso</b>: full major-key chord stabs pumping against the kick, and a formant-synth choir singing "ah-oh-oo" phrases in between — the crowd-vocal moment, synthesized. 126 BPM.',
      engine: {
        kickAttack: 340, kickDecay: 0.5, kickTune: 47,
        duckDepth: 0.2, duckRelease: 0.26,
        bassCutoff: 650, bassDecay: 0.2, bassWave: 'sawtooth',
        leadStyle: 'chord', leadRes: 2, delayMix: 0.3, drive: 0.3,
      },
      levels: { kick: 0.95, clap: 0.6, bass: 0.85, chat: 0.28, ohat: 0.4, lead: 0.55, vox: 0.7, fx: 0.4 },
      tracks: {
        kick: tk(KICK4, KICK4),
        clap: tk(CLAP24, CLAP24),
        bass: tk(OFF8),
        chat: tk(EIGHTHS),
        ohat: tk(OFF8),
        lead: tk([0, 3, 6, 10, 13], [0], { 0: 0, 3: 0, 6: 5, 10: 3, 13: 4 }),
        vox:  tk([2, 7, 8, 11, 15], [2, 8], { 2: 7, 7: 9, 8: 7, 11: 8, 15: 11 }, { 2: 'ah', 7: 'oh', 8: 'oo', 11: 'eh', 15: 'ah' }),
        fx:   tk([]),
      },
    },
  ];

  PSY.getPreset = (id) => PSY.PRESETS.find((p) => p.id === id) || PSY.PRESETS[0];
})();
