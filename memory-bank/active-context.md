# Active Context

> 現在進行中の作業・注力していることを記録する

## 現在のフォーカス

- 2026-02-13 最終出社。2/14以降 sumitsugi 本業化
- 失業保険の手続きと再就職手当の活用を検討中
- Notion を中央データハブとして統合中（Tasks / Journal / Articles）

## 最近の変更

- 2026-02-12: 記事自動補充の GitHub Action 追加
  - notion-articles.ts に replenish コマンド追加（HN + Zenn から自動補充）
  - 日次 cron（05:00 JST）で未読10件未満なら自動補充
- 2026-02-11: kawa（Expo アプリ）→ Notion 統合に切替。kawa 削除
  - Articles DB を Notion で管理（Journal DB は 2026-02-13 に廃止）
  - notion-setup.ts / notion-articles.ts 作成（notion-journal.ts は削除済み）
  - 既存スクリプト（notion-add.ts / notion-list.ts）を共通ライブラリにリファクタ
- 2026-02-10: memory bank を導入

## 次にやること

- ハローワークで手続き（離職票届き次第）
- デイリープラン生成（松本あかりが日記+カレンダーを統合）
