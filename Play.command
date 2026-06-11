#!/bin/zsh
# Double-click to play BlockBonk
cd "$(dirname "$0")"
( sleep 1 && open "http://localhost:8123" ) &
exec python3 -m http.server 8123
