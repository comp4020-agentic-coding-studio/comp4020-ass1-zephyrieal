import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

// Core interaction: selecting cavies as parents and advancing a generation
// changes what's on screen — the generation counter, the stats/comparison
// panels, the timeline, and the generation-narrative feedback all update.
// This runs the BUILT bundle (dist/) inside jsdom, driving the real client
// script exactly as a browser would (click events, no mocking of app logic),
// so it survives any internal refactor as long as the on-screen contract
// holds.
const DIST = resolve("dist");
const html = readFileSync(join(DIST, "index.html"), "utf8");

function extractModuleScriptSrc(markup: string): string {
  const match = markup.match(/<script[^>]*type="module"[^>]*src="([^"]+)"/);
  if (!match) throw new Error("expected a <script type=\"module\" src=\"...\"> in dist/index.html");
  return match[1];
}

function readBundle(): string {
  const src = extractModuleScriptSrc(html);
  // src is an absolute path like /comp4020-ass1-zephyrieal/_astro/xxx.js —
  // strip the GitHub Pages base segment to get the path inside dist/.
  const relative = src.replace(/^\/[^/]+\//, "");
  return readFileSync(join(DIST, relative), "utf8");
}

const bundle = readBundle();

let dom: JSDOM;

beforeAll(() => {
  expect(bundle).not.toContain("\nimport ");
});

afterEach(() => {
  dom?.window.close();
});

function renderPage(): JSDOM {
  const instance = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/", pretendToBeVisual: true });
  const script = instance.window.document.createElement("script");
  script.textContent = bundle;
  instance.window.document.body.appendChild(script);
  // The game is gated behind a landing screen's Start button (see
  // Landing.astro / app.ts's startGame()) --- click through it so the rest
  // of the suite drives the actual game view, same as a real player would.
  byTestId(instance.window.document, "start-button").click();
  return instance;
}

function byTestId(doc: Document, testId: string): HTMLElement {
  const el = doc.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  if (!el) throw new Error(`missing [data-testid="${testId}"]`);
  return el;
}

describe("core interaction: selecting parents and advancing a generation", () => {
  it("renders one cavy button per member of the starting population", () => {
    dom = renderPage();
    const cavies = dom.window.document.querySelectorAll(".cavy");
    expect(cavies.length).toBe(10);
  });

  it("clicking a cavy selects it and populates the inspector", () => {
    dom = renderPage();
    const doc = dom.window.document;
    const inspectBefore = byTestId(doc, "inspect").textContent ?? "";
    expect(inspectBefore).toContain("Click a cavy to inspect it");

    const firstCavy = doc.querySelector<HTMLButtonElement>(".cavy");
    if (!firstCavy) throw new Error("no cavy rendered");
    firstCavy.click();

    const inspectAfter = byTestId(doc, "inspect").textContent ?? "";
    expect(inspectAfter).not.toContain("Click a cavy to inspect it");
    expect(inspectAfter).toContain("Selected as parent");
    expect(byTestId(doc, "selected-count").textContent).toContain("1 selected");
  });

  it("selecting 2+ parents and advancing changes the generation, stats, timeline, and narrative", () => {
    dom = renderPage();
    const doc = dom.window.document;

    const cavies = Array.from(doc.querySelectorAll<HTMLButtonElement>(".cavy"));
    cavies[0].click();
    cavies[1].click();
    expect(byTestId(doc, "selected-count").textContent).toContain("2 selected");

    const generationBefore = byTestId(doc, "generation").textContent;
    const narrativeBefore = byTestId(doc, "generation-narrative").textContent;
    expect(generationBefore).toBe("1");
    expect(narrativeBefore).toContain("founding generation");

    byTestId(doc, "next-generation").click();

    expect(byTestId(doc, "generation").textContent).toBe("2");
    expect(byTestId(doc, "selected-count").textContent).toContain("0 selected");
    expect(byTestId(doc, "timeline-caption").textContent).toContain("Generation 2");
    expect(doc.querySelectorAll(".cavy").length).toBe(10);

    const narrativeAfter = byTestId(doc, "generation-narrative").textContent ?? "";
    expect(narrativeAfter.length).toBeGreaterThan(0);
    expect(narrativeAfter).not.toBe(narrativeBefore);
  });

  it("refuses to advance with fewer than two parents selected", () => {
    dom = renderPage();
    const doc = dom.window.document;

    doc.querySelector<HTMLButtonElement>(".cavy")?.click();
    byTestId(doc, "next-generation").click();

    expect(byTestId(doc, "generation").textContent).toBe("1");
    expect(byTestId(doc, "message").textContent).toBeTruthy();
  });
});
