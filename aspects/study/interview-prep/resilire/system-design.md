# Resilire 技術面接 システム設計 対策

> **進捗管理 → [tracker.md](tracker.md)**
> チェックを入れる基準: 声に出して通しで話せる状態（ノートなし）

---

## シニアレベルで語るために

| 普通の答え | シニアの答え |
|-----------|-----------|
| 「キューを使います」 | 「ピーク時に10万通/分を捌くため非同期キューを導入。Workerはオートスケール。DB書き込みはON CONFLICT DO NOTHINGで冪等性を担保します」 |
| 「Redisでキャッシュします」 | 「施設情報は月1回しか更新されないのにread頻度は高い。TTL1時間のキャッシュでDB負荷を90%削減できます。ただし施設更新時に関連するquadkeyを明示的にINVALIDATEする必要があります」 |
| 「スケールします」 | 「現在10万ユーザー・1000QPS想定。Workerをステートレスに設計し水平スケールできます。ボトルネックはDB。Read Replicaを追加し、将来的にはCQRSでRead/Writeを分離します」 |

**面接で必ず言うべきこと:**
1. **数字を出す** — ユーザー数・QPS・レイテンシ要件
2. **トレードオフを言う** — 「〇〇を選びました、代わりに△△が必要です」
3. **障害時を考える** — 「このコンポーネントが落ちたら？」
4. **ADRスタイル** — 「〇〇を選びました。理由は△△。××も検討しましたが□□で不採用」

---

## 回答フレームワーク（5ステップ）

```
① 要件確認     2〜3分  ← 絶対飛ばさない
② スケール感   2分    ← 数字を出す
③ 全体設計     5〜7分  ← コンポーネントとその理由
④ 深掘り       5〜10分 ← 自分が一番語れる部分から入る
⑤ ボトルネック  2〜3分  ← 弱点と改善案をセットで言う
```

### ① 要件確認（最重要・面接官はここを見ている）

聞かずに設計すると的外れになる。シニアほど丁寧に確認する。

```
必ず聞くこと:
- 対象ユーザー数・企業数（スケール感）
- レイテンシ要件（リアルタイム？バッチでOK？）
- 可用性要件（99.9%？99.99%？）
- 冪等性が必要か（同じ操作を2回やったら？）
- 既存システムとの統合はあるか
```

### ② スケール感（数字の出し方）

正確でなくていい。オーダー感が大事。

```
例: 通知システム
- ユーザー: 1000社 × 100人 = 10万ユーザー
- 通常通知: 10万通/日 = 約70通/分
- ピーク: 大規模災害で全員に一斉送信 = 10万通/分
→ 「バッチでは無理、非同期キューが必要」という判断に使う

ストレージ見積もり:
- 通知1件 = 約1KB
- 1日10万件 = 100MB/日
- 1年 = 36GB → RDBで十分、シャーディング不要
```

### ③ 全体設計（コンポーネントとその理由を言う）

```
Client → API Gateway → Service → Message Queue → Worker → 外部サービス
                          ↓
                         DB (PostgreSQL)
                          ↓
                        Cache (Redis)
```

**各コンポーネントの「なぜ」を言える:**
- API Gateway → レート制限・認証の一元管理
- Message Queue → ピーク吸収・Worker障害時の再試行
- Cache → DB負荷削減・レイテンシ改善
- Read Replica → 読み取り負荷の分散

---

## 問題1：災害アラート通知システム（最重要）

**お題:** 「自然災害発生時に、影響を受けるサプライチェーン施設を持つ企業に即時アラートを送るシステムを設計してください」

### ① 要件確認

```
機能要件:
- 気象庁データをリアルタイムで取得（震度・台風・洪水）
- 施設の位置情報と被災エリアを地理的に照合
- メール・Slack・SMS等で通知

非機能要件:
- 震度6発生から5分以内に通知（レイテンシ）
- 同じアラートを二重送信しない（冪等性）
- Resilireのサービス自体が災害で落ちてはいけない（BCP）
- 可用性 99.99%（1年で約1時間のダウンのみ許容）
```

