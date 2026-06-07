---
notion_id: 376ce17f-7b98-8118-824d-d15c880764e0
date: 2026-06-05
start: 21:35
end: 22:35
category: interview-prep
company: find株式会社
session: 一次面接対策 #1（TypeScript・シニア）
---

# find株式会社 一次面接対策 #1 — 2026-06-05

## 🎯 今日の目標・疑問

一次面接（90 分・1:2、複数名体制）の想定:

- **技術試験＋面接（ハードスキル）**
  - 事前に find が用意したソースコードを読んで discussion
  - 一般的な CS への理解度
- 言語: **TypeScript** / ロール: **シニアエンジニア**

→ 模擬：コードリーディング題材を読み、レビュー・改善・CS 概念へ深掘り。詰まったところを残す。

## 📝 ノート

### 課題1: BatchProcessor コードリーディング

**コードの概要:** ユーザーイベントをバッファして、サイズ or 時間閾値で外部 API に POST するクラス。

**ケンが指摘できた観点 ✅**
- `flush()` の SRP 違反（HTTP 送信 / リトライ制御 / バッファ管理が混在）
- 全リトライ失敗時に `console.error` だけで終わる → silent failure
- HTTP クライアントを constructor 注入して DI すべき（テスタビリティ）
- `withRetries(fn)` を高階関数化してリトライロジックを分離
- `payload: any` が危険 → `z.unknown()` + Zod schema で型安全に
- `push()` が async の `flush()` を await しない問題の特定
- DLQ は専用キュー（SQS/Redis）が理想。メモリ・ディスクのトレードオフも説明できた
- `push()` を async にすると API contract を破壊するトレードオフを理解
- `.catch(err => this.onError?.(err))` パターンで push を sync に保てることを理解

**指摘しきれなかった観点 ❌**
- `this.options.maxRetries = ...` が呼び出し元のオブジェクトを **ミューテーション**する（副作用）
  - 正しい理解: `{ maxRetries: 3, ...options }` でスプレッドして新オブジェクトに
  - ケンの答え: 「マジックナンバー問題」と誤認→ ミューテーション問題が主
- `stop()` が残バッファを flush しない → シャットダウン時のデータロス
- リトライに **backoff なし** → サーバーを即座に連打（Exponential Backoff が定石）
- HTTP 4xx と 5xx を区別せずリトライ → 4xx はリトライ不要（client error）
- `JSON.stringify` が throw する可能性（circular reference、BigInt 等）
- `Content-Type: application/json` ヘッダーが未設定

**理解が浅かった概念**
- good point（b）が「読みやすい」止まり → 「public surface が 3 つに絞られてる」「状態が最小化されてる」と具体化すべき
- DLQ の監視・永続化・overflow 時の戦略まで踏み込めていなかった

### Zod / 型安全

- `z.infer<typeof Schema>` で type 定義と schema の 1 ソース化は理解 ✅
- `payload: z.unknown()` がどう validates されるか最初は不明 → 説明後に理解
  - `parse()` は他フィールド（userId/type/timestamp）を検証。`unknown` は型強制のみ
  - `any` との差: TypeScript が使用前の型ナローイングを強制する

## 🔑 キーワード

- **SRP** (Single Responsibility Principle) — flush() の責務分離
- **DI / 依存性逆転** — HttpClient を constructor 注入
- **unhandled Promise rejection** — async flush を void push で無視
- **fire-and-forget** — push() を同期 API に保つ設計判断
- **onError callback** — エラーハンドリングを constructor で集約
- **Object mutation** — `this.options.x = ...` が呼び出し元を書き換える副作用
- **Exponential Backoff** — リトライ間隔を指数的に広げてサーバー負荷を防ぐ
- **Dead Letter Queue (DLQ)** — 失敗イベントを退避するキュー
- **z.infer** — Zod schema から TypeScript 型を自動導出
- **z.unknown()** — 型制約なし、でも TypeScript がナローイングを強制

## 💡 まとめ

（セッション終了時に記入）

## ❓ 自分への質問（コーネル式キュー）

（セッション終了時に生成）
