# Startup

The first desktop document window shows the loading screen as soon as its HTML
loads, while saved-document restoration and renderer setup continue. The small
classic script and stylesheet in `assets/public/startup/` do not depend on the
editor module graph. The application process grants the full animation once,
consumed synchronously by the first document preload. Reloading that window,
opening into a blank window, and creating/opening windows after closing every
window use the quick static lockup. Only quitting and relaunching resets the grant.
Standalone browser page loads use the animation; reduced motion uses the static
lockup without imposing an animation delay.
Opening into an existing blank window validates/restores the file before reloading
that editor; failed Open leaves its current UI usable for recovery.

Once both the animation and actual startup finish, the loading screen fades out
over 500 ms to reveal the live editor beneath it. The editor remains inert until
that fade completes. Reduced motion and subsequent static desktop windows dismiss
immediately. A startup error during the fade restores the loading screen.
`DocumentOwner.initialize()` warms the existing solver and solid kernel using
empty, read-only calculations. It changes no accepted geometry, selection or
history. Desktop model IPC waits for document restoration and this preparation;
the browser adapter waits for preparation in its WASM workers. Failed preparation
can be retried by reloading. The renderer signals readiness after its first
successful model read and draw. A slow startup keeps the wordmark and spinner;
an error keeps the screen with a Reload action.

The three-second movie plays at 1.5×, taking two seconds. The closing lockup keeps
its original pace: a 650 ms wordmark reveal, at least 300 ms fully settled, then
a 500 ms exit fade (3.45 seconds total when ready). Readiness arriving during the
hold cannot shorten it; readiness arriving later starts the fade immediately.
Reduced motion and static windows impose no reveal, hold or fade delay.
The 60 fps movie uses the actual logo toolpaths. Its 2160-pixel master is encoded
as H.264 MP4, with a 1200-pixel H.264 variant for lower display densities. Mac
Electron can prefer the full-resolution HEVC/hvc1 variant. Decoder errors fall
back through H.264 variants; blocked autoplay, reduced motion and exhausted media
fallback show the static mark. A five-second media deadline bounds stalled
playback, but never bypasses runtime readiness. All MP4s use fast-start metadata,
4:2:0 pixels and no audio. The iPad HTTP server supports byte-range media requests.

The square video covers ordinary windows regardless of their pixel dimensions.
Only proportions wider than 4:1 or taller than 1:4 limit its scale to keep the
final logo within the viewport. Only those letterboxed layouts use a circular
CSS mask, fading the outermost 4% of its radius into the theme background.
The shipped movies contain no border fade. The centered final logo
stays inside the opaque portion, then hands off to the canonical PNG and DM Sans
wordmark. The layout does not own document state or Undo.

Source, rendering commands and font provenance live in the
[branding recipe](../../assets/branding/printed-logo/README.md#startup-animation).
Unit/native tests cover readiness, media fallback and unchanged document state;
the hidden Electron smoke checks that startup releases editor input. Physical
iPad playback remains a device acceptance check.
