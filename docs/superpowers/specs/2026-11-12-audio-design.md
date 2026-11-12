## Updated behaviour: remembered sound and vinyl control (12 November 2026)

Supersedes the original opt-in/reload behaviour below at Tulio's request. Sound is ON by default and the explicit ON/OFF preference and separate volume levels survive refresh. Normal autoplay is attempted; browser restrictions are respected. A blocked attempt leaves the preference ON, shows a waiting message in Sound settings, and retries on a real pointer/keyboard interaction with the game. Mute remains available at all times, including while waiting. An initially hidden page starts only when visible. A bronze-labelled vinyl disc rotates only during playback; mute, hiding and buffering stop its rotation. Reduced-motion users see a static disc. No API, game rules or media assets changed.

# SHIFT audio

Tulio supplied two steampunk investigation tracks and requested looping background music plus online-sourced button and chat effects. Keep the existing browser client and Azure deployment; no API, session, story, AI or storage changes.

Implementation choices: self-host a two-track repeating playlist, starting only when the player selects Enable sound. Use one persistent audio controller across screens, independent music/effect volume, remembered mute/volume, and pause while hidden. Use Web Audio gain nodes (including iOS) instead of depending on mobile media-volume setters. Browsers without Web Audio remain fully playable silently. Clicks are quiet; sending and receiving messages have distinct cues, never replayed by polls/reloads. All information remains visual.

A small persistent audio strip and a keyboard-accessible settings dialog keep controls available without floating over the composer. No hover/key-typing sounds. No new runtime dependencies. Preserve supplied original music separately; web copies are compressed and normalized. Use Kenney UI Audio CC0 effects with exact source and license bundled. Background films remain silent.

Alternatives considered: raw HTMLAudio volume is simpler but not reliable on iOS; a third-party audio library is unnecessary. A scene-switched soundtrack would interrupt long tracks, so use a stable playlist instead.
