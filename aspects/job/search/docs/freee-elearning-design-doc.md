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
上記 3制約の中で、なるべくシンプルに「動くプロダクト」を作る。プロダクト・実装の両軸でシンプルな統合を選び、3名のチームが実際に保守できる設計にする。

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

## 可観測性設計

SLO を定義するだけでなく、「どのメトリクスで計測し、どこでアラートを上げるか」まで設計した。

### キーメトリクスとアラート閾値

| メトリクス | 収集方法 | 警告 (warn) | 危険 (critical) | 対応する SLO |
|-----------|---------|------------|----------------|------------|
| OIDC コールバック成功率 | Datadog APM（HTTP ステータスコード別） | < 99.95% | < 99.9% | OIDC 認証成功率 ≥ 99.9% |
| OEM API Rate Limit ヒット率（429 率） | Datadog カスタムメトリクス（Sidekiq ミドルウェア） | > 0.05% | > 0.1% | Rate Limit 超過エラー率 < 0.1% |
| Sidekiq `elearning_oem_sync` キュー深度 | Sidekiq Web UI + Datadog | > 500 jobs | > 2,000 jobs | インポート完了時間 SLO の代理指標 |
| OemSyncBatch の failure_count 率 | DB クエリ → Datadog | > 1% | > 5% | 従業員データ同期成功率 ≥ 99.5% |
| DynamoDB ロック競合率 | CloudWatch → Datadog | > 10% | > 30% | Rate Limit SLO の構造的指標 |

### Rate Limit の定量観測（リリース後の継続チューニング）

300 req/sec が上限で引き上げ不可のため、「実際にどの頻度で Rate Limit に衝突するか」を定量観測してチューニングを継続する。具体的には：

1. **HTTP 429 率を会社単位で記録** — `company_id` タグ付きで Datadog に送り、特定顧客の従業員数が突出して多い場合を検知する
2. **チャンクあたりの実質所要時間** — `wait: index.minutes` の仮定が実際に成立しているかを Sidekiq の処理時間で検証する
3. **組織同期 API コール数の計測** — 招待 1件あたり何リクエスト消費しているかを可視化し、チャンクサイズ・インターバルの最適値を探る

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
                  freee 認証基盤
                  └── OIDC アプリ（OEM との OIDC 設定を管理）
                            │
                            ▼
                  OEM 提供元プラットフォーム
                  ├── アカウント管理 API（Rate Limit: 300 req/sec）
                  ├── 受講状況取得 API
                  └── OIDC Authorization Server（認証基盤経由で接続）
