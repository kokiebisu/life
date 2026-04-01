# Design Doc: freee Eラーニング — freee株式会社

**著者:** Ken Oki（プロダクトリード）  
**ステータス:** リリース済み（2026年2月12日）  
**関連 PRD:** [freee Eラーニング](./freee-elearning-prd.md)  
**レビュアー:** freee PSIRT、基盤チームアーキテクト、OEM 提供元

---

## 概要と設計原則

本ドキュメントは freee Eラーニングのシステムアーキテクチャを記述する。3名のエンジニアチームが 7ヶ月でゼロから立ち上げたプロダクト。

**設計を決定づけた 3つの制約:**

1. **チーム規模:** エンジニア 3名（うち 24卒・25卒の 2名はジュニア）。過度に複雑な設計は保守不能になる
2. **OEM の制約:** リアーキ中のプロバイダーは大きな仕様変更に応じられない。freee 側が OEM の制約に合わせる必要がある
3. **セキュリティ要件:** freee PSIRT が定義した「なりすまし防止」の要件は絶対条件。妥協不可

**設計のゴール:**  
上記 3制約の中で、なるべくシンプルに「動くプロダクト」を作る。スタンドアロンの美しいアーキテクチャより、3名で保守できるモジュール統合を選ぶ。

---

## SLO 定義

| SLI | SLO |
|-----|-----|
| OIDC 認証成功率 | ≥ 99.9% |
| 従業員データ同期成功率 | ≥ 99.5% |
| 一括インポート完了時間（1,000名） | ≤ 20分 |
| OEM API Rate Limit 超過エラー率 | < 0.1% |
| freee 人事労務本体への可用性影響 | 0%（Eラーニング障害が本体に波及しない） |

---

## アーキテクチャ全体図

```
┌───────────────────────────────────────────────────────────────┐
│ freee 人事労務（Rails モノリス、AWS EKS 上）                    │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ Elearning:: モジュール（Rails Engine）                    │  │
│  │                                                         │  │
│  │ コントローラー:                                          │  │
│  │   ElearningController（一覧・受講状況・設定）              │  │
│  │   OidcController（認証フロー・コールバック）               │  │
│  │   ImportController（一括インポートの開始・進捗確認）        │  │
│  │                                                         │  │
│  │ モデル（Elearning 固有テーブル）:                         │  │
│  │   Elearning::EmployeeAccount（OEM との紐付け）            │  │
│  │   Elearning::OemSyncBatch（一括インポートの進捗）          │  │
│  │   Elearning::OidcSession（OIDC フローのセッション管理）    │  │
│  └────────────────────────┬────────────────────────────────┘  │
│                           │                                   │
│  ┌────────────────────────▼────────────────────────────────┐  │
│  │ 共通リソース（人事労務と共有）                              │  │
│  │   Employee モデル（従業員マスタ）                          │  │
│  │   Company モデル（事業所マスタ）                           │  │
│  │   Devise セッション（認証）                               │  │
│  └────────────────────────┬────────────────────────────────┘  │
│                           │                                   │
│  ┌────────────────────────▼────────────────────────────────┐  │
│  │ 非同期ジョブ（Sidekiq、Redis）                             │  │
│  │   Elearning::OemAccountCreateJob（アカウント作成）         │  │
│  │   Elearning::OemAccountUpdateJob（アカウント更新）         │  │
│  │   Elearning::OemAccountDeactivateJob（無効化）            │  │
│  └────────────────────────┬────────────────────────────────┘  │
│                           │                                   │
└───────────────────────────┼───────────────────────────────────┘
                            │ HTTP（社内 VPC 内）
                            ▼
                  OEM 提供元プラットフォーム
                  ├── アカウント管理 API（Rate Limit: 100 req/分）
                  ├── 受講状況取得 API
                  └── OIDC Authorization Server
```

---

## 主要な設計判断と意思決定の詳細

### 1. なぜモジュール統合（Rails Engine）を選んだのか

**この選択が最初に問われた理由:**  
プロジェクト開始時、基盤チームから「Eラーニングをスタンドアロンサービスとして構築することを推奨する」という意見が出た。「freee 人事労務の既存コードに新プロダクトのコードが混ざるのは責務が不明確になる」という主張。一見正しい。

