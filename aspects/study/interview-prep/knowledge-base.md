# 技術面接 Knowledge Base

カバー済み領域と未カバー領域の一覧。次の練習でどこをやるか判断するために使う。

---

## ✅ カバー済み

### コードリーディング
| 題材 | 主な観点 | セッション |
|---|---|---|
| BatchProcessor | SRP・DI・async/await・DLQ・Zod | find #1 (2026-06-05) |
| WebhookDeliveryService | HMAC署名・backoff・4xx/5xx・clearInterval・OOM | find #2 (2026-06-10) |

### サービス実装（TypeScript）
| 題材 | 主な観点 | セッション |
|---|---|---|
| withdraw（出金） | Math.ceil・月次上限・immutable update・throw vs createError | folio (2026-06-09) |
| executeRegularInvestment（定期積立） | new Date の月跨ぎ・getMonth 0始まり・throw 一番上 | folio (2026-06-09) |
| applyCoupon（クーポン） | usedCount +1・Math.max 負値防止・仕様矛盾の検出 | folio (2026-06-09) |
| allocate（按分計算） | 最大剰余方式・floor+端数配分・heap vs sort | folio (2026-06-10) |

### アルゴリズム
| 題材 | セッション |
|---|---|
| Bubble Sort | folio (2026-06-07) |
| Selection Sort | folio (2026-06-07) |
| factorial | FOLIO本番 (2026-06-10) |
| join（アプリケーションコード） | FOLIO本番 (2026-06-10) |

### CS 概念
| 概念 | 内容 |
|---|---|
| SRP | 単一責任の原則。flush() の責務分離 |
| DI | 依存性注入。HttpClient を constructor 注入 |
| Exponential Backoff | リトライ間隔を指数的に広げる。`1000 * Math.pow(2, i)` |
| DLQ | 失敗イベントを退避するキュー。SQS/Redis |
| fire-and-forget | async 処理を投げっぱなしにする設計。`.catch()` で受ける |
| Promise.all | 並列 async 処理。全完了を待てる |
| unhandled rejection | await なしの async 呼び出しで例外が握りつぶされる |
| HMAC署名 | secret で payload を署名。暗号化ではなく署名（改ざん検知） |
| 暗号化 vs 署名 | 暗号化=秘密にする / 署名=本物と証明する |
| 4xx vs 5xx | 4xx=クライアントエラー（リトライ不要）/ 5xx=サーバーエラー（リトライ可） |
| clearInterval | setInterval の戻り値を保存して stop 時に clearInterval |
| OOM / unbounded growth | 配列が無制限に増え続けるリスク。GCリークとは別 |
| Math.ceil vs floor | 手数料=ceil（銀行有利）。按分=floor+最大剰余方式 |
| throw vs createError | throw=システム異常（middleware へ）/ createError=業務エラー（ユーザーへ） |
| Zod | z.infer で型と schema を1ソース化。unknown + type guard |
| 最大剰余方式 | floor 後の端数を小数部が大きい順に+1円ずつ配る |
| Value Object (DDD) | Fee・Amount・YearMonth をクラス化してバリデーションを内包 |
| immutable update | `{...obj, field: newValue, arr: [...obj.arr, item]}` |
| ?? vs \|\| | `\|\|` は 0 を falsy 扱い。金額には `??` を使う |
| 浮動小数点 | `0.1 + 0.2 !== 0.3`。金融計算は整数または Math.round |
| Date の破壊的変更 | setMonth/setDate は元の Date を変更する |
| Number.isNaN | isNaN より型安全。`Number.isNaN(NaN)` = true |

---

## ❌ 未カバー（優先度順）

### コードリーディング観点（未出題）
- **認証・認可**: JWT 検証・RBAC・セッション管理
- **DB・トランザクション**: N+1・楽観的ロック・トランザクション境界
- **レート制限**: Token Bucket / Leaky Bucket アルゴリズム
- **キャッシュ**: 無効化戦略・TTL・stale-while-revalidate
- **並行性**: Race condition・mutex・Semaphore

### CS 概念（未カバー）
- **計算量**: O(n log n) vs O(n²) の説明
- **B-Tree インデックス**: DB がなぜ速いか
- **TCP vs UDP**: 使い分けと fintech での選択
- **CAP 定理**: Consistency / Availability / Partition tolerance
- **イベントソーシング / CQRS**: fintech でよく使うアーキテクチャ
- **分散トレーシング**: OpenTelemetry・Jaeger
- **GraphQL vs REST**: トレードオフ

### アルゴリズム（未出題）
- 二分探索
- 配列操作（重複除去・グルーピング・sliding window）
- 文字列操作（anagram・palindrome）
- 再帰・ツリー探索（DFS/BFS）
- ハッシュマップ活用（two-sum 系）
