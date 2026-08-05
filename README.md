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
| Uplift 138 | Armin / ASOT-style uplifting trance | 138 |
| Hard Mode | Headhunterz-style hardstyle (reverse bass, screech) | 150 |
| Neuro Roller | Pendulum / Noisia-style drum & bass (Reese) | 174 |
| 2-Step Shuffle | MJ Cole-style UK garage (heavy swing, vox chops) | 132 |
| Memphis Drift | Drift phonk (cowbell melody, half-time) | 130 |
| Yano Groove | Kabza De Small-style amapiano (log drum) | 115 |
| Raga Garba | Navratri garba in raga Bhairav | 108 |

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

## Your work is safe

- **Autosave** — the session is written to `localStorage` on hide/unload and
  every 20s. A reload boots the curated hero preset, then offers a
  **↺ RESTORE LAST SESSION** chip rather than silently resurrecting it.
- **Undo / redo** — ⌘Z / ⌘⇧Z, or the UNDO/REDO buttons. Snapshots are taken at
  the *intent* level, so one undo restores a whole drag-paint gesture, a
  EUCLID/MELODY generation, a DUP, or a preset load.
- **↺ next to CLR** restores chain bars you just removed, per-bar key badge
  intact.
- **🔗 SHARE** copies a link carrying the entire beat — all four patterns
  (with ratchets, probability, vowels, slices), the song chain with its per-bar
  transposes, every synth param, mixer levels/mutes, and the visualizer style +
  word. About 1.2 KB of URL; no server involved. A shared link overrides local
  autosave, and opening one never touches the sender's copy.

## Musical tools

- **Per-bar chord movement** — scroll on any SONG chain block to shift that
  bar's key (±12 semitones, shown as a badge). Bass, lead and vox transpose;
  the kick stays put. i → VI → III → VII progressions in a scroll.
- **Ratchets** — right-click a lit step to cycle ×2/×3/×4 retriggers within
  the step (psy stutter-fills, hat rolls).
- **Step probability** — cmd/ctrl+scroll a lit step: 100/75/50/25% chance it
  fires each loop. The cell dims to match. Generative variation, every bar
  different.
- **EUCLID generator** — pick a track, set HITS and ROT: the hits distribute
  as evenly as possible across 16 steps (Bjorklund). This one algorithm
  produces bhangra, Afro-Cuban, techno and DnB figures.
- **🎲 MELODY dice** — writes a scale-locked random melody (euclidean rhythm,
  mostly stepwise motion) into the lead. Reroll until it sings.
- **AUTO automation** — arm ● AUTO, play, and move the SOUND DESIGN sliders:
  the movement records into the current pattern (per 16th) and replays every
  loop — filter sweeps that stay. CLR AUTO wipes it. Automation renders into
  the WAV export.
- **Synth styles, now switchable in the UI** — the BASS VOICE and LEAD VOICE
  selects in SOUND DESIGN swap the synthesis on your existing pattern (no
  preset reload, nothing overwritten), and snap the paired envelope macro so
  the groove still breathes. Bass: psy roll / **Reese** (dnb) / **log drum**
  (amapiano) / **reverse** (hardstyle); leads: acid / saws / FM / pluck /
  chord / tumbi / **cowbell** (phonk) / **screech** (hardstyle). Scales include
  Major, Mixolydian and **Bhairav** (double harmonic).
- **PUMP** (sidechain depth) and **KICK CHARACTER** (pitch-sweep start: boomy
  EDM ↔ clicky psy) are now macros, so they record with AUTO like the rest.
- **FX one-shots per step** — scroll an FX step to pick zap / snare / riser /
  crash. This is also how a build figure gets into a WAV.
- **× REPEAT** next to the export renders the loop or chain N times, so a
  12-bar chain can become a full-length track.

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
