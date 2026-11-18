"""Command line: ``md-to-pdf REPORT.md [-o OUT.pdf]``."""

import argparse
from pathlib import Path

from md_to_pdf.pdf import open_browser, print_pdf


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse the command line."""
    parser = argparse.ArgumentParser(
        prog="md-to-pdf",
        description="Print Markdown files to A4 PDFs with headless Chromium.",
    )
    parser.add_argument("paths", nargs="+", type=Path, help="Markdown files or folders of them")
    out = parser.add_mutually_exclusive_group()
    out.add_argument("-o", "--output", type=Path, help="PDF path, for a single Markdown file")
    out.add_argument("--out-dir", type=Path, help="folder for the PDFs (default: next to each)")
    parser.add_argument(
        "--channel",
        help="use an installed browser such as chrome or msedge instead of Playwright's Chromium",
    )
    args = parser.parse_args(argv)
    args.sources = [
        file
        for path in args.paths
        for file in (sorted(path.glob("*.md")) if path.is_dir() else [path])
    ]
    if args.output and len(args.sources) != 1:
        parser.error("--output needs exactly one Markdown file")
    return args


def output_path(source: Path, args: argparse.Namespace) -> Path:
    """Return where the PDF for ``source`` goes."""
    if args.output:
        return Path(args.output)
    if args.out_dir:
        return Path(args.out_dir) / source.with_suffix(".pdf").name
    return source.with_suffix(".pdf")


def main(argv: list[str] | None = None) -> None:
    """Convert each Markdown file and print the PDF paths."""
    args = parse_args(argv)
    with open_browser(args.channel) as browser:
        for source in args.sources:
            pdf = output_path(source, args)
            print_pdf(browser, source, pdf)
            print(pdf)  # noqa: T201 - the CLI reports each PDF it wrote
