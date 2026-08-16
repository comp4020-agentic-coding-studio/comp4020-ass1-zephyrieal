// Presentational only: reveals each landing slide as it scrolls into view.
// No simulation/game logic lives here --- see CLAUDE.md's "Simulation
// architecture rule". IntersectionObserver isn't implemented in the jsdom
// environment spec/assignment-1.test.ts runs the built bundle in, so this
// falls back to showing every slide up front there rather than throwing.
const slides = document.querySelectorAll<HTMLElement>(".landing-slide");

if (typeof IntersectionObserver === "undefined") {
  for (const slide of slides) slide.classList.add("in-view");
} else {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        entry.target.classList.toggle("in-view", entry.isIntersecting);
      }
    },
    { threshold: 0.5 },
  );
  for (const slide of slides) observer.observe(slide);
}
