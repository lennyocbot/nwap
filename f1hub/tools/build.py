#!/usr/bin/env python3
"""Assemble the F1 Analysis Hub app.

Embedded mode (single file, one weekend baked in):
    python3 build.py weekend.json[.gz] out.html

Site mode (data fetched at runtime from manifest.json + data/):
    python3 build.py --site out/index.html
"""
import base64
import gzip
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
JS_ORDER = ["core.js", "charts.js", "views_a.js", "views_b.js", "views_c.js", "views_d.js", "views_e.js", "app.js"]


def assemble(mode, b64, title):
    css = (HERE / "src" / "style.css").read_text()
    js = "\n".join((HERE / "src" / f).read_text() for f in JS_ORDER)
    html = (HERE / "template.html").read_text()
    return (html.replace("{{TITLE}}", title).replace("{{CSS}}", css)
                .replace("{{JS}}", js).replace("{{MODE}}", mode)
                .replace("{{DATA_B64}}", b64))


def main():
    args = [a for a in sys.argv[1:] if a != "--site"]
    site = "--site" in sys.argv

    if site:
        out_path = pathlib.Path(args[0] if args else HERE.parent / "index.html")
        html = assemble("site", "", "Minisector — F1 analysis")
    else:
        data_path = pathlib.Path(args[0] if args else HERE / "weekend_2026_9.json")
        out_path = pathlib.Path(args[1] if len(args) > 1 else HERE / "f1-analysis-hub.html")
        raw = data_path.read_bytes()
        if data_path.suffix == ".gz":
            raw = gzip.decompress(raw)
        meta = json.loads(raw)
        b64 = base64.b64encode(gzip.compress(raw, 9)).decode()
        html = assemble("embedded", b64, f"{meta['event']} {meta['year']} — Minisector")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html)
    print(f"wrote {out_path} ({out_path.stat().st_size/1e6:.1f} MB, {'site' if site else 'embedded'} mode)")


if __name__ == "__main__":
    main()
