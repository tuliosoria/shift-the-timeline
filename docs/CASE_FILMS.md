# Background films

The train, pocket watch and corridor films are fictional atmosphere, not evidence. They play as muted background loops behind the screens; there is no film dialog or player.

## Playback

- Each film is a decorative `<video>` that is muted, inline and looped, and has no audio track. It has no controls and carries no information the text does not.
- Under reduced motion, or if a film fails to load, only the static WebP poster is shown. The setting is read live, so changing it takes effect without a reload.
- `public/backdrop.js` picks the film for the current screen and swaps it when the screen changes. The film never covers controls or affects focus, and a failed download is silent: the game stays fully usable.
- Films are decorative, so screen readers skip them.

## Asset budget and serving

Three 10-second fast-start MP4s use 960×540 H.264/yuv420p with the audio track removed. Combined video size is about 2.0 MiB (2.1 MB). The three WebP posters total about 72 KiB. Originals stay outside the repository.

The exact public-asset allowlist includes the films and posters, and both packaging targets copy that same allowlist. The Node static handler provides video/mp4, Content-Length, HEAD and single-byte-range responses, and sends `Cache-Control: public, max-age=86400` for static media (one day). Unknown media paths remain unavailable.

## Regression checks

- `node --test tests/backdrop.test.mjs tests/assets.test.mjs tests/http.test.mjs`: screen-to-film selection, reduced-motion poster fallback, asset budgets, the allowlist, byte ranges, HEAD and cache headers.
- `npm run test:browser`: the three-phone public-demo playthrough, chat and recovery checks run with the backgrounds in place.

No gameplay rules, case evidence, Azure infrastructure, service settings or deployment credentials are affected by the films.
