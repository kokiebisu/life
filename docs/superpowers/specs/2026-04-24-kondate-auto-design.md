# /kondate 自動化設計

> 作成日: 2026-04-24
> ステータス: 設計承認待ち

## 背景

現状の `/kondate` はユーザーが呼び出し、Step 1（たんぱく質選択）・Step 3（承認）・Step 4d（買い出し日時）で3回のユーザー入力を必要とする対話型スキル。

ユーザーは基本「作り置き中心の食生活 + Notion カレンダーで手動微調整」というパターンで運用しており、毎回の対話を省略したい。「未来の数日分に meals エントリーが不足していたら自動で埋めてほしい」というニーズ。

## ゴール

GitHub Actions cron で毎朝チェックし、今日から3日後までの Notion meals DB エントリー数が 2 件以下なら、自動で作り置きメニュー1品を生成して登録する。

## 非ゴール（今回のスコープ外）

- 買い出しリスト自動生成（protein 在庫チェック含む）
- 朝食・昼食の区分に忠実な埋め方
- エスニック料理
- 外食・飲み会日の自動検知（ユーザーがカレンダーで手動調整）
- 対話型の `/kondate` 廃止（共存する）

---

## 1. 起動・トリガー

- **仕組み**: GitHub Actions の `schedule` イベント（cron）
- **実行時刻**: 毎日 JST 03:00（UTC 18:00 前日）
- **Workflow ファイル**: `.github/workflows/kondate-auto.yml`
- **Runner**: `ubuntu-latest`
- **ランタイム**: Node.js 20 + Bun
- **必要な secrets**:
  - `ANTHROPIC_API_KEY` — Claude API 呼び出し用
  - `NOTION_API_KEY` — Notion API 用（リポジトリの既存 env var と同名）
  - GitHub Actions の `GITHUB_TOKEN` — PR 作成・merge 用
  - Notion DB ID（`NOTION_MEALS_DB` 等）も secrets に追加

## 2. 判定ロジック

**入口判定:**

1. Notion meals DB を「今日（JST 基準）から3日後まで」で query
2. 件数 **3 件以上 → スキップ**（バッファ確保のため 2 件以下を「不足」と扱う）
3. 件数 ≤ 2 → 生成フェーズへ進む

**無効化スイッチ:**

- リポジトリ直下に `.kondate-auto.disabled` ファイルが存在したら即終了（旅行・断食・体調不良用）
- 復活は `rm .kondate-auto.disabled` をコミット

**重複実行防止（idempotency）:**

- 登録直前にもう一度 meals DB を check し、別ジョブが先に登録していないか確認
- 3 件以上になっていたらスキップ

## 3. メニュー生成（Claude API 1 回呼び出し）

Anthropic SDK を使い `claude-opus-4-7` で 1 回呼び出す。以下を context として渡す:

- **メニュー履歴** `aspects/diet/kondate-history.md`（過去の自動生成メニュー一覧）
- **過去14日の meals エントリー** — `notion-list.ts --db meals --days -14` で取得
- **fridge.md** — 在庫（参考情報、在庫ゼロでも生成は続行）
- **nutrition-targets.md** — 週目標と今週の実績
- **profile/health.md** — NG 食材（トマト・マヨネーズ・ケチャップ・マスタード）
- **空きスロット情報** — 後述 §5 で算出した登録先スロット

**プロンプト要件:**

- 「**美味しさ > 栄養バランス > 在庫消化**」の優先順位を明示
- 「作り置きに向いていて1週間で飽きにくい」レシピを優先
- レシピ取得元は **クラシル / 白ごはん.com / Nadia / DELISH KITCHEN** の 4 サイトから評価の高いものを 1 つ選ぶ
- 出力は JSON: `{ menu_name, cuisine, recipe_url, ingredients[], steps[], estimated_pfc{p,f,c,kcal} }`
- dietitian 視点（栄養バランス）と chef 視点（美味しさ）を同じプロンプト内で両立。別 agent は噛ませない

**プロンプトキャッシング:**

- システムプロンプト（スキル定義相当）と静的 context（health.md, nutrition-targets.md）は `cache_control: {type: "ephemeral"}` で明示的にキャッシュ
- 動的 context（過去 14 日の meals、履歴）はキャッシュしない

## 4. 単調化防止ルール（プロンプト内で強制）

- **過去 7 日の protein**（鮭 / 鶏 / 豚 / 魚 / 卵 / 豆腐）と**調理法**（焼き / 煮 / 蒸し / 炒め / 揚げ）は除外
- **菜系は 和 / 洋 / 中 のみ**（エスニック禁止）
- **過去の履歴ファイル**に同名メニューがあれば除外（重複ゼロ目標）
- 履歴が飽和して候補が尽きた場合は、**最古の使用メニュー**を再利用可とする fallback

## 5. 登録ロジック

**空きスロットの算出:**

- 3 日 × 3 食枠（朝・昼・晩）= 最大 **9 スロット** を時系列に並べる
  - day1 朝（08:00-09:00）→ day1 昼（12:00-13:00）→ day1 晩（19:00-20:00）→ day2 朝 → ...
