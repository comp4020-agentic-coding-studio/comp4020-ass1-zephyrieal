import { describe, expect, it } from "vitest";

// This week's spec: "the visitor does something that changes what they see —
// state the core interaction plainly enough to write a test for it."
// That test can't be written until the interaction exists, so this fails on
// purpose. Replace it with a real assertion once you've picked your idea:
// load dist/index.html into jsdom, drive the interaction (a click, a drag, an
// input, a scroll), and assert something in the DOM actually changed.
describe("core interaction", () => {
  it("the visitor's action changes what's on screen", () => {
    expect.fail(
      "State your core interaction and assert it here — this test is a stand-in until you do.",
    );
  });
});
