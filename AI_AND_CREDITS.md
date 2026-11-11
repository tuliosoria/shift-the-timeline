# AI use and credits

SHIFT's concept, documentation, artwork and development received assistance from OpenAI tools in November 2026, under the project's creative direction. Automated tests and code review do not replace editorial review or playtesting.

## During play

When AI is configured, a model voices every suspect answer in character, with memory of the earlier questions in the same interview, and may award deductions of the suspect being interviewed. Each question sends only that suspect's fictional profile and brief and the current interview to the provider (`store:false`, which is not a claim of zero retention). Players see a one-line notice on the landing page and lobby; there is no per-question consent. Spend is bounded per room, day and month, and canonical answers replace any reply that fails or is refused by the budget. The outcome is computed from the case and accusations, not by the model. On the hosted playtest app, suspects are AI-voiced when the operator has enabled AI there; otherwise, and whenever a reply fails or the budget refuses it, every answer is the case's canonical text. No AI credential is included in this repository: the hosted key stays in Key Vault, and enabling AI is an explicit operator setting with an approved model, prices and limits (see [Azure deployment](docs/AZURE_DEPLOYMENT.md) and [local AI](docs/LOCAL_AI.md)).

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
