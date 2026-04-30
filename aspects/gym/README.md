# gym

ジムセッションの記録と次回プランの自動生成。Notion ジム DB が source of truth で、ローカル `logs/` はそのミラー。

## Overview

`/gym log` で当日の種目・重量・回数・フィードバック（`余裕` / `まあまあ` / `きつい`）を記録すると、Notion ジム DB に同期される。次回プランは `/gym plan` が前回フィードバックと直近 3 セッションを読んで自動生成する。`余裕` なら +5kg、`きつい` なら -5kg。

## Examples

> 「ジム終わった、ベンチ 70kg×8」

`/gym log` が種目をパース → Notion ジム DB に書き込み → `logs/YYYY-MM-DD.md` を生成。

> 「次のジムプラン」

`/gym plan` が直近のログと当日コンディション（`low` / `normal` / `high`）からメニューを組み立てる。補助種目は直近 3 セッションと重ならないようローテーションする。

## What's here

```
logs/YYYY-MM-DD.md           セッション実績ログ（Notion ミラー）
gyms/<chain>/<location>.md   ジム別マシン一覧・設備情報
profile.md                   会員情報・個人目標
```

## Related

- Notion: ジム DB
- Skills: `/gym log` `/gym plan`
- Top-level: [../../README.md](../../README.md)