```

---

## 主要な設計判断と意思決定の詳細

### 1. UI の配置と実装方式の決定プロセス

この決定は「UI をどこに置くか（プロダクトとして）」と「リポジトリ・サーバーをどこに置くか（実装として）」の 2つの軸で検討した。

#### UI 配置の 3択

| 案 | 概要 | メリット | デメリット | 採用 |
|----|------|---------|-----------|------|
| A: freee 福利厚生のサイドバーに組み込む | 福利厚生プロダクトの一機能として提供 | 福利厚生ユーザーへの導線が自然 | freee Eラーニングのコアニーズは「人事担当者が従業員に研修を強制的に受けさせる」管理側の機能。福利厚生は従業員が自由に利用するプロダクトであり、ユースケースの性質が根本的に異なる。人事労務との連携（雇用管理・組織図との紐付け）が主軸であり、福利厚生に組み込む理由がない | 却下 |
| B: 完全スタンドアローン（独自サブドメイン） | 独立 URL。人事労務からリダイレクト | freee 本体に影響を与えずに独立リリース・スケールが可能 | スタンドアローンでも freee の共通基盤（認証・セッション）を使う前提のため、基盤チームとゼロから連携を立ち上げるコストが高い。3名チームで並行して進める工数がなかった | 却下 |
| C: 人事労務のサイドバーに周辺プロダクトとして組み込む | 人事労務の UI 内に Eラーニングタブを追加 | 人事担当者が画面を離れずに研修管理まで完結。freee の「統合体験」ミッションに合致 | 人事労務のリリースサイクルに引きずられる可能性がある | **採用** |

**案 C の採用判断:**  
プロダクトサイドが freee の「統合体験」ミッションを根拠に決定した。デメリットとして挙げたリリースサイクルの依存は、Rails Engine による名前空間分離（後述）でモジュール単独デプロイが可能な設計にすることで緩和した。

#### サーバー・リポジトリの 3択

| 案 | 概要 | メリット | デメリット | 採用 |
|----|------|---------|-----------|------|
| A: freee 福利厚生のリポジトリに組み込む | 既存の福利厚生サービスに機能追加 | 既存コードを再利用できる | UI は人事労務側にあるのにサーバーが福利厚生側という分断が生じる。データ参照のためのサービス間通信が必要になる | 却下 |
| B: 新規リポジトリ（独立マイクロサービス） | 独自の ECS/EKS・CI/CD・監視を持つ新サービス | 独立デプロイ・独立スケールが可能。障害が人事労務本体に波及しない | インフラ構築・CI/CD 設定・監視設定を新規で整える必要があり、3名チームには保守コストが重い。機能要件が小さい現状では過剰設計 | 却下 |
| C: 人事労務のリポジトリにモジュールとして組み込む（Rails Engine） | 人事労務の Rails モノリスに `Elearning::` 名前空間で組み込む | 既存インフラ・CI/CD・監視を即座に再利用。従業員マスタへのアクセスがシンプル | モノリスの肥大化。人事労務の障害が Eラーニングにも波及する可能性がある | **採用** |

**案 C の採用判断:**  
メリット・デメリットを踏まえた上で、以下 2点が決め手になった。

1. **セキュリティ要件が高くない:** 扱うデータは従業員の氏名・所属程度。給与明細や銀行情報のような高感度データではないため、独立したセキュリティ境界を設ける必然性がなかった。独立マイクロサービス（案 B）のメリットである「障害隔離」は、今回のリスクプロファイルに対して過剰な対策。

2. **機能要件の複雑性が低い:** OEM（LMSプロバイダー）がコア機能（コース管理・受講記録・動画配信・研修割り当て）をすべて担う。freee 側が構築するのは「どの従業員に freee Eラーニングの利用を許可するか」という管理者権限管理と、freee Eラーニングを正とした組織図の OEM への同期機能のみ。この規模に独立マイクロサービスのインフラコスト（独立デプロイ・独立監視・サービス間通信の設計）を払うのは投資対効果が合わない。

**受け入れたトレードオフ:**  
モノリスへの組み込みにより「人事労務本体の障害時に Eラーニングも影響を受ける」リスクを許容した。ただし、Eラーニング障害が人事労務本体へ波及しない方向（一方向の隔離）は Rails Engine の設計で担保した。将来的に機能が複雑化・データが高感度化した場合の切り出しを見越し、`Elearning::` 名前空間を厳守し、人事労務コアモデルへの依存を最小限に抑えた。

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

**採用した解決策: ログイン前の事業所選択 + freee 認証基盤への委譲**

**freee 認証基盤との関係:**  
OIDC の RP（Relying Party）ロジック（state/nonce 生成・CSRF 防止・Authorization Code 交換・ID Token 検証）はすべて freee 認証基盤が担う。Eラーニング側は「認証基盤が提供する OIDC URL に飛ぶ」「コールバックで認証基盤から返された userinfo を検証する」の 2点のみ実装した。

**認証フローの全体像:**  
1. Eラーニングが freee 認証基盤の OIDC URL にリダイレクト
2. 認証基盤が OEM の OIDC Authorization Server とやり取り（state/nonce 管理含む）
3. トークンリクエスト完了後、認証基盤が userinfo を取得して Eラーニングのコールバックに返す
4. userinfo には `external_company_id`・`external_user_id` が含まれる（アカウント作成時に OEM のログインID フィールドに `"{employee_id}_{company_id}"` を詰めており、OEM がこれを userinfo のフィールドとして返す）
5. Eラーニングは userinfo の値と `current_user` を照合してなりすましを検証

```ruby
class Elearning::OidcController < ApplicationController
  def start
    # 複数事業所を持つユーザーには選択画面を表示
    @companies = current_user.companies.where(elearning_enabled: true)
    if @companies.size == 1
      redirect_to authorize_path(company_id: @companies.first.id)
    else
      render :select_company
    end
  end

  def authorize
    company = current_user.companies.find(params[:company_id])
    # state・nonce・CSRF 対策はすべて freee 認証基盤が担う
    # Eラーニング側は認証基盤が提供する URL に company_id を渡してリダイレクトするだけ
    redirect_to freee_auth_oidc_url(company_id: company.id), allow_other_host: true
  end

  def callback
    # 認証基盤がトークンリクエスト完了後に userinfo を返す
    # userinfo には external_company_id・external_user_id が含まれる
    userinfo = parse_userinfo_from_auth_platform(params)

    # なりすまし防止: userinfo の値が current_user と一致するか確認
    company  = Company.find_by(id: userinfo["external_company_id"])
    employee = current_user.employee_for(company)

    unless employee&.id == userinfo["external_user_id"].to_i
      return render_error(:user_mismatch)
    end

    redirect_to userinfo["platform_url"], allow_other_host: true
  end
