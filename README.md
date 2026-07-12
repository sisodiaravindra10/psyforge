# PSYFORGE — Psytrance Beat Forge

A psytrance + EDM beat maker that runs entirely in the browser. Every sound —
kick, rolling bassline, hats, claps, acid leads, dark-psy zaps, even the human
voices — is synthesized live with the Web Audio API. No samples, no
dependencies, no build step.

## Run it

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8642
# then open http://localhost:8642
```

Press **PLAY** (or Space). Audio starts on the first click (browser autoplay policy).

## Presets

Nine artist-inspired styles in two genre families, each with authentic BPM,
scale, and rhythm archetypes:

| Preset | Inspired by | BPM |
|---|---|---|
| Full-On Roller | Astrix | 145 |
| Tribal Spirit | Vini Vici | 138 |
| Progressive Groove | Neelix / Phaxe | 138 |
| Insane Mode | Infected Mushroom | 145 |
| Goa Acid | Hallucinogen / Astral Projection | 140 |
| Forest Floor | Kindzadza / Parvati Records | 150 |
| Levels Anthem | Avicii | 126 |
| Big Room Drop | Martin Garrix / Hardwell | 128 |
| Festival Choir | Swedish House Mafia / Alesso | 126 |
| Punjabi Dhol | Panjabi MC / Diljit-style bhangra | 102 |
| Desi Psy Fusion | Bhangra × full-on psytrance | 145 |

Patterns are original, written in the style of each artist — rhythm archetypes
and sound design character, not copies. The EDM presets swap the tight psy
kick for a boomy 4-on-the-floor with deep sidechain pump, add claps on 2 & 4,
and use pluck/chord lead styles in major keys. The desi presets bring the
bhangra **dhol chaal** gallop, high "ta" slaps (retuned clap), a twangy
**tumbi** lead with grace-note bends, "hoi! hoi!" chants, and a swing lilt.

## Adding your own preset

Presets are plain data in [js/presets.js](js/presets.js). Copy any block in
`PSY.PRESETS` and change:

- `bpm`, `rootMidi` (28 = E1), `scale` (see `PSY.SCALES`), optional `swing`
- `genre` — groups it in the dropdown (`psy` / `edm` / `desi`, or invent one)
- `tracks` — step patterns via the `tk(on, accents, notes, vowels)` helper:
  `on` = array of step indices 0–15, `notes` = `{step: scaleDegree}`,
  `vowels` = `{step: 'ah'|'oh'|'oo'|'eh'|'ee'}` for the VOX track
- `engine` — synth character overrides (kick sweep, bass filter, lead style
  `acid | saws | fm | pluck | chord | tumbi`, sidechain depth, clap tone…)
- `palette` — visualizer hues + symmetry, `levels` — mixer defaults, `desc` —
  the about-panel text

Reload — it appears in the preset menu with A/B/C/D variations and a song
chain auto-generated.

## FRED MODE (real human voice notes)

The VOX track is a *synthesized* choir — FRED MODE is the real thing, the
Fred again.. workflow: hit **🎤 REC LINE** and record up to 10 seconds of an
actual human voice (a 10–20 word line — yours, a friend's, a voice memo
played at the mic). The clip is sliced into 8 equal chunks on the green
**S1–S8 pads**:

- Tap pads to chop the line live; arm **● GRID** while playing and hits are
  quantized into the **VOICE row** of the sequencer
- **Scroll a VOICE cell** to pick which slice it plays
- **PITCH** shifts the whole voice ±12 semitones — chipmunk up or slowed down,
  the classic voice-note flip
- Slices are sidechain-ducked under the kick (the Fred pump) and feed the
  delay web — and because the clip lives in the audio graph, it **renders
  into the WAV export**

No mic handy? Type a line in the box and **SPEAK** plays it through your
device's text-to-speech as a live layer (TTS can't be captured into the
export — recording is the real deal).

## VOX PAD (live voice performance)

The pad row under the grid plays the formant voice live — 8 pads = 8 scale
degrees, each with its own vowel (**alt+click a pad to change it**), playable
by mouse/touch or keys **Q–I**. Arm **● REC** while the sequencer runs and
every pad hit is quantized to the nearest 16th and written into the VOX row
of the pattern you're editing — punch chants in between the beats in real
time, performance-style. Pads follow the current root & scale.

## The VOX track (synthesized human voices)

The VOX row is a formant-synthesized voice — two detuned saws with delayed
vibrato pushed through three parallel bandpass filters tuned to real vowel
formants (F1/F2/F3), with the formants sliding up into place at each note
onset. Five vowels: **ah · oh · oo · eh · ee**. Scroll to pitch it,
**alt+click to change the vowel** — chain steps for "ah-oh-ee" vocal-chop
phrases, glide included. Tribal Spirit uses it as a low chant; Festival Choir
sings full phrases between the chords. Being pure synthesis, it renders into
the WAV export too.

## Controls

- **click** a cell — toggle step · **drag** — paint steps
- **shift+click** — accent (louder, brighter filter)
- **scroll** on a BASS or LEAD cell — change pitch (scale degrees, two octaves)
- **space** — play/stop · **B** — build · **1–4** — switch pattern A–D
- Root note & scale selectors retune the whole pattern (Phrygian is *the* psy scale;
  Phrygian Dominant / Harmonic Minor for goa flavor)
- Sound design macros: bass cutoff & decay, lead resonance, delay mix, drive
- **SWING** — pushes the odd 16ths late (psy is usually straight; a touch works on prog)
- **TYPE box** (bottom-left of the visualizer) — up to 12 letters/digits, rendered
  as beat-reactive LED-wall pixel letters over the shader: columns ripple with
  the bass, the word breathes on the kick, hues run along the letters

## Arrangement & song mode

- Four pattern slots **A–D**. Loading a preset fills all four: **A** core groove,
  **B** stripped intro (no lead/FX), **C** breakdown (no kick/bass), **D** peak
  (extra FX, accented lead) — plus a ready-made 12-bar chain.
- **DUP** copies the current pattern to the next slot for making variations.
- **SONG mode** plays the chain (one bar per block). Build the set by
  **dragging the A–D pattern tabs into the chain** at any position, **drag
  blocks to reorder** them, click a block to remove it (the `+A…+D` buttons
  still work too). In LOOP mode the selected slot repeats — switching slots
  live is a performance tool.
- **Drop an audio file** (voice memo, sample — first 20s) anywhere on the
  FRED MODE panel to load it as the sliced voice instead of recording.
- **BUILD** queues a 2-bar accelerating snare roll + riser starting at the next
  bar, ending in a crash drop. Classic psytrance tension engineering.

## WAV export

**⬇ WAV** renders offline (same synth graph on an `OfflineAudioContext`) and
downloads a 44.1 kHz 16-bit stereo file — the full song chain in SONG mode,
8 bars of the loop otherwise, with a 2s delay tail.

## The sound (for the curious)

- **Kick** — sine osc swept 1700 Hz → ~50 Hz in 45 ms; the sweep is the click
- **Bass** — saw/square through a 24 dB/oct lowpass (two cascaded biquads),
  ~50 ms decay, sidechain-ducked under every kick. K-B-B-B = the full-on roll
- **Acid lead** — saw into a high-Q resonant lowpass with per-note envelope +
  auto-glide on consecutive steps, fed to a 3/16 + 1/8 ping-pong delay web
- **Zaps** — FM'd pitch-drop lasers (dark psy)
- **Visualizer** — two layers: a WebGL fragment shader under an additive
  Canvas 2D layer (kick-spawned polygon rings, pitch-mapped lead particles,
  snare-roll screen shake). Palette + symmetry per preset; falls back to
  2D-only without WebGL. Track chips VU-flash on every hit.
  **Four shader styles** (✦ button on the viz, or press **V**):
  - **TUNNEL** — kaleidoscopic neon tunnel + live waveform ring + 2D mandala arms
  - **HYPNO** — bold rainbow spiral rings flowing into a drifting off-center vortex
  - **HYPERMAZE** — stepped neon zigzag labyrinth (DMT blotter-art style),
    diamond symmetry, colors cycling per ring
  - **MANDALA** — ornate concentric petal/bead rings with inked outlines,
    slowly rotating, blooming on the kick
  All styles share the audio drive (bass = flow speed, kick = pulse,
  build strobe, drop shockwave).
