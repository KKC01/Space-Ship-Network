# AI Sync Guide

このリポジトリでは、Claude Code をメインの実行環境とし、Codex は同じ内容を追従する構成で運用する。

## 正本

- 指示の正本: `CLAUDE.md`
- Codex 向けの入口: `AGENTS.md`
- 共有ツール定義: `.mcp.json`
- Codex 側の対応設定: `.codex/config.toml`

## 同期対象

1. `MCP`
   - 外部サービス接続は `.mcp.json` と `.codex/config.toml` を対応させる。

2. `Hooks`
   - Claude Code 側は `.claude/hooks/`
   - Codex 側は `.codex/hooks/`
   - 役割が同じ hook は同名で揃える。

3. `Agents`
   - Claude Code 側は `.claude/agents/`
   - Codex 側は `.codex/agents/`
   - 役割名を揃え、内容は各ツールの形式に合わせる。

4. `指示`
   - 常時読む指示は `CLAUDE.md` を正本にする。
   - Codex からは `AGENTS.md` を読む。

5. `Obsidian 記憶`
   - `/mnt/obsidian` の vault を共通記憶として扱う。
   - セッション引き継ぎは `_handoff/current-session.md` を更新する。
   - 失敗パターンは `Knowledge/mistakes.md` に蓄積する。

## 運用ルール

- Claude Code 側を先に更新する。
- その変更を Codex 側へ反映する。
- 片側だけの変更を残さない。
- 変更後は Obsidian に引き継ぎを書く。

