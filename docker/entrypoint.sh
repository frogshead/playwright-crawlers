#!/bin/bash
set -e

# Default crawler if not specified
CRAWLER_NAME=${CRAWLER_NAME:-tori}

# Map crawler names to their respective JavaScript files
case "$CRAWLER_NAME" in
  "tori")
    CRAWLER_FILE="build/tori_crawler.js"
    ;;
  "mol")
    CRAWLER_FILE="build/mol_crawler.js"
    ;;
  "fillaritori")
    CRAWLER_FILE="build/fillaritori_crawler.js"
    ;;
  "tavastia")
    CRAWLER_FILE="build/tavastia_crawler.js"
    ;;
  "krapinpaja")
    CRAWLER_FILE="build/krapinpaja_crawler.js"
    ;;
  "theseus")
    CRAWLER_FILE="build/theseus_crawler.js"
    ;;
  *)
    echo "Error: Unknown crawler name '$CRAWLER_NAME'"
    echo "Available crawlers: tori, mol, fillaritori, tavastia, krapinpaja, theseus"
    exit 1
    ;;
esac

# Log the crawler being executed
echo "[$(date -Iseconds)] Starting crawler: $CRAWLER_NAME (file: $CRAWLER_FILE)"

# Execute the crawler
exec node "$CRAWLER_FILE"