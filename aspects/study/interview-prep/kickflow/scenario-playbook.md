# kickflow 一次面接 — システム設計シナリオ Playbook

> 「こういう状況の時にどのように設計するか？/ どう対応するか？」型の質問対策。
> kickflow のドメイン（稟議・ワークフロー SaaS）+ 技術スタック（Rails / PG / ES / Redis / Sidekiq）に紐づけて答える。

## 回答フォーマット（厳守）

EM 面接のシナリオ問題は **「設計判断のトレードオフを言語化できるか」を見ている**。
以下の型で答える:

1. **要件確認**: 「まず確認させてください」で前提・規模・制約を聞く
2. **論点を 2〜3 個に分解**: 「ポイントは A・B・C の 3 つだと思います」
3. **各論点で選択肢 + トレードオフ**: 「X と Y の選択肢がある。X は〜、Y は〜」
4. **判断 + 理由**: 「kickflow の規模・要件なら X を選ぶ。なぜなら〜」
5. **モニタリング・拡張性**: 「運用後は〇〇を監視する。スケールするときは〜」

**やってはいけない:**
- いきなり実装詳細に飛ぶ
- 選択肢を 1 つしか出さない
- トレードオフを言わずに「ベストプラクティスは〜」と言い切る

---

## ドメイン特化シナリオ（kickflow らしさ）

### S-1: 複雑な承認フローの状態管理

**問** 5 段階の承認フローで、途中で「差し戻し」「並列承認」「条件分岐（金額で承認者が変わる）」がある。
どう設計しますか？

**論点:**
- ワークフロー定義 と インスタンス を分離するか
- 状態遷移を **DB のカラム** で持つか **状態遷移テーブル（履歴）** で持つか
- 並列承認・条件分岐を **設定データ** として持つか **コードで分岐** するか

**回答の骨組み:**

```
まず確認: 同時稼働する稟議数、フロー定義の変更頻度、監査要件。

設計:
1. テーブル: workflow_definitions（テンプレート）/ workflow_instances（個別稟議）/
   workflow_steps（各ステップ定義）/ workflow_step_executions（実行履歴）
2. 状態を 1 カラム（current_status）で持つのではなく、
   step_executions に append-only で履歴を積む。
   → 監査要件 + 差し戻し時の巻き戻しが楽
3. 並列承認: 同一 step_no の executions を複数行で持ち、
   全員 approved になったら次の step へ
4. 条件分岐: workflow_steps に condition (JSONB) を持たせ、
   ruby 側で評価。複雑になりすぎたらルールエンジン化

トレードオフ:
- append-only は履歴が長くなる → アーカイブ戦略が必要
- JSONB condition は柔軟だが、定義の妥当性検証が DB レベルでできない

Rails 的に: AASM や state_machines gem も検討対象だが、
履歴を別テーブルに持つ設計の方が監査要件に合う。
```

### S-2: 大量稟議の検索オートコンプリート

**問** 数百万件の稟議の中から「タイトル・申請者・金額」でリアルタイム検索したい。どう設計？

**論点:**
- なぜ Elasticsearch か（PG の LIKE / pg_trgm との比較）
- インデックス更新の同期 vs 非同期
- マルチテナントでテナント分離をどう ES 側で表現するか

**回答の骨組み:**

```
まず確認: 検索の粒度（前方一致 / 中間一致 / 全文）、許容遅延、
データ量、テナント数。

設計:
1. Elasticsearch にインデックス。フィールドは title (n-gram), 
   applicant_id (keyword), amount (long), tenant_id (keyword)
2. テナント分離: 全クエリに tenant_id の filter を必須に。
   index alias を tenant ごとに切る方式もあるが、
   テナント数が増えると shard 過多になるので 単一 index + filter が無難
3. インデックス更新: Rails の after_commit から Sidekiq job で非同期 push。
   検索遅延 1〜2 秒は許容、整合性は eventual で OK
4. 障害時のフォールバック: ES が落ちても PG で ILIKE 検索できる経路を残す

トレードオフ:
- 同期更新は整合性◎だがリクエスト遅延◎ + ES 障害でリクエストが落ちる
- 非同期は遅延◎だが「作成直後に検索しても出ない」UX 問題 → 
  作成画面で楽観的にローカル表示する等で対応

監視: ES のクエリ p95 latency、Sidekiq queue 滞留、
PG-ES 差分（夜間 reindex で検出）
```