### ② スケール感

```
ユーザー: 1000社 × 100人 = 10万人
施設数: 1社あたり100施設 × 1000社 = 10万施設
ピーク: 大規模地震 → 10万通を5分以内 = 約2万通/分 = 333通/秒
```

### ③ 全体設計

```
[気象庁API/XMLフィード]
       ↓ Polling (1分間隔) or Webhook
[Crawler Service（シングルインスタンス）]
       ↓
[Pub/Sub Topic: "disaster-events"]
       ↓
[Alert Processor]
  - PostGISで施設と被災エリアを地理的照合
    ST_DWithin(facility.location, disaster.area, radius)
  - 影響企業・施設を特定
  - 送信メッセージ生成
       ↓
[通知キュー（Pub/Sub）]  ← チャンネル別にトピックを分ける
  ├─ email-queue  → [Email Worker] → SendGrid
  ├─ slack-queue  → [Slack Worker] → Slack API
  └─ sms-queue   → [SMS Worker]   → Twilio
       ↓
[DB: alert_logs]  ← 冪等性チェック
```

### ④ 深掘り：冪等性（二重送信防止）

```sql
-- ON CONFLICT DO NOTHING で同じアラートを1回しか送らない
INSERT INTO alert_logs (disaster_id, company_id, channel, sent_at)
VALUES (:disaster_id, :company_id, :channel, NOW())
ON CONFLICT (disaster_id, company_id, channel) DO NOTHING;

-- インデックス
CREATE UNIQUE INDEX idx_alert_logs_unique
ON alert_logs(disaster_id, company_id, channel);
```

> 「Workerが複数起動していても、DB側のUNIQUE制約で冪等性を保証します。アプリ側のチェックだけでは競合状態で二重送信が起きます」

### ④ 深掘り：BCP（Resilireが最重視）

```
- 東京・大阪の2リージョンで稼働（Active-Active）
- Pub/SubはマネージドサービスでSLA 99.95%
- DBはCloud SQLのレプリケーション（クロスリージョン）
- Crawlerはシングルだがそこが落ちても気象庁APIを直接ポーリングするフォールバック
```

> 「Resilireさんが東京・大阪2拠点でBCPを徹底されていますが、自分もEKS移行でゼロダウンタイムのクラスタ統合をやった経験があります。有事に止まらないシステムの設計は、普段のデプロイからその考え方が必要だと思っています」

### ⑤ ボトルネックと改善案

```
問題1: 大規模災害で10万通が同時発生
→ Worker をオートスケール（Cloud Run / Kubernetes HPA）
→ チャンネル別にWorkerを分けてSendGrid障害がSlackに影響しないよう分離

問題2: 気象庁APIのレート制限
→ Crawlerをシングルにして内部Pub/Sub経由で配信
→ ポーリング間隔は1分（気象庁の更新頻度に合わせる）

問題3: 地理的照合クエリが重い
→ PostGISのインデックス（GiSTインデックス）
→ 施設情報はメモリキャッシュ（更新頻度が低いため）
```

### 面接官の深掘り質問（準備しておく）

| 質問 | 答え方 |
|-----|-------|
| 「Crawlerが落ちたら？」 | ヘルスチェック + 自動再起動。気象庁はポーリングなので多少の遅延は許容範囲内。重要度に応じてWatchdogを別プロセスで立てる |
| 「同じ施設に複数の災害が同時発生したら？」 | disaster_id で分けているので各災害ごとに独立して処理される |
| 「通知ユーザーが1000万人になったら？」 | Workerを増やしても送信APIのレート制限が先にヒットする。SendGridの上限に合わせてWorker数を管理。最終的にはマルチSendGridアカウントで分散 |

---

