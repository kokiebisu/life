# Decisions Log

> 設計判断とその理由を記録する。「なぜそうしたか」を未来の自分に伝える。

## フォーマット

```
### [YYYY-MM-DD] タイトル

**決定:** 何を決めたか
**理由:** なぜそう決めたか
**代替案:** 検討した他の選択肢
**影響:** この決定が影響する範囲
```

---

### [2026-02-12] Notion 4-DB リファクタ

**決定:** 単一の NOTION_TASKS_DB を4つの DB（習慣・イベント・ギター・食事）に分離。各スクリプトを対応させ、イベントファイルを planning/events/ に統合
**理由:** Notion 側で DB が分離済み。スクリプトが単一 DB に依存していたため、プロパティ名の違い（Name vs 名前 vs 件名、Due date vs 日付 vs 実施日）を吸収する抽象化が必要だった
**代替案:** 単一 DB のまま運用 / DB ごとに個別スクリプト作成
**影響:** scripts/lib/notion.ts に DbConfig 抽象化追加。全スクリプト（list/add/sync/daily-plan/backfill-icons）を4-DB対応に。aspects/general/ 削除、planning/events/ 新設。ENV: NOTION_EVENTS_DB, NOTION_GUITAR_DB, NOTION_MEALS_DB 追加

---

### [2026-02-11] kawa → Notion 統合

**決定:** kawa（Expo ライフジャーナルアプリ）を廃止し、Journal / Articles 機能を Notion DB + CLI スクリプトに統合
**理由:** kawa は3画面ともプレースホルダー状態で実機能なし。Notion は既に稼働中でタスク管理が定着している。別アプリを作るよりNotionに統合した方が運用が楽で、開発リソースを sumitsugi に集中できる
**代替案:** kawa を完成させる / 別の日記アプリを使う
**影響:** aspects/kawa 削除。Journal DB と Articles DB が Notion に追加。scripts/ に新スクリプト追加

---

### [2026-02-10] memory bank の導入

**決定:** リポジトリ内に `memory-bank/` ディレクトリを作成し、プロジェクト文脈を構造化して保存する
**理由:** Claude Code の auto memory はローカルのみ。CLAUDE.md は静的な指示書。セッション間で蓄積される文脈をGit管理したい
**代替案:** CLAUDE.md に全て書く / auto memory だけに頼る
**影響:** 全 aspect に横断的に活用される
