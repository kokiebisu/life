# 食事画像分析による PFC/kcal 自動化 設計

- Date: 2026-04-24
- Status: 設計確定（実装プラン作成待ち）

## 背景

現状、外食のエントリーは `aspects/diet/daily/YYYY-MM-DD.md` と Notion meals DB の両方で kcal/PFC が `—` のまま記録される。理由はレシピがなく、手で栄養価を推定するコストが高いため。

結果として:
- ダイエット目的の栄養追跡に穴があく（外食日は合計 kcal 不明）
- フォーマットも揺れている（`外食（相手）` / `店名（外食）` / `外食（場所）`）
- 振り返り時に「何を食べたか」の情報量が薄い

スマホで撮った写真を Notion にアップロードするだけで、kcal・PFC・料理名が自動で埋まる仕組みを作る。

## ゴール

- スマホの Notion アプリで meals DB に新規ページを作って画像を貼るだけで、後から PFC/kcal が自動で埋まる
- 自炊（レシピあり）は現状の `/meal` / `notion-recipe-gen.ts` フローを維持する（二重処理しない）
- Claude Code サブスクの範囲内で完結（API キー課金なし）

## 非ゴール

- 日次 daily ファイル（`aspects/diet/daily/`）への自動反映（別タスク）
- 自炊料理の画像分析（レシピから算出済みのため不要）
- 食品成分データベースとの照合（推定値で十分）
- 1 ページに複数食分の写真が混在するケースのサポート（1 ページ = 1 食を前提）

## ユーザーフロー

1. 外食時、Notion モバイルアプリを開く
2. meals DB で新規ページを作成（タイトルは任意、空 / `外食` / 店名どれでも OK）
3. 本文に料理写真を画像ブロックとして貼付
4. 以降の操作は不要（放置）
5. Mac で `/from-notion` を実行すると、画像分析が自動で走り、ページ本文に PFC/kcal が書き込まれる

## アーキテクチャ

```
スマホ（Notion mobile）               Mac（/from-notion 実行時）
────────────────────                  ────────────────────────────
meals DB 新規ページ
  + 画像ブロック貼付
  ↓ （放置）
                                      notion-pull.ts の enrich 拡張
                                        ↓
                                      enrichMealImages()
                                        ↓
                                      meals DB を走査 → 対象検出
                                        ↓
                                      Notion から画像 URL 取得
                                      → 一時ファイルにダウンロード
                                        ↓
                                      callClaude() with Read tool
                                      （Claude Code サブスク）
                                        ↓
                                      JSON（dishName, items, kcal, PFC）
                                        ↓
                                      Notion ページ本文に書き戻し
                                      + タイトル補強（条件つき）
                                        ↓
                                      一時ファイル削除
```

### コンポーネント

#### 1. `scripts/lib/vision.ts`（新規）

- 責務: 画像 URL のリストを受け取って、1 食分の合算栄養情報 JSON を返す
- 公開 API:
  ```ts
  export interface MealVisionResult {
    dishName: string;       // 例: "豚しょうが焼き定食" / "ラーメン + 餃子"
    items: string[];        // 例: ["豚ロース 150g", "玉ねぎ 80g", "餃子 5個"]
    kcal: number;           // 合計
    protein: number;        // 合計 g
    fat: number;            // 合計 g
    carbs: number;          // 合計 g
    confidence: "high" | "medium" | "low";
    confidenceReason?: string;
    imageCount: number;     // 分析に使った画像数（ログ・デバッグ用）
  }
  export async function analyzeMealImages(imageUrls: string[]): Promise<MealVisionResult>;
  ```
- 内部処理:
  1. `imageUrls` 全てを並列 `fetch()` でダウンロード
  2. 保存先パス: `/tmp/meal-<pageId>-<timestamp>-<index>.<ext>`
     - `pageId` は Notion ページ ID（ハイフンなし）
     - `index` は 0 始まりの連番（画像の順序を保持）
     - `ext` は Content-Type ヘッダから判定（`image/jpeg → jpg`, `image/png → png`, `image/webp → webp`）
     - 1 枚でも Content-Type が取得できない / 非対応なら警告してその画像をスキップ。残り 0 枚なら全体失敗
  3. `callClaude()` にプロンプト + 全画像パス + `allowedTools: ["Read"]` を渡す
     - プロンプトで「これらは同一食事の複数枚の写真」と明示、合算の JSON を返すよう指示
  4. JSON パース、スキーマ検証（必須フィールド欠落ならリトライ対象）
  5. `try/finally` で一時ファイルを全て削除