**しかし設計を精査すると、スタンドアロンにすることで 3つの複雑さが新たに発生することが判明した:**

**複雑さ 1: 認証の問題**  
freee Eラーニングの最大の価値提案は「freee アカウントでそのまま Eラーニングにログインできる」ことだった（顧客ヒアリングで全員が求めた）。スタンドアロンにすると：
- freee の認証基盤（Devise + freee SSO）を使えない
- 独自の SSO 実装が必要（追加 2〜3スプリント）
- またはユーザーに別途ログインを要求する（製品価値の毀損）

**複雑さ 2: 従業員データの鮮度**  
freee 人事労務の従業員マスタとリアルタイム同期するには、スタンドアロンの場合：
- freee 人事労務の Webhook を受信する → API バージョン管理・認証実装が必要
- または定期ポーリング → 従業員データが最大数分遅れる
モジュール統合なら `after_create` フック + Sidekiq で即時連携できる。

**複雑さ 3: チーム規模**  
3名のチームでマイクロサービスのインフラ（ECS タスク定義・独立した CI/CD・独立した監視設定）を追加で保守するのは、開発速度を大幅に落とすリスクがあった。freee の既存インフラ（EKS クラスタ・Datadog・GitHub Actions CI/CD）を再利用できるモジュール統合の方が「速く動くプロダクト」を作れる。

**最終的な判断:**  
スタンドアロンの「クリーンな責務分離」より、モジュール統合の「チームが実際に動ける設計」を選んだ。基盤チームとの合意形成にあたり、「将来の切り出し容易性を保証するために `Elearning::` 名前空間を厳守し、人事労務のコアモデルに Eラーニングの関心事を混入させない」という原則を約束した。

---

### 2. OIDC 認証の詳細設計（1:n → 1:1 の不一致解決）

**問題の本質:**

```
freee 側の設計:
  User A → 事業所 X（メインの会社）
         → 事業所 Y（副業・グループ会社）
  → 1人のユーザーが複数の会社のコンテキストで利用する

OEM 側の設計:
  User → 会社（1対1）
  → OEM のリアーキ中のため、この制約は変更不可
```

**当初検討した解決策（却下）:**

*案 A: OEM 側に事業所選択テーブルを追加してもらう*  
→ OEM がリアーキ中で「今は新テーブルを追加できない」と明確に断られた。

*案 B: freee 側で事業所ごとに OEM アカウントを複数作成し、ユーザーに選ばせる*  
→ 1人のユーザーが複数の OEM アカウントを持つことになり、受講履歴が事業所ごとに分断される。HR 管理者が全従業員の受講状況を一元管理できなくなる（製品の根幹的な価値を損なう）。

**採用した解決策: ログイン前の事業所選択 + OIDC state パラメータ**