end
```

**PSIRT との合意事項の記録:**  
この設計を PSIRT に提出した際、以下の懸念が出た。

---

*懸念: freee 従業員と OEM ユーザーの突合キーをどう担保するか*

**背景にある制約:**  
OEM のユーザー作成 API には `external_user_id` / `external_company_id` の専用パラメータが存在しない（公開 API のため仕様変更不可）。一方、OEM の API には**ログインID**という任意文字列フィールドが存在し、OEM はこの値を OIDC 認証後の userinfo の `external_user_id`・`external_company_id` フィールドとして返す。

**採用した解決策: ログインID フィールドへの埋め込み**  
アカウント作成時に OEM のログインID フィールドへ `"{employee_id}_{company_id}"` を渡す。OIDC コールバック時は認証基盤経由で返された userinfo の `external_user_id`・`external_company_id` を直接読み取り、`current_user` と照合する。文字列パースは不要。

**PSIRT の懸念:**  
ログインID は任意フィールドであり後から変更できる。悪意あるユーザーが自分のログインIDを他人の値に書き換えてなりすませないか？

**freee 側の回答:**  
OEM 側でログインIDの**重複を許容しない設定**にしてもらった。既に別ユーザーが使用しているログインIDへの変更は OEM 側で拒否されるため、書き換えによるなりすましは不可能。PSIRT 承認。

---

*懸念: state・nonce 等の OIDC セキュリティ要件は担保されているか*  
→ state（CSRF 防止）・nonce（リプレイアタック防止）・Authorization Code 交換・ID Token 検証はすべて freee 認証基盤が実装・管理する。freee の認証基盤は社内セキュリティ基準に準拠していることを確認済み。Eラーニング側で重複実装する必要はない。PSIRT 承認。

---

### 3. 大量データ連携の非同期ワーカー設計

**なぜ Rate Limit が厳しいのか（根本的な制約の理解）:**  
OEM の Rate Limit は「1 IP あたり」の制限。通常の OEM 契約は 1 社 = 1 IP のため、1 社分のリクエスト量であれば問題なかった。しかし freee は OEM と一括契約しており、複数の事業所（顧客企業）のリクエストをすべて freee の同一 IP から送ることになる。freee 全体の従業員数×アカウント作成が 1 IP に集中するため、通常想定の何十倍ものリクエストが発生する。

OEM に Rate Limit の引き上げを交渉し、最終的に 300 req/sec まで上げてもらった。これ以上の引き上げは不可と言われたため、この制限は変えられない前提で設計する必要があった。それでも freee の全顧客規模では足りないため、非同期処理でスループットを制御する設計が必要になった。リリース後は Rate Limit に衝突する頻度を定量的に観測し、チューニングを継続予定。

さらに Rate Limit の消費が多い理由がもう一つある。招待（アカウント作成）時には、従業員を正しい部門に所属させた状態で OEM に登録する必要があるため、**招待前に毎回組織の同期処理（部門ツリーの更新）を実行しなければならない**。この組織同期が大量のリクエストを消費し、1従業員あたりの実質的な API コールが「アカウント作成 1件」より大幅に多くなる。

**同期実装の何が問題か:**  
1,000名の一括インポートを同期処理すると：
- freee 全顧客の同時インポートで Rate Limit に衝突
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
    #   - OEM の Rate Limit は per-IP 制限。freee は多テナントで全顧客リクエストが集中する
    #   - 300 req/sec まで引き上げてもらったが freee 全顧客規模では不足
    #   - 100件ずつ 1分間隔でスケジューリングしてスループットを制御する
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
          # OEM に external_user_id/company_id の専用パラメータはない（公開 API のため追加不可）。
          # ログインID（任意文字列フィールド）に "{employee_id}_{company_id}" を詰めることで
          # OIDC コールバック時の突合キーとして機能させる。
          # OEM 側でログインIDの重複を禁止する設定にしてもらったため、他人の ID に変更不可。
          login_id: "#{employee_id}_#{batch.company_id}",
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

**Rate Limit とキューの並列数制御:**  
`wait: index.minutes` の設計は「チャンクが 1分ごとに 1つずつ処理される」ことを前提としている。freee の ClusterOps（Kubernetes ベースのワーカー管理機能）で `elearning_oem_sync` キューのワーカー Pod を常時 1台稼働する設定（min replicas: 1）にしている。アプリケーションコード側の concurrency 設定ではなく、インフラ層での管理。

**同一事業所への並行処理防止（DynamoDB 分散ロック）:**  
複数のワーカーが同じ `company_id` のチャンクを並行処理すると、組織同期リクエストが重複してさらに Rate Limit を圧迫する。この排他制御のため **DynamoDB 分散ロック**を導入した。各チャンクジョブは処理開始時に `elearning_lock:{company_id}` をキーとして DynamoDB にロックを取得し、処理完了後に解放する。同じ事業所の別チャンクはロック待ちになり、組織同期の重複実行を防ぐ。

**なぜ Redis ではなく DynamoDB か:**  
Sidekiq はすでに Redis を使っているため「Redis 分散ロック（Redlock）」も選択肢に上がった。却下した理由は 2つ。  
① Redlock はネットワーク分断・クロック歪み時に安全性が保証されないことが Martin Kleppmann に指摘されており、freee 社内でも採用を避ける方針があった。  
② freee のインフラではすでに DynamoDB を他用途で運用しており、新たな依存を増やさずに済む。DynamoDB の conditional write（`attribute_not_exists`）はアトミックなロック取得を保証する。

**冪等性チェックのレースコンディション:**  
`next if Elearning::EmployeeAccount.exists?(...)` は楽観的チェックであり、2つのワーカーが同時に `exists? == false` を確認して両方が `create_account` を呼ぶ可能性がある。DynamoDB ロックはこのレースコンディションを会社単位で防ぐ（同じ `company_id` に対して 1ワーカーのみが処理する）。万が一、ネットワーク瞬断で二重実行が起きた場合は `EmployeeAccount` の `unique index [:employee_id, :company_id]` が DB レベルで重複を防ぎ、`ActiveRecord::RecordNotAlreadyExists` を rescue して `skip` する。

**OEM 側でのアカウント作成成功後に `EmployeeAccount.create!` が失敗した場合（孤児レコード問題）:**  
OEM でアカウントが作成されたが freee DB への保存前にエラーが起きると、OEM にはアカウントがあるが freee 側に紐付けレコードがない「孤児」状態になる。対策として、次回リトライ時に `EmployeeAccount.exists?` が false なので再度 `create_account` を呼ぶが、OEM 側ではすでにログインIDが使用済みのため「重複エラー」が返る。このエラーを catch して OEM のユーザー検索 API で既存アカウントの `oem_user_id` を取得し、freee DB に保存し直す reconciliation パスを実装している。

また、リトライポリシーの改善も合わせて実施した（指数バックオフの調整・Dead Letter Queue の整備）。

**なぜ個別の失敗をスキップして続けるのか:**  
1,000名の一括インポートで、1名のメールアドレスが無効（OEM 側の バリデーションエラー）だったとして、それで全件を止めるのは HR 管理者にとって最悪の体験。個別の失敗はログに記録し「999名は成功、1名は手動確認が必要」という状態が最善。Rate Limit 超過だけは全チャンクに影響するため、チャンクごとリトライする。

**フロントエンドの進捗表示:**

```typescript
// フロントエンドは3秒ごとにポーリングして進捗を表示
// なぜ WebSocket ではなくポーリングか:
// - 人事労務本体に WebSocket を使っているユースケースが存在しない。
//   この進捗表示のためだけに Action Cable を導入するのはアーキテクチャ上の影響が大きく、
//   3名チームには過剰な投資と判断した
// - 3秒ごとのポーリングで進捗表示として十分な UX が実現できる

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