- 上限: 1 ページあたり最大 5 枚（超過分は警告ログを出してスキップ）
- 依存: 既存の `lib/claude.ts` のみ。新規 SDK 追加なし

#### 2. `scripts/notion/notion-meal-analyze.ts`（新規）

- 責務: meals DB 走査 → 対象判定 → Vision 呼び出し → 本文更新
- CLI:
  ```bash
  bun run scripts/notion/notion-meal-analyze.ts --date YYYY-MM-DD
  bun run scripts/notion/notion-meal-analyze.ts --from YYYY-MM-DD --to YYYY-MM-DD
  bun run scripts/notion/notion-meal-analyze.ts --page-id <id>  # 個別強制実行
  bun run scripts/notion/notion-meal-analyze.ts --date YYYY-MM-DD --dry-run
  ```
- 対象判定ロジック:
  1. meals DB のページ本文に `image` ブロックが 1 つ以上ある
  2. 本文に `## 推定（画像分析）` セクションがない（冪等性マーカー）
  3. 本文に材料リスト（`- .+ \d+\s*(g|個|本|枚)` 等）がない（自炊扱いを除外）
  4. 本文に数値 kcal（`\d+\s*kcal`）が未記入
- 出力サマリ:
  ```
  対象: 3件
  - abc123: 外食 → 推定開始
  - def456: 飲み会 → 推定開始
  - ghi789: スキップ（既に分析済み）
  成功: 2件 / スキップ: 1件 / 失敗: 0件
  ```

#### 3. `notion-pull.ts` の enrich 拡張

- `enrichMealImages()` を enrich パイプラインに追加
- `--no-enrich` でスキップ可能（既存フラグに乗る）
- `--dry-run` で対象検出だけ実行し、Vision API は呼ばない
- pull 結果サマリに追加: `meal-images: 2件分析 / 1件スキップ`

## データフロー詳細

### Vision プロンプト（固定）

```
あなたは栄養士アシスタントです。指定された画像群は同一の食事を複数の角度・タイミングで撮影したものです。全画像を参考に、1 食分として合算の栄養情報を推定してください。

画像:
- {画像パス 1}
- {画像パス 2}
- ...

複数画像の扱い:
- 同じ料理が別角度で写っている場合は二重計上しない（1 品として扱う）
- 別の料理（例: 丼 + サイドサラダ）が写っている場合は両方を合算する
- 食卓全景 + 個別アップの組み合わせなら、全景で品数を確認し個別アップで材料を特定する

以下の JSON だけを返してください。説明文や Markdown コードブロックは不要です。

{
  "dishName": "料理名（日本語、複数料理なら「メイン + サイド」のように連結）",
  "items": ["主な食材 推定量", ...],
  "kcal": 合計値,
  "protein": 合計値,
  "fat": 合計値,
  "carbs": 合計値,
  "confidence": "high" | "medium" | "low",
  "confidenceReason": "低い場合の理由（オプション）"
}

推定の目安:
- 一般的な定食・丼・麺類など典型的な料理は high
- 具材が見えにくい / 複数皿が重なっている → medium
- 暗い / ピントが合っていない / 部分的に見切れている → low
- 同一料理か別料理かの判別が難しい → medium 以下
```

### Notion ページ本文への書き込みフォーマット

```markdown
[既存の画像ブロック（触らない）]

## 推定（画像分析）

**豚ロースのしょうが焼き定食**

- 豚ロース 150g
- 玉ねぎ 80g
- キャベツ 60g
- 白米 200g

**~780 kcal | P: 32g | F: 28g | C: 95g**

> 画像分析による概算（信頼度: 中）
```

- `## 推定（画像分析）` セクションを**末尾に追加**（既存本文は触らない）
- 信頼度は `high=高 / medium=中 / low=低` に変換
- `~780 kcal` の `~` は既存 daily ファイルの記法に合わせる

### タイトル補強ルール

`dishName` と既存タイトルの関係で分岐:

