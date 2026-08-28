#!/usr/bin/env python3
"""Build a single self-contained HTML edition of the CDBG-DR Fund Dashboard."""
from __future__ import annotations

import argparse
import base64
import gzip
import html
import re
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site-dir", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--output", type=Path, default=None)
    return parser.parse_args()


def packed_node(relative: str, source: Path) -> str:
    raw = source.read_bytes()
    packed = gzip.compress(raw, compresslevel=9, mtime=0)
    encoded = base64.b64encode(packed).decode("ascii")
    lines = "\n".join(encoded[index:index + 120] for index in range(0, len(encoded), 120))
    return f'<script type="application/x-cdbg-gzip" data-cdbg-path="{html.escape(relative, quote=True)}">\n{lines}\n</script>'


def build(site: Path, output: Path) -> None:
    site = site.resolve()
    index = (site / "index.html").read_text(encoding="utf-8")
    css = (site / "assets/app.css").read_text(encoding="utf-8")
    favicon = base64.b64encode((site / "assets/favicon.svg").read_bytes()).decode("ascii")

    index = re.sub(
        r'<link\s+rel="icon"\s+href="\./assets/favicon\.svg"\s+type="image/svg\+xml"\s*/?>',
        f'<link rel="icon" href="data:image/svg+xml;base64,{favicon}" type="image/svg+xml">',
        index,
    )
    index = re.sub(
        r'<link\s+rel="stylesheet"\s+href="\./assets/app\.css"\s*/?>',
        '<style id="cdbg-inline-style">\n' + css + '\n</style>',
        index,
    )
    for source in (
        "./assets/vendor/plotly-3.3.1.min.js",
        "./data/bootstrap.js",
        "./assets/app.js",
    ):
        index = re.sub(rf'<script\s+src="{re.escape(source)}"\s*></script>', "", index)
    index = index.replace("STATIC GITHUB PAGES EDITION", "SELF-CONTAINED HTML EDITION")

    assets = [
        "assets/vendor/plotly-3.3.1.min.js",
        "data/bootstrap.js",
        "assets/app.js",
    ]
    assets.extend(sorted(str(path.relative_to(site)).replace("\\", "/") for path in (site / "data/rows").glob("rows_*.js")))
    assets.extend(sorted(str(path.relative_to(site)).replace("\\", "/") for path in (site / "data/narratives").glob("narratives_*.js")))
    assets.extend([
        "data/geography/state.js",
        "data/geography/county.js",
        "data/geography/urban.js",
    ])
    missing = [relative for relative in assets if not (site / relative).is_file()]
    if missing:
        raise FileNotFoundError("Missing assets required for one-file HTML:\n" + "\n".join(missing))

    packed = "\n\n".join(packed_node(relative, site / relative) for relative in assets)
    pako = (site / "scripts/vendor/pako_inflate.min.js").read_text(encoding="utf-8")
    bootloader = r'''
<script>
(() => {
  "use strict";
  const nodes = new Map();
  for (const node of document.querySelectorAll('script[type="application/x-cdbg-gzip"][data-cdbg-path]')) {
    const key = node.dataset.cdbgPath.replace(/^(?:\.\/)+/, "").replace(/^\/+/, "");
    nodes.set(key, node);
  }
  function setBootStatus(message, percent) {
    const messageNode = document.getElementById("loading-message");
    const progressNode = document.getElementById("loading-progress");
    if (messageNode) messageNode.textContent = message;
    if (progressNode) progressNode.style.width = `${Math.max(3, Math.min(100, percent))}%`;
  }
  function base64ToBytes(text) {
    const binary = atob(text.replace(/\s+/g, ""));
    const output = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) output[index] = binary.charCodeAt(index);
    return output;
  }
  function executeJavaScript(code, sourceName) {
    const script = document.createElement("script");
    script.textContent = `${code}\n//# sourceURL=cdbg-self-contained://${sourceName}`;
    document.head.appendChild(script);
    script.remove();
  }
  const loaded = new Map();
  window.__CDBG_EXEC_PACKED_ASSET = function executePackedAsset(source) {
    const key = String(source).replace(/^(?:\.\/)+/, "").replace(/^\/+/, "");
    if (loaded.has(key)) return loaded.get(key);
    const promise = Promise.resolve().then(() => {
      const node = nodes.get(key);
      if (!node) throw new Error(`Embedded dashboard asset not found: ${key}`);
      const packedBytes = base64ToBytes(node.textContent);
      const unpacked = window.pako.ungzip(packedBytes);
      executeJavaScript(new TextDecoder("utf-8").decode(unpacked), key);
      node.textContent = "";
      node.remove();
      nodes.delete(key);
      return key;
    });
    loaded.set(key, promise);
    return promise;
  };
  async function start() {
    try {
      setBootStatus("Starting the self-contained dashboard engine…", 3);
      await window.__CDBG_EXEC_PACKED_ASSET("assets/vendor/plotly-3.3.1.min.js");
      setBootStatus("Preparing embedded financial and geographic metadata…", 5);
      await window.__CDBG_EXEC_PACKED_ASSET("data/bootstrap.js");
      setBootStatus("Launching Explore & Compare and Quick Report…", 6);
      await window.__CDBG_EXEC_PACKED_ASSET("assets/app.js");
    } catch (error) {
      console.error(error);
      const loading = document.getElementById("loading-screen");
      if (loading) loading.hidden = true;
      const app = document.getElementById("app");
      if (app) app.hidden = false;
      const globalError = document.getElementById("global-error");
      if (globalError) {
        globalError.hidden = false;
        globalError.innerHTML = `<strong>Dashboard startup error:</strong> ${String(error?.message || error)}<br>Open this HTML file in a current Chrome, Edge, Firefox, or Safari browser.`;
      }
    }
  }
  start();
})();
</script>
'''
    injection = f"\n{packed}\n\n<script>\n{pako}\n</script>\n{bootloader}\n"
    if "</body>" not in index:
        raise ValueError("index.html does not contain </body>")
    final = index.replace("</body>", injection + "</body>")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(final, encoding="utf-8")
    print(f"Wrote {output} ({output.stat().st_size:,} bytes; {len(assets)} packed assets)")


def main() -> None:
    args = parse_args()
    site = args.site_dir.resolve()
    output = args.output or (site / "HUD-CDBG-DR-Fund-Dashboard-Hierarchical.html")
    build(site, output.resolve())


if __name__ == "__main__":
    main()