- **スロット「占有」の判定**: 既存 meals エントリーの start 時刻が以下の時間帯に入っていれば、そのスロットは占有済み扱い
  - 朝スロット: 05:00–11:00
  - 昼スロット: 11:00–16:00
  - 晩スロット: 16:00–23:59
- 占有済みスロットを除外した残りの **先頭 3 つ** を登録対象とする（servings=3 分）
- 空きスロットが 3 未満の場合はあるだけ埋める（例: 空き 2 なら servings=2）

**登録方法:**

- 各スロットに対し `bun run scripts/notion/notion-add.ts --db meals --title "メニュー名" --date YYYY-MM-DD --start HH:MM --end HH:MM --servings 3` を実行
- `notion-add.ts` 内部で重複チェック・レシピ自動生成が走る
- daily ファイル `aspects/diet/daily/YYYY-MM-DD.md` を該当日分だけ作成・更新
  - 該当スロットにメニュー・材料（スケール後）・PFC を記載
  - 既存のセクションは上書きしない

**履歴ファイル更新:**

- `aspects/diet/kondate-history.md` の先頭（新しい日付順）に追記:

```markdown
# 自動生成メニュー履歴

## 2026-04-24
- [豚こま生姜焼き](https://www.notion.so/xxxxxxxx)（和）

## 2026-04-21
- [鶏むねハム](https://www.notion.so/yyyyyyyy)（和）
```

- リンクは **Notion ページ URL**（`notion-add.ts` の結果から取得）
- 菜系タグ（和/洋/中）を括弧書き

## 6. エラー処理

| ケース | 挙動 |
|--------|------|
| Notion API エラー | 指数バックオフで 3 回リトライ、失敗なら GH Actions step 失敗 |
| Claude API エラー | 3 回リトライ、失敗なら GH Actions step 失敗 |
| JSON パース失敗 | 1 回再問い合わせ、ダメなら失敗 |
| 重複実行検知 | 成功扱いで早期終了（エラーにしない） |
| `.kondate-auto.disabled` 存在 | 成功扱いで早期終了 |

失敗時は GitHub Actions の標準通知に任せる（Slack 連携等は今回なし）。

## 7. PR ワークフロー（main 直接 push 禁止）

`.ai/rules/git-workflow.md` に従い、bot も PR 経由で merge する:

1. 一時ブランチ作成: `chore/kondate-auto-YYYY-MM-DD`
2. 生成した daily ファイル + 履歴ファイルを commit
3. `gh pr create` で PR 作成
   - title: `chore(kondate-auto): auto-generate meals for MM/DD..MM/DD`
   - body: 生成メニュー名・対象日・登録スロット・選定根拠（「過去7日 protein: 鶏・鮭 → 今回は豚」等）
4. `gh pr merge --merge --delete-branch` で自動マージ
5. コミットメッセージ末尾に `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`

**認証:**

- GitHub Actions の `GITHUB_TOKEN` で PR 作成・マージ可能（リポジトリ設定で Actions に write 権限付与）
- Branch protection を bypass する必要がある場合は PAT を secret として追加

## 8. 実装構成

**新規ファイル:**

```
.github/workflows/kondate-auto.yml       # GitHub Actions workflow
scripts/kondate/kondate-auto.ts           # メインロジック（bun script）
scripts/kondate/lib/empty-slots.ts        # 空きスロット算出
scripts/kondate/lib/menu-history.ts       # kondate-history.md read/write
scripts/kondate/lib/generate-menu.ts      # Claude API 呼び出し
aspects/diet/kondate-history.md           # 生成履歴（初期は空）
```

**既存流用:**

- `scripts/notion/notion-add.ts` — meals エントリー登録
- `scripts/notion/notion-list.ts` — meals DB query
- `scripts/lib/notion.ts` — Notion API クライアント
- `scripts/create-pr.ts` — PR 作成フォールバック

## 9. テスト観点（実装時）

- ✅ meals 0 件 → 生成実行
- ✅ meals 2 件 → 生成実行
- ✅ meals 3 件 → スキップ
- ✅ `.kondate-auto.disabled` 存在 → スキップ
- ✅ 履歴に同名メニューあり → 別メニューを選ぶ
- ✅ エスニック指定メニュー → プロンプトで除外されるか
- ✅ PR 作成 → auto-merge 成功
- ✅ 空きスロット算出: 一部埋まっている場合も正しく3スロット選ぶ
- ✅ dry-run モード（Notion 書き込みなし・ログのみ）の提供

## 10. ロールアウト手順

1. `scripts/kondate/kondate-auto.ts` を実装し、ローカルで `--dry-run` 実行
2. Notion テスト DB で試し登録（本番 meals DB は別 env var で分離）
3. GitHub Actions workflow を作成、初回は `workflow_dispatch`（手動トリガー）で検証
4. 問題なければ cron schedule を有効化
5. 1 週間稼働を観察、単調化や不味さがあればプロンプト調整
