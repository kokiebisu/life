# gym-auto 設計書

> 作成日: 2026-04-28
> 関連: `kondate-auto`（先行事例 / `2026-04-24-kondate-auto-design.md`）

## 概要

`/gym plan` を GitHub Actions で自動化する。毎朝 03:00 JST に走り、**今日〜+2日**（3日間）の Notion ジム DB にエントリが1件もなければ、今日の **07:00–08:30** にセッションを自動登録する。

ローカル md は書かない。Notion が source of truth で、`/from-notion` 等の別コマンドで後から md に同期する想定。

## トリガー条件

| 条件 | 動作 |
|------|------|
| `.gym-auto.disabled` が存在 | スキップ |
| 同期後、3日窓に **1件以上** ジム DB エントリあり | スキップ |
| 3日窓が空 + 今日 07:00–08:30 にスロット確保可 | 今日に登録 |
| 3日窓が空 + 今日のスロットが全て埋まっている（12:30 まで前進しても空きなし） | スキップ（log: `[skip] no slot today`） |

- 3日窓 = `[today, today+2]`（JST）
- `today` は `todayJST()` を使用

## ワークフロー（`.github/workflows/gym-auto.yml`）

`kondate-auto.yml` をクローンしてリネーム。

- `cron: "0 18 * * *"`（UTC）= 03:00 JST 毎日
- `workflow_dispatch` で `dry_run` input 提供
- 環境変数: `TZ=Asia/Tokyo`, `NOTION_API_KEY`, `NOTION_GYM_DB`, `CLAUDE_CODE_OAUTH_TOKEN`, `GH_TOKEN`
- ステップ:
  1. Checkout（fetch-depth: 0）
  2. Setup Bun
  3. `bun install --frozen-lockfile`
  4. `npm install -g @anthropic-ai/claude-code`
  5. git config（`gym-auto[bot]`）
  6. `.gym-auto.disabled` チェック
  7. ブランチ作成: `chore/gym-auto-$(date +%Y-%m-%d)`
  8. `bun run scripts/gym/gym-auto.ts`（or `--dry-run`）
  9. `git diff` で変更検出
  10. **変更ありの場合のみ** commit / push / `gh api ... pulls` で PR 作成 → squash merge

> **設計上、gym-auto は git に書き込まない。** 9 で変更なしと判定 → 10 はスキップされる。
> 将来 history file 等を追加する余地のために、kondate-auto と同じ has_changes 分岐は残しておく。

## メインスクリプト（`scripts/gym/gym-auto.ts`）

```
1. dry-run flag を解釈
2. .gym-auto.disabled が存在 → exit
3. sync-notion-to-md.ts を子プロセスで実行（前回 FB / 連日判定の元データ更新）
4. fetchGymRange(today, today+2) → ジム DB エントリ取得
5. existing.length > 0 → exit (skip)
6. determineTimeSlot(today)
   - 候補時刻: 07:00, 07:30, 08:00, ..., 11:00（30 分刻みで前進、終了時刻は +90 分）
   - 各候補について notion-list.ts 相当のクエリで全 DB の同日エントリを取得
   - 候補時刻と既存エントリが時間衝突しない最初のスロットを採用
   - 全候補が衝突 → exit (skip)
7. buildMenuContext()
   - prevSession: 同期済みローカル log の前日エントリ（連日ルール用）
   - lastThreeAux: 直近 3 セッションの補助種目（aux rotation 用）
   - suggestedWeights: suggest-next-menu.ts --json の出力
   - condition: aspects/daily/diary/today.md の `## コンディション` セクション（無ければ normal）
   - machines: aspects/gym/gyms/fitplace/minatomirai.md（テキストとして渡す）
   - preferences: 胸=ダンベルプレス / 脚=スクワットマシン / デッドリフト禁止
8. generateMenu(ctx) → Claude API 呼び出し（後述）→ {exercises: [...]}
9. dry-run なら ここで JSON を出力して exit
10. 冪等性再チェック: fetchGymRange を再実行、エントリが増えていたら exit
11. validate-entry.ts --date today --title "ジム" --start HH:MM --end HH:MM で重複バリデーション
12. notion-create-pages でジム DB に1ページ作成（icon: 🏋️、cover、名前: ジム、日付）
13. format-menu.ts に session + exercises を渡して本文生成 → notion-update-page で replace_content
14. cache-status.ts --clear
15. 完了ログを stdout に出力
```

### 共通: タイムゾーン
時刻リテラルは全て `+09:00` 付き ISO8601。

### エラー時のリトライ
LLM 呼び出しは 1 回のみ（kondate-auto と同様）。失敗時は exit code 非0 で workflow を fail させ、次の cron で再試行。

## メニュー生成（`scripts/gym/lib/generate-menu.ts`）

`scripts/kondate/lib/generate-menu.ts` の構造を踏襲し、Claude API を呼ぶ。

### Input: `MenuContext`
```ts
interface MenuContext {
  date: string;             // YYYY-MM-DD
  startTime: string;        // HH:MM
  endTime: string;          // HH:MM
  prevSession: PrevSession | null;  // 前日のセッション（連日判定用）
  lastThreeAux: string[];   // 直近3セッションで使った補助種目
  suggestedWeights: SuggestedExercise[];  // suggest-next-menu.ts の JSON 出力
  condition: "low" | "normal" | "high";
  machines: string;         // gyms/fitplace/minatomirai.md の中身
}

