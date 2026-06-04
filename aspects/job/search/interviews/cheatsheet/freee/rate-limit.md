---

### 1分 pitch

freee Eラーニングの開発において、外部APIの物理制約を自社システムの設計で隠蔽するという課題に取り組みました。

OEM先のAPIには1IPあたり**300 req/min**という制限があり、freeeは全顧客が同じ出口IPを共有する構造だったため、特定企業の大量処理が他社の操作を止めてしまう「共倒れ」のリスクがありました。per-company枠の分離やバルク操作APIの追加をOEM側に交渉しましたが、いずれも却下されました。そのため、これらの制約を前提に、自社システムの設計でいかに隠蔽するかという課題に取り組みました。

この制約に対し、Sidekiqによる非同期化とRedisでのグローバルなRate Limiter、DynamoDBを用いた企業単位のMutexで排他制御を実装しました。

負荷試験では1,000名超の一括招待でworkerがOOMによるSIGKILLで落ちることがわかり、chunk分割で1 jobあたりのメモリフットプリントを抑え、2,000名の一括招待が安定して通ることを確認してからリリースしました。リリース後は大規模な一括処理も事故なく安定稼働しています。

---

## Layer 2 — 質問別 Q&A

### Q1. なぜ非同期にした？

**Key**: 同期だと UI も OEM も詰まる。retry が HTTP 内では扱いづらい

- 同期リクエスト内で数百APIコール → UIが待ちすぎる
- OEM rate limitにも当たりやすい
- 失敗時のretryがHTTPリクエスト内では扱いづらい
- Sidekiq jobにして retry / rate limit待ち / 途中失敗 / 再実行 を扱える形に

**深掘り対応**

- 「同期で全部解決する手は？」→ N百コールを1リクエスト内で完了させる前提自体が無理。1名招待でも複数コール、100名なら数百
- 「Sidekiq 以外の選択肢は？」→ Rails スタックなので一番素直。AWS SQS + worker は別レイヤーになるのでチーム規模的に重い

---

### Q2. 2 worker は何のため？

**Key**: urgent / bulk を独立した worker + 独立した rate limiter に分離。bulk が詰まっても urgent が止まらない設計

**30秒**

urgent と bulk に分けた。urgent はロール変更・従業員削除など即時性が必要な操作、bulk は一括招待・組織同期などの大量処理。それぞれ独立した Redis rate limiter を持つ。

**1分**

- urgent worker: 管理者が今すぐ反映したいロール変更・削除を担当
- bulk worker: 一括招待・組織同期など非同期で処理できる大量処理を担当
- 独立した rate limiter → bulk が quota を使い切っても urgent は進む
- traffic に応じて worker 数は増やせる設計

**深掘り対応**

- 「本当に 2 で十分？」→ urgent / bulk の分離が目的で達成済み。traffic が増えたら urgent queue をさらに優先 pop する設計を追加する
- 「なぜ 3 じゃないの？」→ worker 数より queue の分離が本質。当時の traffic で 2 本で十分だった
- 「lock 取得失敗した job は？」→ 二重実行せず「進行中」を返す。今なら既存 job の sync_id を返して合流させる

---

### Q3. N+1 と bulk insert は？

**Key**: SELECT 側の往復と INSERT 側の往復、別問題として両方見た

- **N+1（SELECT 側）**: 招待対象のユーザー・所属・権限を**事前にまとめて preload / eager load** してから job に入る
- **bulk insert（INSERT 側）**: `create!` を人数分回すと round-trip（DB への往復）も人数分。`activerecord-import` / `upsert_all` で 1 SQL にまとめる。当時の実装は記憶曖昧だが、**面接では「今なら必ず入れる」で答える**
- callback / validation は基本飛ぶので、冪等性・必須項目は DB 制約に寄せる（`(company_id, employee_external_id)` の unique 制約）

**深掘り対応**

- 「rate limit と N+1 の関係は？」→ OEM の制限を守っても、worker が N+1 で詰まれば rate limiter 以前の問題
- 「callback で副作用がある時は？」→ 事前に明示呼び出しするか、DB 制約に寄せる

---

### Q4. 負荷試験で何がわかった？

**Key**: 1,000名超の一括招待でworkerがOOMによるSIGKILL。chunk分割で解決し、2,000名で安定確認してリリース

**1分**

