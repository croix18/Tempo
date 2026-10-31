#!/bin/bash
cd "$(dirname "$0")/.."
mkdir -p build/logs
( for p in "pip rosie 40" "rosie theo 40" "theo mabel 40" "mabel gus 40" "gus nora 30" "nora felix 30"; do node tests/match.js $p 11; done ) > build/logs/lane1.txt 2>&1 &
( for p in "felix iris 24" "iris silas 20" "silas vera 16" "vera otto 12" "otto celeste 10"; do node tests/match.js $p 13; done ) > build/logs/lane2.txt 2>&1 &
wait
echo DONE >> build/logs/lane1.txt
