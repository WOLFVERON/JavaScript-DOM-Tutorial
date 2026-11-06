#!/usr/bin/env bash
# Builds index.html (standalone page) from app.html (the Claude Artifact source).
set -euo pipefail
cd "$(dirname "$0")"
{ printf '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'; cat app.html; printf '\n</html>\n'; } > index.html
echo "Built index.html"