## 問題2：大量データのインポート/エクスポート

**お題:** 「サプライチェーンデータを企業がCSV/Excelでインポートできる機能を設計してください。数万行のデータも想定」

### ① 要件確認

```
- ファイル形式: CSV, Excel (.xlsx)
- 最大サイズ: 10万行 / 50MB
- 進捗表示: リアルタイムで何件処理したか見たい
- エラー処理: 一部エラーがあっても続行して、エラー行を後で確認したい
- 冪等性: 同じファイルを2回インポートしたら？（重複チェック必要）
```

### ② スケール感

```
1社あたり月1〜数回のインポート
同時インポート: 最大50社が同時 = 50ジョブ並行
1ジョブ: 10万行 × 100ms/行 = 1000秒 → 非同期必須
```

### ③ 全体設計

```
[Client]
  → POST /imports（マルチパートでファイル送信）
       ↓
[API Server]
  1. ファイルサイズ・形式の簡易バリデーション（同期）
  2. Cloud Storage (GCS/S3) にファイル保存
  3. import_jobs テーブルにレコード作成（status: pending）
  4. ジョブID をクライアントに返す（即時レスポンス）
       ↓
[Pub/Sub: import-jobs]
       ↓
[Import Worker]
  1. ファイルをストリーミングで読む（メモリ節約）
  2. 1000行ずつバリデーション + DBへバルクインサート
  3. processed_rows を定期更新
  4. エラー行は import_job_errors に記録
       ↓
[Client] → GET /imports/:id でポーリング or WebSocket
```

### ④ 深掘り：なぜ非同期か

> 「10万行のCSVを同期処理すると最悪数分かかり、タイムアウトします。ジョブIDを即座に返し、クライアントにポーリングさせることでUXを損なわず処理できます。Workerが途中でクラッシュしても、ジョブステータスから処理済み行がわかるので再開できます」

### ④ 深掘り：冪等なインポート設計

```go
// 1000件ずつチャンクで処理
const chunkSize = 1000
for i := 0; i < len(rows); i += chunkSize {
    end := min(i+chunkSize, len(rows))
    chunk := rows[i:end]

    if err := db.BulkInsert(ctx, chunk); err != nil {
        // エラー行を記録して続行
        recordErrors(jobID, i, chunk, err)
    }
    // 進捗を更新
    updateProgress(jobID, i+len(chunk))
}
```

### ⑤ ボトルネックと改善案

```
問題1: 同時50ジョブでDB書き込みが競合
→ Worker当たりの同時接続数を制限（semaphore）
→ バルクインサートで1SQLの行数を最適化（1000行/回）

問題2: 大きいExcelファイルのパースがメモリを使う
→ ストリーミングパーサーを使う（xlsx.Reader のストリームモード）
→ Workerのメモリ上限を設定してOOMを防ぐ

問題3: エクスポートも必要（DB → CSV）
→ バックグラウンドジョブで生成 → GCSに保存 → 署名付きURLをメール送信
→ 大量データは事前バッチ生成（毎日深夜にキャッシュ）
```

### 面接官の深掘り質問

| 質問 | 答え方 |
|-----|-------|
| 「インポート中にWorkerがクラッシュしたら？」 | import_jobs.processed_rows から再開。バルクインサートはUPSERT（ON CONFLICT UPDATE）で冪等にする |
| 「同じファイルを2回インポートしたら？」 | ファイルハッシュをjobsテーブルに保存。同一ハッシュは警告して確認を促す |
| 「エクスポートのボリュームが大きい場合は？」 | 深夜バッチで事前生成。GCSのSignedURLで直接ダウンロードさせてAPIサーバーを介さない |

---

## 問題3：キャッシュ戦略（地図表示）

**お題:** 「地図上に大量のサプライヤー施設をリアルタイムで表示する機能を設計してください」

### ① 要件確認