**`after_create_commit` の限界:**  
ActiveRecord のコールバックは ActiveRecord 経由のオペレーションにしか発火しない。マイグレーションスクリプトや管理ツールによる SQL 直接 INSERT では発火しない。大量の従業員を一括で取り込む場合（初期データ投入・他システムからの移行等）は、コールバックに頼らず `BulkEmployeeImportJob` を別途手動で投入する必要がある。この前提はチーム内で共有済み。

---

## セキュリティ設計の詳細

### 脅威モデル

| 脅威 | 攻撃の具体的なシナリオ | 対策 |
|------|---------------------|------|
| CSRF（クロスサイトリクエストフォージェリ） | 悪意あるサイトが OEM の Authorization Endpoint への認証リクエストを偽造する | freee 認証基盤が state パラメータ管理・CSRF 対策を担う。Eラーニング側での実装不要 |
| リプレイアタック | 傍受した認証レスポンス（Authorization Code）を再利用する | freee 認証基盤が nonce 検証・コード再利用防止を担う。Eラーニング側での実装不要 |
| セッションハイジャック | OIDC Callback の state パラメータを改ざんして別のユーザー・事業所として認証する | freee 認証基盤が state 検証を担う。Eラーニング側での実装不要 |
| なりすまし（アカウント入れ替え） | OEM のログインIDを他人の `"{employee_id}_{company_id}"` に書き換えて、別人として OIDC 認証を通す | OEM 側でログインIDの重複を禁止する設定にしてもらった。他人が使用中のログインIDへの変更は OEM が拒否するため、書き換えによるなりすましは不可能。コールバック時は userinfo の `external_user_id`・`external_company_id` を `current_user` と照合する |
| 権限昇格 | 一般従業員が HR 管理者の機能（受講状況の一括閲覧・研修割り当て）にアクセスする | freee 人事労務の既存の権限管理（ロールベースアクセス制御）を再利用 |

