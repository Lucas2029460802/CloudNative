"""Turn report Markdown into the HTML page that Chromium prints."""

import html
import re
from importlib.resources import files
from string import Template
lazy from pathlib import Path  # annotations only

from markdown_it import MarkdownIt

ASSETS = files("md_to_pdf") / "assets"

BOLD = re.compile(r"\*\*([^*\n]+?)\*\*")
CODE = re.compile(r"(```.*?```|`[^`\n]*`)", re.DOTALL)
MATH = re.compile(r"\$\$.+?\$\$|\$(?=\S)[^$\n]*?(?<=\S)\$", re.DOTALL)


def fix_bold(text: str) -> str:
    """Turn ``**x**`` into ``<strong>``; CommonMark drops it next to full-width punctuation."""
    parts = CODE.split(text)  # odd items are code spans, left alone
    return "".join(
        part if i % 2 else BOLD.sub(r"<strong>\1</strong>", part) for i, part in enumerate(parts)
    )


def protect_math(text: str) -> tuple[str, list[str]]:
    """Swap formulas for plain tokens so Markdown leaves their underscores and backslashes alone."""
    found: list[str] = []

    def stash(match: re.Match[str]) -> str:
        found.append(match.group(0))
        return f"MATHTOKEN{len(found) - 1}END"

    parts = CODE.split(text)
    protected = "".join(part if i % 2 else MATH.sub(stash, part) for i, part in enumerate(parts))
    return protected, found


def render_body(text: str) -> str:
    """Render Markdown the way StackEdit does: CommonMark plus tables and strikethrough."""
    protected, formulas = protect_math(text)
    body: str = (  # markdown-it-py types render() as Any
        MarkdownIt("commonmark")
        .enable(["table", "strikethrough"])
        .render(fix_bold(protected))
        .replace("<pre>", '<pre class="prism">')
    )
    for i, formula in enumerate(formulas):
        body = body.replace(f"MATHTOKEN{i}END", html.escape(formula, quote=False))
    return body


def build_page(md_path: Path) -> str:
    """Return a full HTML page for ``md_path``; relative links resolve next to the file."""
    page = Template((ASSETS / "page.html").read_text(encoding="utf-8"))
    return page.substitute(
        title=html.escape(md_path.stem),
        base=md_path.resolve().parent.as_uri() + "/",
        style=(ASSETS / "report.css").read_text(encoding="utf-8"),
        body=render_body(md_path.read_text(encoding="utf-8")),
    )