```
- 施設数: 1社あたり最大1万件、全体では100万件規模
- 更新頻度: 施設情報は月1回程度の更新
- レイテンシ: 地図操作時に1秒以内
- 同時接続: 100ユーザーが同時に地図を操作
```

### ② スケール感

```
100万施設 × 1件1KBのGeoJSON = 1GB
キャッシュに全部乗らない → タイル分割して必要な部分だけ
地図ズームレベル別のquadkeyでキャッシュ → 数万タイル
```

### ③ 全体設計

```
[Client: 地図ズーム・スクロール]
  → クライアントのviewportに対応するquadkeyを送信
       ↓
[BFF]
  Redis: quadkey → GeoJSON のキャッシュある？
      ↓ Hit → GeoJSON を返す（< 5ms）
      ↓ Miss → Backend に問い合わせ
               ↓
          [Backend: PostGIS]
            ST_Within(facility.location, quadkey.bounds) で施設取得
            GeoJSON に変換
               ↓
          Redis にキャッシュ（TTL: 1時間）
```

### ④ 深掘り：なぜサーバー側でキャッシュするか（ADRスタイル）

> 「3つの選択肢を検討しました。①クライアントで計算: 全施設データを送るのでネットワーク転送量が増える。②リクエストごとにPostGISクエリ: 100万施設に対するST_Withinが重い。③サーバーキャッシュ: 施設情報の更新頻度が月1回と低いのでヒット率が高い。③を選びました。判断基準は『更新頻度×読み取り頻度×キャッシュ失効コスト』です」

### ④ 深掘り：Cache Invalidation

```python
# 施設情報を更新したとき
def update_facility(facility_id, new_data):
    db.update(facility_id, new_data)

    # この施設が含まれるquadkeyを全て無効化
    affected_quadkeys = get_quadkeys_for_facility(facility_id)
    for qk in affected_quadkeys:
        redis.delete(f"quadkey:{qk}")

    # または: 施設更新テーブルをポーリングしてバックグラウンドで無効化
```

> 「Cache Invalidationは3大難問の1つです。施設更新と同一トランザクション内でキャッシュ削除すると、DBがロールバックしてもキャッシュは消えてしまいます。2フェーズコミットは重いので、DBトランザクション成功後にキャッシュ削除するイベント駆動にしています」

### ⑤ ボトルネックと改善案

```
問題1: 施設情報を大量更新した後（インポート後）のcold start
→ Cache Warm-up: インポート完了後に主要quadkeyを非同期でプリロード

問題2: 人気エリア（東京・大阪）のquadkeyだけ集中
→ Redis Cluster でシャーディング。ただし100万施設規模では不要

問題3: PostGISのST_Withinが遅い
→ GiSTインデックスを施設のlocation列に作成
→ ズームレベル別にデータを事前集計（タイルサーバーパターン）
```

---

## 問題4：URLショートナー

**お題:** 「bit.lyのようなURL短縮サービスを設計してください」

### ① 要件確認

```
- URLを短縮してhttps://res.il/AbCd のようなURLを作る
- 短縮URLにアクセスすると元のURLにリダイレクト
- アクセス統計（クリック数・リファラ・地域）を記録したい
- スケール: 1日100万URL作成、1000万クリック
- 短縮URLの有効期限はあるか（今回はなし）
```

### ② スケール感

```
Write: 1日100万 = 12 writes/秒 → 少ない
Read: 1日1000万 = 115 reads/秒 → Read重視
URLの総数: 5年で18億件 → UUID的なIDが必要

Read:Write = 1000:1 → Read最適化が重要
```

### ③ 全体設計

```
[CREATE] POST /urls { url: "https://..." }
  → ID生成（Base62エンコード: 7文字 = 62^7 = 3.5兆通り）
  → DB保存: urls(id, original_url, created_at)
  → レスポンス: { short_url: "https://res.il/AbCd123" }

[REDIRECT] GET /AbCd123
  → Redisキャッシュチェック（TTL: 24時間）
  → Cache Miss → DB lookup → Redisに書く
  → 301/302リダイレクト
  → 統計記録（非同期: Pub/Sub → Analytics Worker → ClickHouse）
```

