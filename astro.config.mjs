import { defineConfig } from "astro/config";

// Deployed as a GitHub Pages project site
// (comp4020-agentic-coding-studio.github.io/comp4020-ass1-zephyrieal/),
// not at the domain root, so every generated link needs this prefix or
// assets 404 on the live URL while looking fine locally.
export default defineConfig({
  base: "/comp4020-ass1-zephyrieal/",
});
