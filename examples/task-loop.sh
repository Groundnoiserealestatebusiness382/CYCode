#!/usr/bin/env bash
# Minimal CYCode task loop: one isolated agent run per line of tasks.txt.
# Failed tasks are collected for retry/escalation — verify, don't trust.
set -uo pipefail

TASKS="${1:-tasks.txt}"
FAILED="failed-tasks.txt"
: > "$FAILED"

while IFS= read -r task; do
  [ -z "$task" ] && continue
  echo "▶ $task"
  if cycode exec "$task" --mode acceptEdits --json >> runs.jsonl; then
    echo "✓ done"
  else
    echo "✗ failed"
    echo "$task" >> "$FAILED"
  fi
done < "$TASKS"

if [ -s "$FAILED" ]; then
  echo "Failed tasks left in $FAILED"
  exit 1
fi
