# Audio controls and assets

Enable sound in the persistent top strip. Sound settings has separate music and
effect volume sliders; zero mutes that channel. Mute sound stops everything at
once. The two tracks alternate and repeat, independent of screens or turns.
Settings levels stay on this browser, but every new page load starts silently.
Background tabs pause audio; returning resumes only when sound is still enabled.

Music uses one HTMLAudioElement routed through a Web Audio gain node so volume
works on mobile Safari as well as desktop. Effects use a second gain and at most
four short sources. Both channels begin only from an explicit click. A rejected
playback promise disables sound and leaves the game usable. Missing effects are
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
