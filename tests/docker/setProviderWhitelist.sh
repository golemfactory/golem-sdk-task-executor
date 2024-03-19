#!/bin/bash
ya-provider rule set outbound everyone --mode whitelist

WHITELIST_URL="https://raw.githubusercontent.com/golemfactory/ya-installer-resources/main/whitelist/strict.lst"

curl -s "$WHITELIST_URL" | while read -r url; do
    ya-provider whitelist add -p "$url"
done

echo "Whitelisting completed"