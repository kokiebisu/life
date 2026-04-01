# Design Doc: ギフトカード決済マイクロサービス — Coinmiles

**著者:** Ken Oki  
**ステータス:** リリース済み（2022年6月）  
**関連 PRD:** [ギフトカード仮想通貨キャッシュバック](./coinmiles-gift-card-prd.md)

---

## 概要

本ドキュメントは、Coinmiles プラットフォームにおけるギフトカード BTC キャッシュバック機能のバックエンドアーキテクチャを記述する。

**解決する問題:**  
ユーザーがアプリ内でギフトカードを購入すると、BTC キャッシュバックが付与される。しかし単純に実装すると以下の問題が起きる：

1. クレジットカード情報が自社サーバーを通ると PCI DSS スコープに入り、年次セキュリティ監査が必要になる（スタートアップ体制では維持不能）
2. 決済とキャッシュバック付与を同一トランザクションで処理すると、どちらかが失敗した際に状態が曖昧になる（二重請求・付与漏れのリスク）
3. ギフトカードプロバイダーの API キーは 30日で期限切れになるが、過去に 2回、失効を見落として本番停止が発生している
4. 実装当時のバックエンドチームは事実上 1名（CTO・リードエンジニアが同時退職後）であり、複雑な設計は保守不能になる

**これらを制約として、以下の設計目標を達成する:**
- PCI 非準拠環境での安全な決済（Stripe トークン化）
- 決済とキャッシュバックの分離（SQS 非同期）
- API キー失効の撲滅（EventBridge + Secrets Manager）
- 将来のプロバイダー変更への備え（Clean Architecture）

---

## SLO 定義

| SLI | SLO |
|-----|-----|
| 決済成功率 | ≥ 98% |
| キャッシュバック付与成功率 | ≥ 99.5% |
| キャッシュバック付与 P50 レイテンシ | < 30秒 |
| キャッシュバック付与 P99 レイテンシ | < 60秒 |
| DLQ 深度 | = 0（常時） |
| API キー期限切れ障害 | ゼロ |

---

## アーキテクチャ全体図

```
┌─────────────────────────────────────────────────────────────────┐
│ クライアント（React Native / Expo）                               │
│                                                                 │
│ ① Stripe SDK でカード入力（カードデータはデバイスでトークン化）    │
│    → stripePaymentMethodId のみが自社サーバーに送られる          │
└────────────────────────┬────────────────────────────────────────┘
                         │ POST /payments/gift-card
                         │ { paymentMethodId, productId, userId }
                         ▼
              API Gateway（TLS 1.2+、WAF）
                         │
                         ▼
         ┌───────────────────────────────┐
         │ Lambda: 決済サービス            │
         │ ─────────────────────────     │
         │ ② Secrets Manager → APIキー取得│（コールドスタート時のみ）
         │ ③ DynamoDB 冪等チェック         │
         │ ④ Stripe Payment Intent 作成  │
         │ ⑤ DynamoDB に pending 書き込み │
         │ ⑥ SQS にジョブ投入            │
         │ ⑦ クライアントに 200 を返す    │
         └───────────────────────────────┘
                         │
         ┌───────────────┘
         │ SQS FIFO キュー
         │ MessageDeduplicationId = payment_intent_id
         └───────────────┐
                         ▼
         ┌───────────────────────────────┐
         │ Lambda: キャッシュバックワーカー │
         │ ─────────────────────────     │
         │ ⑧ DynamoDB で冪等チェック      │
         │ ⑨ ConditionalUpdate で状態遷移 │
         │    (pending → processing)     │
         │ ⑩ ギフトカード API 呼び出し    │
         │ ⑪ BTC ウォレット付与          │
         │ ⑫ DynamoDB を completed に更新│
         └───────────────────────────────┘
                         │
         失敗（5回リトライ後）
                         ▼
              SQS Dead Letter Queue
              └── CloudWatch Alarm → PagerDuty

AWS Secrets Manager ←── EventBridge（毎月25日 09:00 JST）
              └── Lambda: キーローテーター
```

---

## 主要な設計判断と意思決定プロセス

### 1. なぜ Stripe Checkout ではなく Payment Intent を使うのか

**問題の発端:**  
最初のプロトタイプは Stripe Checkout を使っていた。実装が 3時間で終わり、PCI 準拠も自動的にクリアできた。しかしインターナルレビューで重大な問題が発覚した。

