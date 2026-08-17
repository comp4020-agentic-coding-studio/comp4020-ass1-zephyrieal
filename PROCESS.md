# Process overview

## What I built

Built from two prompt docs the user handed over:
`Iteration_1___Functional_Prototype_Prompt.md` (plain HTML/CSS/JS, prove the
selection-to-inheritance loop works, no polish) and
`Astro_Interactive_Guinea_Pig_Domestication___AI_Build_Prompt.md` (the real
rebuild). It's a guinea pig breeding sim: you pick which cavies breed each
generation, and their traits (size, roundness, docility, skittishness,
curiosity, personality, coat colour) drift toward whatever you keep selecting
for. Phase 1 proved the mechanic in vanilla JS; phase 2 ported that logic
untouched into TypeScript and built the real presentation around it: a
historical timeline, per-generation narrative feedback, a final
wild-vs-modern comparison.

## The moments that mattered

1. **Documentation instead of conversation.**
   The obvious path was to describe the idea to the AI in chat and figure out
   the product turn by turn. I tried that first, and the back-and-forth got
   expensive fast: re-explaining constraints, repeating context, drifting
   from the design I actually had in my head. Instead I wrote the whole
   product down first, as two prompt docs
   (`Iteration_1___Functional_Prototype_Prompt.md`, then the Astro rebuild
   prompt), and handed over the finished spec rather than negotiating it live.
   The durable rules inside them (the simulation/rendering split,
   deterministic RNG, the six selection experiments) went into `CLAUDE.md` so
   they'd outlive the prompt that introduced them, instead of only existing
   in a chat transcript no future session reads.
   [`0397c87`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-zephyrieal/commit/0397c870e38a60090ea051efaafe9aac326d2ba0)

2. **A bug fixed in the harness, not just the diff.**
   Phase 1 had a real bug: a "friendly" cavy with drifted-low docility could
   get stuck fleeing forever, because personality was applied as a
   multiplier after the flee-vs-approach decision was already made, which
   can scale a reaction but can't flip it. Fix: apply personality as a
   floor/ceiling before that decision. I didn't just patch it and move on, I
   put the rule in `CLAUDE.md` so it can't quietly come back.
   [`3288bf9`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-zephyrieal/commit/3288bf9d576c935c68e7d61a1564ece9a6d1adc6)

3. **A landing screen that didn't break the render loop.**
   Obvious fix for an intro screen: hide the game's `<div>` with CSS until
   Start is clicked. That breaks quietly: `render.ts` places every cavy with
   `getBoundingClientRect()` at creation and every frame after, so if the sim
   starts while the view is `display: none`, every cavy gets pinned to a 0×0
   rect and clumps in the corner. Fix: don't start the sim until Start is
   clicked and the view has real layout. Checked with a Playwright
   screenshot: all ten cavies spread out on the very first frame, not
   clumped.
   [`6959d4d`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-zephyrieal/commit/6959d4dbe8dc50017c2164c6634e0251d8e22dff)

4. **Caught a bug my own test had missed.**
   Landing slides scroll-snap one per screen. First test: one clean
   `page.mouse.wheel()` call, looked perfect. Then the user reported that a
   real fast scroll skips the middle slide. `scroll-snap-stop`'s default only
   guarantees you land on some slide, not every one you pass through. One-line
   fix (`scroll-snap-stop: always`), but the real lesson was in retesting with
   thirty rapid small wheel events to mimic a real flick, instead of trusting
   the clean one, which is what actually caught it.
   [`6959d4d`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-zephyrieal/commit/6959d4dbe8dc50017c2164c6634e0251d8e22dff)
