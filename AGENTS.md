# AGENTS.md

Guidance for AI agents (and humans) working in this repo. Read this fully before touching anything.

## What this repo is

A long-lived collection of small game prototypes: game-jam ideas, loose experiments, and anything worth testing before it earns a real project. It is published with GitHub Pages so teammates can play a prototype from a link with nothing to install.

Every prototype has two parts, and both matter equally:

1. **`DESIGN.md`**: the complete, self-contained description of the idea. A reader must be able to understand the whole concept, its rules, and its current state from this one file without opening the code, the chat history, or anything else.
2. **`index.html`**: a playable, browser-only prototype of that idea.

The design doc is the source of truth. The prototype exists to test it. When they disagree, fix one of them in the same change.

## Repo layout

```
/
├── AGENTS.md            ← this file
├── index.html           ← hub page: lists every prototype (reads prototypes.js)
├── prototypes.js        ← manifest of all prototypes, one entry each
├── shared/              ← optional helpers reused by several prototypes
├── jams/
│   └── YYYY-MM-<jam-name>/
│       └── <idea-name>/
│           ├── DESIGN.md
│           ├── index.html
│           └── assets/  ← only if needed
└── ideas/
    └── <idea-name>/     ← experiments outside any jam, same structure
```

Rules:

- One folder per prototype. Never put two prototypes in one folder.
- Folder and file names: lowercase, `kebab-case`, ASCII only. GitHub Pages is case-sensitive; a wrong-case path works locally and 404s online.
- Jam folders are dated `YYYY-MM-<jam-name>` so they sort chronologically.
- Prototypes are independent. Do not import from another prototype's folder. Put shared code in `shared/` only when a second prototype actually needs it, and never change `shared/` in a way that breaks an existing prototype.
- Do not delete or rewrite other prototypes while working on one. Parked ideas stay in the repo with `status: parked`.

## Adding a prototype

1. Create the folder under `jams/<jam>/` or `ideas/`.
2. Write `DESIGN.md` first, using the template below. If the idea is still vague, write the doc with an explicit **Open questions** section rather than inventing answers silently; the doc is where the idea gets sharpened.
3. Build `index.html`.
4. Add an entry to `prototypes.js`.
5. Run the **Definition of done** checklist at the bottom of this file.

Agents may proceed without asking on anything covered by this file. Ask the human when the request changes the core idea of an existing prototype, or when the scope asked for would take more than a few hours of work.

## Design doc: `DESIGN.md`

The doc must stand alone. Assume the reader has never heard of the idea and will not run the prototype. Write it for a teammate, not for yourself. Plain language; no hidden references to chats or other files.

Keep the doc in sync with the prototype: every change to rules, controls, or scope in `index.html` updates the matching section here, plus one line in the changelog.

Template (copy all sections; write "None yet" rather than deleting a section):

```markdown
# <Title>

**Status:** idea | prototype | playtested | parked | promoted
**Created:** YYYY-MM-DD
**Play:** https://fyh828.github.io/protos/<path-to-folder>/
**Pitch:** One sentence a stranger understands.

## The idea
2–5 paragraphs. What the player does, why it is interesting, what feeling or
fantasy it delivers, and what makes it different from the obvious comparison.
Include the full idea, not just what the prototype covers.

## Core loop
The repeating cycle the player goes through, as a short numbered list.
Note the length of one loop (seconds / minutes).

## Rules and systems
Everything needed to play the game by hand with pen and paper: entities,
stats, how they interact, what triggers what, numbers where they matter.
Use subsections per system.

## Controls
Exact inputs. Keyboard, mouse, touch. State what the prototype actually supports.

## Win, lose, and progression
How a session ends, and what carries over between sessions or levels, if anything.

## Look and sound
Intended visual style and audio direction, even if the prototype uses
placeholder shapes. Note which assets are placeholders and which are real.

## Prototype scope
What this prototype is meant to prove or disprove, in one or two sentences.
Then two lists: **In the prototype** / **Deliberately left out**.

## Open questions
Decisions not made yet, each with the options being considered.

## Playtest notes
Dated entries. Who played, what happened, what surprised us, what to change.

## Changelog
Dated one-line entries, newest first. Every change to this doc or the prototype
gets a line.
```

