---
type: interview-prep
date: 2026-04-30
category: senior-coding
duration_min: TBD
---

# シニアコーディング面接 5観点ドリル

## セッションの目的

シニアエンジニア技術面接で評価される **5観点** を「型」として身に付ける:

1. **API 設計** — signature を呼び出し側体験から逆算する
2. **トレードオフ** — 複数案+選定理由+不採用理由+選んだ案の欠点
3. **本番考慮** — timeout / retry / context / observability
4. **並行性** — thread safe / race / lock 粒度
5. **拡張性** — v2 想定で interface を切る

題材: **決済 SaaS の Rate Limiter** （Go 実装）

---

## ドリル1 — API 設計 ⏱️ 8分

### 出題

`Allow` メソッドの signature を切る。

### Ken の答え（最終形）

```go
package ratelimit

type Decision struct {
    Allow bool          // ← Allowed が望ましい（Go 慣習: 過去分詞）
    Limit int
    Remaining int
    RetryAfter time.Duration
}

type RateLimiter interface {
    Allow(ctx context.Context, key string) (Decision, error)
}
```

### 評価

| 観点 | 結果 |
|------|------|
| ctx を入れたか | ✅ 即答 |
| key を抽象化したか（userID → key） | ✅ |
| Decision struct にしたか | ✅ |
| 命名 (Allowed) | ⚠️ Allow のまま |
| build green | ⚠️ import 漏れ |

**スコア: ◯ ミッドレンジ** （ヒントを聞いて修正できる段階）

### 持ち帰り

- 状態フィールドは過去分詞（`Allowed`, `Done`, `Closed`）
- メソッドは命令形（`Allow()`, `Close()`）
- 書いたら `import` の整合確認をクセに
- `n int`（複数トークン消費）は YAGNI で消す判断もOK。標準 `golang.org/x/time/rate` も `AllowN` を別メソッドにしている

### 決め台詞

> 「signature はこう切りました。理由は4つ。①key を string にしたのは customer_id でも API key でも IP でも使い回せるように。②戻り値を Decision struct にしたのは X-RateLimit-Remaining や Retry-After ヘッダにそのまま流したいから。③ctx は将来 Redis backend にしたとき deadline / cancel を伝えたいから。④`n int` は今は外してます、必要なら `AllowN` を別メソッドで足せるので」

---

## ドリル2 — トレードオフ: アルゴリズム選定 ⏱️ 8分

### 出題

シナリオ: 決済 SaaS API、Free 10 req/sec / Pro 100 req/sec、バースト許容、顧客100万社規模、将来 Redis 分散。

選択肢: **Token Bucket / Sliding Window / Fixed Window**

### Ken の答え

（記入待ち）

### 評価

（記入待ち）

### 持ち帰り

（記入待ち）

---

## ドリル3 — 並行性 ⏱️ 10分

（未実施）

## ドリル4 — 本番考慮 ⏱️ 7分

（未実施）

## ドリル5 — 拡張性 ⏱️ 7分

（未実施）

## ドリル6 — コード間違い修正 / バグ発見 ⏱️ 10分

（未実施。race / goroutine leak / typed nil / N+1 系の混入コードを読んで指摘+修正）

---

## 全体フィードバック

（セッション終了時に記入）