### ④ 深掘り：IDの生成方法（ADRスタイル）

> 「4つの方法を検討しました。①MD5ハッシュ: 衝突が起きうる。②UUIDv4: 長すぎる。③自動採番+Base62: シンプルだがDBが単一障害点。④分散ID（Snowflake型）: スケールするが複雑。今回は③を選びました。DB採番はPostgreSQLのSERIALで、ボトルネックになったらSharding-approachに切り替えます」

### ④ 深掘り：301 vs 302 リダイレクト

> 「301（恒久的）はブラウザがキャッシュするのでサーバー負荷が減りますが、元URLを変更してもブラウザがキャッシュを持ち続けます。統計を記録したい場合もブラウザを経由しないので計測できません。302（一時的）はブラウザがキャッシュしないので毎回サーバーを通り、統計が取れます。今回は統計要件があるので302を選びます」

### ⑤ ボトルネックと改善案

```
Read(リダイレクト)が大部分 → Redis Cache で対応
Writeは少ない → DBのボトルネックにはなりにくい

将来的に1日10億クリックになったら:
- Redisクラスタでキャッシュを分散
- CDNエッジでリダイレクトを処理（Cloudflare Workers等）
- 統計はClickHouseやBigQueryに集約（OLTPとOLAPを分離）
```

---

## 問題5：リアルタイム通知システム

**お題:** 「Resilireのプロダクトで、サプライヤー情報が変更されたときにユーザーにリアルタイムで通知する機能を設計してください」

### ① 要件確認

```
- トリガー: サプライヤー情報の変更・リスクスコア変動・災害アラート
- 配信先: メール、アプリ内通知（WebSocket）、Slack
- ユーザーはチャンネルごとにON/OFF設定できる
- 未読/既読の管理が必要
- 送信失敗時はリトライする（最大3回）
- 同じ通知を二重送信しない
```

### ② スケール感

```
通知生成: 1分あたり最大1万件（大量更新インポート後）
配信: 1通知 × 複数チャンネル = 平均2配信/通知 → 2万配信/分
リトライ考慮: ×1.5 = 3万件/分 = 500件/秒
```

### ③ 全体設計

```
[イベントソース]
  - サプライヤー更新 API
  - 災害アラートシステム
  - スコア計算バッチ
       ↓
[Pub/Sub: notification-events]
       ↓
[Notification Service]
  1. ユーザー通知設定を参照（Redisキャッシュ）
  2. 配信対象ユーザー・チャンネルを決定
  3. notification_deliveries テーブルに INSERT（pending）
  4. チャンネル別Queueに発行
       ↓
[チャンネル別 Worker]
  email-worker  → SendGrid
  ws-worker     → WebSocket管理サーバー → クライアント
  slack-worker  → Slack API
       ↓
  成功: status = 'sent', sent_at = NOW()
  失敗: retry_count++, next_retry_at = NOW() + exponential_backoff
```

### ④ 深掘り：WebSocketのスケーリング

```
問題: WebSocketはステートフル（特定サーバーと接続）
     → Workerが複数台あると、どのWorkerが誰に繋がっているか不明

解決:
[ws-worker] → Pub/Sub "ws-{user_id}" → [接続サーバー] → Client

各接続サーバーはRedisのSubscriberに登録
ws-workerはuser_idに対応するチャンネルにPublish
→ 接続サーバーは特定のuser_idからのメッセージをサブスクライブしているので転送できる
```

### ④ 深掘り：リトライとExponential Backoff

