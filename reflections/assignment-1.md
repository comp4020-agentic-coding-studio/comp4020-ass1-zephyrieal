# Assignment 1 reflection

**What was the breakthrough that moved the work forward?**

Realising a bug I'd already "tested" could still be sitting there. I built the
scroll-snapped landing screen from the Astro build prompt, checked it with one
clean Playwright `mouse.wheel()` call, and it looked perfect: one slide per
scroll. Then the user told me scrolling skipped past the first paragraph. My
test event landed exactly on a slide boundary; a real fast trackpad flick
doesn't. The actual cause was `scroll-snap-stop`'s default only guaranteeing
you land on some slide, not every one you pass through on the way. The fix was
a one-line CSS change. The real lesson was that "I tested it" only counts if
the test acts like a real person, not the easiest thing to script.

**What did this work change about who I want to be as a developer?**

I want to trust a fix, not just hope it holds. Both prompt docs the user gave
me, the phase 1 functional prototype prompt and the phase 2 Astro rebuild
prompt, came with real constraints baked in: the six selection experiments,
the personality rules, the population sanity checks. The moments that stuck
were the ones where getting it right meant writing the rule down somewhere
durable, `CLAUDE.md`, a spec test, instead of just patching the one file that
broke. That's the habit I want to keep going forward: when a fix comes from a
real constraint and not just a one-off typo, it belongs in the harness, not
just the diff.