**React Native での Checkout の実際の挙動:**  
Stripe Checkout はブラウザの URL（`checkout.stripe.com`）にリダイレクトする。React Native では WebView でこのページを開くことになる。問題は：
- アプリの外に出るため「購入したのにアプリに戻れない」という UX 問題が頻発
- Expo の Deep Link 設定が複雑で、コールバック URL のハンドリングに追加 2週間かかることが判明
- WebView 内の Stripe ページは Coinmiles のデザインシステムと全く異なる見た目になる

**Payment Intent に切り替えた理由:**  
Stripe SDK（`@stripe/stripe-react-native`）を使うと、カード入力フォームをネイティブコンポーネントとして Coinmiles のアプリ内に埋め込める。カード番号・CVV は Stripe の SDK がデバイス側でトークン化し、自社サーバーには `paymentMethodId`（トークン文字列）のみが送られる。PCI 非準拠環境でもカードデータが自社を通らない。

**コスト:**  
Checkout（3時間） → Payment Intent（追加 4日）。この差を「UX の完全な制御」と「PCI 要件の両立」で正当化した。

**実際の効果:**  
決済フローがアプリを離れないため、チェックアウト完了率が Checkout プロトタイプより約 15% 高い（A/B テストではなく社内テスト 30名での比較）。

---

### 2. なぜキャッシュバックを非同期（SQS）で処理するのか

**最初の実装（同期処理）で起きた問題:**  
ステージング環境での負荷テスト中、以下のシナリオを再現した：
- Stripe の Payment Intent 確定成功（HTTP 200）
- ギフトカードプロバイダーの API がタイムアウト（5秒後に HTTP 504）
- Lambda がタイムアウト応答を返すと、クライアントはエラーとして処理
- ユーザーには「エラー」と表示される
- しかし Stripe では決済は成功している
- DynamoDB には中途半端な状態のレコードが残る

**この状態の問題:**  
ユーザーが「エラーだった」と思って再度購入ボタンを押すと二重請求になる。あるいは、実際には決済が成功しているにも関わらず「キャッシュバックが来ない」と CS に問い合わせる。エンジニアが手動で状態を確認して「実は成功していました、キャッシュバックを手動で付与します」という対応が必要になる。

週 5〜8件発生していた CS 問い合わせの大半がこのパターンだった。

**SQS 非同期化による解決:**  
決済サービスは「Stripe に Payment Intent を確定させ、SQS にジョブを投入」するだけでユーザーに 200 を返す。この処理は 100ms 以内に完了する。ギフトカード API が遅くても、落ちていても、決済フローには影響しない。

キャッシュバック付与は SQS ワーカーが非同期で処理する。失敗すれば自動リトライ、最終失敗は DLQ で可視化される。「决済成功・状態不明」という曖昧な状態がなくなる。

**ユーザー体験のトレードオフ:**  
「購入直後にキャッシュバックが見える」から「30秒以内に付与される」に変わる。ユーザーインタビュー（n=15）で「即時でなくても 1分以内なら問題ない」という回答が 93%だったため、このトレードオフは許容範囲と判断した。

---

### 3. なぜ DynamoDB を使うのか（RDS PostgreSQL との比較）

**最初の検討:**  
Coinmiles の既存サービスの一部は RDS（PostgreSQL）を使っていた。決済サービスも同じ RDS を使えばシンプルだという意見があった。

**Lambda と RDS の相性問題:**  
Lambda は同時実行数が最大 1,000（デフォルト）まで瞬時にスケールする。RDS への接続は 1接続につき約 5〜10MB のメモリをサーバー側で消費する。Lambda が 100 同時実行になると 100接続が発生し、RDS の最大接続数（db.t3.micro で 85接続）を超えてしまう。

解決策として RDS Proxy があるが、月額 $20〜30 の追加コストと、RDS Proxy 自体の設定・保守が必要になる。購入ボリュームが未知数の初期段階で、接続数問題への対処を最初から設計に組み込む必要があった。

**DynamoDB を選んだ理由:**  
- サーバーレスアーキテクチャとの親和性が高い（接続数の概念がない）
- アクセスパターンが「`payment_intent_id` で 1件取得」という単純なパターンのみ → DynamoDB の強み
- 購入ボリューム初期（月 数百件）でのコスト: DynamoDB ≈ 月 $1〜3、RDS（db.t3.micro）≈ 月 $15〜20 + バックアップ
- 既存の Coinmiles Lambda サービスが全て DynamoDB を使っており、チームの習熟コストがゼロ

**DynamoDB の制限と対応:**  
複雑なクエリ（例：「特定の期間の購入履歴を集計する」）が困難。これは DynamoDB Streams → Lambda → S3 でデータをエクスポートし、Athena でアドホック分析する設計で対応する（将来対応、V1 では手動確認）。

