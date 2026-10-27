# Startup

The first desktop document window shows the loading screen as soon as its HTML
loads, while saved-document restoration and renderer setup continue. The small
classic script and stylesheet in `assets/public/startup/` do not depend on the
editor module graph. Further desktop windows show the static loading lockup.
Standalone browser page loads use the animation; reduced motion uses the static
lockup without imposing an animation delay.

The editor remains inert until both the animation and actual startup finish.
`DocumentOwner.initialize()` warms the existing solver and solid kernel using
empty, read-only calculations. It changes no accepted geometry, selection or
history. Desktop model IPC waits for document restoration and this preparation;
the browser adapter waits for preparation in its WASM workers. Failed preparation
can be retried by reloading. The renderer signals readiness after its first
successful model read and draw. A slow startup keeps the wordmark and spinner;
an error keeps the screen with a Reload action.

The 60 fps movie uses the actual logo toolpaths. Its 2160-pixel master is encoded
as H.264 MP4, with a 1200-pixel H.264 variant for lower display densities. Mac
Electron can prefer the full-resolution HEVC/hvc1 variant. Decoder errors fall
back through H.264 variants; blocked autoplay, reduced motion and exhausted media
fallback show the static mark. A five-second media deadline bounds stalled
playback, but never bypasses runtime readiness. All MP4s use fast-start metadata,
4:2:0 pixels and no audio. The iPad HTTP server supports byte-range media requests.

The square video covers ordinary windows up to its 1080 CSS-pixel display limit.
An additional aspect-ratio limit keeps the final logo within the viewport, even
in very short or narrow windows. When either limit leaves space, a soft circular
CSS mask blends the video into the theme background. The centered final logo
stays inside the opaque portion, then hands off to the canonical PNG and DM Sans
wordmark. The layout does not own document state or Undo.

Source, rendering commands and font provenance live in the
[branding recipe](../../assets/branding/printed-logo/README.md#startup-animation).
Unit/native tests cover readiness, media fallback and unchanged document state;
the hidden Electron smoke checks that startup releases editor input. Physical
iPad playback remains a device acceptance check.
