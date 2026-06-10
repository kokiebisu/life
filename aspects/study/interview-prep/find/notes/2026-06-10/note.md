---
date: 2026-06-10
session: find株式会社 一次面接対策 #2（WebhookDeliveryService コードリーディング）
---

# find株式会社 一次面接対策 #2 — 2026-06-10

## 題材

`WebhookDeliveryService` — 外部エンドポイントにイベントを配信するサービス（Stripe / GitHub のような送信プラットフォーム側）

## 指摘できた観点 ✅

- `payload: any` → `unknown` + type guard
- `fetch` 直接依存 → `HttpClient` interface + コンストラクタ DI
- `console.log` のみ → モニタリング・アラート不足
- `deliveryLog` がインメモリ → スケールアウト時の stateful 問題 + DLQ
- マジックナンバー（`3`, `30000`）→ 定数化
- `dispatch()` 内で `deliver` を await していない → `.catch()` or `Promise.all`
- backoff なし → 失敗即連打（自己 DDoS）→ Exponential Backoff
- `stop()` が `clearInterval` を呼ばない → タイマーが走り続ける
- `start()` 二重呼び出しで `setInterval` が複数走る

## 惜しかった観点 🔺

- `deliveryLog` の無制限成長を「メモリリークなし」と誤認
  - 正確には「OOM リスク（unbounded growth）」。GC リークではないが本番で危険

## 見逃した観点 ❌

- **`secret` 未使用 → HMAC 署名なし**
  - `secret` は送信時に HMAC-SHA256 で payload を署名してヘッダーに付けるもの
  - 受信側が署名を検証して「本物の送信者か」を確認する
  - fintech / Stripe / GitHub では webhook に HMAC 署名が必須レベルの慣行
- **4xx と 5xx を区別しないリトライ**
  - 4xx（クライアントエラー）→ リトライしても同じ結果。`break` して終了
  - 5xx（サーバーエラー）→ 回復の可能性あり。Exponential Backoff でリトライ

## 覚えておく CS 概念

### 暗号化 vs 署名
- **暗号化**: データを読めなくする（秘密にする）
- **署名**: データが本物・改ざんなしを証明する（内容は読める）
- HMAC は署名。payload は平文で送り、signature で正当性を証明

### HMAC 署名の実装例
```typescript
const signature = crypto
  .createHmac('sha256', webhook.secret)
  .update(JSON.stringify(body))
  .digest('hex')

fetch(webhook.url, {
  headers: {
    'X-Webhook-Signature': signature,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(body)
})
```

### dispatch の await 設計判断
| 書き方 | 挙動 | 使いどころ |
|---|---|---|
| `this.deliver(...)` | fire-and-forget、例外は unhandled rejection | NG |
| `await this.deliver(...)` | 直列、遅い | 配信数が少ない場合 |
| `.catch(err => ...)` | fire-and-forget + エラーハンドリング | 非同期で投げっぱなし OK な場合 |
| `Promise.all(targets.map(...))` | 並列、全完了を待てる | fintech など全配信確認が必要な場合 |

「後続ロジックが dispatch の完了を前提にするか」が await の判断基準。

### Exponential Backoff
```typescript
await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)))
```
リトライ間隔を指数的に広げてサーバー負荷を防ぐ。API リクエストのリトライには必須。

### clearInterval パターン
```typescript
private intervalId: ReturnType<typeof setInterval> | null = null

start(): void {
  if (this.intervalId) return  // 二重起動防止
  this.intervalId = setInterval(() => this.retryFailed(), 30000)
}

stop(): void {
  if (this.intervalId) {
    clearInterval(this.intervalId)
    this.intervalId = null
  }
}
```

## コードリーディングの順番（体系化）

1. **概要を一言で言う**（何をするクラスか）
2. **良い点を探す**（public surface、encapsulation、責務の分離）
3. **型の問題**（any、unknown、型安全性）
4. **エラーハンドリング**（silent failure、console.log のみ）
5. **非同期**（await 漏れ、unhandled rejection）
6. **インフラ依存**（fetch 直依存 → DI）
7. **状態管理**（インメモリ → 永続化、スケールアウト）
8. **リトライ設計**（backoff、4xx/5xx 区別）
9. **セキュリティ**（署名、認証）
10. **ライフサイクル**（start/stop、clearInterval）
