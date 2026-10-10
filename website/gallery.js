const gallery = document.querySelector(".demo-gallery");
const track = gallery.querySelector(".demo-track");
const slides = [...gallery.querySelectorAll(".demo-slide")];
const choices = [...gallery.querySelectorAll("[data-slide]")];
const toggle = gallery.querySelector(".demo-playback");
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
let current = 0;
let playing = !reduced.matches;
let visible = false;

function playback() {
  slides.forEach((slide, index) => {
    const video = slide.querySelector("video");
    if (index === current && playing && visible && !document.hidden) {
      video.play().catch((error) => {
        if (error.name === "AbortError" || index !== current) return;
        playing = false;
        playback();
      });
    } else video.pause();
  });
  toggle.textContent = playing ? "Pause demos" : "Play demos";
  toggle.setAttribute("aria-pressed", String(playing));
}
function select(index) {
  current = (index + slides.length) % slides.length;
  track.style.transform = `translateX(-${current * 100}%)`;
  slides.forEach((slide, i) => {
    slide.setAttribute("aria-hidden", String(i !== current));
    slide.inert = i !== current;
  });
  choices.forEach((button, i) => {
    button.setAttribute("aria-pressed", String(i === current));
  });
  const video = slides[current].querySelector("video");
  if (video.ended) video.currentTime = 0;
  playback();
}
choices.forEach((button, index) => {
  button.addEventListener("click", () => select(index));
});
gallery.querySelector(".demo-previous").addEventListener("click", () => select(current - 1));
gallery.querySelector(".demo-next").addEventListener("click", () => select(current + 1));
toggle.addEventListener("click", () => {
  playing = !playing;
  playback();
});
slides.forEach((slide) => {
  slide.querySelector("video").addEventListener("ended", () => {
    if (playing) select(current + 1);
  });
});
gallery.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  event.preventDefault();
  select(current + (event.key === "ArrowRight" ? 1 : -1));
  choices[current].focus();
});
let startX;
track.addEventListener("pointerdown", (event) => {
  startX = event.clientX;
});
track.addEventListener("pointerup", (event) => {
  if (startX !== undefined && Math.abs(event.clientX - startX) > 40)
    select(current + (event.clientX < startX ? 1 : -1));
  startX = undefined;
});
track.addEventListener("pointercancel", () => {
  startX = undefined;
});
reduced.addEventListener("change", () => {
  playing = !reduced.matches;
  playback();
});
document.addEventListener("visibilitychange", playback);
new IntersectionObserver(
  ([entry]) => {
    visible = entry.isIntersecting;
    playback();
  },
  { threshold: 0.15 },
).observe(gallery);
select(0);