### S-3: マルチテナントのデータ分離

**問** SaaS でテナント A のデータがテナント B から見えないようにするには？

**論点:**
- 分離レベル: **DB 単位 / スキーマ単位 / カラム単位**
- Rails での実装: default_scope / Apartment gem / 手動 where
- DB レベルでの保険: PostgreSQL の RLS（Row-Level Security）

**回答の骨組み:**

```
まず確認: テナント数の想定、テナントあたりのデータ量、
強い分離要件（金融・医療レベル）か通常 SaaS か。

選択肢:
A. DB 単位分離 — 完全分離だが運用コスト爆発、横断レポート不可
B. スキーマ単位（Apartment gem）— 中庸だがマイグレーション複雑、
   テナント数 数千超で破綻
C. カラム単位（tenant_id を全テーブルに）— 運用容易、
   横断レポート可、ただし誤り = 情報漏洩

kickflow（エンタープライズ SaaS、数百〜数千テナント想定）なら C。
ただし「アプリ側の where 忘れ」が漏洩リスクなので、
保険として:
1. ApplicationRecord に default_scope { where(tenant_id: Current.tenant_id) }
2. PostgreSQL の Row-Level Security ポリシーを設定
   → アプリのバグでも DB レイヤで遮断
3. テストで cross-tenant アクセスを検知するスペック

トレードオフ:
- RLS は SET LOCAL でセッション変数を渡す必要があり、
  connection pool で取り違えに注意（Rails の場合は middleware で確実に set）

過去のインシデント想定: 管理画面の検索で tenant_id を where に
入れ忘れる事故が起きやすい。コードレビュー + RLS の二重防御。
```

### S-4: 通知システム（承認依頼・差し戻し）

**問** 稟議が次の承認者に回ったとき、メール + Slack + アプリ内通知を送りたい。設計は？

**論点:**
- 送信先チャネルの抽象化
- 失敗時のリトライ・冪等性
- ユーザーの通知設定（個別 ON/OFF）

**回答の骨組み:**

```
まず確認: 通知遅延の許容（即時 / 数分）、配信保証（at-least-once / exactly-once）、
ユーザーごとのチャネル設定の有無。

設計:
1. ドメインイベント発行: workflow_step.advanced を Rails のイベント
   バスから発火（ActiveSupport::Notifications でも sidekiq job 直接 enqueue でも）
2. Notifier クラスをチャネルごとに（EmailNotifier, SlackNotifier, InAppNotifier）
3. user_notification_preferences テーブルで個別 ON/OFF
4. Sidekiq job で各チャネル送信。失敗時は retry + dead queue
5. 冪等性: notification_logs テーブルに (event_id, channel, user_id) を
   ユニーク制約。重複送信を DB レベルで防ぐ

トレードオフ:
- at-least-once（普通の Sidekiq）: 二重送信が起きうる → 冪等性キー必須
- exactly-once: 分散システムでは保証困難 → 諦めて at-least-once + 冪等

監視: チャネル別の失敗率、Slack API rate limit、メール bounce 率
```

### S-5: Sidekiq ジョブが詰まった

**問** 朝会で「Sidekiq の queue が 10 万件溜まってます」と報告された。どう対応？

**論点:**
- まず止血か、原因調査か
- 詰まりの典型パターン
- 再発防止

**回答の骨組み:**

