#!/usr/bin/env python3
"""Servidor estático do Hidrata, com o tipo certo para o manifesto do PWA."""

import os
import socketserver
from http.server import SimpleHTTPRequestHandler

PORT = int(os.environ.get("PORT", "8080"))


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".webmanifest": "application/manifest+json",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".html": "text/html; charset=utf-8",
    }


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
        print(f"Hidrata em http://localhost:{PORT}")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
