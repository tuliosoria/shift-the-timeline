# Audio controls and assets

Sound is ON by default. The bronze vinyl in the persistent top strip spins only
while playing; reduced-motion users see a static disc. Sound settings has separate music and
effect volume sliders; zero mutes that channel. Mute sound stops everything at
once. The two tracks alternate and repeat, independent of screens or turns.
The ON/OFF preference and volume levels are saved on this browser, including
after refresh. Normal autoplay is attempted; if blocked, the preference stays ON
and Sound settings explains that a real interaction with the game starts audio.
Background tabs pause audio; returning resumes only when sound is still enabled.

Music uses one HTMLAudioElement routed through a Web Audio gain node so volume
works on mobile Safari as well as desktop. Effects use a second gain and at most
four short sources. Browser autoplay restrictions are respected; a real pointer or keyboard gesture
retries a blocked start. Mute is available even while waiting. A rejected
playback promise never changes the saved preference or blocks the game. Missing effects are
silent; two failed music files stop rather than causing a fetch loop. All game
information remains visual. Existing background videos have no audio track.

Events: quiet clicks on enabled buttons, one submission cue from the chat owner,
and one receive cue when an own pending answer resolves. First state/reload,
repeated polls, notebook visits and room changes do not replay old answers.

Assets/licences: see ../AI_AND_CREDITS.md and the bundled Kenney-CC0.txt. Supplied
music is not covered by the effects' CC0 licence. No new runtime dependencies.
HTTP range support covers the explicit audio routes for mobile playback/seeking.

Verification: `node --test tests/audio.test.mjs tests/audio-http.test.mjs tests/assets.test.mjs`
and `node tests/browser-audio.mjs`; the latter uses synthetic dialogue and native
headless Chromium audio, tests both tracks, independent controls, mute, reload
and exactly-once send/receive. Full repository checks remain required before merge.

### Touch and pen activation

Automatic sound unlock follows browser activation timing: mouse pointerdown, touch/pen pointerup, and keyboard keydown. A first tap is sufficient; muted preference remains authoritative. Regression coverage uses real touchscreen and pen input with activation-neutral CDP reads, so test inspection cannot accidentally grant activation.
