#!/usr/bin/env bash
#
# dotfiles install script — VS Code が全 devcontainer / Codespace の起動時に自動実行する。
# Antigravity CLI（agy）を ~/.local/bin に冪等インストールし、PATH を通す。
#
set -euo pipefail

BIN="$HOME/.local/bin/agy"

if [ -x "$BIN" ]; then
  echo "[dotfiles] agy はインストール済み: $BIN（agy本体が自己更新するためスキップ）"
else
  echo "[dotfiles] Antigravity CLI（agy）をインストールします..."
  # 公式インストーラ。SHA512検証付きで ~/.local/bin/agy を配置し、~/.bashrc 等に PATH を追記する。
  curl -fsSL https://antigravity.google/cli/install.sh | bash
fi

# 非対話シェル（postCreate等）でも解決できるよう、念のため PATH 追記を冪等に保証。
for profile in "$HOME/.bashrc" "$HOME/.profile"; do
  line='export PATH="$HOME/.local/bin:$PATH"'
  if [ -f "$profile" ] && ! grep -qF '.local/bin' "$profile"; then
    printf '\n%s\n' "$line" >> "$profile"
    echo "[dotfiles] PATH を $profile に追記しました"
  fi
done

echo "[dotfiles] 完了。新しいターミナルで 'agy' が使えます。"
