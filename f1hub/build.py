#!/usr/bin/env python3
"""Assemble the F1 Analysis Hub single-file app.

Usage: python3 build.py <weekend.json> <out.html>
"""
import base64
import gzip
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
JS_ORDER = ["core.js", "charts.js", "views_a.js", "views_b.js", "views_c.js", "views_d.js", "app.js"]


def main():
    data_path = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else HERE / "weekend_2026_9.json")
    out_path = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else HERE / "f1-analysis-hub.html")

    raw = data_path.read_bytes()
    if data_path.suffix == ".gz":
        raw = gzip.decompress(raw)
    meta = json.loads(raw)
    b64 = base64.b64encode(gzip.compress(raw, 9)).decode()

    css = (HERE / "src" / "style.css").read_text()
    js = "\n".join((HERE / "src" / f).read_text() for f in JS_ORDER)

    html = (HERE / "template.html").read_text()
    title = f"{meta['event']} {meta['year']} — F1 Analysis Hub"
    html = html.replace("{{TITLE}}", title).replace("{{CSS}}", css).replace("{{JS}}", js).replace("{{DATA_B64}}", b64)
    out_path.write_text(html)
    print(f"wrote {out_path} ({out_path.stat().st_size/1e6:.1f} MB, data {len(b64)/1e6:.1f} MB b64)")


if __name__ == "__main__":
    main()