```ruby
# 1. 事業所選択画面を OIDC フローの前に挟む
# アプリ内で事業所を選択 → OIDC Authorization Request に state として埋め込む

class Elearning::OidcController < ApplicationController
  def start
    # 複数事業所を持つユーザーには選択画面を表示
    @companies = current_user.companies.where(elearning_enabled: true)
    if @companies.size == 1
      redirect_to authorize_path(company_id: @companies.first.id)
    else
      render :select_company  # 事業所選択画面
    end
  end

  def authorize
    company = current_user.companies.find(params[:company_id])

    # OIDC セッションを DB に保存（state と nonce を生成）
    oidc_session = Elearning::OidcSession.create!(
      user: current_user,
      company: company,
      state: SecureRandom.hex(32),    # CSRF 防止（推測不可能な乱数）
      nonce: SecureRandom.hex(32),    # リプレイアタック防止
      expires_at: 10.minutes.from_now # セッションの有効期限（ブラウザバックの悪用防止）
    )

    # state の JWT 署名（改ざん防止）
    # state 文字列に company_id を含めると、コールバック時に company_id を取得できる
    # 単なるランダム文字列では company_id の情報を引き回せない
    signed_state = JWT.encode(
      {
        session_id: oidc_session.id,
        company_id: company.id,
        exp: 10.minutes.from_now.to_i,
      },
      Rails.application.credentials.secret_key_base,
      "HS256"
    )

    authorization_url = build_oidc_authorization_url(
      state: signed_state,
      nonce: oidc_session.nonce,
    )
    redirect_to authorization_url, allow_other_host: true
  end

  def callback
    # 1. state の JWT 検証（署名・有効期限・改ざんチェック）
    begin
      payload = JWT.decode(
        params[:state],
        Rails.application.credentials.secret_key_base,
        true,  # 署名検証を必ず実行
        { algorithm: "HS256" }
      ).first
    rescue JWT::DecodeError, JWT::ExpiredSignature => e
      return render_error(:invalid_state, e.message)
    end

    # 2. DB の OidcSession と突き合わせ（セッションの存在・未使用確認）
    oidc_session = Elearning::OidcSession.find_by(
      id: payload["session_id"],
      used: false  # 一度使ったセッションは再利用不可（リプレイアタック防止）
    )
    return render_error(:session_not_found) unless oidc_session

    # 3. Authorization Code → Token 交換
    token_response = Elearning::OemOidcClient.exchange_code(
      code: params[:code],
      redirect_uri: elearning_oidc_callback_url,
    )

    # 4. ID Token の検証
    id_token_claims = Elearning::OemOidcClient.verify_id_token(
      id_token: token_response[:id_token],
      expected_nonce: oidc_session.nonce,  # nonce 検証でリプレイアタック防止
    )

    # 5. なりすまし防止: OEM のユーザー ID が freee の従業員と一致するか確認
    employee_account = Elearning::EmployeeAccount.find_by(
      company: oidc_session.company,
      employee: current_user.employee_for(oidc_session.company),
      oem_user_id: id_token_claims["sub"],  # OEM のユーザー ID が変更されていないか
    )
    return render_error(:user_mismatch) unless employee_account

    # 6. セッションを使用済みにマーク（再利用防止）
    oidc_session.update!(used: true, used_at: Time.current)

    # 7. OEM プラットフォームの URL にリダイレクト
    redirect_to token_response[:platform_url], allow_other_host: true
  end
end
```

**PSIRT との合意事項の記録:**  
この設計を PSIRT に提出した際、2点の懸念が出た：

*懸念 1: state に company_id を含めることはセキュリティ上問題ないか*  
→ state は JWT で署名されており、改ざんは即座に検知できる。company_id は秘密情報でもないため、含めることに問題はない。PSIRT 承認。

*懸念 2: OEM 側の nonce 検証が実装されているか確認できるか*  
→ OEM 側のコードレビューには参加できなかったが、OEM の OIDC 実装は国際標準（OpenID Connect Core 1.0）に準拠していることを文書で確認。nonce 検証は OIDC 標準の必須要件。PSIRT 承認。

---

### 3. 大量データ連携の非同期ワーカー設計

**なぜ Rate Limit が厳しいのか（根本的な制約の理解）:**  
OEM がリアーキ中のため、新規 API の Rate Limit を緩和することを断られた。現行 API の「100 req/分」は変えられない前提で設計する必要があった。

**同期実装の何が問題か:**  
1,000名の一括インポートを同期処理すると：
- 1,000 req ÷ 100 req/分 = 最低 10分
- Rails のリクエストタイムアウト（デフォルト 60秒）をはるかに超える
- リクエストが途中でタイムアウトした場合、何件処理されたか不明

**Sidekiq 非同期処理の設計:**