---

### 4. なぜ Clean Architecture を採用したのか

**採用を迷った理由:**  
1名のバックエンドエンジニアにとって、レイヤーを分けることはボイラープレートが増える。「シンプルに書いたほうが保守しやすい」という意見もある。実際、最初のプロトタイプは全ての処理を 1つの Lambda ハンドラーに書いていた。

**採用を決めた理由（実際の出来事が根拠）:**  
プロトタイプ実装の直後、ギフトカードプロバイダーから「API の認証フローを次のリリースで変更します。3週間後に移行してください」という通知が届いた。

プロトタイプ（モノリシックな Lambda ハンドラー）では、API 呼び出しのコードが複数の関数に散在しており、影響範囲の調査に半日かかった。Clean Architecture でインターフェースを切っていれば、`ProviderAClient.ts` だけを変更すれば済む。

この実体験をもとに「このプロバイダーはまた変更する」という前提で設計した。

**実際の効果:**  
リリース後 4ヶ月目に、プロバイダーが APIレスポンスのフィールド名を変更した。影響箇所が `ProviderAClient.ts` の 1ファイル・8行の変更で完結した。所要時間 約 2時間（vs 散在していた場合の推定 1〜2日）。

---

### 5. 決済状態の設計と冪等性の詳細

**なぜこれほど冪等性にこだわるのか:**  
Stripe の公式ドキュメントに「Webhookは最低 1回配信されます。重複配信が起きる可能性があります」と明記されている。これは「仕様」であり「バグ」ではない。決済システムは重複を前提に設計しなければならない。

**決済状態遷移の設計:**

```typescript
// 状態遷移: pending → processing → completed | failed
// ConditionalExpression を使ってアトミックな状態遷移を保証する

// なぜ processing 状態が必要か:
// pending → completed の 2状態だと、2つの Lambda が同時に処理を始めた場合、
// 両方が「pending だから処理する」と判断して二重処理が起きる可能性がある。
// processing という中間状態を入れることで「誰かが処理中」を表現できる。

async function transitionToProcesing(paymentIntentId: string): Promise<boolean> {
  try {
    await dynamodb.update({
      TableName: PAYMENTS_TABLE,
      Key: { pk: `PAYMENT#${paymentIntentId}` },
      UpdateExpression: "SET #status = :processing, updatedAt = :now",
      ConditionExpression: "#status = :pending",  // pending のときだけ更新可能
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":processing": "processing",
        ":pending": "pending",
        ":now": new Date().toISOString(),
      },
    }).promise();
    return true;  // 状態遷移成功 → 自分が処理する
  } catch (error) {
    if (error.code === "ConditionalCheckFailedException") {
      // 別の Lambda インスタンスが先に処理を始めた
      return false;  // 処理をスキップ（二重処理防止）
    }
    throw error;
  }
}

// SQS + DynamoDB の二重防御:
// Layer 1: SQS FIFO の MessageDeduplicationId（同じ payment_intent_id のメッセージを重複排除）
// Layer 2: DynamoDB ConditionalUpdate（Lambda が複数起動しても状態遷移で排他制御）
// どちらか片方が漏れても、もう片方で防御できる
```

**pending ← → processing の巻き戻し処理:**  
Lambda が processing 状態のまま死んだ場合（Lambda タイムアウト等）、SQS Visibility Timeout（30秒）後にメッセージが再配信される。再配信されたときに状態が processing のままになっているが、処理を開始してから 5分以上経過している場合は「処理が途中で死んだ」と判断して pending にリセットする：

```typescript
const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;  // 5分

async function processWithTimeoutCheck(paymentIntentId: string): Promise<void> {
  const record = await getPaymentRecord(paymentIntentId);

  if (record.status === "completed") return;  // 完了済みはスキップ

  if (record.status === "processing") {
    const processingDuration = Date.now() - new Date(record.updatedAt).getTime();
    if (processingDuration < PROCESSING_TIMEOUT_MS) {
      // まだ処理中かもしれない。スキップ（タイムアウトを待つ）
      return;
    }
    // 5分以上 processing のままは「処理が死んだ」とみなして pending にリセット
    await resetToPending(paymentIntentId);
  }

  const canProcess = await transitionToProcessing(paymentIntentId);
  if (!canProcess) return;

  // 実際の処理...
}
```

---

### 6. APIキー自動ローテーションの詳細設計

**なぜこれが必要なのか（根本原因の分析）:**  
2021年に 2回、APIキーの期限切れによる本番停止が発生した。どちらも「担当エンジニアが期限切れを知らなかった」ではなく「スプレッドシートに管理していたが、担当者が別のタスクに集中していて確認を忘れた」という人的ミス。

「チームのプロセスを改善する」という選択肢もあったが、プロセスは属人的で長続きしない。技術的に自動化することで人間の注意力に依存しない仕組みにした。

**ローテーション Lambda の詳細:**

```typescript
// Lambda: キーローテーター（毎月25日 09:00 JST に EventBridge から起動）
// 期限は月末（30日）。25日に更新することで 5日間のバッファを確保。

