#!/usr/bin/env bash
# Runs every browser test against one build and prints a short summary per test.
# Usage: build/run_all.sh [file:///path/to/Tempo.html]
cd "$(dirname "$0")/.." || exit 1
export TEMPO_URL="${1:-file://$PWD/dist/Tempo.html}"
mkdir -p build/logs
for t in ui_test game_test fullgame_test flow_test openings_test trap_avoid_test openings_qa csp_test sync_test dark_test caps_test data_robust_test practice_robust_test review_robust_test motion_test clock_test loop_test tiers_test talk_test portraits_test endgame_test keyboard_test engine_test lessons_practice_test import_test bg_review_test; do
  [ -f "build/$t.py" ] || { echo "=== $t: missing"; continue; }
  start=$(date +%s)
  timeout 1800 python3 "build/$t.py" > "build/logs/$t.log" 2>&1
  code=$?
  echo "=== $t (exit $code, $(( $(date +%s) - start ))s)"
  grep -v "^\s*-\|waiting\|retrying" "build/logs/$t.log" | tail -4
done