```ruby
# app/jobs/elearning/bulk_employee_import_job.rb

class Elearning::BulkEmployeeImportJob < ApplicationJob
  queue_as :elearning_oem_sync

  # Sidekiq のリトライ設定
  # 一時的なネットワーク障害: 5回リトライ（指数バックオフ）
  # OEM の Rate Limit 超過: 1分後にリトライ
  sidekiq_options retry: 5

  def perform(batch_id:)
    batch = Elearning::OemSyncBatch.find(batch_id)
    return if batch.completed? || batch.failed?

    employee_ids = batch.pending_employee_ids

    # 100件ずつに分割して、1分間隔でジョブを投入
    # なぜ perform_later(wait:) を使うのか:
    #   - Rate Limit は「1分間に100リクエスト」という制約
    #   - 100件を処理したら次の100件は1分後に開始する必要がある
    #   - Sidekiq の scheduled jobs で実現（at オプション）
    employee_ids.each_slice(100).with_index do |chunk, index|
      Elearning::OemAccountCreateChunkJob.set(
        wait: index.minutes  # 0分後, 1分後, 2分後, ... と順番に投入
      ).perform_later(
        batch_id: batch.id,
        employee_ids: chunk,
        chunk_index: index,
      )
    end

    # バッチ状態を processing に更新
    batch.update!(
      status: :processing,
      total_chunks: (employee_ids.size.to_f / 100).ceil,
      started_at: Time.current,
    )
  end
end

class Elearning::OemAccountCreateChunkJob < ApplicationJob
  queue_as :elearning_oem_sync

  # OEM の Rate Limit 超過（HTTP 429）は1分後にリトライ
  retry_on Elearning::OemRateLimitError, wait: 1.minute, attempts: 3
  # ネットワーク障害は指数バックオフでリトライ
  retry_on Elearning::OemNetworkError, wait: :exponentially_longer, attempts: 5
  # OEM の5xxエラー
  retry_on Elearning::OemServerError, wait: 30.seconds, attempts: 3

  def perform(batch_id:, employee_ids:, chunk_index:)
    batch = Elearning::OemSyncBatch.find(batch_id)

    employee_ids.each do |employee_id|
      # 冪等性: 既に OEM アカウントが存在する場合はスキップ
      next if Elearning::EmployeeAccount.exists?(
        employee_id: employee_id, company_id: batch.company_id
      )

      employee = Employee.includes(:company).find(employee_id)

      begin
        oem_response = Elearning::OemApiClient.create_account(
          external_company_id: batch.company_id.to_s,
          external_user_id: employee_id.to_s,
          email: employee.email,
          name: employee.full_name,
          department: employee.department&.name,
          role: employee.role&.name,
        )

        # OEM アカウントと freee 従業員の紐付けを保存
        Elearning::EmployeeAccount.create!(
          employee: employee,
          company_id: batch.company_id,
          oem_user_id: oem_response["user_id"],
          oem_company_id: oem_response["company_id"],
          sync_status: :synced,
          last_synced_at: Time.current,
        )

        batch.increment!(:completed_count)

      rescue Elearning::OemRateLimitError => e
        # Rate Limit: このチャンク全体を再試行
        raise  # Sidekiq のリトライに委ねる
      rescue => e
        # 個別従業員の失敗: ログに記録してスキップ、他の従業員の処理は継続
        batch.record_failure(
          employee_id: employee_id,
          error_message: e.message,
          error_class: e.class.name,
        )
        logger.error(
          message: "OEM account creation failed",
          employee_id: employee_id,
          batch_id: batch_id,
          error: e.message,
        )
      end
    end

    batch.mark_chunk_completed!(chunk_index)
    batch.check_and_finalize!  # 全チャンク完了時にバッチを completed に更新
  end
end
```

**なぜ個別の失敗をスキップして続けるのか:**  
1,000名の一括インポートで、1名のメールアドレスが無効（OEM 側の バリデーションエラー）だったとして、それで全件を止めるのは HR 管理者にとって最悪の体験。個別の失敗はログに記録し「999名は成功、1名は手動確認が必要」という状態が最善。Rate Limit 超過だけは全チャンクに影響するため、チャンクごとリトライする。

**フロントエンドの進捗表示:**

