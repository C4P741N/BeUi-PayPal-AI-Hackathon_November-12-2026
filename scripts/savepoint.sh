#!/usr/bin/env bash
# ── Save point helper ────────────────────────────────────────────────
# Create labeled snapshots of the project and revert to them later.
#
# Usage (run from the project root or anywhere):
#   scripts/savepoint.sh save "label"    create a new save point
#   scripts/savepoint.sh list            list save points (numbered in
#                                        the order they were created)
#   scripts/savepoint.sh revert <n>      revert project to save point n
#
# Save points capture the full project state, including the chat
# database in db/, so reverting also restores the conversations that
# existed when the save point was created.
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."   # always operate from the project root

CMD="${1:-help}"

case "$CMD" in
  save)
    LABEL="${2:-manual save}"
    git add -A
    if git diff --cached --quiet; then
      echo "No changes since the last save point — nothing to save."
      exit 0
    fi
    git commit -q -m "Save point: $LABEL"
    echo "✔ Save point created:"
    git log -1 --format='  %h  %s  (%ci)'
    ;;

  list)
    # Oldest first; the numbers here match `revert <n>`.
    SAVEPOINTS=$(git log --reverse --format='%h %ci %s' | grep 'Save point' || true)
    if [ -n "$SAVEPOINTS" ]; then
      echo "$SAVEPOINTS" | cat -n | sed 's/^ *//; s/\t/  /'
    else
      echo "No save points yet — create one with:"
      echo "  scripts/savepoint.sh save \"label\""
    fi
    ;;

  revert)
    N="${2:-1}"
    SAVEPOINTS=$(git log --reverse --format='%h %s' | grep 'Save point' || true)
    HASH=$(echo "$SAVEPOINTS" | sed -n "${N}p" | cut -d' ' -f1)
    if [ -z "${HASH:-}" ]; then
      echo "Save point #${N} not found. Run 'scripts/savepoint.sh list' to see them."
      exit 1
    fi
    LABEL=$(echo "$SAVEPOINTS" | sed -n "${N}p" | cut -d' ' -f2-)
    git reset --hard -q "$HASH"
    # Remove files that were created after the save point (source dirs only).
    git clean -fdq src prisma public mini-services examples
    echo "✔ Reverted to save point #${N}: $LABEL"
    git log -1 --format='  %h  %s  (%ci)'
    echo "  The dev server will hot-reload automatically."
    ;;

  help|*)
    sed -n '/^# ── Save point/,/^# ─────/p' "$0" | sed 's/^# \{0,1\}//' | head -12
    ;;
esac
