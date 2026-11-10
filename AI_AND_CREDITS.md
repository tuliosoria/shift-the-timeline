# AI use and credits

SHIFT's concept, documentation, artwork and development received assistance from OpenAI tools in November 2026, under the project's creative direction. Automated tests and code review do not replace editorial review or playtesting.

## During play

This build uses canonical answers without live GPT calls. The optional narration orchestration is tested with simulations and remains disabled. Canonical evidence and outcomes stay authoritative on the server. No AI credential is included.

Activating generative narration later requires separate approval of the model, costs, data policy and secure credentials.

## Original artwork

The 15 fictional suspect portraits and three illustrated stage icons were created with OpenAI image generation. Four portraits were revised to make the cast more visually distinct. Their appearance is artistic direction, not evidence about guilt. Art was based only on public fictional profiles, never the private solution.

Browser assets are WebP derivatives with transparency, sized to 512px for portraits and 192px for stage icons. Original generated PNGs are retained separately and are not included in the deployment bundle. The 18 browser illustrations total approximately 634 KiB. Mockup previews are concept images, not screenshots proving browser behaviour.

## Typography

The SHIFT wordmark uses the unmodified Rye Regular font by Sorkin Type Co, distributed under the SIL Open Font License 1.1. The original font and its copyright/licence are self-hosted in `public/assets/fonts/`; no external font request is made during play. Text and controls use system fonts.

Verified source: https://github.com/google/fonts/tree/main/ofl/rye

Source TTF Git blob SHA: `f539f0960133f00d4ad13d06bd58891130ca555a`. The font was not subsetted or renamed. Preserve the bundled `OFL-Rye.txt` when distributing it.

## Code dependencies and editorial content

The backend uses AWS SDK v3; esbuild is the existing build tool. Versions are pinned in the package lock and dependency notices are packaged with the runtime artefacts.

The full editorial case, including its English localisation and solution, stays private and outside this repository and browser bundle. Public tests and screenshots use synthetic content.

Before competition submission, review the organiser's current AI disclosure requirements and record all contributions and materials actually distributed. This file does not assert compliance with rules that have not been checked.
