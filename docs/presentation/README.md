# Lab 2 class presentation

A [Slidev](https://sli.dev) deck for the 10-minute Lab 2 talk: moving the venue booking system from Docker Compose to Kubernetes. The talk outline and who says what are in [../presentation-guide.md](../presentation-guide.md). Each slide's spoken script is in its speaker notes.

This is its own Bun project with its own lockfile. Install it once:

```sh
cd docs/presentation
bun install
```

## Present

| Goal                             | Command                                                                 | Output                                                                |
| -------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Live editing with presenter view | `bun run dev`                                                           | <http://localhost:3030>, presenter at `/#/presenter/1`                |
| One offline HTML file            | `bun run build:single`                                                  | `dist-single/index.html` (open it by double-click, no network needed) |
| Static site with presenter view  | `bun run build`, then `bun run serve`                                   | <http://localhost:3030>                                               |
| PDF and PowerPoint backups       | `bun run export -- --with-clicks` and `bun run export -- --format pptx` | `slides-export.pdf`, `slides-export.pptx`                             |

The single HTML file has no presenter sync, because that needs a server. Use `bun run dev` or `bun run serve` when you want the notes on a second screen.

Press `G` and type a number to jump to a slide. The thank-you slide is the last one, after the backup slides (B1 onward).

## Architecture animation

The diagram on slide 4 is a [Remotion](https://www.remotion.dev) composition in `morph/`. It is rendered into one clip and one still per click:

```sh
bun morph/render.ts
```

The clips go to `assets/morph/`. Stop a running dev server first, because on Windows it keeps the clips open and the render cannot replace them.

## Check the layout

`checks/check-slides.ts` opens every slide in Chromium and reports text overflow, orphans, contrast, margins, minimum font size and other layout rules. Run it against a dev server or a built deck:

```sh
bun checks/check-slides.ts http://localhost:3030
```

CI runs the type check, both builds and this checker.