interface PrevSession {
  date: string;
  bodyParts: ("push" | "pull" | "legs" | "cardio")[];
}
```

### Output: `MenuResult`
```ts
interface MenuResult {
  exercises: Array<{
    type: "strength" | "cardio";
    name: string;
    weight?: string;     // strength: "65"
    sets?: number;
    reps?: number;
    duration?: string;   // cardio: "15分"
  }>;
  rationale: string;     // PR description / log 用の根拠
}
```

`format-menu.ts` がそのまま受け取れる構造。

### Prompt
鈴木コーチペルソナで「3〜5 種目を選定」と指示。コンテキストとして以下を渡す:

- 日付 / 時間
- 前日のセッション（あれば部位）と連日ルール:
  - 押す系の翌日 → 引く系 or cardio only
  - 引く系の翌日 → 押す系 or cardio only
- 直近3セッションの補助種目（除外リスト）
- 推奨重量テーブル（前回 + FB → 推奨）
- 当日のコンディション（low → 軽め / high → 攻め）
- 利用可能マシン
- 種目プリファレンス: ダンベルプレス（ベンチ禁止）、スクワットマシン（フリーウェイト禁止）、デッドリフト禁止
- メニュー密度ルール: 連日制約があっても **3〜5 種目組む**

出力は JSON のみ（kondate と同じパターンで `parseMenuResponse` で fence ストリップ + バリデーション）。

## 再利用するもの

| ファイル | 用途 |
|---------|------|
| `scripts/gym/sync-notion-to-md.ts` | 起動時に Notion → md 同期 |
| `scripts/gym/suggest-next-menu.ts` | 前回 FB 由来の推奨重量を JSON で取得 |
| `scripts/gym/format-menu.ts` | Notion ページ本文生成 |
| `scripts/notion/lib/notion.ts` | `getScheduleDbConfig`, `queryDbByDateCached`, `todayJST`, `parseArgs` |
| `scripts/lib/llm.ts` | Claude API 呼び出し |
| `scripts/validate-entry.ts` | 重複バリデーション |
| `scripts/notion/notion-list.ts` | スロット衝突チェック（呼び出し方は kondate-auto と揃える） |

## 新規追加するもの

| パス | 内容 |
|------|------|
| `.github/workflows/gym-auto.yml` | GitHub Actions ワークフロー |
| `scripts/gym/gym-auto.ts` | エントリポイント |
| `scripts/gym/lib/generate-menu.ts` | Claude API 呼び出し（kondate のミラー） |
| `scripts/gym/lib/empty-slot.ts` | スロット衝突判定（07:00 → 12:30 を 30 分刻み） |
| `scripts/gym/lib/empty-slot.test.ts` | TDD: スロット選択ユニットテスト |
| `scripts/gym/lib/generate-menu.test.ts` | TDD: prompt/parse ユニットテスト |
| `scripts/gym/gym-auto.test.ts`（任意） | E2E スモーク（モック Notion + LLM） |

## 例外・スキップ条件まとめ

| 状況 | 動作 |
|------|------|
| `.gym-auto.disabled` 存在 | 即 exit |
| Notion 同期失敗 | warning ログ + 続行（kondate は致命的扱いしない） |
| 3日窓に既存エントリ | exit `[skip] N entries in window` |
| 今日のスロットが全て衝突 | exit `[skip] no slot today` |
| LLM 呼び出し失敗 | exit code 1（workflow fail）|
| 冪等性再チェックで増えていた | exit `[skip] re-check: N entries (race)` |
| Notion 登録失敗 | exit code 1 |

## 動作確認手順（実装後）

1. ローカル: `bun run scripts/gym/gym-auto.ts --dry-run` で window check + LLM 出力 JSON を確認
2. ローカル: `.gym-auto.disabled` を作成して exit を確認
3. GitHub Actions: `workflow_dispatch` の `dry_run=true` で安全に1回走らせる
4. 翌朝 cron 自動実行 → 登録された Notion ページを確認

## 開示制限・セキュリティ

- secrets は kondate-auto と同じセット + `NOTION_GYM_DB`
- LLM プロンプトに個人情報（住所等）は含めない（マシン一覧・FB のみ）
- ジム DB の data_source_id は repo 内に既出のため新規漏洩なし

## オープン項目（実装時に決める）

- スロット候補の上限（07:00–12:30 で良いか、もう少し早朝/遅めまで広げるか）— 暫定 12:30
- LLM 失敗時のフォールバック（heuristic で最低限のメニューを組むか）— 暫定: 失敗ならスキップ（次の cron に任せる）
