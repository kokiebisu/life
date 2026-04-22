# レシピのN食分対応

## 概要

`/kondate` で作成される Notion 食事ページのレシピを、実際に作る食数分の分量で生成する。現状は常に1人前に正規化されるため、3食分の作り置きでも1人前の分量しか書かれない。作り置き前提の運用に合わせ、レシピ生成時点でN食分の分量・手順を出力する。

## 変更対象

### 1. `scripts/notion/notion-recipe-gen.ts`

**CLI引数追加:**
- `--servings N`（デフォルト: 1、整数、1以上）

**SYSTEM_PROMPT の動的変更:**
- `servings === 1` → 現行通り「材料は1人前に換算」
- `servings >= 2` → 「材料は{N}食分で記載してください。手順内の分量（水○ml、醤油大さじ○等）も{N}食分に合わせてください」

**RecipeData 型の拡張:**
```typescript
interface RecipeData {
  // ...既存フィールド
  servings: number; // 追加
}
```

**Notion ブロック生成（`buildNotionBlocks`）の変更:**
- ヘッダー callout に食数を表示（servings >= 2 の場合のみ）:
  - 現行: `📋 クラシル | 調理時間 20分`
  - 変更後: `📋 クラシル | 🍽️ 3食分 | 調理時間 20分`
- 材料リストの各アイテムは Claude API が N食分で返すのでそのまま表示

**parseArgs での受け取り:**
- 既存の `parseArgs` ユーティリティを使って `--servings` を取得
- 未指定時はデフォルト 1

### 2. `scripts/notion/notion-add.ts`

**CLI引数追加:**
- `--servings N`（meals DB の場合のみ有効、他の DB では無視）

**runRecipeGen の変更:**
```typescript
// Before
async function runRecipeGen(pageId: string): Promise<void>

// After
async function runRecipeGen(pageId: string, servings?: number): Promise<void>
```

- spawn コマンドに `--servings N` を追加（N >= 2 の場合のみ）
- servings 未指定 or 1 の場合は従来と同じ引数で呼ぶ（後方互換）

### 3. `skills/kondate/SKILL.md`

**Step 4a の変更:**
- `notion-add.ts` 呼び出し時に `--servings` を追加する指示を記載
- 食数はパック基準表（Step 1 で決定済み）から自動でセットする

変更前:
```bash
bun run scripts/notion-add.ts --db meals --title "メニュー名" --date YYYY-MM-DD --start HH:MM --end HH:MM
```

変更後:
```bash
bun run scripts/notion-add.ts --db meals --title "メニュー名" --date YYYY-MM-DD --start HH:MM --end HH:MM --servings N
```

- N = パック基準表で決定した食数（例: 鮭3切れパック → 3）
- 1食分の場合でも明示的に `--servings 1` を渡してよい（デフォルトと同じ）

## 影響範囲

| 機能 | 影響 |
|------|------|
| `/kondate` | `--servings` を渡すようになる（主要変更） |
| `/meal`（食事記録） | 影響なし。`--servings` を渡さなければ従来通り1人前 |
| `notion-recipe-gen.ts` 単体実行 | デフォルト1人前で後方互換 |
| 既存 Notion ページ | 変更なし |
| daily ファイル | 変更なし（既にスケール後の分量を記載するルール） |

## 後方互換性

- `--servings` はオプショナル。未指定時は 1（現行動作と同一）
- 既存の呼び出し元（`notion-add.ts` 内部の `runRecipeGen`）はデフォルト値で動作
- Notion ページのフォーマットは servings=1 のとき変化なし
