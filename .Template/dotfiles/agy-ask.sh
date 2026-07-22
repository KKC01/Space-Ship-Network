#!/usr/bin/env bash
# agy-ask.sh : agy --print を「非TTYでも出力が消えない」確実な形で呼ぶラッパー。
# 既知バグ #76（非TTYでstdout消失・exit0空）対策に擬似TTY(script)を噛ませ、
# ANSI制御・CRを除去して素のテキストだけを返す。
# 使い方: bash agy-ask.sh "プロンプト"   /  agy-ask.sh "..." --model "Gemini 3.1 Pro (High)"
set -euo pipefail
[ $# -ge 1 ] || { echo "usage: agy-ask.sh <prompt> [extra agy flags...]" >&2; exit 2; }
PROMPT="$1"; shift
EXTRA="$*"
# 擬似TTYで agy -p を実行（-e で子プロセスのexitを伝播）
out=$(script -qec "agy --print \"$PROMPT\" $EXTRA" /dev/null 2>/dev/null \
        | sed -r 's/\x1B\[[0-9;?]*[A-Za-z]//g; s/\x1B\][0-9;]*[A-Za-z]//g' \
        | tr -d '\r' \
        | grep -viE '^$|HasRichCommandDetection' || true)
if [ -z "${out//[$' \t\n']/}" ]; then
  echo "ERROR: agy returned empty output (auth未完了 or 既知バグ #76 の可能性)" >&2
  exit 1
fi
printf '%s\n' "$out"
