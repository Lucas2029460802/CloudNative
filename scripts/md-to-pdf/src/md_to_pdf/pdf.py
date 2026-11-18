"""Print the HTML page to PDF with Playwright's Chromium."""

from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory
lazy from collections.abc import Iterator  # annotations only

from playwright.sync_api import Browser, PdfMargins, sync_playwright

from md_to_pdf.markdown import ASSETS, build_page

A4_MM = (210, 297)


@dataclass(frozen=True, slots=True, kw_only=True)
class Layout:
    """Page geometry. CSS zoom scales StackEdit's 16 px text; 0.8 prints it at 9.6 pt."""

    zoom: float = 0.8
    margin_x_mm: float = 18
    margin_y_mm: float = 16
    image_share: float = 0.75  # tallest image, as a share of the printable height
    code_em: float = 0.85  # StackEdit's code size relative to body text
    code_min_em: float = 0.62  # smallest a wide code block may shrink to (about 6 pt)

    def margins(self) -> PdfMargins:
        """Return the page margins in Playwright's format."""
        x, y = f"{self.margin_x_mm}mm", f"{self.margin_y_mm}mm"
        return {"top": y, "bottom": y, "left": x, "right": x}

    def script_options(self) -> dict[str, float]:
        """Return the options layout.js expects; zoom also scales mm, so divide it out."""
        width, height = A4_MM
        return {
            "zoom": self.zoom,
            "textWidthMm": (width - 2 * self.margin_x_mm) / self.zoom,
            "imageMaxHeightMm": (height - 2 * self.margin_y_mm) * self.image_share / self.zoom,
            "codeEm": self.code_em,
            "codeMinEm": self.code_min_em,
        }


@contextmanager
def open_browser(channel: str | None = None) -> Iterator[Browser]:
    """Launch headless Chromium; ``channel`` picks an installed Chrome or Edge instead."""
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel=channel)
        try:
            yield browser
        finally:
            browser.close()


def print_pdf(browser: Browser, md_path: Path, pdf_path: Path, layout: Layout = Layout()) -> None:
    """Render ``md_path`` and print it to ``pdf_path``."""
    script = (ASSETS / "layout.js").read_text(encoding="utf-8")
    with TemporaryDirectory() as tmp:
        # A file URL, so the page may load the report's images from disk.
        page_file = Path(tmp) / "page.html"
        page_file.write_text(build_page(md_path), encoding="utf-8")
        page = browser.new_page()
        try:
            page.goto(page_file.as_uri(), wait_until="networkidle")
            page.add_script_tag(content=script)
            page.evaluate("options => layoutReport(options)", layout.script_options())
            pdf_path.parent.mkdir(parents=True, exist_ok=True)
            page.pdf(path=pdf_path, format="A4", margin=layout.margins(), print_background=True)
        finally:
            page.close()
