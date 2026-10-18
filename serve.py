#!/usr/bin/env python3
"""
Statischer Server fuer die Testoberflaeche.

Warum nicht `python3 -m http.server`: der liefert Dateien mit Last-Modified
aus, und Browser halten ES-Module hartnaeckig im Zwischenspeicher. Nach einer
Aenderung laedt der Browser dann einen Teil der Module neu und einen Teil
nicht - die Seite bricht beim Import ab und tut scheinbar gar nichts mehr.

Dieser Server schickt `Cache-Control: no-store`. Damit ist jede Aenderung
nach einem normalen Neuladen sofort da.

    python3 serve.py           # http://127.0.0.1:8100
    python3 serve.py 9000      # anderer Port
"""

import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ORDNER = Path(__file__).resolve().parent


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ORDNER), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8100
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)

    print(f"Testoberfläche: http://127.0.0.1:{port}/  (Strg+C beendet)")
    print(f"Ordner: {ORDNER}")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nbeendet")


if __name__ == "__main__":
    main()