```typescript
// フロントエンドは3秒ごとにポーリングして進捗を表示
// なぜ WebSocket ではなくポーリングか:
// - 1,000名のインポートは最大 10分かかる。常時接続を 10分維持するより
//   3秒ごとの短いポーリングの方が実装・インフラのシンプルさが勝る
// - Rails の Action Cable（WebSocket）は今回のプロジェクトでは使っていない
//   新たに導入するコストが高い
// - 3秒の遅延は進捗表示として許容範囲

function BulkImportProgress({ batchId }: { batchId: string }) {
  const { data: batch } = useQuery({
    queryKey: ["bulk-import-progress", batchId],
    queryFn: () => fetch(`/api/elearning/sync_batches/${batchId}`).then(r => r.json()),
    refetchInterval: (data) => {
      // 完了・失敗したらポーリング停止
      if (data?.status === "completed" || data?.status === "failed") return false;
      return 3000;  // 3秒ごと
    },
    staleTime: 0,  // 常に最新データを取得
  });

  const progressPercent = batch
    ? Math.round((batch.completed_count / batch.total_count) * 100)
    : 0;

  return (
    <div>
      <ProgressBar value={progressPercent} />
      <p>{batch?.completed_count} / {batch?.total_count} 名の処理が完了</p>
      {batch?.failed_count > 0 && (
        <Warning>
          {batch.failed_count} 名のアカウント作成に失敗しました。
          <DownloadLink href={`/api/elearning/sync_batches/${batchId}/failures.csv`}>
            エラー詳細をダウンロード
          </DownloadLink>
        </Warning>
      )}
      {batch?.status === "completed" && <Success>インポートが完了しました</Success>}
    </div>
  );
}
```

---

### 4. 従業員マスタとの連携設計

**なぜイベントドリブンにするのか（ポーリングとの比較）:**

| 観点 | ポーリング（定期実行） | イベントドリブン（採用） |
|------|-----------------|-------------------|
| データ鮮度 | 最大ポーリング間隔（例: 5分）だけ遅れる | 従業員 CRUD と同じトランザクション内で即時トリガー |
| 失敗の検知 | 次のポーリングまで気付かない | ジョブ失敗を即座に Sidekiq で捕捉・リトライ |
| 無駄な処理 | 変更がなくてもポーリングが実行される | 変更があった時だけ処理が走る |
| 実装の複雑さ | シンプル（cron + SQL） | やや複雑（ActiveRecord コールバック + Sidekiq） |

```ruby
# app/models/employee.rb（既存モデルへの最小限の追加）

class Employee < ApplicationRecord
  # Elearning:: モジュールの関心事を Employee モデルに混入しないよう注意。
  # コールバックの定義のみここに置き、ロジックは Elearning:: 名前空間に閉じる。

  after_create_commit  :enqueue_elearning_account_creation,  if: :elearning_enabled_for_company?
  after_update_commit  :enqueue_elearning_account_update,    if: :elearning_relevant_change?
  after_destroy_commit :enqueue_elearning_account_deactivation, if: :elearning_enabled_for_company?

  private

  def elearning_enabled_for_company?
    company.elearning_enabled?
  end

  def elearning_relevant_change?
    # 全フィールドの変更でジョブを起こさない（無駄なジョブを防ぐ）
    # Eラーニング側で意味のある変更（氏名・メール・部署・役職）のみ対象
    elearning_enabled_for_company? &&
      saved_changes.keys.intersect?(%w[email first_name last_name department_id role_id status])
  end

  def enqueue_elearning_account_creation
    Elearning::OemAccountCreateJob.perform_later(
      employee_id: id,
      company_id: company_id,
    )
  end

  # ...
end
```

**`after_create` ではなく `after_create_commit` を使う理由:**  
`after_create` はデータベーストランザクションのコミット前に呼ばれる。Sidekiq ジョブが即座に起動して従業員レコードを読み込もうとすると、まだ DB にコミットされていない可能性がある（DB の read-your-writes 保証がない場合）。`after_create_commit` はトランザクションコミット後に呼ばれるため、安全。

---

## セキュリティ設計の詳細

### 脅威モデル

| 脅威 | 攻撃の具体的なシナリオ | 対策 |
|------|---------------------|------|
| CSRF（クロスサイトリクエストフォージェリ） | 悪意あるサイトが OEM の Authorization Endpoint への認証リクエストを偽造する | state パラメータの JWT 署名検証。state が DB の OidcSession と一致しない場合は即座に拒否 |
| リプレイアタック | 傍受した認証レスポンス（Authorization Code）を再利用する | nonce 検証。OidcSession の `used` フラグで一度使った認証フローを再利用不可にする |
| セッションハイジャック | OIDC Callback の state パラメータを改ざんして別のユーザー・事業所として認証する | state を JWT で署名。改ざんは JWT 検証で即座に検知 |
| なりすまし（アカウント入れ替え） | 認証済みユーザーが OEM 側のユーザー ID を変更して別人の受講記録にアクセスする | コールバック時に `oem_user_id` と freee の従業員の紐付けを DB で確認。不一致は拒否 |
| 権限昇格 | 一般従業員が HR 管理者の機能（受講状況の一括閲覧・研修割り当て）にアクセスする | freee 人事労務の既存の権限管理（ロールベースアクセス制御）を再利用 |