| 既存タイトルパターン | 判定方法 | アクション |
|----------------------|---------|-----------|
| 空文字列 | `title.trim() === ""` | `外食（<dishName>）` に更新 |
| `外食` 単独 | 完全一致 | `外食（<dishName>）` に更新 |
| `朝食` / `昼食` / `夕食` 単独 | 完全一致 | `外食（<dishName>）` に更新 |
| `外食（...）` | 先頭 2 文字が `外食` かつ `（` を含む | 変更しない |
| 上記以外 | - | 変更しない（ユーザー指定を尊重） |

## 冪等性とエラーハンドリング

- **冪等性マーカー:** 本文に `## 推定（画像分析）` セクションがあれば対象外
- **画像取得失敗（ネットワーク / 404 / 期限切れ URL）:**
  - 一部の画像だけ失敗 → 取得できた画像で分析を続行、ログに失敗画像を記録
  - 全画像失敗 → そのページはスキップ、次のページへ
- **Vision API 失敗（JSON パース失敗含む）:** リトライ 1 回 → 失敗時はスキップ
- **画像枚数:**
  - 0 枚 → 対象外（判定時点で除外）
  - 1〜5 枚 → 全て分析対象
  - 6 枚以上 → 先頭 5 枚のみ使用、残りは警告ログ
- **ファイル形式:** jpg / jpeg / png / webp のみ対応。他は警告してその画像だけスキップ
- **一時ファイル:** `try/finally` で必ず削除（成功・失敗問わず）
- **dry-run:** 対象検出と取得予定までログ表示、Vision は呼ばない

## 既存仕組みとの整合

- `/meal` スキル: 変更なし（ユーザー主導の対話フローを維持）
- `notion-add.ts --no-recipe`: 変更なし（外食・コンビニの自動スキップはそのまま）
- `notion-recipe-gen.ts`: 変更なし（自炊レシピ生成は独立）
- `notion-pull.ts` のその他同期処理: 変更なし（enrich フェーズに追加するだけ）

自炊料理で画像を貼るケースは、本文に材料リストが存在するため対象判定でスキップされる（二重処理なし）。

## テスト戦略

### ユニットテスト

- `lib/vision.ts`:
  - 単一画像の JSON パース成功ケース
  - 複数画像（2〜5 枚）の JSON パース成功ケース
  - JSON パース失敗時のリトライ
  - 一時ファイル cleanup（成功・失敗両ケース、複数ファイル）
  - 6 枚以上の画像が渡された場合に先頭 5 枚のみ使用
  - 一部画像のダウンロード失敗時に残りで続行
- `notion-meal-analyze.ts` の対象判定ロジック:
  - 画像 1 枚 + マーカーなし + 材料なし → 対象
  - 画像 3 枚 + マーカーなし + 材料なし → 対象
  - 画像あり + マーカーあり → 対象外
  - 画像あり + 材料リストあり → 対象外（自炊）
  - 画像なし → 対象外

### 統合テスト

- 固定サンプル画像（リポジトリに含めない、`/tmp` で生成）を使った end-to-end スナップショット
- モックした Claude 応答で Notion 書き戻しまで検証

### 手動検証

1. 実際の外食写真で Notion ページ作成
2. `--dry-run` で対象検出を確認
3. `--page-id` で 1 件だけ実行
4. Notion ページで書き戻し内容を確認
5. 再実行で冪等性を確認（`## 推定（画像分析）` があればスキップ）
6. `/from-notion` 経由での自動実行を確認

## ロールアウト

1. `lib/vision.ts` + ユニットテスト
2. `notion-meal-analyze.ts` + ユニットテスト + dry-run 手動確認
3. `--page-id` で本番画像 1 件に対し実行、品質確認
4. `notion-pull.ts` の enrich 拡張
5. `/from-notion` 経由で実運用、1 週間様子見
6. 問題があれば `.ai/rules/` に運用メモを追加

## 今後の拡張候補（本タスク外）

- daily ファイル（`aspects/diet/daily/`）への自動反映
- 信頼度 low の場合にユーザーへプッシュ通知 or 確認リスト化
- 店名・場所のジオタグからの補完（iOS ショートカット連携）
- `/meal <画像パス>` 形式のローカル画像分析（対話モードで使う）
- 6 枚以上の画像を分割バッチで処理して合算する機能
