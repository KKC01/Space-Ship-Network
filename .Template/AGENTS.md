# AGENTS.md

Codex からこのリポジトリを扱うときの入口。

## まず読むもの

1. [AI_SYNC.md](./AI_SYNC.md)
2. `CLAUDE.md`
3. Obsidian Vaultを使う場合: `/mnt/obsidian/_handoff/current-session.md`
4. Obsidian Vaultを使う場合: `/mnt/obsidian/Knowledge/mistakes.md`

## このリポジトリの指示

- 変更は最小限にする。
- 役割ごとの設定を混ぜない。
- Obsidian Vaultを使う場合、変更後は引き継ぎを書く。
- セキュリティに関わる変更は既存の hook と確認ルールに従う。

## 主要な対応関係

| 役割 | Claude Code 側 | Codex 側 |
|---|---|---|
| 常時指示 | `CLAUDE.md` | `AGENTS.md` |
| MCP 設定 | `.mcp.json` | `.codex/config.toml` |
| Hooks | `.claude/hooks/` | `.codex/hooks/` |
| Agents | `.claude/agents/` | `.codex/agents/` |
| Skills | `.claude/skills/` | `.codex/skills/` |
