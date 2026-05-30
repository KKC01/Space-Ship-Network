#!/usr/bin/env node
// SessionStart hook: Obsidian の引き継ぎ・ミス記録を毎セッション必ずコンテキストへ注入する。
// Claude の遵守可否に依存せず強制するための仕組み（CLAUDE.md 必須手順の自動化）。
const fs = require("fs");

const read = (p) => {
  try {
    return fs.readFileSync(p, "utf8");
  } catch (e) {
    // ファイル欠損（Obsidian未マウント等）でもhookを失敗させない
    return "(読み込み不可: " + p + ")";
  }
};

const handoff = read("/mnt/obsidian/_handoff/current-session.md");
const mistakes = read("/mnt/obsidian/Knowledge/mistakes.md");

const ctx =
  "# 【最優先・必読】前回セッション引き継ぎ (current-session.md)\n\n" +
  handoff +
  "\n\n---\n\n# 【最優先・必読】ミス記録 (mistakes.md)\n\n" +
  mistakes;

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: ctx,
    },
  })
);
