#!/usr/bin/env python3
"""Minimal Scrapling HTTP sidecar for Klyro.

POST /fetch  { "url": "https://..." }  -> { "html": "...", "links": [...], "status": 200 }
GET  /health -> { "ok": true }

Uses Scrapling's lightweight curl_cffi Fetcher (stealth, no browser) so it is
cheap to run. The Node server calls this only when SCRAPLING_URL is set.
Bound to localhost; it is an internal service behind the Node API.
"""
import logging
from flask import Flask, request, jsonify
from scrapling.fetchers import Fetcher

logging.getLogger("scrapling").setLevel(logging.WARNING)
app = Flask(__name__)


@app.get("/health")
def health():
    return jsonify(ok=True)


@app.post("/fetch")
def fetch():
    data = request.get_json(silent=True) or {}
    url = (data.get("url") or "").strip()
    if not url:
        return jsonify(error="url required"), 400

    def do_fetch(**extra):
        r = Fetcher.get(url, timeout=25, stealthy_headers=True, **extra)
        html = getattr(r, "html_content", "") or ""
        try:
            links = [a.attrib.get("href") for a in r.css("a[href]")][:200]
        except Exception:
            links = []
        return jsonify(html=html, links=[l for l in links if l], status=getattr(r, "status", None))

    try:
        return do_fetch()
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        # Many small-business sites have broken/mismatched TLS certs. That is a
        # property of the TARGET site (and itself a lead signal), not a sidecar
        # fault — retry once without certificate verification so enrichment can
        # still read the page. We only need the HTML, not a trust decision.
        if "SSL" in msg or "certificate" in msg.lower() or "TLS" in msg:
            try:
                return do_fetch(verify=False)
            except Exception as e2:  # noqa: BLE001
                return jsonify(error=str(e2)[:300], kind="target_site"), 200
        # Any other failure is also the target site's problem; return 200 with an
        # error field so the Node fallback chain continues and the provider is
        # not marked down for a single bad URL.
        return jsonify(error=msg[:300], kind="target_site"), 200


if __name__ == "__main__":
    # Local-only; the Node API reaches it via SCRAPLING_URL=http://127.0.0.1:8077
    app.run(host="127.0.0.1", port=8077)