```sql
-- リトライ待ちの配信を取得するクエリ
SELECT * FROM notification_deliveries
WHERE status = 'pending'
  AND next_retry_at <= NOW()
  AND retry_count < 3
ORDER BY next_retry_at ASC
LIMIT 100;

-- Partial Index でスキャン範囲を最小化
CREATE INDEX idx_pending_deliveries ON notification_deliveries(next_retry_at)
WHERE status = 'pending' AND retry_count < 3;
```

```
Exponential Backoff:
1回目失敗 → 1分後リトライ
2回目失敗 → 4分後リトライ
3回目失敗 → status = 'failed', ユーザーに通知
```

### ⑤ ボトルネックと改善案

```
問題1: 通知設定の読み取りが毎回DB
→ Redisに通知設定をキャッシュ（TTL: 5分）
→ 設定変更時にキャッシュを即座にINVALIDATE

問題2: 一括インポート後に大量通知が発生
→ バッチ処理後の通知は「今すぐ」ではなく「N分後にまとめて」に変更可能
→ ユーザー設定でダイジェストモード（1日1回まとめて）を選択できるよう設計

問題3: Slackがレート制限（1/秒）
→ Slack専用のレートリミッターを実装
→ Tiers: 重要通知は即時、通常通知はキューで制限
```

### 面接官の深掘り質問

| 質問 | 答え方 |
|-----|-------|
| 「通知の重複を防ぐには？」 | notification_deliveries に UNIQUE制約 (notification_id, user_id, channel)。INSERT ON CONFLICT DO NOTHING |
| 「SendGridが全断したら？」 | Circuit Breakerでフォールバック先（Amazon SES）に切り替え。n分後に自動復旧チェック |
| 「通知がリアルタイムである必要はあるか？」 | 災害アラートは5分以内必須。通常変更通知は数分以内で十分。優先度別にQueueを分ける |

---

## キーワード集（シニアが使う言葉）

| キーワード | シニアの使い方 |
|-----------|-------------|
| 冪等性 | 「同じ操作を2回やっても結果が変わらない。ON CONFLICT DO NOTHINGで担保」 |
| Backpressure | 「Workerの処理速度より発生速度が速いとキューが溢れる。Workerのスケールアウトで対応」 |
| Circuit Breaker | 「外部APIが落ちたとき自動でフォールバック。Resilience4jや自前実装で状態を管理」 |
| CQRS | 「Read/Writeでモデルを分離。Writeは正規化されたDB、Readは非正規化されたViewを使う」 |
| Eventual Consistency | 「分散システムで即座の整合性を諦める代わりにスケールを得る。通知の遅延は許容できるが在庫は許容できない」 |
| Cache Invalidation | 「3大難問。更新時に関連キャッシュを削除。2フェーズコミットは重いのでイベント駆動で対応」 |
| Graceful Shutdown | 「実行中のリクエストを完了させてから停止。`signal.NotifyContext` でSIGTERMを受け取る」 |
| Back-pressure | 「上流が速すぎる場合に下流が『遅くして』とシグナルを返す設計」 |

---

## 10日スケジュール（システム設計）

| 日 | テーマ | 目標 |
|----|--------|------|
| 1 | 5ステップフレームワーク | 手順を暗記して体に染み込ませる |
| 2 | 問題4: URLショートナー | 最もシンプルな問題で型を練習 |
| 3 | 問題5: 通知システム | チャンネル分離・リトライ設計 |
| 4 | 問題1: 災害アラート | Resilireのコアドメインを設計 |
| 5 | 問題2: インポート | 非同期ジョブ設計 |
| 6 | 問題3: キャッシュ戦略 | PostGIS + Redis の組み合わせ |
| 7 | 問題1〜3を声に出して通し | ノートなしで5分話せるか |
| 8 | 問題4〜5を声に出して通し | 深掘り質問に答えられるか |
| 9 | 未知のお題を自力で解く | 5ステップを白紙から実践 |
| 10 | 全問を模擬面接形式で | 面接官に見立てて深掘り質問 |
