# Optional case films

The train, pocket watch and corridor films are fictional atmosphere, not evidence. The opening page features the train; the lobby features the corridor; the investigation includes a compact scene card. All three remain available in the same viewer.

## Playback and access

- Posters are ordinary responsive images. No MP4 URL is attached until a player clicks a scene.
- Playback starts muted, inline, with native pause, seek, volume and full-screen controls. There is no loop or automatic scene advancement.
- The viewer has a labelled native dialog, visible Close control, Escape dismissal, scene descriptions and focus restoration. Motion is always opt-in, including under reduced-motion preferences.
- Closing the viewer unloads its media. Hiding the tab pauses playback without automatically resuming it later.
- The dialog lives outside the game’s re-rendered content so room updates do not restart a film or erase drafts.
- A failed download displays a non-blocking message; the investigation remains usable.

## Asset budget and serving

Three 10-second fast-start MP4s use 960×540 H.264/yuv420p with AAC audio. Combined video size is approximately 2.3 MiB. The three WebP posters total approximately 72 KiB. Originals stay outside the repository.

The existing exact public-asset allowlist includes the new player module, posters and films. Both packaging targets copy that same allowlist. The Node static handler provides video/mp4, Content-Length, HEAD and single-byte-range responses for mobile playback and seeking. Unknown media paths remain unavailable.

## Regression checks

- `node --test tests/client-films.test.mjs tests/films-http.test.mjs tests/assets.test.mjs`: scene entry points, asset budgets, allowlist, byte ranges, HEAD and invalid requests.
- `node tests/browser-case-films.mjs`: real media playback at 320, 390 and 1440 pixels under reduced motion; manual loading, muted playback, switching all three films, repeated dismissal, draft preservation, polling while the dialog is open, restored focus, and failed media.
- The film test uses installed Google Chrome (included on the CI runner), because the bundled open-source headless Chromium omits the H.264/AAC decoders. For local runs, install Chrome or set `BROWSER_EXECUTABLE_PATH` to a browser with those codecs. A decoder assertion fails explicitly rather than skipping playback.
- The film browser regression runs as part of `npm run test:browser` in CI alongside the existing three-player playthrough and recovery checks.

No gameplay rules, case evidence, AI consent, Azure infrastructure, service settings or deployment credentials were changed.
