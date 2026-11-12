# AI use and credits

SHIFT's concept, documentation, artwork and development received assistance from OpenAI tools in November 2026, under the project's creative direction. Automated tests and code review do not replace editorial review or playtesting.

## During play

When AI is configured and a question is admitted, a model voices the suspect in character and may award deductions from that suspect's authorised sources. Each request contains the suspect's brief and four canonical responses, public case facts, the new question, and up to eleven earlier resolved exchanges with the same suspect from the same player and room, including earlier turns. Whole exchanges may be omitted to fit the storage envelope; they are not summarised into new facts. Already-earned deduction IDs are restricted to this suspect's sources and removed from the award candidates. Other players' conversations, other suspects' briefs, session credentials and the global solution object are excluded. A culprit's own brief may contain hidden truth. The request uses `store:false`, which is not a claim of zero retention.

Players see the reported dialogue mode on the landing page and lobby; there is no per-question consent. Canonical replies replace calls that fail or cannot be admitted, and the outcome is computed from the case and accusations, not by the model. The implementation supports bounded spend policies; the currently approved Azure production policy is explicitly uncapped, with per-request and concurrency limits retained. This campaign changes no spending policy or AI settings. See [AI orchestration](docs/AI_ORCHESTRATION.md) for the recorded policy and validation limits. No AI credential is included in this repository: hosted credentials remain in Key Vault. Enabling AI and any paid evaluation require their own operator authorisation (see [Azure deployment](docs/AZURE_DEPLOYMENT.md) and [local AI](docs/LOCAL_AI.md)).

## Original artwork

The 15 fictional suspect portraits and three illustrated stage icons were created with OpenAI image generation. Four portraits were revised to make the cast more visually distinct. Their appearance is artistic direction, not evidence about guilt. Art was based only on public fictional profiles, never the private solution.

The Bracken Quay public demo reuses the existing 15 portraits with an explicit, case-scoped cast mapping. This is presentation art, not a change to the characters, clues or solution. The original case's portrait assignments and assets are unchanged.

Browser assets are WebP derivatives with transparency, sized to 512px for portraits and 192px for stage icons. Original generated PNGs are retained separately and are not included in the deployment bundle. The 18 browser illustrations total approximately 634 KiB. Mockup previews are concept images, not screenshots proving browser behaviour.

## Background films

The three 10-second atmosphere films (steam train, pocket watch and carriage corridor) were generated with Google Gemini under the project’s creative direction. They are fictional mood pieces, not canonical evidence, suspect testimony or clues.

Web copies use 960×540 H.264 video with no audio track in fast-start MP4 files. Together they are about 2.0 MiB, with about 72 KiB of static WebP posters. Full-resolution originals are retained separately. They play as muted, looped backgrounds, and only the poster shows under reduced motion.

## Typography

The SHIFT wordmark uses the unmodified Rye Regular font by Sorkin Type Co, distributed under the SIL Open Font License 1.1. The original font and its copyright/licence are self-hosted in `public/assets/fonts/`; no external font request is made during play. Text and controls use system fonts.

Verified source: https://github.com/google/fonts/tree/main/ofl/rye

Source TTF Git blob SHA: `f539f0960133f00d4ad13d06bd58891130ca555a`. The font was not subsetted or renamed. Preserve the bundled `OFL-Rye.txt` when distributing it.

## Code dependencies and editorial content

The backend uses AWS SDK v3; esbuild is the existing build tool. Versions are pinned in the package lock and dependency notices are packaged with the runtime artefacts.

The full editorial case, including its English localisation and solution, stays private and outside this repository and browser bundle. Public tests and screenshots use synthetic content.

Before competition submission, review the organiser's current AI disclosure requirements and record all contributions and materials actually distributed. This file does not assert compliance with rules that have not been checked.

## Music and interface audio

Tulio supplied two investigation music files for this game on 12 November 2026:
“Trilha Steampunk de Investigação Noir” and “Trilha Steampunk de Investigação”.
Web copies are 128 kb/s MP3, loudness-normalised to -20 LUFS with short edge fades,
and stripped of embedded metadata. They form a repeating two-track playlist.
Original authorship/generation details were not supplied; this notice does **not**
relicense the music as CC0 or imply independent redistribution permission.

The three interface effects are Kenney Vleugels' **UI Audio / UI SFX Set**, CC0 1.0:
- `click.wav`: original `click1.wav` (button click)
- `send.wav`: original `switch15.wav` (message submission)
- `receive.wav`: original `switch3.wav` (new resolved reply)

Verified primary licence page: https://kenney.nl/assets/ui-audio
CC0: https://creativecommons.org/publicdomain/zero/1.0/
Bytes sourced from the public Calinou packaging of Kenney's pack (Ogg-to-WAV
conversion), commit `8c3d81b9159d058c444f89d12d518276b0b09345`:
https://github.com/Calinou/kenney-ui-audio
The exact licence is bundled at `public/assets/audio/Kenney-CC0.txt`.

Audio is self-hosted, optional and starts only after Enable sound. Music and
sound-effect levels are separate; returning after a reload requires opt-in again.
No audio API, analytics or external audio request is made while playing.
