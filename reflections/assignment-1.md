# Assignment 1 reflection

**What was the breakthrough that moved the work forward?**

Realising that talking to the AI was not actually the fast way to build this.
My first attempt was the obvious one: describe the idea in chat and steer it
turn by turn. The back-and-forth got expensive fast — re-explaining the same
constraint, watching the design drift from what I actually had in my head each
round. The breakthrough was giving that up and writing the whole product down
first, as two full prompt docs (a plain-JS functional prototype, then the real
Astro rebuild), and handing over a finished spec instead of negotiating one
live. That's also what pushed the constraints that mattered — the six
selection experiments, the personality-before-behaviour rule, the population
sanity checks — into `CLAUDE.md`, so they'd survive past the one prompt that
introduced them.

**What did this work change about who I want to be as a developer?**

I want to test like an actual person, not like whatever's easiest to script. I
asked for a scroll-snapped landing screen, and the automated check that came
back looked clean — one slide per scroll. But when I actually used it with a
fast trackpad flick, it skipped straight past the first paragraph: the test
event had landed exactly on a slide boundary, and a real flick doesn't. Only
once I reported that back did the real cause turn up — `scroll-snap-stop`'s
default guarantees you land on *some* slide, not every one you pass through.
That was the moment "it passed the check" stopped being enough for me. Going
forward I want to keep closing that loop myself before calling something done,
and to push any fix that comes from a real constraint into something durable —
a rule in `CLAUDE.md`, a test — instead of leaving it as a one-off patch.