export const handler = async (): Promise<void> => {
  const secretsManager = new AWS.SecretsManager({ region: "us-east-1" });

  // 1. 現在のクライアント証明書を Secrets Manager から取得
  //    （証明書は別途、長期有効な別シークレットとして管理）
  const certSecret = await secretsManager.getSecretValue({
    SecretId: "coinmiles/gift-card-provider/client-cert"
  }).promise();
  const { cert, key } = JSON.parse(certSecret.SecretString!);

  // 2. クライアント証明書でプロバイダー API に認証して新しい API キーを取得
  //    ※ プロバイダー独自のフロー（標準 OAuth ではない）
  const httpsAgent = new https.Agent({ cert, key });
  const response = await axios.post(
    "https://api.giftcardprovider.com/auth/refresh",
    {},
    { httpsAgent, timeout: 10000 }
  );
  const newApiKey = response.data.api_key;

  // 3. 新しい API キーを Secrets Manager に書き込む
  await secretsManager.updateSecret({
    SecretId: "coinmiles/gift-card-provider/api-key",
    SecretString: JSON.stringify({ apiKey: newApiKey, rotatedAt: new Date().toISOString() }),
  }).promise();

  // 4. 成功ログ（CloudWatch Logs で確認可能）
  console.log(JSON.stringify({
    event: "api_key_rotated",
    rotatedAt: new Date().toISOString(),
    nextRotation: "次の月の25日",
  }));
};
```

**なぜ 25日に設定するのか:**  
プロバイダーの API キーは毎月 1日に期限切れになる（毎月1日に新しいキーが発行される）。25日に更新することで、ローテーション失敗時に最大 5回（25, 26, 27, 28, 29日）のリトライが可能。EventBridge は失敗時に 1時間後に最大 3回リトライするが、それでも失敗した場合は CloudWatch Alarm → PagerDuty で翌日中には人間が気付ける。

**アプリケーション側でのキーキャッシュ:**

```typescript
// なぜ Lambda コールドスタート時のみ Secrets Manager を呼ぶのか
//
// Secrets Manager の呼び出しは:
// - レイテンシ: 50〜100ms（同一リージョン）
// - コスト: $0.05 / 10,000 API コール
// - 月間呼び出し数（推定）: コールドスタート 200回程度 → $0.001 以下
//
// ウォームスタート（コンテナが再利用される場合）では
// グローバル変数にキャッシュされたキーを使う。
// ローテーション後は次のコールドスタートで自動的に新しいキーを取得。
//
// 「ウォーム時に古いキーを使い続けるリスク」: 30日の有効期限があるため、
// Lambda コンテナが 30日以上再利用されることはまずない（AWS の仕様上も非現実的）。

let cachedApiKey: string | null = null;

export async function getGiftCardApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey;

  const secretsManager = new AWS.SecretsManager({ region: "us-east-1" });
  const secret = await secretsManager.getSecretValue({
    SecretId: "coinmiles/gift-card-provider/api-key"
  }).promise();

  cachedApiKey = JSON.parse(secret.SecretString!).apiKey;
  return cachedApiKey;
}
```

---

## データモデルの詳細

```typescript
// DynamoDB: payments テーブル
// アクセスパターン: payment_intent_id で 1件取得（PK のみ）
// ユーザー別の履歴取得: userId をソートキーにした GSI で対応

interface PaymentRecord {
  pk: string;          // PAYMENT#{paymentIntentId}  ← パーティションキー
  sk: string;          // USER#{userId}              ← ソートキー（GSI 用）

  status: "pending" | "processing" | "completed" | "failed";

  // 決済情報
  stripePaymentIntentId: string;
  amountCAD: number;         // セント単位（5000 = $50.00）
  giftCardProductId: string;

  // キャッシュバック情報
  btcCashbackSatoshis: number;  // 1 BTC = 100,000,000 Satoshi
  giftCardRedemptionCode?: string;  // 付与後に設定

