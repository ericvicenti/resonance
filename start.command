#!/bin/zsh
cd "${0:A:h}"
mkdir -p "$HOME/Library/Logs/Resonance"
if ! curl -fsS http://localhost:8765/ >/dev/null 2>&1; then
  nohup node server.mjs > "$HOME/Library/Logs/Resonance/server.log" 2>&1 < /dev/null &
  disown
fi
open -na "Google Chrome" --args --user-data-dir="$HOME/Library/Application Support/Resonance/Chrome" --no-first-run --no-default-browser-check --remote-debugging-port=9227 --start-fullscreen --app=http://localhost:8765