### セキュリティ設定の詳細

**freee 認証基盤への委譲により、Eラーニング側での OIDC セッション管理は不要。**  
state/nonce の生成・検証・有効期限管理・リプレイ防止はすべて認証基盤が担うため、`OidcSession` テーブルおよびそのクリーンアップジョブは実装不要だった。

Eラーニング固有のテーブルは以下の2つのみ:

```ruby
# OEM との紐付けテーブル
create_table :elearning_employee_accounts do |t|
  t.references :employee, null: false
  t.string     :oem_user_id, null: false
  t.timestamps
  t.index [:oem_user_id]  # 管理画面・受講状況取得で使用
end

# 一括インポートの進捗テーブル
create_table :elearning_oem_sync_batches do |t|
  t.references :company, null: false
  t.integer    :total_count, null: false
  t.integer    :processed_count, null: false, default: 0
  t.integer    :failed_count, null: false, default: 0
  t.string     :status, null: false, default: "pending"
  t.timestamps
end
```

---

## テスト戦略

**なぜテスト設計をここに書くのか:**  
セキュリティ要件のある認証フロー、非同期ワーカー、外部 API 連携は「動いているように見えるが壊れている」バグが発生しやすい。テスト設計を事前に決めることで、カバレッジの漏れを防ぐ。

**テスト境界の設計方針:**  
OEM API は WebMock でスタブ化する（VCR は使わない。OEM の API レスポンスが変更された際にカセットが古くなることを防ぐため）。freee 認証基盤への OIDC リダイレクトはコントローラーテストでリダイレクト先 URL のみ検証し、認証基盤内部は対象外とする。DynamoDB ロックは `Elearning::DynamodbLock` をモックし、ロック取得・解放の呼び出しが正しいシーケンスで起きることを検証する。

