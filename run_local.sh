#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
echo "Starting CDBG-DR Fund Dashboard at http://127.0.0.1:8000/"
python3 -m http.server 8000