```
順序立てて:

1. 止血（最優先）
   - critical / default / mailers などキューが分かれているか確認
   - ユーザー影響の大きいキュー（通知・メール）を優先する
   - 緊急なら worker process を一時的にスケールアウト

2. 原因切り分け
   - 特定 job が遅い? → Sidekiq Web UI / Datadog APM で確認
   - 外部 API のレイテンシ上昇? → Datadog の外部 dependency view
   - DB のロック? → pg_stat_activity / slow query log
   - retry 地獄（失敗 job が無限 retry）? → dead queue を確認

3. 典型パターン
   a. 重い job が低並列で詰まる → キュー分離 + 並列度調整
   b. 外部 API タイムアウトで全 worker が待ち状態 → 
      タイムアウト短縮 + Circuit Breaker
   c. N+1 で 1 job が分単位 → eager loading
   d. 一時的なスパイク（夜間バッチで大量 enqueue）→ 
      throttling（sidekiq-throttled gem）

4. 再発防止
   - キューの大きさを Datadog アラート化
   - p95 job duration を SLO 化
   - 重い job は別キュー / 別 worker process に隔離

トレードオフ:
- worker 増やせば捌けるが、DB connection / 外部 API rate limit に
  ぶつかる → スケールの天井を意識
```

### S-6: テナントA のデータが テナントB に見えるバグ報告

**問** カスタマーサポートから「他社のデータが見えた」とエスカ。1 時間で対応するには？

**論点:**
- まず影響範囲特定、次に止血、最後に根本対応
- 監査ログ・通知義務

**回答の骨組み:**

```
1. 即時対応（最初の 10 分）
   - 該当機能を機能フラグで OFF（影響範囲を広げない）
   - インシデント宣言（SEV1）、PdM・CS・CISO に通知
   - ログから「いつから / 何件 / 誰が見たか」を特定するチームを立てる

2. 影響範囲特定（30 分）
   - アクセスログから (viewer_tenant_id, viewed_tenant_id, resource) で 
     不一致レコードを抽出
   - 被害テナントのリストを CS に渡す

3. 止血コード（30 分）
   - 該当エンドポイントに tenant_id チェックを追加
   - RLS が効いていない原因（middleware の set 漏れ / 
     default_scope の不備）を特定して修正
   - hotfix 用 PR を別 owner にレビューしてもらう

4. 事後（数日）
   - 同種バグが他にないか cross-tenant test を全エンドポイントに追加
   - 個人情報保護法 / 顧客との SLA に基づき通知義務確認
   - ポストモーテム

トレードオフ:
- 機能 OFF はビジネス影響大 → ただし情報漏洩拡大の方が致命的
- hotfix を急ぐと別バグが入る → コードレビューは省略しない、
  ただし通常より小さい diff で
```

### S-7: N+1 で本番のレスポンスが落ちた

**問** 「承認待ち一覧」の API が p95 5 秒になった。原因は N+1。どう対応？

**回答の骨組み:**

```
1. 緊急対応
   - includes / preload で N+1 解消
   - Bullet gem を本番では使えないので開発で常時 ON
   - Datadog で該当エンドポイントの slow query を確認

2. 根本対応
   a. N+1 検知のテストを書く（assert_queries で SQL 数を asserting）
   b. PR CI に Bullet を組み込む
   c. JSON serializer で includes 漏れが起きやすい関連を整理

3. それでも遅いケース
   - eager loading だと JOIN が巨大 → preload で複数クエリに分割
   - PostgreSQL の EXPLAIN ANALYZE で index 使用確認
   - キャッシュ層追加（Redis）

トレードオフ:
- includes は JOIN 一発で N+1 解消だがクエリが重くなる
- preload は 2 クエリで軽いがロードする ID 数が多いと in 句が肥大
- どちらを使うかは「データ量」と「関連の cardinality」で判断
```

### S-8: 監査ログの設計

**問** エンタープライズ向けで「誰が何をいつ操作したか」全部記録したい。設計は？

**論点:**
- 書き込み先: 同 DB / 別 DB / 別ストレージ（S3 / BigQuery）
- 書き込みタイミング: 同期 / 非同期
- 改ざん防止

**回答の骨組み:**