  // デバッグ情報
  processingStartedAt?: string;  // processing に遷移した時刻
  completedAt?: string;
  errorMessage?: string;         // failed 時の原因

  // メタデータ
  createdAt: string;    // ISO 8601
  updatedAt: string;
  ttl: number;          // 90日後に自動削除（= Math.floor(Date.now() / 1000) + 90 * 86400）
                        // 理由: 90日以上前の決済記録は返金対応が不要。保存コスト削減
}

// GSI 定義（userId でユーザーの購入履歴を取得するため）
// GSI: UserPurchaseHistory
//   Partition Key: sk（= USER#{userId}）
//   Sort Key:      createdAt
```

**TTL の設計意図:**  
90日後に自動削除するのは DynamoDB のコスト削減のため。Stripe 側には永続的に決済記録が残るため、90日超の問い合わせは Stripe Dashboard で対応できる。「ユーザーの購入履歴を永続的に保持する」ビジネス要件がない限り、TTL で削除するのがサーバーレスでは一般的。

---

## 障害モード分析

| 障害モード | 障害の根本パターン | 影響 | 設計上の対策 | 残存リスク |
|-----------|-----------------|------|------------|----------|
| 決済成功 → SQS 投入失敗 | Lambda のメモリ不足・タイムアウト | キャッシュバック付与漏れ | Lambda が 500 を返す → Stripe が Webhook を再配信 → SQS 再投入 | Webhook の最大待機時間（Stripe は 72時間以内に再配信。その間ユーザーはキャッシュバックを受け取れない）|
| SQS ワーカーが同一メッセージを複数処理 | SQS Visibility Timeout 内に処理完了できなかった | 二重キャッシュバック | DynamoDB ConditionalUpdate で排他制御 | ConditionalUpdate と ギフトカード API 呼び出しの間に Lambda が死んだ場合、ギフトカードが発行されたがキャッシュバックが未付与の可能性（ギフトカード API に冪等キーを渡すことで対応） |
| ギフトカード API が完全停止 | プロバイダー側の障害 | 購入不可 | DLQ で蓄積。復旧後に自動再処理 | 復旧が 72時間を超えると Stripe 側でタイムアウト（払い戻しが必要） |
| API キーが期限切れ | EventBridge のローテーション失敗 | ギフトカード API への全リクエストが 401 | EventBridge 3回リトライ → PagerDuty | PagerDuty 通知後に人間が対応するまでの数分〜数時間の停止 |
| Redis 停止 | 該当なし（このサービスは Redis を使わない） | なし | — | — |

---

## 検討したが採用しなかった設計（詳細な却下理由）

| 選択肢 | 詳細な却下理由 |
|--------|--------------|
| **Stripe Checkout** | React Native での WebView リダイレクトが UX を破壊する。コールバック URL の Deep Link 設定の複雑さ（追加 2週間）と比較して、Payment Intent の追加実装コスト（4日）が正当化される。PCI は両方とも問題なし |
| **同期処理（キャッシュバック付与を待ってから 200 を返す）** | ステージング環境での実証で「決済成功・付与状態不明」という曖昧状態を再現できた。CS 問い合わせの根本原因を技術的に排除できる唯一の設計が非同期化。ユーザーへの遅延（< 60秒）はインタビューで許容されている |
| **AWS Step Functions** | ステートマシンは「SQS 投入 → ワーカー処理」という 2ステップに対して複雑すぎる。Step Functions の学習コスト・デバッグの複雑さが、1名のチームには過大。SQS + DynamoDB の組み合わせで同等の保証が得られる |
| **RDS PostgreSQL** | Lambda との接続数問題（最大 85接続に対して Lambda が瞬時に数百スケールするリスク）。RDS Proxy（月 $20〜30）を追加しても、DynamoDB の費用対効果（< $5/月）には勝てない。アクセスパターンが単純な PK 検索のみなので、SQL のメリットがない |

---

## パフォーマンス実測値

| メトリクス | 目標 | リリース後 1ヶ月の実測値 |
|-----------|------|----------------------|
| 決済 Lambda P50 | < 500ms | **320ms** |
| 決済 Lambda P99 | < 2,000ms | **1,100ms**（コールドスタート込み） |
| キャッシュバック付与 P50 | < 30秒 | **8秒** |
| キャッシュバック付与 P99 | < 60秒 | **42秒** |
| DLQ 深度（初月累計） | 0件 | **0件** |
| Secrets Manager コールドスタートオーバーヘッド | < 200ms | **80ms** |
| キーローテーション成功率（3ヶ月） | 100% | **100%（3/3回成功）** |
