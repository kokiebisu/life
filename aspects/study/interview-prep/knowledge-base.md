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

### CS 概念・設計パターン
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
| throw vs createError | throw=システム異常（middleware へ）/ createError=業務エラー（ユーザーへ） |
| throw は関数の一番上 | 他のバリデーションより先に置かないと dead code になる。middleware パターンの前提 |
| Zod | z.infer で型と schema を1ソース化。unknown + type guard |
| Value Object (DDD) | Fee・Amount・YearMonth をクラス化してバリデーションを内包 |
| immutable update | `{...obj, field: newValue, arr: [...obj.arr, item]}` |
| webhook secret の管理 | per-endpoint なので環境変数ではなく DB で管理して登録時に払い出す |

### 金融計算パターン
| パターン | 内容 |
|---|---|
| Math.ceil vs floor | 手数料=ceil（銀行有利に丸め）。按分=floor+最大剰余方式 |
| 最大剰余方式 | `floor` 後の端数（小数部）が大きい順に上位 r 個へ +1 円。合計が必ず total に一致する |
| 手数料クランプ | `Math.min(5000, Math.max(200, fee))` で下限・上限を設ける |
| 月次上限チェック | 既存履歴の `amount + fee` の合計 + 今回の `amount + fee` で判定。fee を忘れない |
| reduce で cur.fee | reduce 内では履歴レコードの `cur.fee` を使う。現在トランザクションの `fee` 変数と混同しない |
| 負値防止 | `Math.max(0, value)` でクーポン残数など負にならないよう guard |

### JavaScript / TypeScript 落とし穴
| 落とし穴 | 内容 |
|---|---|
| 浮動小数点 | `0.1 + 0.2 !== 0.3`。金融計算は整数演算か `Math.round` |
| Date の破壊的変更 | `setMonth()` / `setDate()` は元の Date を変更する。新しい Date を作ること |
| Number.isNaN | グローバル `isNaN` より型安全。`isNaN('abc')` は true だが `Number.isNaN('abc')` は false |
| ?? vs \|\| | `\|\|` は `0` / `""` を falsy 扱い。金額・数量には `??`（null/undefined のみ） |
| getMonth() 0始まり | `getMonth()` は 0〜11。`getDate()` は 1〜31（こちらは1始まり） |
| new Date('YYYY-MM-DD') | UTC midnight として解釈される。日付の等値比較には使えるが時刻を含む場合は注意 |
| new Date(y, m, d) 月overflow | `month` に 12 を渡すと翌年1月になる。`day` に 0 を渡すと前月末日 |
| getDate() vs dayOfMonth | 月末クランプ後の日付を次月に引き継ぐとき `getDate()` を使うとドリフトする。元の `dayOfMonth` を渡す |
| toLocaleString の引数 | `toLocaleString('ja-JP')` はロケールコード。`'YYYY-MM-DD'` はフォーマット文字列ではない |
| 日付フォーマット | `` `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` `` |

### 正規表現
| パターン | 内容 |
|---|---|
| YYYY-MM-DD | `/^\d{4}-\d{2}-\d{2}$/` — `$` を忘れると末尾の余分な文字を許す |
| YYYY-MM | `/^\d{4}-\d{2}$/` — `\d{2}?` にすると2桁目が optional になるバグ |

### heap vs sort（top-k 問題）
- **heap**: 構築 O(n)、k個取り出し O(k log n)。k << n のとき有利
- **sort**: O(n log n)。TypeScript に標準 heap がないため実務では sort が無難
- 判断基準: k が n に比べて極端に小さくなければ sort で十分

### コードリーディングの体系的な見る順番
1. 概要を一言で言う（何をするクラスか）
2. 良い点を探す（public surface・encapsulation・責務の分離）
3. 型の問題（any、unknown、型安全性）
4. エラーハンドリング（silent failure、console.log のみ）
5. 非同期（await 漏れ、unhandled rejection）
6. インフラ依存（fetch 直依存 → DI）
7. 状態管理（インメモリ → 永続化、スケールアウト）
8. リトライ設計（backoff、4xx/5xx 区別）
9. セキュリティ（署名、認証）
10. ライフサイクル（start/stop、clearInterval）

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
