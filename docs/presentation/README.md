# Lab 2 class presentation

This [Slidev](https://sli.dev) deck is for the 10-minute Lab 2 talk on moving the venue booking system from Docker Compose to Kubernetes. See [../presentation-guide.md](../presentation-guide.md) for the demo steps, talk outline and team split. Each slide's spoken script is in its speaker notes.

The deck is a separate Bun project with its own lockfile. Install it once:

```sh
cd docs/presentation
bun install
```

## Present

| Goal                             | Command                                                                 | Output                                                             |
| -------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Live editing with presenter view | `bun run dev`                                                           | <http://localhost:3030>, presenter at `/#/presenter/1`             |
| One offline HTML file            | `bun run build:single`                                                  | `dist-single/index.html` (double-click to open, no network needed) |
| Static site with presenter view  | `bun run build`, then `bun run serve`                                   | <http://localhost:3030>                                            |
| PDF and PowerPoint backups       | `bun run export -- --with-clicks` and `bun run export -- --format pptx` | `slides-export.pdf`, `slides-export.pptx`                          |

Use `bun run dev` or `bun run serve` when you want the notes on a second screen. The single HTML file has no presenter sync because that needs a server.

Press `G` and type a number to jump to a slide. The thank-you slide is the last one, after the backup slides (B1 onward).

## Architecture animation

The diagram on slide 4 is a [Remotion](https://www.remotion.dev) composition in `morph/`. Stop any running dev server first. On Windows, the dev server keeps the clips open so the render cannot replace them.

Render one clip and one still per click:

```sh
bun morph/render.ts
```

Both go to `assets/morph/`.

## Check the layout

`checks/check-slides.ts` opens every slide in Chromium and checks text overflow, orphans, contrast, margins, minimum font size and other layout rules. Run it against a dev server or a built deck:

```sh
bun checks/check-slides.ts http://localhost:3030
```

CI runs the type check, both builds and this checker.
