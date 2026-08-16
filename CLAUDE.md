# COMP4020 prototype

This is your starter repo for a COMP4020 prototype: a static site written in
HTML/CSS/TypeScript that builds to plain HTML/CSS/JS and deploys to GitHub
Pages. Built with Astro, carried forward from last week. The **deployed site is
what gets marked** --- not this repo, and not "it
works on my machine". It's marked live in Chrome against the deployed URL at two
viewports --- 1920×1080 (desktop) and 390×844 (phone) --- and both count in
full, so make that artefact good at both and use the checks below to know
whether it is.

What you're building this week — the spec — is published on the course website,
and this repo's name tells you which deliverable it is. Run the course plugin's
**start** skill at the start of each week: it pulls the right spec from the
course API, carries your harness forward from last week, and helps you turn the
spec's checkable lines into tests of your own. Read the spec before you build,
and see `spec/README.md` for how the checks in this repo relate to it.

## How to work in here

- Keep the dev server running (`pnpm dev`) so you see changes as you make them.
- Before you push, run `pnpm check`. It runs most of what CI runs --- build,
  lint, and the spec --- so you catch those in seconds instead of waiting for
  the pipeline. The links check, the evidence check, the secrets scan, and the
  deploy itself only run in CI; run `pnpm dlx linkinator ./dist --silent`
  locally against a fresh `pnpm build` for the links check without waiting for
  CI.