```ruby
# OIDC コールバックのテスト（重要な境界条件を全て網羅）
RSpec.describe Elearning::OidcController, type: :controller do
  describe "GET #callback" do
    context "正常系" do
      it "userinfo の external_user_id・external_company_id が current_user と一致すれば OEM URL にリダイレクトする" do ...  end
    end

    context "なりすまし防止" do
      it "userinfo の external_user_id が current_user の employee_id と一致しない場合は 403 を返す" do ...  end
      it "userinfo の external_company_id が current_user の所属事業所に存在しない場合は 403 を返す" do ...  end
    end

    context "認証基盤エラー" do
      it "userinfo が取得できない場合は 500 を返す" do ...  end
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
  # OEM の user_id から逆引きするためのインデックス（管理画面・受講状況取得で使用）
  # ※ OIDC コールバックは login_id パースに変更済み。oem_user_id は他用途で保持。
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

## 技術的負債と既知の限界

意図的に積んだ技術的負債を明示する。これらは「知らなかったから対処しなかった」ではなく、「V1 のスコープでは許容できると判断した」ものである。

### 積んだ負債

| 負債 | 影響 | 許容した理由 | 返済タイミング |
|------|------|------------|--------------|
| `after_create_commit` が直接 SQL では発火しない | 大量一括インポート時に手動 `BulkEmployeeImportJob` 投入が必要 | 一括インポートは管理者操作で頻度が低く、手順書で担保できる | V2 で Outbox パターン検討 |
| Rate Limit の 300 req/sec 上限を超えた際の自動バックプレッシャー機構がない | 顧客数増加に伴い 429 率が上昇する可能性 | リリース直後の規模では許容範囲内。定量観測で検知する | 429 率が SLO 超過したら動的スロットリングを実装 |
| OEM の受講状況がポーリング（15分ごと）でリアルタイムでない | 受講完了から管理者の画面反映まで最大 15分遅れ | V1 の MVP スコープでは許容できると顧客ヒアリングで確認済み | V2 で OEM Webhook 対応（OEM リアーキ完了後） |
| `failures` が `jsonb` 配列でスキーマレス | 失敗の分析クエリが複雑になる | V1 の失敗件数は少なく CSV ダウンロードで十分 | 失敗が多くなったら専用テーブルに移行 |

### 現設計のスケール上限

現設計が破綻するポイントを把握しておく：

**Rate Limit の天井:** freee 顧客の総従業員数 × 組織同期コール数が 300 req/sec を継続的に超えると、DynamoDB ロックのキュー待ちが増加し、インポート時間の SLO（≤20分）を超える。この閾値を超えたら、組織同期のキャッシュ（部門ツリーを一定時間使い回す）または OEM との専用 IP 割り当て交渉が必要になる。

**Sidekiq キューの深度:** `wait: index.minutes` は 1,000名 = 10チャンク = 10分間のスケジューリングで設計されている。顧客 1社が 10,000名規模になると 100チャンク = 100分かかる計算で SLO を超える。その場合はインターバルを短縮するか、チャンクサイズを増やす必要がある。

**モノリスへの組み込みの限界:** 現状は人事労務の DB を直接参照することでサービス間通信を避けているが、`Elearning::` モジュールが持つテーブルが増え、人事労務コアへの依存が増えると切り出しコストが高くなる。名前空間の厳守（`Elearning::` 外のクラスへの直接参照を最小化）が将来の切り出し可能性を維持する唯一の防衛線である。

---

## 検討したが採用しなかった設計（詳細な理由）

| 選択肢 | 詳細な却下理由 |
|--------|--------------|
| **独立マイクロサービス（新規リポジトリ）** | セキュリティ要件が高くなく（扱うデータは氏名・所属程度）、機能要件もシンプル（OEM がコア機能を担い、freee 側は管理機能のみ）なため、独立デプロイ・独立監視・サービス間通信の設計コストを払う理由がなかった |
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
