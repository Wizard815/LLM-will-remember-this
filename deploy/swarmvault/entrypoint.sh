#!/bin/sh
# Build a SwarmVault graph from the household wiki (mounted read-only at
# $WIKI_DIR), refresh it every $REFRESH_MINUTES, and serve the graph viewer.
# Everything SwarmVault writes stays in $VAULT_DIR, never in the wiki.
set -eu

cd "$VAULT_DIR"

if [ ! -f swarmvault.config.json ]; then
  echo "swarmvault-trial: first run, creating the vault in $VAULT_DIR"
  swarmvault init
  if [ -n "${ARGOS_URL:-}" ] && [ -n "${ARGOS_MODEL:-}" ]; then
    # Optional: let a local model (Argos, OpenAI-compatible) do the extraction.
    # Without it SwarmVault's offline heuristic is used, which is noisier.
    swarmvault provider add argos --type openai-compatible --api-style chat \
      --base-url "$ARGOS_URL" --model "$ARGOS_MODEL" --api-key-env ARGOS_API_KEY \
      --capability chat --capability structured \
      --task compileProvider --task queryProvider --task lintProvider
  fi
  swarmvault source add "$WIKI_DIR" --no-guide
else
  swarmvault source reload --all
fi

refresh() {
  while sleep "$((REFRESH_MINUTES * 60))"; do
    swarmvault source reload --all || echo "swarmvault-trial: refresh failed, will retry"
  done
}
refresh &

exec swarmvault graph serve --port "$VIEWER_PORT" --full