- rate limit 対策だけでは不十分 → worker 側の限界も測る必要があった
- 1,000名超で worker が OOM → SIGKILL → 外部 API ではなく自社の capacity 問題
- chunk 分割で 1 job あたりのメモリ使用量を抑えた
- 2,000名で安定確認してからリリース


**深掘り対応**

- 「chunking のサイズはどう決める？」→ 負荷試験で worker が OOM しない範囲。メモリフットプリントを見て決める
- 「途中失敗の再開は？」→ 当時は雑だった。今なら checkpoint で「どこまで処理済み」を持つ

---

### Q5. Redis rate limiter の中身は？

**Key**: 秒単位 counter（300/min = 5/sec 換算）。全社共通の出口 IP なので、会社単位ではなく全体で見る

- 秒単位のカウンタ（5/sec = 300/min 換算）を Redis に置く
- OEM API を呼ぶ前に `acquire`
- 取れなければ Sidekiq retry にスケジュールして worker を解放する（今なら acquire 失敗で reenqueue）
- 429 を受けたら例外にして Sidekiq retry に乗せる
- 顧客単位ではなく、OEM API 全体で共有する limiter

**深掘り対応**

- 「token bucket は？」→ token bucket というより秒単位 counter。素直な実装
- 「会社単位の limit は？」→ 会社単位の制御ではなく、全社共有の出口 IP 制約を守るためのもの
- 「Lua は？」→ 実装した。「残り確認 → インクリメント」を atomic に実行するため。2 コマンドに分けると複数 job が同時に「残り 1」を読む race condition が起きる

---

### Q6. urgent / bulk の rate limiter 設計は？

**Key**: urgent / bulk それぞれ独立した rate limiter を実装。bulk を保守的な閾値に抑えて urgent のスループットを確保

**30秒**

urgent と bulk に独立した Redis rate limiter を用意した。bulk が quota を使い切っても urgent のスループットは独立して確保される。

**1分**

- urgent: ロール変更・削除など即時性が必要 → 独立した rate limiter で確保
- bulk: 一括招待・同期 → 保守的な閾値でスロットリング
- OEM 全体 300 req/min のうち bulk を 200 に抑えれば urgent に最低 100 が残る
- urgent は 1 操作 約 3 コール → 100 req/min = 33 操作/min。管理者のクリック数では到達しない
- 今なら soft cap を動的に管理して、bulk idle 時は urgent がより多く使える設計にする

**深掘り対応**

- 「なぜ 200 / 100 なの？」→ urgent は 1 操作 3 コール。100 req/min = 33 操作/min。人間のクリック数で超えられない上限なのでこの下限で十分
- 「strict partition じゃダメ？」→ bulk が idle でも urgent が 100 までしか使えず無駄。soft cap の方が現実的
- 「soft cap の実装は？」→ global counter と bulk counter を別に持ち、acquire 時に atomic 判定。Redis Lua でまとめる

---

### Q7. 組織同期の per-company mutex は？

**Key**: 同一企業で組織同期を二重起動しないため。DynamoDB conditional write

- 問題：同一企業で組織同期が同時起動する可能性（管理者ボタン + 招待前処理）
- 対応：企業単位で mutex、同じ company の組織同期は同時 1 本
- DynamoDB を選んだ理由：既存スタックに DynamoDB の mutex クラスがすでにあり、conditional write が mutex のセマンティクスと自然にマッチしていた。新たに Redis で同等の実装を作るよりリスクが低いと判断した

**深掘り対応（TTL 関連）**

- 「TTL で正しさ担保？」→ NO。**TTL は掃除用**。正しさは condition expression と `expires_at < now` 判定
- 「TTL 切れで二重実行は？」→ `lock_id` を持って release 時に一致確認。長い job なら heartbeat で `expires_at` 延長
- 「Redis でよくない？」→ Redis でも SETNX + EXPIRE で実装可能。既存実装があったので DynamoDB を使った

**深掘り対応（mutex 全般）**

- 「処理が遅れた場合の合流は？」→ 当時はエラー。今なら既存 job の `sync_id` を返して合流させる

---

### Q8. retry はどうしてる？

**Key**: Sidekiq retry に寄せる + DB unique で冪等性。worker は塞がらず idle になる