```
まず確認: 保持期間（法的要件）、検索要件、改ざん耐性レベル。

設計:
1. ストレージ: 同 DB に audit_logs テーブル + 
   定期的に S3 / BigQuery にアーカイブ
2. 書き込み: paper_trail gem / audited gem で ActiveRecord callback
   または application 層で明示的に AuditLog.record(...)
3. 改ざん防止:
   - audit_logs は UPDATE/DELETE 権限を DB role レベルで禁止
   - hash chain（前のレコードの hash を次のレコードに含める）で
     改ざん検出
4. パフォーマンス: 同期書き込みで「監査ログがなければ本番処理も失敗」
   が原則（漏れたら監査要件不充足）。ただし高頻度書き込みは
   Redis にバッファリング + バッチ flush の余地あり

トレードオフ:
- paper_trail は便利だが ActiveRecord callback 経由なので 
  bulk update では発火しない → bulk 操作禁止 or 手動記録
- 別 DB に書くと application 側で transaction を跨ぐ → 
  整合性が弱くなる
```

---

## 知識問題（一次面接で出やすい想定）

### Rails / Ruby

**Q: ActiveRecord の transaction で気をつけることは？**
- nested transaction の挙動（savepoint）
- after_commit と after_save の使い分け
- ロックの粒度（lock! / with_lock / pessimistic vs optimistic）
- 例外を rescue すると rollback されない罠

**Q: Sidekiq job の冪等性はどう担保する？**
- 一意キー（idempotency_key）を引数に含める
- 副作用のあるロジック側で「既に処理済みなら skip」を判定
- Sidekiq Pro の unique job 機能 / sidekiq-unique-jobs gem

**Q: ActiveRecord callback と Service object の使い分け**
- callback: モデル不変条件の維持（updated_at の更新など）
- Service object: 複数モデルにまたがるトランザクション、外部 API 連携
- callback で外部 API を叩くのはアンチパターン（rollback されない）

### PostgreSQL

**Q: インデックスをどう設計する？**
- WHERE / ORDER BY / JOIN で使う列に B-tree
- 複合インデックスは「使われる順」を意識（先頭列が等価条件で使われるか）
- LIKE 検索は pg_trgm + GIN
- ユニーク制約は ID 自動 index される

**Q: EXPLAIN ANALYZE の見方**
- Seq Scan vs Index Scan vs Bitmap Index Scan
- cost と actual time の乖離（統計情報の古さ）
- rows estimate と actual rows のズレ

**Q: トランザクション分離レベル**
- Read Committed（PG default）/ Repeatable Read / Serializable
- Phantom Read / Non-repeatable Read の違い
- 在庫管理など「同時更新」がある箇所は SELECT FOR UPDATE

### Elasticsearch

**Q: なぜ ES を使う?**
- 全文検索 + ファセット + 集計が高速
- PG の pg_trgm で代替できる場合もあるが、データ量が増えると ES 優位

**Q: index の更新戦略**
- リアルタイム: after_commit で Sidekiq job 経由
- バッチ: 夜間 reindex
- 部分更新: _update API で必要フィールドのみ

### システム設計

**Q: スケーラビリティを考えるとき何を見る?**
- ボトルネック: CPU / Memory / Network / Disk / DB connection
- 縦に伸ばす（垂直） vs 横に伸ばす（水平）
- ステートレス化 / キャッシュ層 / read replica / sharding の順

**Q: Heroku から AWS に移行するとして判断軸は?**
- コスト、運用負荷、スケール、リージョン要件
- kickflow は両方使っている → 既存資産活用しつつ部分移行が現実的

---

## モック想定問答（時間があれば）

EM 面接で頻出の組み合わせ:

1. 自己紹介（2 分）
2. freee での経験 + 印象に残るプロジェクト（5 分）
3. kickflow への志望動機（2 分）
4. **シナリオ問題 × 1〜2 個（S-1 / S-3 / S-5 あたり）**
5. **知識問題 × 3〜5 個**
6. 逆質問（3〜5 個）
