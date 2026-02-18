# Life

GitHub を使った人生管理リポジトリ

> 日記を読んで、チームが理解して、明日のタスクが進化する。
> 静的なチェックリストではなく、自分と一緒に成長する生きたシステム。

## 構造

```
planning/    全体管理（イベント・デイリープラン・目標・ロードマップ）
aspects/     生活の各側面（チーム対応あり）
projects/    個人プロジェクト
profile/     プロフィール情報
scripts/     Notion 連携スクリプト
```

## アスペクト（生活の側面）

`aspects/` 配下に生活の各側面を管理するチームがいます。

| アスペクト | 説明 | チーム | コマンド |
|-----------|------|--------|----------|
| [ダイエット](aspects/diet/) | 減量・健康管理 | 6人 | `/ask:diet` |
| [ギター](aspects/guitar/) | ギター練習 | 3人 | - |
| [投資](aspects/investment/) | 投資判断 | 8人 | - |
| [学習](aspects/study/) | 起業・法律・技術 | 9人 | - |
| [就職活動](aspects/job/) | 就職・転職活動 | 6人 | `/ask:job:search` |
| [福岡](aspects/fukuoka/) | 福岡移住検討 | 1人 | - |
| [読書](aspects/reading/) | 読書記録 | 1人 | - |
| [ルーティン](aspects/routine/) | 習慣管理 | - | - |
| [教会](aspects/church/) | 教会関連 | - | - |

## プロジェクト

| プロジェクト | 説明 |
|-------------|------|
| [sumitsugi](projects/sumitsugi/) | 個人プロジェクト（本業） |

## Claude Code コマンド

| コマンド | 説明 |
|----------|------|
| `/ask:diet` | ダイエットチームに相談 |
| `/ask:job:search` | 就職活動チームに相談 |
| `/goal` | 壁打ちして目標を追加 |
| `/event` | イベント登録 |
| `/calendar` | Notion カレンダー操作 |
| `/pr` | 変更をグループ化してPR作成 |
| `/from:notion` | Notion からデータ同期 |
| `/from:sumitsugi` | sumitsugi ↔ LIFE タスク同期 |
| `/tidy` | 指示ファイルの整理・重複削減 |
| `/cache` | キャッシュ管理 |

## タスク・スケジュール管理

- **Notion** でタスク・イベント・習慣・食事・ギター練習を一元管理
- **Notion Calendar** で閲覧（Google Calendar と双方向同期）
- マークダウンファイルで日記や振り返りを記録

## 参考
- [life repo のススメ](https://zenn.dev/hand_dot/articles/85c9640b7dcc66)
- [2025年版 life repo](https://qiita.com/e99h2121/items/45c62307565458964b94)