- 429 / 一時失敗は例外にして Sidekiq retry に乗せる
- Sidekiq の retry は「例外 → スケジュールし直し → worker は次の job へ」という動作なので、sleep で待つ実装と違って worker は塞がらない
- rate limit が連続した場合、全 job が retry queue に積まれて worker が idle になる。これは意図した動作で、OEM への burst より回復を待つ方が正しい
- ただし retry が積み上がった場合の queue 監視は必要
- 二重作成は DB unique 制約で防ぐ（例：`(company_id, employee_external_id)`）

**今なら**

acquire 失敗時に reenqueue して rate limit がリセットされる時刻に寄せることで、idle 時間を短縮できる。ただし全 job が「rate limit がリセットされた瞬間」に一斉に起きて OEM に burst を浴びせる **Thundering Herd**（大量の job が同時に再実行されること）には注意が必要で、Sidekiq の jitter（retry タイミングにランダムなズレを入れる機能）か acquire 失敗ベースの reenqueue で緩和する。

**深掘り対応**

- 「retry 数の上限は？」→ Sidekiq デフォルト（25 回 / 約 3 週間）。重要 job は別途設定する余地あり
- 「全 worker が rate limit 待ちになったことはないか？」→ 塞がる設計ではないので「詰まる」のではなく「idle になる」。設計上の意図した動作

---

### Q9. 同時クリック UX / 進捗表示は？

**Key**: 当時は最低限。今なら合流 UX + 1〜2 秒ポーリング

**同時クリック（30秒）**

実行中なら後発クリックはブロック、「他のユーザーが実行中」表示。合流 UX は作っていない。今なら後発を既存 job に合流させて、同じ進捗バナーを見せる。

**進捗表示（30秒）**

組織同期は async で job 投げて、UI はリロードで完了確認。1 秒ポーリング / リアルタイム進捗は未実装。当時は WebSocket 前例なし + リリーススコープ外。今なら 1〜2 秒ポーリングか SSE。双方向通信が要らないので WebSocket まではいらない。

**1〜2秒ポーリングの根拠**

ユーザーが「少し同期に時間がかかります」バナーを見ながら画面で待つ前提だったので、処理完了後にバナーがすぐ消えることを期待する。10〜30秒では完了後も待たせてしまうため、体感とサーバー負荷のバランスを取って 1〜2 秒とした。

**1分**

- 当時: スコープ外 + WebSocket 前例なし → rate limit と排他を優先
- 後発クリック: エラーでブロック、進捗: リロードで確認
- 今なら: 後発は既存 job の sync_id を返して合流 → サポート問い合わせ減
- 進捗: 1〜2 秒ポーリング、必要なら SSE


**深掘り対応**

- 「なぜ WebSocket じゃない？」→ 人事労務で前例なし、運用コスト、リリース優先。ポーリングで十分
- 「rate limit 待ちと失敗の表示分けは？」→ 当時はやってない。今なら UI 上で分けて「混雑で待機中」と「失敗」を見せる

---

### Q10. 監視は？

**Key**: 実装の記憶は曖昧。見るべき指標は明確

**見るべき指標**

acquire 待機時間 / 429 率 / job 成功失敗数 / job 完了時間 / queue latency / company 単位の偏り

当時 company_id タグ付き metrics や class 別 acquire 待機時間が入っていたかは記憶曖昧（盛らない）。

**今なら**

class / company / endpoint 別 metrics、queue latency アラート、ダッシュボードで「OEM 側 vs 自社 worker」を分けて見られる形。

**深掘り対応**

- 「429 が増えた時どう気づく？」→ 429 率の閾値超え、queue latency 急増、job retry 急増
- 「OEM 側 / 自社 worker をどう切り分け？」→ acquire 待機時間が長ければ OEM 側、queue latency が長ければ自社 worker

---

### Q11. シニアとしての設計判断は？

**Key**: 最初から理想構成にしない。事故を止める → 観測 → 改善 の順

**1分**

- 最初から理想構成を全部入れると複雑さが過剰 → チーム規模・期限と釣り合わない
- まず「事故る箇所を最小構成で止める」を優先した
- 観測して実測から次の優先度（soft cap 精緻化、合流 UX）を判断する設計
- 今なら: soft cap 精緻化 → 合流 UX → class 別 metrics の順に足す


**深掘り対応**

- 「最初から全部入れるべきだったのでは？」→ 1 人で持つ範囲ではない。複雑さは事故を生むので段階的に
- 「観測なしで判断するリスクは？」→ あるからこそ、まず止める範囲を絞った。soft cap の精緻化や合流 UX は実測を見てから判断する順序にした

---
