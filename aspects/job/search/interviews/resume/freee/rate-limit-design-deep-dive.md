---
title: freee 外部連携 rate limit 対策 - 面接用カンペ
created: 2026-05-07
updated: 2026-05-11
---

# freee 外部連携 rate limit 対策 - 面接用カンペ

> 面接中に **3 秒で該当 Q に飛び、5 秒で答えのキーを掴む** ためのドキュメント。
> Layer 1 で索引、Layer 2 で各 Q の答え、Layer 3 は前日復習用の背景資料。

---

## Layer 1: カンペカード（面接中はここだけ見る）

### 1 分 pitch（最初に話す）

> freee Eラーニングで OEM の Eラーニング基盤と API 連携していたんですが、OEM 側に **1 IP あたり 300 req/sec** の rate limit がありました。freee 側は全顧客のリクエストが同じ出口 IP から出る構造だったので、全社でこの 300 req/sec を共有する必要がありました。一括招待や組織同期では数百 API コールが発生するので、複数社が同時に動くとすぐ上限に当たります。対応としては、**Sidekiq で非同期化**して、**N+1 を解消**し、**worker を 2 本立てて片方が lock 待ちでも止まらない形**にし、**Redis で rate limiter** を入れ、**組織同期は company 単位の mutex** で守り、**retry と冪等性も別レイヤーで設計**しました。UX は最低限で、**今やり直すなら** urgent / bulk 分離、進捗表示、合流 UX を足したいです。

### トリガー索引（質問キーワード → 答え）

