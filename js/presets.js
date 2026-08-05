/* PSYFORGE — scales, note utilities and artist-inspired presets.
   Two genre families: psytrance (Astrix, Vini Vici, Infected Mushroom, goa,
   dark psy) and electronic/EDM (Avicii-style progressive house, big room,
   anthem house with choir chops). */
(function () {
  const PSY = (window.PSY = window.PSY || {});

  PSY.SCALES = {
    phrygian:       { name: 'Phrygian',           steps: [0, 1, 3, 5, 7, 8, 10] },
    phrygianDom:    { name: 'Phrygian Dominant',  steps: [0, 1, 4, 5, 7, 8, 10] },
    harmonicMinor:  { name: 'Harmonic Minor',     steps: [0, 2, 3, 5, 7, 8, 11] },
    minor:          { name: 'Natural Minor',      steps: [0, 2, 3, 5, 7, 8, 10] },
    major:          { name: 'Major',              steps: [0, 2, 4, 5, 7, 9, 11] },
    mixolydian:     { name: 'Mixolydian',         steps: [0, 2, 4, 5, 7, 9, 10] },
    doubleHarmonic: { name: 'Bhairav (Dbl Harm)', steps: [0, 1, 4, 5, 7, 8, 11] },
  };

  // euclidean rhythm: distribute `hits` onsets as evenly as possible over `steps`
  PSY.euclid = (hits, steps = 16, rot = 0) => {
    const arr = [];
    for (let i = 0; i < steps; i++) {
      const j = (((i - rot) % steps) + steps) % steps;
      arr.push((j * hits) % steps < hits);
    }
    return arr;
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
        hatDecayOpen: 0.28,
        bassCutoff: 780, bassDecay: 0.055, bassWave: 'sawtooth',
        leadStyle: 'saws', leadRes: 6, delayMix: 0.22, drive: 0.45, kickTune: 50,
      },
      levels: { kick: 0.8, clap: 0.5, bass: 0.75, chat: 0.58, ohat: 0.63, lead: 0.6, vox: 0.6, fx: 0.5 },
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
      levels: { kick: 0.8, clap: 0.5, bass: 0.75, chat: 0.464, ohat: 0.588, lead: 0.55, vox: 0.65, fx: 0.55 },
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
      levels: { kick: 0.8, clap: 0.5, bass: 0.75, chat: 0.435, ohat: 0.56, lead: 0.55, vox: 0.5, fx: 0.4 },
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
      levels: { kick: 0.8, clap: 0.5, bass: 0.75, chat: 0.551, ohat: 0.588, lead: 0.62, vox: 0.6, fx: 0.5 },
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
      levels: { kick: 0.8, clap: 0.5, bass: 0.75, chat: 0.522, ohat: 0.588, lead: 0.6, vox: 0.6, fx: 0.4 },
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
      levels: { kick: 0.8, clap: 0.5, bass: 0.75, chat: 0.362, ohat: 0.42, lead: 0.5, vox: 0.55, fx: 0.6 },
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
      levels: { kick: 0.8, clap: 0.6, bass: 0.75, chat: 0.435, ohat: 0.56, lead: 0.62, vox: 0.62, fx: 0.4 },
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
      levels: { kick: 0.8, clap: 0.55, bass: 0.75, chat: 0.435, ohat: 0.532, lead: 0.65, vox: 0.58, fx: 0.45 },
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
      levels: { kick: 0.8, clap: 0.6, bass: 0.75, chat: 0.406, ohat: 0.56, lead: 0.55, vox: 0.7, fx: 0.4 },
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

  /* ============ DESI / PUNJABI ============ */
  PSY.PRESETS.push(
    {
      id: 'punjabi',
      genre: 'desi',
      name: 'Punjabi Dhol',
      artist: 'Panjabi MC / Diljit-style bhangra',
      bpm: 102,
      rootMidi: 31, // G1
      scale: 'major',
      swing: 0.12,
      palette: { h1: 35, h2: 130, sym: 8 },
      desc: 'Pure bhangra engine in the style of <b>Panjabi MC</b> ("Mundian To Bach Ke") and <b>Diljit Dosanjh</b>: the dhol <b>chaal</b> gallop (dha&hellip;dha-dha&hellip;) on a thuddy kick, high "ta" slaps, a twangy <b>tumbi</b> riff bouncing on the high strings, and "hoi! hoi!" chants on the offbeats. 102 BPM with a light swing lilt.',
      engine: {
        hatToneClosed: 6400, hatToneOpen: 5800, hatDecayClosed: 0.045, hatDecayOpen: 0.16,
        kickAttack: 240, kickDecay: 0.3, kickTune: 56,
        duckDepth: 0.6, duckRelease: 0.1,
        bassCutoff: 620, bassDecay: 0.16, bassWave: 'sawtooth',
        leadStyle: 'tumbi', leadRes: 4, delayMix: 0.16, drive: 0.35,
        clapTone: 2000,
      },
      levels: { kick: 0.8, clap: 0.6, bass: 0.75, chat: 0.435, ohat: 0.42, lead: 0.68, vox: 0.7, fx: 0.4 },
      tracks: {
        kick: tk([0, 3, 6, 8, 11, 14], [0, 8]), // the chaal gallop
        clap: tk([4, 7, 12, 15], [4, 12]),      // "ta" slaps on 2 & 4 + ghost kas
        bass: tk([0, 6, 8, 14], [0, 8], { 0: 0, 6: 0, 8: 0, 14: 4 }),
        chat: tk(EIGHTHS),
        ohat: tk([2, 10]),
        lead: tk([0, 2, 3, 4, 6, 8, 10, 11, 14], [0, 6], {
          0: 7, 2: 7, 3: 9, 4: 7, 6: 11, 8: 7, 10: 9, 11: 7, 14: 6,
        }),
        vox:  tk([7, 15], [7, 15], { 7: 9, 15: 7 }, { 7: 'oh', 15: 'ee' }), // hoi! hoi!
        fx:   tk([]),
      },
    },
    {
      id: 'desipsy',
      genre: 'desi',
      name: 'Desi Psy Fusion',
      artist: 'Bhangra x full-on psytrance',
      bpm: 145,
      rootMidi: 28, // E1
      scale: 'phrygianDom',
      swing: 0,
      palette: { h1: 15, h2: 45, sym: 12 },
      desc: 'The fusion set: a full-on psytrance roller carrying a <b>tumbi</b> riff in Phrygian Dominant (that desert-exotic double-take), dhol-style slaps riding beats 2 & 4, and low "oh-ah" chants under the roll. What happens when the Punjab meets the party at 145 BPM.',
      engine: {
        bassCutoff: 760, bassDecay: 0.055, bassWave: 'sawtooth',
        leadStyle: 'tumbi', leadRes: 5, delayMix: 0.28, drive: 0.45, kickTune: 50,
        clapTone: 1900,
      },
      levels: { kick: 0.8, clap: 0.5, bass: 0.75, chat: 0.551, ohat: 0.588, lead: 0.65, vox: 0.62, fx: 0.45 },
      tracks: {
        kick: tk(KICK4, KICK4),
        clap: tk(CLAP24, CLAP24),
        bass: tk(ROLL, [1, 5, 9, 13]),
        chat: tk(ALL16, OFF8),
        ohat: tk(OFF8),
        lead: tk([2, 3, 6, 7, 10, 11, 14], [2, 10], {
          2: 7, 3: 8, 6: 7, 7: 9, 10: 7, 11: 8, 14: 10,
        }),
        vox:  tk([0, 8], [0], { 0: 0, 8: 1 }, { 0: 'oh', 8: 'ah' }),
        fx:   tk([12]),
      },
    }
  );

  /* ============ EDM: TRANCE + HARDSTYLE ============ */
  PSY.PRESETS.push(
    {
      id: 'trance',
      genre: 'edm',
      name: 'Uplift 138',
      artist: 'Armin / ASOT-style uplifting trance',
      bpm: 138,
      rootMidi: 28,
      scale: 'minor',
      palette: { h1: 220, h2: 330, sym: 12 },
      desc: 'Classic uplifting trance in the style of <b>Armin van Buuren</b> and the ASOT era: offbeat bass pumping under a driving 8th-note supersaw line, claps riding 2 & 4, everything soaked in delay. Hands up at 138.',
      engine: {
        kickAttack: 600, kickDecay: 0.3, kickTune: 48,
        duckDepth: 0.35, duckRelease: 0.2,
        bassCutoff: 680, bassDecay: 0.18, bassWave: 'sawtooth',
        leadStyle: 'saws', leadRes: 4, delayMix: 0.35, drive: 0.35,
      },
      levels: { kick: 0.8, clap: 0.5, bass: 0.75, chat: 0.435, ohat: 0.56, lead: 0.6, vox: 0.55, fx: 0.4 },
      tracks: {
        kick: tk(KICK4, KICK4),
        clap: tk(CLAP24, CLAP24),
        bass: tk(OFF8, OFF8),
        chat: tk(ALL16),
        ohat: tk(OFF8),
        lead: tk(EIGHTHS, [0, 8], { 0: 0, 2: 4, 4: 3, 6: 4, 8: 5, 10: 4, 12: 3, 14: 1 }),
        vox:  tk([15], [], { 15: 7 }, { 15: 'ah' }),
        fx:   tk([]),
      },
    },
    {
      id: 'hardstyle',
      genre: 'edm',
      name: 'Hard Mode',
      artist: 'Headhunterz / Wildstylez-style hardstyle',
      bpm: 150,
      rootMidi: 29, // F1
      scale: 'phrygian',
      palette: { h1: 0, h2: 55, sym: 8 },
      desc: 'Mainstage hardstyle in the style of <b>Headhunterz</b> and <b>Wildstylez</b>: a punchy kick answered by the signature <b>reverse bass</b> swelling into every offbeat, and distorted screech stabs on top. 150 BPM of stomp.',
      engine: {
        kickAttack: 2200, kickDecay: 0.34, kickTune: 55,
        duckDepth: 0.5, duckRelease: 0.12,
        bassStyle: 'reverse', bassCutoff: 900, bassDecay: 0.3, bassWave: 'sawtooth',
        leadStyle: 'screech', leadRes: 8, delayMix: 0.22, drive: 0.7,
      },
      levels: { kick: 0.8, clap: 0.45, bass: 0.75, chat: 0.435, ohat: 0.49, lead: 0.55, vox: 0.5, fx: 0.4 },
      tracks: {
        kick: tk(KICK4, KICK4),
        clap: tk(CLAP24),
        bass: tk(OFF8, OFF8),
        chat: tk(EIGHTHS),
        ohat: tk([]),
        lead: tk([2, 6, 10, 14], [2, 6, 10, 14], { 2: 0, 6: 1, 10: 0, 14: 3 }),
        vox:  tk([]),
        fx:   tk([0]),
      },
    }
  );

  /* ============ BASS & BREAKS ============ */
  PSY.PRESETS.push(
    {
      id: 'dnb',
      genre: 'bass',
      name: 'Neuro Roller',
      artist: 'Pendulum / Noisia-style drum & bass',
      bpm: 174,
      rootMidi: 28,
      scale: 'minor',
      palette: { h1: 150, h2: 210, sym: 8 },
      desc: 'Drum & bass in the style of <b>Pendulum</b> and <b>Noisia</b>: the two-step break (kick displaced, snares cracking 2 & 4) over a detuned <b>Reese bass</b> — two saws beating against each other through the filter. 174 BPM, half-time heads, full-time feet.',
      engine: {
        hatToneClosed: 5600, hatDecayClosed: 0.05,
        kickAttack: 900, kickDecay: 0.2, kickTune: 52,
        duckDepth: 0.55, duckRelease: 0.08,
        bassStyle: 'reese', bassCutoff: 480, bassDecay: 0.3, bassWave: 'sawtooth',
        leadStyle: 'fm', leadRes: 6, delayMix: 0.25, drive: 0.5,
        clapTone: 1500,
      },
      // the Reese is two saws plus a sub sustained across a 3-step gate — much
      // denser than a plucked psy roll, so it needs its own trim to leave crest
      levels: { kick: 0.8, clap: 0.65, bass: 0.5, chat: 0.464, ohat: 0.49, lead: 0.5, vox: 0.5, fx: 0.4 },
      tracks: {
        kick: tk([0, 10], [0, 10]),
        clap: tk(CLAP24, CLAP24),
        bass: tk([0, 6, 8, 14], [0, 8], { 0: 0, 6: 0, 8: 1, 14: 0 }),
        chat: tk(ALL16, [2, 6, 10, 14]),
        ohat: tk([7, 15]),
        lead: tk([3, 11], [], { 3: 7, 11: 8 }),
        vox:  tk([]),
        fx:   tk([13]),
      },
    },
    {
      id: 'ukgarage',
      genre: 'bass',
      name: '2-Step Shuffle',
      artist: 'MJ Cole / Artful Dodger-style UK garage',
      bpm: 132,
      rootMidi: 28,
      scale: 'mixolydian',
      palette: { h1: 260, h2: 190, sym: 6 },
      desc: 'UK garage in the style of <b>MJ Cole</b> and <b>Artful Dodger</b>: the 2-step kick (beat two goes missing), skippy swung hats, warm sub stabs — and chopped vocal syllables bouncing through the gaps, which is exactly what the VOX track was born for. Heavy shuffle.',
      swing: 0.22,
      engine: {
        kickAttack: 700, kickDecay: 0.22, kickTune: 50,
        duckDepth: 0.6, duckRelease: 0.1,
        bassCutoff: 550, bassDecay: 0.12, bassWave: 'sawtooth',
        leadStyle: 'pluck', leadRes: 3, delayMix: 0.3, drive: 0.35,
        clapTone: 1600,
      },
      levels: { kick: 0.8, clap: 0.6, bass: 0.75, chat: 0.551, ohat: 0.56, lead: 0.5, vox: 0.68, fx: 0.4 },
      tracks: {
        kick: tk([0, 7, 10], [0]),
        clap: tk(CLAP24, [12]),
        bass: tk([2, 5, 11, 14], [2], { 2: 0, 5: 0, 11: 1, 14: 4 }),
        chat: tk([2, 3, 6, 10, 11, 14], [3, 11]),
        ohat: tk([2, 10]),
        lead: tk([8], [], { 8: 4 }),
        vox:  tk([3, 6, 11, 15], [3, 11], { 3: 7, 6: 9, 11: 8, 15: 5 }, { 3: 'oh', 6: 'eh', 11: 'ah', 15: 'oo' }),
        fx:   tk([]),
      },
    },
    {
      id: 'phonk',
      genre: 'bass',
      name: 'Memphis Drift',
      artist: 'Drift phonk / Memphis rap style',
      bpm: 130,
      rootMidi: 28,
      scale: 'minor',
      palette: { h1: 280, h2: 0, sym: 6 },
      desc: 'Drift phonk: the half-time backbeat (one lonely snare on beat 3), an 808-style boomy bass, low chant vocals — and the signature <b>cowbell melody</b> riding on top like it\'s 1994 in Memphis. Night drives only.',
      swing: 0.05,
      engine: {
        hatToneClosed: 4600, hatDecayClosed: 0.09,
        kickAttack: 500, kickDecay: 0.35, kickTune: 47,
        duckDepth: 0.55, duckRelease: 0.15,
        bassStyle: 'log', bassCutoff: 800, bassDecay: 0.3, bassWave: 'sawtooth',
        leadStyle: 'cowbell', leadRes: 4, delayMix: 0.18, drive: 0.6,
        clapTone: 1300,
      },
      levels: { kick: 0.8, clap: 0.6, bass: 0.75, chat: 0.435, ohat: 0.35, lead: 0.6, vox: 0.55, fx: 0.4 },
      tracks: {
        kick: tk([0, 10], [0]),
        clap: tk([8], [8]),
        bass: tk([0, 10], [0], { 0: 0, 10: 1 }),
        chat: tk(EIGHTHS, [14]),
        ohat: tk([]),
        lead: tk([0, 2, 4, 5, 8, 10, 12, 13], [0, 8], { 0: 7, 2: 7, 4: 10, 5: 9, 8: 7, 10: 5, 12: 4, 13: 7 }),
        vox:  tk([6, 14], [], { 6: 1, 14: 0 }, { 6: 'oh', 14: 'ah' }),
        fx:   tk([]),
      },
    }
  );

  /* ============ GLOBAL GROOVES ============ */
  PSY.PRESETS.push(
    {
      id: 'amapiano',
      genre: 'global',
      name: 'Yano Groove',
      artist: 'Kabza De Small-style amapiano',
      bpm: 115,
      rootMidi: 33, // A1
      scale: 'minor',
      palette: { h1: 140, h2: 32, sym: 6 },
      desc: 'Amapiano in the style of <b>Kabza De Small</b> and <b>DBN Gogo</b>: the sparse kick leaves all the room to the <b>log drum</b> — that bouncing pitched bass that IS the genre — with soft chord stabs, shakers, and airy vocal sighs. Yanos, 115 BPM.',
      swing: 0.08,
      engine: {
        hatToneClosed: 6800, hatToneOpen: 6200, hatDecayClosed: 0.04, hatDecayOpen: 0.16,
        kickAttack: 300, kickDecay: 0.4, kickTune: 45,
        duckDepth: 0.5, duckRelease: 0.18,
        bassStyle: 'log', bassCutoff: 950, bassDecay: 0.13, bassWave: 'sawtooth',
        leadStyle: 'chord', leadRes: 2, delayMix: 0.22, drive: 0.5,
      },
      levels: { kick: 0.8, clap: 0.5, bass: 0.75, chat: 0.507, ohat: 0.49, lead: 0.45, vox: 0.6, fx: 0.4 },
      tracks: {
        kick: tk([0, 8], [0]),
        clap: tk([4, 12]),
        bass: tk([2, 3, 6, 10, 11, 14], [2, 10], { 2: 0, 3: 0, 6: 3, 10: 4, 11: 3, 14: 1 }),
        chat: tk(EIGHTHS, [6, 14]),
        ohat: tk([2, 10]),
        lead: tk([0, 10], [], { 0: 0, 10: 3 }),
        vox:  tk([7, 15], [], { 7: 7, 15: 4 }, { 7: 'oo', 15: 'ah' }),
        fx:   tk([]),
      },
    },
    {
      id: 'garba',
      genre: 'desi',
      name: 'Raga Garba',
      artist: 'Navratri garba / raga Bhairav flavor',
      bpm: 108,
      rootMidi: 26, // D1
      scale: 'doubleHarmonic',
      palette: { h1: 320, h2: 42, sym: 12 },
      desc: 'Navratri energy: the garba gallop on a rounded dhol kick, high dandiya stick clicks, and a tumbi line snaking through <b>raga Bhairav</b> (the double-harmonic scale — both the b2 and the major 7, maximum exotic tension). Spin accordingly. 108 BPM, swung.',
      swing: 0.18,
      engine: {
        hatToneClosed: 6600, hatToneOpen: 6000, hatDecayClosed: 0.04, hatDecayOpen: 0.14,
        kickAttack: 260, kickDecay: 0.28, kickTune: 50,
        duckDepth: 0.6, duckRelease: 0.1,
        bassCutoff: 620, bassDecay: 0.16, bassWave: 'sawtooth',
        leadStyle: 'tumbi', leadRes: 4, delayMix: 0.2, drive: 0.4,
        clapTone: 2600,
      },
      levels: { kick: 0.8, clap: 0.55, bass: 0.75, chat: 0.435, ohat: 0.42, lead: 0.65, vox: 0.6, fx: 0.4 },
      tracks: {
        kick: tk([0, 3, 6, 8, 11, 14], [0, 8]),
        clap: tk([2, 6, 10, 14], [6, 14]),
        bass: tk([0, 6, 8, 14], [0], { 0: 0, 6: 0, 8: 0, 14: 4 }),
        chat: tk(EIGHTHS),
        ohat: tk([4, 12]),
        lead: tk([0, 2, 4, 6, 8, 10, 12, 14], [0, 8], { 0: 7, 2: 8, 4: 9, 6: 8, 8: 7, 10: 9, 12: 11, 14: 8 }),
        vox:  tk([3, 11], [3], { 3: 9, 11: 7 }, { 3: 'eh', 11: 'oh' }),
        fx:   tk([]),
      },
    }
  );

  PSY.getPreset = (id) => PSY.PRESETS.find((p) => p.id === id) || PSY.PRESETS[0];
})();