### セキュリティ設定の詳細

```ruby
# OidcSession テーブル: OIDC フローの状態管理
create_table :elearning_oidc_sessions do |t|
  t.references :user, null: false
  t.references :company, null: false
  t.string     :state, null: false, index: { unique: true }  # state の重複は禁止
  t.string     :nonce, null: false
  t.boolean    :used, null: false, default: false
  t.datetime   :used_at
  t.datetime   :expires_at, null: false   # 10分で期限切れ
  t.timestamps

  # 期限切れセッションの自動削除（PostgreSQL のパーティションまたは定期 cleanup ジョブ）
  t.index [:expires_at], name: "index_elearning_oidc_sessions_on_expires_at"
end

# 定期クリーンアップ（期限切れセッションの削除）
class Elearning::CleanupExpiredOidcSessionsJob < ApplicationJob
  def perform
    Elearning::OidcSession
      .where("expires_at < ?", 1.hour.ago)  # 1時間余裕を持たせて削除
      .delete_all
  end
end
# Whenever gem で毎日実行
every 1.day, at: "3:00am" do
  runner "Elearning::CleanupExpiredOidcSessionsJob.perform_later"
end
```

---

## テスト戦略

**なぜテスト設計をここに書くのか:**  
セキュリティ要件のある認証フロー、非同期ワーカー、外部 API 連携は「動いているように見えるが壊れている」バグが発生しやすい。テスト設計を事前に決めることで、カバレッジの漏れを防ぐ。

```ruby
# OIDC コールバックのテスト（重要な境界条件を全て網羅）
RSpec.describe Elearning::OidcController, type: :controller do
  describe "GET #callback" do
    context "正常系" do
      it "正しい state・nonce で認証が完了する" do ...  end
    end

    context "state の改ざん検知" do
      it "state が DB に存在しない場合は 403 を返す" do ...  end
      it "state の JWT 署名が不正な場合は 403 を返す" do ...  end
      it "state の JWT が期限切れの場合は 403 を返す" do ...  end
    end

    context "リプレイアタック防止" do
      it "同じ state を 2回使った場合は 403 を返す" do
        session = create(:elearning_oidc_session, used: true)
        # ... 2回目のコールバックが拒否されることを確認
      end
    end

    context "なりすまし防止" do
      it "OEM の user_id が freee の従業員と紐付かない場合は 403 を返す" do ...  end
    end

    context "nonce 検証" do
      it "ID Token の nonce が一致しない場合は 403 を返す" do ...  end
    end
  end
end

# Sidekiq ワーカーのテスト
RSpec.describe Elearning::OemAccountCreateChunkJob, type: :job do
  context "冪等性" do
    it "同じ employee_id を 2回処理しても OEM アカウントが 1つだけ作られる" do ...  end
  end

  context "Rate Limit 超過（HTTP 429）" do
    it "Sidekiq のリトライキューに再投入される" do ...  end
  end

  context "個別従業員の失敗" do
    it "1人が失敗しても他の従業員のアカウント作成は続く" do ...  end
    it "失敗件数が OemSyncBatch に記録される" do ...  end
  end
end
```

---

## データモデルの詳細

```ruby
create_table :elearning_employee_accounts do |t|
  t.references :employee, null: false, foreign_key: true
  t.references :company, null: false, foreign_key: true
  t.string     :oem_user_id, null: false
  t.string     :oem_company_id, null: false
  t.string     :sync_status, null: false, default: "synced"
  #             synced / pending_update / deactivated / error
  t.datetime   :last_synced_at
  t.text       :last_error_message
  t.timestamps

  # compound unique index: 同じ従業員×会社の組み合わせは1レコードのみ
  t.index [:employee_id, :company_id], unique: true
  # OEM の user_id から逆引きするためのインデックス（OIDC コールバックで使用）
  t.index [:oem_user_id, :oem_company_id], unique: true
end

create_table :elearning_oem_sync_batches do |t|
  t.references :company, null: false, foreign_key: true
  t.string     :status, null: false, default: "pending"
  #             pending / processing / completed / partial_failure / failed
  t.integer    :total_count, null: false
  t.integer    :total_chunks, null: false, default: 0
  t.integer    :completed_count, null: false, default: 0
  t.integer    :completed_chunks, null: false, default: 0
  t.integer    :failed_count, null: false, default: 0
  t.jsonb      :failures, null: false, default: []
  #             [{ employee_id: 123, error_message: "...", error_class: "..." }]
  t.datetime   :started_at
  t.datetime   :completed_at
  t.timestamps
end
```

