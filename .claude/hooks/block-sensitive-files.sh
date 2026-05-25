#!/bin/bash
INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')

if [ "$TOOL" = "Bash" ]; then
  CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
  if echo "$CMD" | grep -q 'settings\.local\.json'; then
    echo '{"continue": false, "stopReason": "🚫 settings.local.json へのアクセスは禁止されています（APIキー保護）"}'
    exit 2
  fi
else
  FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
  if echo "$FILE" | grep -q 'settings\.local\.json'; then
    echo '{"continue": false, "stopReason": "🚫 settings.local.json へのアクセスは禁止されています（APIキー保護）"}'
    exit 2
  fi
fi
