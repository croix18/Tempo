#!/bin/bash
cd "$(dirname "$0")/.."
mkdir -p build/logs
( for p in "pip rosie 40" "rosie theo 40" "theo mabel 40" "mabel gus 40" "gus nora 40" "nora felix 40" "felix iris 30" "iris silas 24"; do node tests/match.js $p 61; done ) > build/logs/c2_lane1.txt 2>&1 &
( for p in "silas vera 16" "vera otto 12" "otto celeste 10"; do node tests/match.js $p 63; done ) > build/logs/c2_lane2.txt 2>&1 &
wait
echo DONE >> build/logs/c2_lane1.txt