## Prototype: `index.html`

- Plain HTML, CSS, and JavaScript. No build step, no bundler, no package manager, no frameworks that need compiling. The file you commit is the file that runs.
- Prefer a single `index.html` with inline CSS and JS. Split into separate files only when it passes roughly 500 lines.
- Libraries are allowed from a CDN (cdnjs or jsDelivr) if they save real time. Pin an exact version in the URL. Candidates: Phaser, Kaplay, p5.js, PixiJS. Raw `<canvas>` is often enough.
- Every path is relative (`./assets/x.png`, never `/assets/x.png`). Project sites live under `/<repo>/`, so root-absolute paths break.
- Must work when opened at a GitHub Pages URL *and* from a local static server. Do not depend on `file://` quirks.
- Start screen with a button or "press any key" before any audio plays; browsers block sound until the first user gesture.
- Show the controls on screen or on the start screen. Testers will not read the doc first.
- Keep the first playable loop reachable within 10 seconds of loading. No menus, settings, or save systems unless the idea is about them.
- Target desktop browsers (Chrome, Firefox, Safari). Touch support is a bonus, not a requirement, unless the design doc says the idea is mobile-first.
- Assets: keep each prototype under about 5 MB. Compress images (PNG/WebP), use OGG/MP3 for audio, no raw WAV. Placeholder shapes and colors are perfectly fine; do not spend time on art the design doc does not call for.
- No console errors on load or during normal play. Check the browser console before calling it done.
- Put a link back to the hub (`../../../index.html` or equivalent relative path) somewhere unobtrusive, and a link to the prototype's `DESIGN.md` on GitHub if the repo is public.

## Hub page and manifest

`index.html` at the root lists every prototype by reading `prototypes.js`. Do not hand-edit the hub's HTML to add entries; add to the manifest instead. Agents maintain `prototypes.js`; the hub renders it.

`prototypes.js` defines a single global array. One entry per prototype:

```js
window.PROTOTYPES = [
  {
    title: "Mushroom Detective",
    path: "jams/2026-10-example-jam/mushroom-detective/",
    pitch: "Identify poisoned mushrooms by cross-examining the forest's witnesses.",
    status: "prototype",
    created: "2026-10-27",
    group: "2026-10 Example Jam",
    tags: ["deduction", "narrative"]
  }
];
```

Keep entries sorted newest first. `path` is relative to the repo root and ends with `/`. `group` is the jam name or `"Ideas"`.

## Local testing

Serve the repo root over HTTP; opening files directly with `file://` hides bugs that will appear on Pages.

```sh
python3 -m http.server 8000
# then open http://localhost:8000/
```

Test the specific prototype at `http://localhost:8000/<path>/`, and test the hub at `/`.

## Git conventions

- Work on `main`. Pages deploys from it, so every push goes live within a minute or two. Do not push a prototype that fails to load.
- Commit messages: `<folder>: <what changed>`, for example `mushroom-detective: add witness timer, update DESIGN.md`. Repo-wide changes use `repo:` or `hub:`.
- Commit the design doc and the prototype change together when they are related.
- Never commit secrets, API keys, or anything that cannot be public. The repo is public while prototypes are being shared.
- No large binaries. If an asset is bigger than 5 MB, downscale or compress it instead.

## Definition of done

Before a prototype is reported as finished, every item must be true:

- [ ] `DESIGN.md` exists, follows the template, and a stranger could play the game by hand from it.
- [ ] `DESIGN.md` describes the full idea, not just the prototype, and **Prototype scope** states what is in and out.
- [ ] `index.html` loads with no console errors at `http://localhost:8000/<path>/`.
- [ ] All asset paths are relative and match the file names exactly, including case.
- [ ] Controls are visible on screen.
- [ ] Audio, if any, starts only after a click or key press.
- [ ] Entry added to `prototypes.js` and the hub shows it.
- [ ] Changelog in `DESIGN.md` has a dated line for this change.
- [ ] Total folder size is under about 5 MB.
