# md-to-pdf

Prints the lab reports in `docs/` to A4 PDFs. It renders the Markdown the way StackEdit does (CommonMark with tables, StackEdit's stylesheet, KaTeX and Prism) and prints the page with Playwright's headless Chromium.

On top of StackEdit's look, the layout is tuned for reports full of command output and screenshots:

- 18 mm side margins and 9.6 pt body text.
- A code block wider than the page shrinks until its longest line fits, down to about 6 pt. Past that, lines wrap with a hanging indent, so no output is cut off.
- Images are capped at three quarters of a page and stay with their caption.
- Headings stay with the block after them, and table rows are not split across pages.

The page geometry lives in `Layout` in `src/md_to_pdf/pdf.py`. The CSS and the page script are in `src/md_to_pdf/assets/`.

## Setup

Needs [uv](https://docs.astral.sh/uv/). It installs Python 3.15 and the dependencies on first run. Playwright's Chromium is a separate one-time download (about 125 MB):

```sh
uv run --project scripts/md-to-pdf playwright install --only-shell chromium
```

To use an installed Chrome or Edge instead, pass `--channel chrome` or `--channel msedge`.

## Usage

From the repository root:

```sh
bun run report:pdf docs/lab-2-report.md              # writes docs/lab-2-report.pdf
bun run report:pdf docs/lab-2-report.md -o out.pdf
bun run report:pdf docs --out-dir out                # every .md in docs/
```

The stylesheet, KaTeX and Prism load from CDNs, so rendering needs a network connection.

The `云原生软件技术-Lab*.pdf` files at the repository root are the course's lab requirements. Do not write reports over them.

## Checks

Run these in this folder. CI runs them in the `md-to-pdf` job.

```sh
uv run ruff check          # all rules, including import sorting
uv run ruff format --check
uv run mypy                # strict
```
