# /analyze — ルール→コード リファクタリング分析スキル

## 概要

`.ai/rules/`・`CLAUDE.md`・`skills/` 内の自然言語ルールを分析し、TypeScript コードに置き換えた方が一貫性のある箇所を検出・レポート・実装するスキル。

## 動機

- 自然言語のルールは Claude が守れないことがある（特に「〜の前に必ず〜しろ」系）
- コードで強制すれば 100% 一貫する
- 既に `validate-entry.ts`（重複チェック）や `normalizeTitle`（タイトル正規化）で成功している前例がある

## アーキテクチャ

```
/analyze 実行
    │
    ▼
scripts/analyze-rules.ts（構造化抽出）
    │  入力: .ai/rules/*.md, CLAUDE.md, skills/**/*.md
    │  出力: JSON（ルール一覧 + メタデータ）
    │
    ▼
Claude（スキル側）が JSON を受け取り:
    │  1. 各ルールを「コード化可能か」判定
    │  2. 違反履歴の推定（/learn 由来かどうか）
    │  3. 優先度スコアリング（高/中/低）
    │  4. レポート生成 → docs/analysis/YYYY-MM-DD-analyze.md
    │
    ▼
ユーザーに提示（レポート表示）
    │  「どれを実装しますか？」
    │
    ▼
選ばれた項目を実装 → PR
```

## コンポーネント

### 1. `scripts/analyze-rules.ts` — ルール構造化抽出スクリプト

#### 入力

- `.ai/rules/*.md`
- `CLAUDE.md`
- `skills/*/SKILL.md`（スキル内のプロンプト指示）

#### ルール分解ロジック

各 Markdown ファイルを「個別ルール」に分解する:

- `##` 見出し単位で分割（1 見出し = 1 ルール候補）
- 見出しがない場合はリスト項目（`-` / `1.`）単位
- 「厳守」マーク付きのルールにはフラグを立てる

#### 各ルールに付与するメタデータ

```typescript
interface ExtractedRule {
  id: string;              // ファイル名 + 見出しから生成
  source: string;          // ファイルパス
  heading: string;         // 見出しテキスト
  body: string;            // ルール本文
  isStrict: boolean;       // 「厳守」マーク付きか
  hasCodeBlock: boolean;   // コード例を含むか（手順が明確な兆候）
  hasConditional: boolean; // 「〜の場合」「〜の前に」等の条件分岐パターン
  relatedScripts: string[]; // 本文中で参照されているスクリプトパス
  patternType: RulePattern; // 下記参照
}

type RulePattern =
  | "pre-check"       // 「〜の前に〜を実行」
  | "post-check"      // 「〜の後に〜を確認」
  | "format-enforce"  // 「〜を付けろ」「〜形式にしろ」
  | "fallback"        // 「〜が失敗したら〜する」
  | "prohibition"     // 「〜するな」「〜禁止」
  | "judgment"        // 判断が必要（コード化困難）
  | "unknown"
```

#### パターン検出（正規表現ベース）

| パターン | 検出キーワード | コード化可能性 |
|---------|--------------|-------------|
| pre-check | `前に必ず`, `する前に`, `登録する前` | 高 |
| post-check | `した後`, `の後に必ず`, `確認する` | 高 |
| format-enforce | `を付ける`, `形式`, `フォーマット`, `+09:00` | 高 |
| fallback | `失敗した場合`, `エラーが出たら` | 高 |
| prohibition | `禁止`, `しない`, `するな`, `使わない` | 中 |
| judgment | `判断`, `文脈`, `適切に`, `考慮` | 低 |

#### 既存スクリプト対応検出

ルール本文中の `scripts/` パス参照と、`scripts/` 配下の実ファイルを突合。「ルールが参照するスクリプトが既にある = 部分的にコード化済み」として検出。

#### 出力

```bash
bun run scripts/analyze-rules.ts
# → stdout に JSON 出力（ExtractedRule[] 形式）
```

### 2. `/analyze` スキル — オーケストレーション

#### フロー

1. **スクリプト実行**: `bun run scripts/analyze-rules.ts` → JSON 取得
2. **LLM 判断**: 各ルールについて
   - patternType が high（pre-check / post-check / format-enforce / fallback）→ コード化候補
   - prohibition → 既存スクリプトに guard を追加できるか検討
   - judgment → スキップ（プロンプトに残す）
3. **違反履歴の推定**:
   - `git blame` でルールの追加日・コミットメッセージを確認（`/learn` 由来かどうか）
   - `memory/` 内の `feedback_*.md` と関連するルールを紐付け
   - `/learn` 由来 = 過去に違反があった証拠 → 優先度加点
4. **優先度スコアリング**:
   - コード化可能性: high=3, mid=2, low=0
   - 違反履歴あり: +2
   - 厳守マーク: +1
   - コード例あり（手順が明確）: +1
   - スコア順にソート
5. **レポート生成**: `docs/analysis/YYYY-MM-DD-analyze.md` に保存
6. **ユーザーに提示**: 高優先度候補を表示し「どれを実装しますか？（番号で選択）」
7. **実装**: 選ばれた候補について
   - 既存スクリプトに guard を追加 or 新スクリプト作成
   - 元のルールファイルから該当記述を「コード化済み」に書き換え
   - PR 作成

#### レポートフォーマット

```markdown
# Rules Analysis Report - YYYY-MM-DD

## Summary
- 分析対象: N ファイル, M ルール
- コード化候補: X 件（高: A, 中: B）
- スキップ: Y 件（判断系/既にコード化済み）

## 高優先度

### 1. [source] ルール名 (スコア: N)
- **現状**: ルール原文の要約
- **提案**: 具体的なコード化方法
- **違反履歴**: あり/なし
- **想定実装**: 変更対象ファイルと概要

## 中優先度
（同様のフォーマット）

## スキップ
- [source] ルール名 — 理由
```

## エラーハンドリング

### スクリプト側
- ファイル読み込み失敗: 個別ファイルのエラーはスキップして残りを処理。stderr に警告
- パターン未検出: `unknown` に分類。LLM 判断フェーズで再評価

### スキル側
- JSON パース失敗: スクリプトの exit code が 0 以外ならエラー表示して終了
- 候補 0 件: 「現時点でコード化候補はありません」と報告して終了
- 実装時の競合: 既存スクリプトの変更が大きい場合、ユーザーに変更箇所を見せて承認

## やらないこと

- ルールの自動削除（必ず「コード化済み」マークに書き換える or ユーザー承認後に削除）
- skills/ 内のスキル自体の書き換え（レポートで提案のみ、実装は手動）
- scripts/ 自体のリファクタリング検出（スコープ外）