---

## 障害モード分析

| 障害 | 根本原因パターン | 影響範囲 | 対策 | 復旧手順 |
|------|---------------|---------|------|---------|
| OEM 全停止 | OEM 側のシステム障害 | 新規アカウント作成不可・OIDC ログイン不可 | Sidekiq ジョブは失敗してリトライキューに蓄積。OEM 復旧後に自動処理再開 | 1. OEM のステータスページを確認 2. HR 管理者に影響を通知 3. 復旧後にバッチ状態を確認 |
| Rate Limit 超過（HTTP 429） | ジョブのスケジューリングバグ（1分に100件以上投入） | アカウント作成の遅延 | `retry_on OemRateLimitError, wait: 1.minute` で自動リトライ | 1. Sidekiq キューの状態を確認 2. Dead Set（最終失敗）がないか確認 |
| OIDC 認証エラー増加 | OEM の OIDC 仕様変更、または証明書期限切れ | ユーザーがログインできない | エラー率アラーム → PagerDuty | 1. OEM の変更履歴を確認 2. OIDC Metadata Endpoint（/.well-known/openid-configuration）を確認 |
| 従業員インポートの部分失敗 | メールアドレスの重複、OEM 側のバリデーションエラー | 一部の従業員がアカウントを持てない | `failures` カラムにエラー詳細を記録 | HR 管理者が CSV ダウンロードで確認 → 手動で修正して再インポート |
| Sidekiq Redis 停止 | Redis（Sidekiq バックエンド）の障害 | 全非同期ジョブが停止 | Sidekiq は Redis 復旧後に自動再開。在キューのジョブは失われない（Redis の RDB/AOF 永続化） | Redis の可用性は人事労務本体と共有。SRE チームが対応 |

---

## 検討したが採用しなかった設計（詳細な理由）

| 選択肢 | 詳細な却下理由 |
|--------|--------------|
| **スタンドアロン・マイクロサービス** | 認証基盤の再実装（2〜3スプリント）・従業員データの API 経由取得（バージョン管理・認証の複雑さ）・3名チームのインフラ保守コスト増加。これらのコストがモジュール統合のデメリット（名前空間の管理）を大きく上回る |
| **OEM Webhook で受講状況をリアルタイム受信** | OEM がリアーキ中のため「Webhook 機能の実装は今年度中に対応できない」と明言された。V1 ではポーリングで受講状況を取得（15分ごと）。V2 で Webhook を実装予定 |
| **受講状況を freee DB に全量コピー** | OEM 側が受講の正とならず、freee DB が「コピー」になる。データの鮮度・整合性の管理コストが高い。また PSIRT から「データの所有権が不明確になる」という懸念が出た |
| **Bull/BullMQ（Node.js）による非同期処理** | Rails スタックと技術を混在させるコスト。Sidekiq の方が Rails との親和性が高く、チームの習熟コストがゼロ |

---

## 実績

| 指標 | 目標 | 実績（初月） |
|------|------|------------|
| リリース日 | 2026年2月12日（計画通り） | **2026年2月12日** |
| PSIRT セキュリティ要件 | 全件クリア | **全件クリア（0指摘）** |
| 1,000名一括インポート完了時間 | ≤ 20分 | **約 12分** |
| 従業員データ同期成功率 | ≥ 99.5% | **99.7%** |
| OIDC 認証エラー率 | < 0.1% | **0.03%** |
| OEM Rate Limit 超過エラー率 | < 0.1% | **0.0%**（スケジューリング設計が機能） |
