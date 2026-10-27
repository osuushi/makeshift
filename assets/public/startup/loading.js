const startupMediaSpeed = 1.5;

// H.264 remains the browser baseline. macOS Electron may use the smaller HEVC
// asset, but a failed hardware decoder must fall back to the same H.264 movie.
const playStartupMedia = (video, failed) => {
  video.defaultPlaybackRate = startupMediaSpeed;
  const theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  const root = `./startup/print-${theme}`;
  const full = video.clientWidth * (window.devicePixelRatio || 1) > 1200;
  const macElectron = window.makeshiftStartup?.platform === "darwin";
  const sources = full ? [`${root}.mp4`, `${root}-small.mp4`] : [`${root}-small.mp4`];
  if (full && macElectron && video.canPlayType('video/mp4; codecs="hvc1.1.6.L153.B0"'))
    sources.unshift(`${root}-hevc.mp4`);
  let stopped = false;
  const next = () => {
    if (stopped) return;
    const source = sources.shift();
    if (!source) {
      failed();
      return;
    }
    video.src = source;
    video.playbackRate = startupMediaSpeed;
    const active = video.src;
    video.play().catch((error) => {
      if (stopped || video.src !== active) return;
      if (error.name === "NotAllowedError") failed();
      else next();
    });
  };
  video.addEventListener("error", next);
  next();
  return () => {
    stopped = true;
    video.removeEventListener("error", next);
  };
};

const showStartupError = (screen, detail) => {
  const status = screen.querySelector(".startup-status");
  status.replaceChildren();
  const box = document.createElement("div");
  box.className = "startup-error";
  const message = document.createElement("p");
  message.textContent = `Makeshift could not start: ${detail || "Please reload to try again."}`;
  const retry = document.createElement("button");
  retry.textContent = "Reload";
  retry.onclick = () => location.reload();
  box.append(message, retry);
  status.append(box);
};

(() => {
  const screen = document.querySelector("#startup");
  const app = document.querySelector("#app");
  const video = screen?.querySelector("video");
  if (!(screen instanceof HTMLElement) || !(app instanceof HTMLElement) || !video) return;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const animate = !reduced && window.makeshiftStartup?.animate !== false;
  if (!animate) screen.classList.add("is-static");
  let ready = false;
  let finished = false;
  let revealed = false;
  let failed = false;
  let deadline;
  let revealTimer;
  let dismissTimer;
  let stopMedia;
  app.inert = true;
  const dismiss = () => {
    if (!ready || !finished || failed || dismissTimer !== undefined) return;
    clearTimeout(deadline);
    clearTimeout(revealTimer);
    stopMedia?.();
    video.pause();
    screen.classList.add("is-dismissing");
    dismissTimer = setTimeout(
      () => {
        screen.remove();
        app.inert = false;
        window.removeEventListener("makeshift-ready", onReady);
        window.removeEventListener("makeshift-startup-error", onError);
      },
      animate ? 500 : 0,
    );
  };
  const reveal = () => {
    if (revealed) return;
    revealed = true;
    clearTimeout(deadline);
    stopMedia?.();
    video.pause();
    screen.classList.add("is-wordmark");
    revealTimer = setTimeout(
      () => {
        finished = true;
        if (!ready) screen.classList.add("is-waiting");
        dismiss();
      },
      // Complete the 650 ms reveal, then hold the settled lockup for 300 ms.
      animate ? 650 + 300 : 0,
    );
  };
  function onReady() {
    ready = true;
    dismiss();
  }
  function onError(event) {
    failed = true;
    clearTimeout(dismissTimer);
    screen.classList.remove("is-dismissing");
    reveal();
    clearTimeout(revealTimer);
    showStartupError(screen, event.detail);
  }
  window.addEventListener("makeshift-ready", onReady);
  window.addEventListener("makeshift-startup-error", onError);
  video.addEventListener("ended", reveal, { once: true });
  // Media failure/stalling must never hold an otherwise ready editor hostage.
  deadline = setTimeout(reveal, 5000);
  if (!animate) reveal();
  else stopMedia = playStartupMedia(video, reveal);
})();