- To see what the page actually looks like rather than what you assume it looks
  like, open it in a browser (the `agent-browser` CLI, documented on
  [the course site](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/backpressure/#agent-browser-the-rendered-page-as-ground-truth),
  works well for this). The rendered page is the truth; your mental model of it
  isn't.
- When a check fails, read its output before changing anything. Each check below
  names what it measures, and the failure message is the instruction: it tells
  you the file, the line, or the contract. Treat a red check as authoritative
  --- the page is wrong until the check is green, not until you decide it should
  be.
- Commit when the checks pass. Never commit a red state.

## The checks (your sensors)

CI runs these on every push once your repo is public. GitHub's checks UI shows
two jobs, `check` and `deploy` --- not one status per sensor below --- and
within `check` the steps run in sequence (`pnpm check` chains typecheck, build,
lint, and the spec with `&&`), so an early failure like a broken build stops the
later sensors from running for that push; fix it and push again to see the rest.
While the repo is private (all week, until you ship) the CI jobs stay skipped
--- `pnpm check` is the same roster on your machine, and it's the faster loop
anyway. They aren't hoops. Each is a different way of finding out something true
about the site that you can't reliably see by looking at it.

They also carry a mark at a crit: the sweep runs fifteen minutes after your
cutoff, and green checks there are worth half that week's shipped mark. Still
running counts as not green, so ship with time for CI to finish.

- **typecheck** --- `tsc --noEmit` runs first in `pnpm check`, so a type error
  stops the roster before the build even starts. The types are extra
  backpressure: a red here is the compiler telling you a claim in the code is
  false.
- **build** --- the site must build (`pnpm build`). A build failure means the
  deployed site is broken or stale, so nothing else matters until this is green.
- **deploy / online** --- the live GitHub Pages URL must load and return the
  page you expect. An asset that 404s on the deployed URL counts as broken even
  if it loads locally.
- **spec** --- `spec/invariants.test.ts` asserts what's true of any good
  website, whatever the week's brief asks; the tests you write for the week's
  own spec run alongside it (any `spec/*.test.ts`). A failure names the contract
  you haven't met yet.
- **lint** --- `stylelint` for CSS, `oxlint` for TypeScript. Flags code that's
  wrong, fragile, or non-idiomatic. Read the rule it names.
- **tests** --- any other tests you write, wherever you put them (co-located
  with your source is fine, not just `spec/`), must pass. Vitest picks up both
  this and the spec suite in one `vitest run`, the last step of `pnpm check`. A
  failing test is a claim about the site that's no longer true.
- **evidence** (`pnpm check:evidence`) --- checks your process evidence:
  `PROCESS.md`'s citations resolve to real commits, the current deliverable's
  exact reflection is in `reflections/` (worked out from this repo's name
  against the public course API), and your `CLAUDE.md` is present. Evidence
  gates the deploy --- `deploy` needs `check` to pass, so failing evidence
  blocks the deploy alongside everything else. See
  [Your process is part of the mark](#your-process-is-part-of-the-mark) below,
  and the course website's
  [assessment page](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/assessment/#what-you-submit)
  for what counts as evidence.
- **links** --- internal links must resolve. A broken link is a dead end you
  didn't mean to ship.
- **secrets** --- the repo is scanned for committed credentials. Never put a
  key, token, or password in a tracked file. If one leaks, rotate it. A local
  pre-commit hook (`.githooks/pre-commit`, installed by `pnpm install`) also
  blocks any commit containing something shaped like an API key --- by the time
  CI sees a key it's already pushed, so the hook is the sensor that matters.

Nothing here measures **accessibility** or **performance** --- wiring those
sensors (`axe-core`, Lighthouse, or whatever you choose) is your work, and later
in the course the spec will ask you to show how you tested both. When you do,
read a green performance result honestly: it's a lab estimate from one run on a
CI machine, not proof the site is fast for real users.

## The stack is swappable

This repo runs on Astro (kept from last week), not the template's Vite default:
pages live in `src/pages/`, the shared shell is `src/layouts/Layout.astro`, and
`astro.config.mjs` sets the GitHub Pages `base` path. That's a choice, not a
rule (unless the week's spec says otherwise) --- nothing in CI names a tool ---
the whole contract is:

- `pnpm build` emits the complete site into `dist/`
- the `package.json` scripts (`check`, `check:evidence`, `build`) keep working
- whatever lands in `dist/` still passes the invariants in `spec/`

Two things bite in a swap. The deployed site lives under a path
(`…github.io/<repo>/`), so configure your generator's base path --- Astro (like
most generators) needs `base` set explicitly in `astro.config.mjs`, and getting
it wrong looks fine locally while every asset 404s on the live URL. And commit
the updated `pnpm-lock.yaml`: CI installs with `--frozen-lockfile`.

## Your process is part of the mark

The deployed page is only half of it. How you got there is marked too: your
commit history, your agent files, and the decisions visible across them. The
checks above can't see any of that, so a person reads it directly --- which
means building legibly is part of building well.

- **Commit as you go.** Small, frequent commits are the record of how the work
  came together, and that record is read, not just the final state. A trail that
  grew alongside the code is the strongest evidence of your process; a single
  dump the night before is the weakest.
- **Keep a process overview** (`PROCESS.md`). A short reading-guide, not an
  essay: what you built, the moments that mattered --- each pointing at a
  commit, a `CLAUDE.md` change, or a prompt and the commit it produced --- and
  where to look in the history. It points a marker at the evidence; it doesn't
  stand in for it, and claims the history doesn't back don't count. The
  `PROCESS.md` in this repo is a template showing the shape and the citation
  format (link text the commit hash or range, target the commit or compare URL);
  `pnpm check:evidence` verifies your citations resolve to real commits before
  you ship. Markers follow those citations and don't trawl the repo for evidence
  you didn't cite.
- **Write your reflection in `reflections/`** --- a short markdown file in this
  repo, named for the deliverable it answers, so the number in the filename is
  the number in this repo's name (`crit-1.md` in `comp4020-crit1-<you>`,
  `assignment-1.md` in `comp4020-ass1-<you>`); `reflections/README.md` has the
  full rule. `pnpm check:evidence` checks the exact current name against the
  course API, not merely the presence of any well-named file. It answers the two
  standing prompts: the breakthrough that moved the work forward, and what this
  work changed about the developer you want to be. It stays out of the deployed
  site. It's due at the cutoff, and if it isn't in the repo by then the week
  doesn't count as shipped, however good the prototype is.
- **This file is process evidence.** The harness you build to direct the agent,
  this `CLAUDE.md` and any `AGENTS.md`, is itself read as part of how you
  worked. Keep it honest and current (see below).

You don't need a name, a student number, or any identity file in the repo: we
know whose repo it is. Spend the effort on the work.

## This file is yours

This CLAUDE.md is a starting point, not a fixed rulebook. As you learn what your
prototype needs --- a convention to hold the agent to, a sensor that keeps
catching you out, a fact about the stack the agent keeps getting wrong --- write
it down here. Growing this file is the work of harness engineering, and the gap
between this boilerplate and your own version is part of what your prototype
says about the developer you're becoming.

## Project sequencing

This project has two build prompts, run in order:

1. `Iteration_1___Functional_Prototype_Prompt.md` --- plain HTML/CSS/JS, no framework,
   coloured circles/shapes only. Goal: prove the selection→inheritance→population-change
   loop works. No visual polish. **Done.** Lives untouched in `prototype/` as the
   reference implementation and its regression harness (`prototype/experiments.js`).
2. `Astro_Interactive_Guinea_Pig_Domestication___AI_Build_Prompt.md` --- the Astro rebuild.
   **Landed.** The simulation core (population, selection, inheritance, statistics ---
   the pure functions) was ported unchanged in behaviour from `prototype/js/*.js` to
   `src/lib/sim/*.ts`, and the presentation layer (historical timeline/eras, storytelling
   panels, per-generation narrative feedback, final wild-vs-modern comparison, warm
   editorial visual system) was rebuilt around it in Astro, with no UI framework
   installed --- `src/scripts/app.ts`/`render.ts` are the same vanilla-TS,
   physics-loop-and-DOM-reconciliation architecture as `prototype/js/main.js`/`render.js`,
   just typed and extended.

Both phases are complete. The rules below (simulation architecture, deterministic RNG,
the six selection experiments, personality/curiosity/interaction items, population sanity
checks) now govern `src/lib/sim/*.ts` and `src/scripts/*.ts` as the live implementation;
`prototype/` remains as the phase-1 artifact and is not deleted or further modified. Any
future change to selection/inheritance/trait-variation logic happens in `src/lib/sim/*.ts`
and must keep `spec/experiments.test.ts` (the six experiments, ported from
`prototype/experiments.js` into real vitest assertions) green.

## Simulation architecture rule

Simulation logic and rendering must be in separate modules. Concretely:

- `createPopulation()`, `selectAnimal()`, `breedPopulation()`, `inheritTrait()`,
  `calculateStatistics()`, `advanceGeneration()` must be pure functions: same inputs
  always produce the same outputs (given a fixed seed), no DOM access, no reading from
  or writing to UI state.
- Rendering code may call these functions and read their return values, but must never
  contain trait math, inheritance math, or selection logic inline.
- If a change requires touching both a pure simulation function and a rendering
  component in the same edit, stop and split it into two edits. A single diff that
  mixes simulation math into a component file is a violation, not a shortcut --- flag it
  and refactor rather than leaving it in place.

## Deterministic RNG

All randomness in the simulation (trait variation, coat colour inheritance, random
wandering) must go through a single seeded PRNG utility, not `Math.random()` directly.
Expose a way to set the seed at simulation start. This is required from the first
prototype commit onward, not deferred to a later phase --- retrofitting determinism after
the fact hides bugs that seeded testing would have caught earlier.

## Standing correctness check: the six selection experiments

After ANY change to selection, inheritance, or trait-variation logic --- not just once at
the start of the project --- run and report the results of all six experiments below.
This is a required self-check, not an optional demo.

**Experiment A --- select high docility, 10 generations.**
Expected: average docility at gen 10 is meaningfully higher than gen 1 (not a marginal
1--2 point drift; should be clearly visible in the stats panel).

**Experiment B --- select high roundness, 10 generations.**
Expected: same pattern for roundness.

**Experiment C --- select randomly, 10 generations.**
Expected: no consistent directional trend in any trait across repeated runs. If random
selection produces the same upward trend as A/B, the inheritance logic is broken
(likely regressing toward a fixed target rather than toward parent values) --- this is a
bug, fix it before continuing.

**Experiment D --- select the HIGHEST-skittishness animals, 10 generations.**
Expected: average skittishness at gen 10 is meaningfully higher than gen 1, and the
population becomes more likely to flee from the pointer. This proves selection can move
the population in more than one direction, not just toward docility/roundness.

Report actual before/after numbers for each experiment, not just "looks right." If any
experiment doesn't match its expected result, treat it as a harness failure: diagnose
the root cause in the inheritance/selection code, fix it there, and re-run all six
experiments --- don't just adjust one trait's numbers until the output looks plausible.

**Experiment E --- select FRIENDLY parents, 10 generations.** Expected: the friendly
share of the population at gen 10 is meaningfully higher than gen 1 (report as counts,
e.g. "8/10 friendly", not an average --- personality is categorical, not a number).

**Experiment F --- select SHY parents, 10 generations.** Same pattern for shy. Together
E and F prove personality (categorical) responds to selection the same way the numeric
traits do.

All six originate in `prototype/experiments.js` (`node prototype/experiments.js`, prints
before/after numbers) and are additionally enforced as real assertions in
`spec/experiments.test.ts` against `src/lib/sim/*.ts`, so `pnpm check` fails if a change
to the Astro build's simulation core breaks any of them.

## Personality, curiosity, and interaction items

- `personality` (`shy`/`neutral`/`friendly`, `simulation.js`) is inherited independently
  of the numeric traits --- it is NOT a renamed/derived docility. `behaviour.js` applies
  it as a floor/ceiling/damping on the trait-derived affinity, BEFORE the flee-vs-approach
  branch decision, not as a post-branch magnitude multiplier --- a multiplier applied
  after the branch is chosen can scale a reaction but can never flip its sign, which is
  exactly the bug that let a "friendly" cavy with drifted-low docility get stuck fleeing
  forever. Any new interaction (a hypothetical future one) must follow the same
  before-the-branch ordering.
- `curiosity` is a numeric trait like the other four, driving the toy response
  (`calculatePlayResponse`) the way `docility` drives the mouse/food responses.
- Food (🥕) and toy (🧸) are always-present, player-draggable world objects owned by
  `render.js` --- not simulation entities, no trait math lives in their drag handling.
  Their pure response functions (`calculateFoodResponse`, `calculatePlayResponse`) live
  in `behaviour.js` alongside `calculateMouseResponse`, same architecture rule as always.
- `familiarity` (render.js's per-cavy motion state) is ephemeral, render-only, and reset
  automatically every generation (new cavy ids = fresh motion-map entries). It must NEVER
  be written onto a `cavy` object, read by `simulation.js`, or factored into inheritance
  --- it may only ever soften a mouse-response flee reaction slightly, never override a
  personality's ceiling into actual approach. This is the "taming an individual is not
  domesticating a population" distinction the prompt asks for; breaking it would silently
  make interaction (not selection) the thing that changes the population, which defeats
  the whole exercise.

## Population sanity checks

On every generation update, verify and report if violated:

- population size stays constant (no silent growth/shrink)
- all trait values remain within their defined bounds (e.g. 0--100) --- no NaN, no
  negative values, no overflow past the cap after repeated selection
- selection is cleared after advancing to the next generation
- the statistics panel always reflects the population currently on screen, never a
  stale generation

## What counts as "done" for a phase

A phase is not complete when it renders without errors. It's complete when:

1. the relevant checklist in the prompt file is fully checked off, and
2. for any phase touching selection/inheritance, all six experiments above pass with
   reported numbers.

Do not move to visual polish or the next phase until both conditions hold.
