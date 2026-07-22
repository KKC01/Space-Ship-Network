---
name: ui-check
description: Use when verifying that the original user instruction is visually achieved in the browser — after tester runs, to catch gaps between what was tested and what was originally requested.
---

# ui-check

## Overview

`tester` が動作確認した後でも、ユーザーの最初の指示と実画面が一致しているかを目視で照合する。
`tester` の代替ではなく、「指示の達成確認」に特化した補完スキル。

## When to Use

- `tester` が実行済みで、完了報告の前に使う
- UI 変更後、実装の完了を主張する前に必ず使う
- `tester` の確認範囲が広すぎて最初の指示への言及が薄い場合

## 実行手順

### 1. 最初の指示を特定する

会話の最初のユーザーメッセージから「何をしてほしかったか」を箇条書きで抽出する。

### 2. tester の報告を確認する（あれば）

tester が何を確認済みか把握し、最初の指示との照合で漏れを予測する。

### 3. instruction-verifier エージェントを呼び出す

以下を含むプロンプトで Agent ツール（subagent_type: instruction-verifier）を呼び出す：

- 最初の指示から抽出した照合リスト（箇条書き）
- dev server URL（通常 `http://localhost:3000/Space-Ship-Network/`）
- 「各項目が画面上で達成されているか、スクショを目視で確認すること」
- 「コードを読んで推測しない。スクショの目視のみを根拠とすること」

### 4. 結果を報告する

instruction-verifier の結果を受けて、最初の指示の各要件について報告する：

- ✅ 達成（スクショで確認済み）
- ❌ 未達成（スクショで確認済み）
- ⚠️ 未確認（スクショでは判断不可）

## しないこと

- `tester` と同じ Playwright 操作の繰り返し（機能テスト・エッジケース）
- コードを読んで「実装されているはず」と推測すること
- スクショなしで完了を報告すること
- tester の報告を鵜呑みにして instruction-verifier を省略すること