| 聞かれたら | § | 一言で言うキー |
|---|---|---|
| なぜ非同期？ | [Q1](#q1-なぜ非同期にした) | UI/OEM 詰まり回避、retry が HTTP では扱いづらい |
| 2 worker は何のため？ | [Q2](#q2-2-worker-は何のため) | 詰まりを減らす最小構成。優先度保証ではない |
| N+1 は？ / bulk insert は？ | [Q3](#q3-n1-と-bulk-insert-は) | SELECT/INSERT 両方の round-trip 削減 |
| 負荷試験で何がわかった？ | [Q4](#q4-負荷試験で何がわかった) | 1,000 名超で worker CPU 不足、SIGKILL |
| Redis rate limiter の中身は？ | [Q5](#q5-redis-rate-limiter-の中身は) | 秒単位 counter、全社共通 |
| urgent / bulk 分離は？ / soft cap は？ | [Q6](#q6-urgent--bulk-分離--soft-cap-は) | 当時は分けてない、今なら soft cap |
| 組織同期の mutex は？ | [Q7](#q7-組織同期の-per-company-mutex-は) | per-company、DynamoDB conditional write |
| TTL 安全？ | [Q7](#q7-組織同期の-per-company-mutex-は) | TTL は掃除、正しさは condition + lock_id |
| retry はどうしてる？ | [Q8](#q8-retry-はどうしてる) | Sidekiq retry + DB unique |
| 429 を受けたら？ | [Q8](#q8-retry-はどうしてる) | 例外 → Sidekiq retry に乗せる |
| 同時クリック UX は？ | [Q9](#q9-同時クリック-ux--進捗表示は) | 当時はブロック、今なら合流 |
| 進捗表示は？ / WebSocket は？ | [Q9](#q9-同時クリック-ux--進捗表示は) | リロード確認のみ、今なら 1〜2 秒ポーリング |
| 監視は？ / 429 にどう気づく？ | [Q10](#q10-監視は) | 記憶曖昧、見るべき指標は明確 |
| starvation は？ | [Q11](#q11-starvation--sleep--deadlock-は) | 完全防止できてない、今なら queue 分離 |
| sleep で worker 塞いでない？ | [Q11](#q11-starvation--sleep--deadlock-は) | 今なら acquire 失敗で reenqueue |
| deadlock は？ | [Q11](#q11-starvation--sleep--deadlock-は) | 1 ジョブ 1 ロック設計で構造的に回避 |
| X-lock / S-lock の使い分け | [Q12](#q12-x-lock--s-lock-の使い分け) | SELECT FOR UPDATE と DynamoDB conditional write |
| 実装と改善案の境界は？ | [Q13](#q13-どこまで実装で-どこから改善案) | (表参照) |
| シニアとしての設計判断は？ | [Q14](#q14-シニアとしての設計判断は) | 事故止め → 観測 → 改善 |

### ハマった時の逃げセリフ

- 「実装の記憶が曖昧なので断言は避けますが、**見るべき指標は明確で** 〜です」
- 「当時の制約下では 〜 を優先しました。**今なら** 〜 を足します」
- 「**実装済みの話と、振り返りの改善案は分けて話します**」
- 「完璧に防いだとは言いません。当時は 〜 を止めることを優先しました」
- 「token bucket というより、**Redis の秒単位 counter** で上限を見ていました」（rate limiter で深掘りされた時）

### 避けたい言い方

- ❌「完璧な設計で解決しました」
- ❌「subscription pattern で合流 UX まで作りました」
- ❌「SSE / ポーリング / Datadog まで全部設計しました」
- ❌「token bucket で構造的にサンダリングハードを防ぎました」
- ❌「TTL で正しさを担保しました」（TTL は掃除用。正しさは condition）

---

## Layer 2: 質問別 Q&A

### Q1. なぜ非同期にした？

**Key**: 同期だと UI も OEM も詰まる。retry が HTTP 内では扱いづらい

- 同期リクエスト内で数百 API コール → UI が待ちすぎる
- OEM rate limit にも当たりやすい
- 失敗時の retry が HTTP リクエスト内では扱いづらい
- Sidekiq job にして retry / rate limit 待ち / 途中失敗 / 再実行 を扱える形に

**深掘り対応**:
- 「同期で全部解決する手は？」→ N 百コールを 1 リクエスト内で完了させる前提自体が無理。1 名招待でも複数コール、100 名なら数百
- 「Sidekiq 以外の選択肢は？」→ Rails スタックなので一番素直。AWS SQS + worker は別レイヤーになるのでチーム規模的に重い

---

### Q2. 2 worker は何のため？

**Key**: 詰まりを減らす最小構成。優先度保証ではない

**30 秒**:
- worker を 2 つ用意した
- 片方が lock 待ちでも、もう片方が別の処理を取れる
- 目的は「全体停止を避ける」こと
- urgent / bulk のような優先度分離ではない

**1 分で話す**:
> 当時の優先順位は「事故を止める」でした。1 本の worker だと、組織同期の lock を待っている間に別の管理者操作も全部止まってしまう。それを避けるために worker を 2 本立てて、lock 待ちが起きても片方は別の仕事を進められるようにしました。ただこれは厳密な優先度制御ではなく、あくまで詰まりを減らすための並列度確保です。管理者操作を強く守る設計ではないので、今やり直すなら urgent / bulk で queue を分けて、bulk が枠を食い尽くさないように soft cap を置きます。

**深掘り対応**:
- 「本当に 2 で十分？」→ 十分とは言わない。当時の制約下での最小構成。今なら urgent / bulk queue + 専用 worker
- 「lock 取得失敗した job は？」→ 二重実行せず「進行中」を返す。今なら既存 job の sync_id を返して合流させる

---

### Q3. N+1 と bulk insert は？

**Key**: SELECT 側の往復と INSERT 側の往復、別問題として両方見た

- **N+1（SELECT 側）**: 一括招待は人数分ループ。ループ内 DB クエリが残ると worker CPU と DB が詰まる
- 招待対象のユーザー・所属・権限を**事前にまとめて preload / eager load** してから job に入る
- **bulk insert（INSERT 側）**: `create!` を人数分回すと round-trip も人数分
- 対策は activerecord-import の `import` / `import!`、または Rails 6+ の `upsert_all` で 1 SQL にまとめる（当時実際に使ったかは記憶曖昧、今ならこれを使う）
- callback / validation は基本飛ぶので、**冪等性・必須項目は DB 制約に寄せる**（`(company_id, employee_external_id)` の unique 制約）

**深掘り対応**:
- 「rate limit と N+1 の関係は？」→ OEM の 300 req/sec を守っても、worker が N+1 で詰まれば rate limiter 以前の問題
- 「callback で副作用がある時は？」→ 事前に明示呼び出しするか、DB 制約に寄せる
- 「`import` と `upsert_all` の使い分けは？」→ validation 効かせたいなら import、純粋に高速 upsert なら upsert_all

---

### Q4. 負荷試験で何がわかった？

**Key**: 1,000 名超の一括招待で worker CPU が不足、SIGKILL で落ちる

- ボトルネックは **OEM rate limit だけではなかった**
- worker CPU、DB 読み込み、job 処理時間の複合
- `SIGKILL` / exit 9 でプロセスが落ちるケースがあった
- 一括処理は chunking、worker sizing、分割 まで含めて設計する必要があると分かった

**1 分で話す**:
> rate limit 対策をやり切っても worker 側が落ちたら意味がないので、負荷試験で限界を見ました。結果として 1,000 名以上の一括招待は worker CPU が足りず、プロセスが SIGKILL で落ちることが分かりました。これは外部 API の制約ではなく自社側の capacity 問題です。なので今なら、招待対象を 100〜200 名単位の child job に分割して、parent job は進捗管理だけを持つ形にします。worker が kill されても途中から再開できるように checkpoint も入れます。

**深掘り対応**:
- 「chunking のサイズはどう決める？」→ 負荷試験で worker CPU が持つ範囲。100〜200 名はその文脈
- 「途中失敗の再開は？」→ 当時は雑だった。今なら checkpoint で「どこまで処理済み」を持つ

---

### Q5. Redis rate limiter の中身は？

**Key**: 秒単位 counter。全社共通の出口 IP なので、会社単位ではなく全体で見る

- 秒単位のカウンタを Redis に置く
- OEM API を呼ぶ前に `acquire`
- 取れなければ Sidekiq retry に乗せて worker を解放する形が望ましい（当時の実装詳細は曖昧、今なら scheduled retry / reenqueue）
- 429 を受けたら例外にして Sidekiq retry に乗せる
- 顧客単位ではなく、OEM API 全体で共有する limiter

**深掘り対応**:
- 「token bucket は？」→ token bucket というより秒単位 counter。素直な実装
- 「実装の細部は？」→ global と class 別カウンタを atomic に見る必要がある（今なら Lua でまとめる）。雑にやると説明上の soft cap と実挙動がズレる
- 「会社単位の limit は？」→ 会社単位の制御ではなく、全社共有の出口 IP 制約を守るためのもの

---

### Q6. urgent / bulk 分離 / soft cap は？

**Key**: 当時は分けていない。今なら soft cap で bulk が全枠を食わないようにする

**30 秒**:
- 当時の実装は urgent / bulk の綺麗な分け方ではなかった
- 今なら 2 層で分ける: **Sidekiq queue で urgent を優先 pop**（スケジューラ層） + **rate limit で bulk に soft cap**（quota 層）
- 「urgent の throughput 下限を保証する設計」と言う。latency までは担保しない（urgent 自身がバーストすれば待つ）

**1 分で話す**:
> 振り返ると、管理者操作と一括処理を同じ rate limit 枠で扱ったのは弱点でした。bulk が詰まっている時に管理者のロール変更や削除も巻き込まれて遅れます。なので今なら 2 層で分けます。スケジューラ層では Sidekiq queue を urgent / bulk に分けて urgent を優先 pop、rate limit 層では class 別カウンタを持って bulk に soft cap を置く。OEM の全体上限は 300 req/sec のままで、bulk を例えば 200 までに抑えれば、urgent には最低 100 の throughput 下限が残ります。保証するのはこの下限であって、urgent 自身が 100/sec を超えてバーストすれば順番待ちは発生します。

**深掘り対応**:
- 「strict partition じゃダメ？」→ ダメ。bulk が idle でも urgent が 100 までしか使えず、OEM の 300 に余裕があるのに詰まる。soft cap の方が現実的
- 「soft cap の実装は？」→ global counter と bulk counter を別に持ち、acquire 時に atomic 判定。Redis Lua でまとめる
- 「1 カウンタじゃダメ？」→ 説明上の soft cap と実挙動がズレる。最低でも 2 つ要る

---

### Q7. 組織同期の per-company mutex は？

**Key**: 同一企業で組織同期を二重起動しないため。DynamoDB conditional write

- 問題: 同一企業で組織同期が同時起動する可能性（管理者ボタン + 招待前処理）
- OEM 側の race condition、rate limit 枠の無駄
- 対応: **企業単位で mutex**、同じ company の組織同期は同時 1 本、後発はブロック
- DynamoDB を選んだ理由: conditional write で atomic、既存 AWS スタック、TTL で掃除しやすい

**深掘り対応（TTL 関連）**:
- 「TTL で正しさ担保？」→ NO。**TTL は掃除用**。正しさは condition expression と `expires_at < now` 判定
- 「TTL 切れで二重実行は？」→ `lock_id` を持って release 時に一致確認。長い job なら **heartbeat で `expires_at` 延長**
- 「TTL の物理削除遅延は？」→ 遅延ありき。TTL 削除そのものには依存しない設計

**深掘り対応（mutex 全般）**:
- 「Redis でやらなかった理由？」→ DynamoDB を選んだのは既存スタック上にあったから。Redis でも実装可能（SETNX + EXPIRE）
- 「処理が遅れた場合の合流は？」→ 当時はエラー。今なら既存 job の `sync_id` を返して合流させる

---

### Q8. retry はどうしてる？

**Key**: Sidekiq retry に寄せる + DB unique で冪等性

- 429 / 一時失敗は例外にして Sidekiq retry に乗せる
- Sidekiq の指数バックオフ + jitter を使う（自前 retry は増やさない）
- 二重作成は DB unique 制約で防ぐ（例: `(company_id, employee_external_id)`）
- request_id ベースの冪等性も併用

**深掘り対応**:
- 「rate limit 待ち中の worker は塞がない？」→ 当時の実装詳細は盛らない。「今なら acquire 失敗時に reenqueue して worker 解放」と言う
- 「retry 数の上限は？」→ Sidekiq デフォルト（25 回 / 約 3 週間）。重要 job は別途設定する余地あり

---

### Q9. 同時クリック UX / 進捗表示は？

**Key**: 当時は最低限。今なら合流 UX + 1〜2 秒ポーリング

**30 秒（同時クリック）**:
- 実行中なら後発クリックはブロック、「他のユーザーが実行中」表示
- 合流 UX までは作っていない
- 今なら後発を既存 job に合流させて、同じ進捗バナーを見せる

**30 秒（進捗表示）**:
- 組織同期は async で job 投げて、UI はリロードで完了確認
- 1 秒ポーリング / リアルタイム進捗は未実装
- 当時は WebSocket 前例なし + リリーススコープ外
- 今なら 1〜2 秒ポーリングか SSE、進捗バー、rate limit 待ちと失敗を UI 上で分ける

**1 分で話す**:
> UX は正直、当時は最低限でした。リリーススコープと WebSocket の前例なしという制約で、まず rate limit と排他を優先したからです。なので後発クリックはエラーにしてブロック、進捗もリロードで確認、という形でした。今やり直すなら、後発クリックは既存 job の sync_id を返して合流させて、サポート問い合わせを減らします。進捗は WebSocket より先に 1〜2 秒ポーリング、必要なら SSE で十分です。双方向通信が要らないので WebSocket までは要らない。

**深掘り対応**:
- 「なぜ WebSocket じゃない？」→ 人事労務で前例なし、運用コスト、リリース優先。ポーリングで十分
- 「rate limit 待ちと失敗の表示分けは？」→ 当時はやってない。今なら UI 上で分けて「混雑で待機中」と「失敗」を見せる

---

### Q10. 監視は？

**Key**: 実装の記憶は曖昧。**見るべき指標は明確**

- 見るべき指標: acquire 待機時間 / 429 率 / job 成功失敗数 / job 完了時間 / queue latency / company 単位の偏り
- 当時 company_id タグ付き Datadog metrics や class 別 acquire 待機時間が入っていたかは記憶曖昧（盛らない）
- 今なら Datadog で class / company / endpoint 別、PagerDuty 通知、ダッシュボードで「OEM 側 vs 自社 worker」を分けて見られる形

**深掘り対応**:
- 「429 が増えた時どう気づく？」→ 429 率の閾値超え、urgent 相当の queue latency 超え、job retry 急増、特定 company の失敗連続
- 「OEM 側 / 自社 worker をどう切り分け？」→ acquire 待機時間が長ければ OEM 側、queue latency が長ければ自社 worker
- 「実装してたか曖昧」→ ここで盛らない。「見るべき指標は明確」「今ならこう入れる」と話す

---

### Q11. starvation / sleep / deadlock は？

**Key**: 当時の構成では完全防止できていない。設計と運用で吸収

**starvation（一方が後回しになり続ける）**:
- 当時の 2 worker 方式では完全防止できない
- 大量 bulk が流れ続けると管理者操作が遅れる可能性あり
- 当時はまず rate limit 超過と二重同期を止める方が優先
- 今なら queue 分離 + bulk soft cap + queue latency 監視 + 閾値超えで alert

**sleep で worker 塞ぐ問題**:
- 長時間 sleep で worker を塞ぐのは良くない
- 当時の実装詳細は盛らない
- 今なら acquire 失敗時に scheduled retry / reenqueue で worker 解放
- 429 は指数バックオフ + jitter、limiter で事前ブロックなら短い delayed job

**deadlock**:
- 1 ジョブが同時保持するロックは原則 1 つ（per-company mutex か rate limiter token）
- **同時保持しない設計**なので deadlock は構造的に起きない
- DB トランザクション内で複数行 SELECT FOR UPDATE する場合は**主キー昇順で取る**（lock ordering）
- 最後の安全網: InnoDB が deadlock を検知して片方 rollback → retry で吸収
- リスクとして残るのは livelock（両方 retry し続けて進まない）→ jitter と queue latency で気づく

---

### Q12. X-lock / S-lock の使い分け

**Key**: 状態遷移は X-lock、企業跨ぎの排他は DynamoDB conditional write

- **共有ロック (S-lock)**: 読み込み専用。他の読み手と共存、書き込みは弾く
- **排他ロック (X-lock)**: 書き込み用。他のロックを一切弾く
- DB レベル: 状態遷移（pending → invited 等）を守るなら `SELECT ... FOR UPDATE` で行に X-lock を取るのが定石（当時の具体的な使用箇所の記憶は曖昧）
- アプリレベル（DynamoDB mutex）: `attribute_not_exists` 条件で「ロックが空 or 期限切れ」のときだけ取得 → 実質 X-lock 相当
- Redis rate limiter は counter なのでこの議論とは別文脈

**深掘り対応**:
- 「S-lock 使う場面は？」→ 整合性チェックなど、自分は書かないが他からの更新を防ぎたい時に `SELECT ... LOCK IN SHARE MODE` 相当
- 「S/X 混在のリスクは？」→ 意図しない待ちが起きやすい。書き込み前提なら最初から FOR UPDATE で X を取る方針

---

### Q13. どこまで実装で、どこから改善案？

**Key**: 当時 = 事故を止める最小構成。今なら = 優先度制御 + UX + 監視を足す

| 項目 | 状態 |
|---|---|
| Sidekiq 非同期化 | 実装済み |
| N+1 クエリ解消 | 実装済み |
| activerecord-import / upsert_all による bulk insert | 記憶要確認 |
| worker 負荷試験 | 実装済み |
| 2 worker + lock 取得 | 実装済み |
| SELECT FOR UPDATE による行レベル X-lock | 記憶要確認 |
| Redis rate limiter（全社共通 counter） | 実装済み |
| DynamoDB per-company mutex | 実装済み |
| 冪等性の DB 制約 | 実装済み |
| 一括招待の進捗画面 | 実装済み |
| 一括招待の完了メール | 実装済み |
| urgent / bulk queue 分離 | 未実装（今なら改善） |
| bulk soft cap | 未実装（今なら改善） |
| Sidekiq queue priority | 未実装（今なら改善） |
| 同時クリックの合流 UX | 未実装（今なら改善） |
| 組織同期ボタンの 1 秒ポーリング | 未実装（今なら改善） |
| 失敗ユーザーだけ再試行 UI | 未実装（今なら改善） |
| company_id 別 Datadog metrics | 記憶曖昧（断言しない） |

---

### Q14. シニアとしての設計判断は？

**Key**: 最初から理想構成にしない。事故を止める → 観測 → 改善 の順

**1 分で話す**:
> 最初から理想構成を全部入れると、チーム規模とリリース期限に対して複雑さが過剰になります。なので順序を意識して、まず外部 API の制約で事故る箇所を最小構成で止めました。このケースだと 2 worker + lock + rate limiter + per-company mutex です。その上で観測して、実測を見てから優先度制御や UX を足す、という考えでした。実際には観測の細部まで詰め切れていない部分もあるので、今なら queue 分離と合流 UX と class 別 metrics を順に足します。

**深掘り対応**:
- 「最初から全部入れるべきだったのでは？」→ 1 人で持つ範囲ではない、チーム規模と保守性のトレードオフ。複雑さは事故を生むので段階的に
- 「観測なしで判断するリスクは？」→ あるからこそ、まず止める範囲を絞った。urgent / bulk の必要性は実測で見たかった

---

## Layer 3: 巻末参考資料（前日復習用）

### 背景

- プロダクト: freee Eラーニング（人事労務から OEM 提供元の Eラーニング基盤を呼び出す）
- OEM API で行っていた操作: ロール変更 / ユーザー削除 / 招待 / 組織同期
- 前提: 研修割り当て前に、OEM 側に従業員アカウントと組織ツリーが必要。1 操作で複数 API コール発生

### 制約まとめ

- OEM 側: **1 IP あたり 300 req/sec**（交渉済みでこれ以上は無理）
- freee 側: 全顧客が同一出口 IP → 全社で 300 req/sec を共有
- 操作の重さ: 1 名招待 = 数コール、100 名招待 = 数百コール、1,000 名以上は worker 側もボトルネック
- 環境: Rails + Sidekiq + Redis + AWS。WebSocket は人事労務で前例なし

### 操作の性質（urgent / bulk 分類）

| 操作 | 性質 | 整理 |
|---|---|---|
| ロール変更 | 管理者が UI で待つ | 即時性高 |
| ユーザー削除 | 管理者が UI で待つ | 即時性高 |
| 組織同期ボタン | 管理者が明示的に押す | 即時性高 |
| 招待前の組織同期 | 招待ジョブの前処理 | バッチ寄り |
| 一括招待 | 時間がかかってもよい | バッチ寄り |

組織同期は dual-trigger（管理者ボタン = urgent、招待前処理 = bulk）。当時は queue で綺麗に分けず、worker 2 つで詰まりを減らす形だった。

### 自己評価

**良かった点**:
- OEM の全体 rate limit を顧客横断の共有リソースとして扱えた
- 2 worker で lock 待ちの全体停止を回避
- N+1 解消で worker 内の DB アクセスを軽くした
- 負荷試験で 1,000 名超の一括招待が worker CPU 的に厳しいことを把握
- 組織同期の並列実行を company 単位で止めた
- retry と冪等性を別レイヤーで設計

**弱かった点**:
- UX は最低限（後発クリックは合流ではなくブロック、進捗表示も弱い）
- 管理者操作と一括処理の優先度分離は弱かった
- 1,000 名超の chunking と checkpoint は今ならもっと明示的に設計
- metrics の粒度は今ならもっと細かくする

**着地点**:
- 「当時の制約下で、rate limit と並列実行の事故を止めるところまではやった」
- 「UX は改善余地があった」
- 「今なら urgent / bulk 分離、既存ジョブへの合流、進捗表示まで入れる」
