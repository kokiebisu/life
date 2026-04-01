# Design Doc: EKS クラスタ統合マイグレーション — freee福利厚生

**著者:** Ken Oki（マイグレーションリード）  
**ステータス:** リリース済み（2025年5月）  
**レビュアー:** SRE チームリード、人事労務クラスタオーナー

---

## 概要と問題の本質

### なぜこの仕事を誰かが「やる必要があった」のか

EKS（Kubernetes）は AWS から「サポート終了バージョン（EOS）の 14ヶ月前に通知し、EOS 後は強制アップグレード」というライフサイクルがある。freee 福利厚生の独自クラスタは 3〜4ヶ月ごとにバージョンアップグレードが必要で、その都度 1〜2週間の作業（SRE のサポート + 福利厚生チームの対応）が発生していた。

**チームに与えた実際の影響:**  
福利厚生チームはエンジニア 4名（筆者含む）で、このクラスタを誰も「専門家」として把握していなかった。アップグレードの前後 1〜2週間は、プロダクト開発のベロシティが約 40%低下していた（スプリントの振り返りで計測）。四半期に 1回これが発生するため、年間で計 4〜8週間がインフラ保守に費やされていた。

**加えて:**  
- 福利厚生クラスタは SOC1 準拠要件を満たしていなかった（人事労務クラスタは準拠済み）
- これはセキュリティ審査で繰り返し指摘されていたが、「専用クラスタを維持している間は解決しない」問題

**提案の発端:**  
筆者が人事労務チームのエンジニアに相談したところ「namespace を追加してもらえれば同じクラスタで管理できる」と言われた。これが契機となり、正式な提案として Design Doc を作成した。

---

## Before / After

### Before（移行前の状態）

```
freee 福利厚生
  └── 専用 EKS クラスタ（v1.27）
      ├── Node Group: welfare-ng-prod
      │     m5.large × 3 ノード
      │     月額コスト: 約 $350（EC2 インスタンス費用）
      ├── OIDC プロバイダー: 福利厚生クラスタ専用
      ├── IAM ロール（IRSA）: 福利厚生サービス専用
      ├── ArgoCD Application: welfare-argocd（専用インスタンス）
      ├── Datadog エージェント: 独自設定
      └── S3 Terraform State: s3://welfare-terraform-state/

問題:
  - EKS バージョンアップグレード: 年 3〜4回（各 1〜2週間）
  - チームの EKS 知識が浅く、アップグレードのたびに学習コスト発生
  - SOC1 非準拠
  - インフラコスト: 月額 $350
```

### After（移行後の状態）

```
freee 人事労務クラスタ（v1.29、SOC1 準拠済み）
  └── Namespace: welfare-benefits（追加）
      ├── 人事労務・福利厚生・他プロダクトで当番制アップグレード
      │     チームあたり年 1〜2回の対応で済む
      ├── OIDC プロバイダー: 人事労務クラスタのものを共有
      ├── IAM ロール（IRSA）: 人事労務クラスタのものを使用
      ├── ArgoCD Application: 人事労務の ArgoCD に統合
      ├── Datadog: 人事労務のロギング基盤を利用
      └── S3 Terraform State: s3://jinjirommu-terraform-state/welfare-benefits/

効果:
  - EKS アップグレード作業: ロードマップから除外
  - SOC1 準拠レベルに自動引き上げ
  - Node Group 廃止: 月額 $350 コスト削減
```

---

## SLO / リスク目標

| 目標 | 内容 |
|------|------|
| ダウンタイム | 0分（本番移行中） |
| データ損失 | 0件 |
| メール重複送信 | 0件（目標）|
| Cron 二重起動 | 0件 |
| ロールバック所要時間（問題発生時） | ≤ 15分 |

---

## 主要な設計判断と意思決定の詳細

### 1. なぜ Blue/Green 同時稼働ではなく「Cron 集約 + 一括切り替え」を採用したのか

**Blue/Green 同時稼働の問題点（詳細）:**

```
Blue/Green の標準的な手順:
  1. 新クラスタ（Green）を起動し、テスト
  2. ロードバランサーをトラフィックの一部を Green に向ける（Canary）
  3. 問題なければ 100% に切り替え
  4. Blue を停止

この「ステップ 1〜4」の期間（数時間〜1日）、
旧クラスタ（Blue）と新クラスタ（Green）が両方動いている。
```

**なぜこれが問題か:**  
福利厚生サービスには「スケジュールされた Cron ジョブ」がある。例：毎日 02:00 に「月次請求レポート生成」「未払いの通知メール送信」が走る。Blue/Green 同時稼働中にこの時刻が来ると、Blue と Green の両方で同じ Cron が実行される。

- **メール重複送信:** 「今月のご請求額のお知らせ」が 2通届く
- **DB の重複処理:** 月次集計バッチが 2回実行され、数値がおかしくなる

**技術的な解決策の検討（全て却下した）:**

*案 A: 分散ロックで Cron の二重起動を防ぐ*  
Redis で `SET cron:monthly-report:2025-05 1 NX EX 3600` のようなロックを実装する。  
→ このロックを実装するには全 Cron ジョブを修正する必要がある（対象 12ジョブ）。移行目的のプロジェクトのスコープとして過大。バグが入るリスクも増える。

*案 B: Blue を先に止めてから Green を起動する（メンテナンスウィンドウ）*  
真の意味でのダウンタイムが発生する。深夜でも、SaaS でダウンタイムを出すことは顧客への告知が必要。

*案 C: 「Cron 一枠集約 + 移行ウィンドウ」で二重起動ゼロを設計段階で保証する*  
移行前に全 Cron の実行時間を 04:00 以降に変更する。これにより「深夜 03:00〜04:00」が Cron ゼロ時間帯になる。この時間帯に移行を実行すれば、旧クラスタを停止してから新クラスタを起動するまでの間に Cron が走ることはない。

**案 C を採用した理由:**  
- 既存コードへの変更が「Cron スケジュール時刻の修正」のみ（最小スコープ）
- 二重起動が「設計上不可能な状態」を作り出せる（分散ロックは「実装が正しければ二重起動しない」であり、設計保証が弱い）
- 深夜 03:00〜04:00 の Cron ゼロ時間帯はビジネス影響なし

---

### 2. メール二重送信リスクを「技術で解決しない」と決めた理由

**なぜこれが議論になったか:**  
レビュー段階で「案 C（Cron 集約）で Cron 実行時の二重起動は防げるが、移行ウィンドウ中に処理中だったバックグラウンドワーカーが残っていた場合の重複はどうするか」という指摘があった。

**具体的なシナリオ:**  
移行ウィンドウ直前（02:50）に開始した「通知メール送信ワーカー」が 03:00 になってもまだ実行中だったとする。旧クラスタを停止すると、このワーカーは途中で強制終了する。SQS や DB に「処理中」のジョブが残る。新クラスタが起動すると、このジョブを再試行し、既に送信済みのメールを再送する可能性がある。

**技術的な解決策の工数見積もり:**  
メール送信ジョブに冪等キーを実装する（送信前に `email_send:#{job_id}` を Redis で確認）。  
→ メール送信に関わる全ジョブ（8ジョブ）への修正。テスト。デプロイ。推定 1スプリント（2週間）。

**「許容」という判断に至ったプロセス:**  
「技術で解決できる問題はすべき」という原則は正しい。ただし今回は追加の計算をした：

1. このシナリオが実際に発生する確率: 移行ウィンドウ（03:00〜04:00）開始直前に「メール送信ワーカー」が動いている確率。全 Cron を 04:00 以降に移動しているため、03:00 時点で動いている可能性があるのは「ユーザー操作でトリガーされた非同期ジョブ」のみ。深夜 03:00 のユーザー操作は実績上ほぼゼロ。

2. 発生した場合の影響: メールが 2通届く。「ご請求額のお知らせ」が 2通届いても、ユーザーが困惑する可能性はあるが、システムの整合性には影響しない（DB 側の処理は冪等設計になっている）。

3. CS チームに事前通知し、翌朝 1件でも問い合わせがあれば謝罪対応できる体制を整える。

**最終的な判断:**  
「技術実装 2週間」と「CS チームへの事前通知 + 翌朝の対応準備 1日」を比較した。発生確率が非常に低く、発生しても自動的に復旧する問題（重複メールは追加でアクションを起こさなくても翌日から正常）に 2週間を費やすのは、ロードマップへの影響が大きすぎる。移行プロジェクトのゴールは「インフラ保守コストの削減」であり、新規機能の開発を止めてまで対応する必要はないと判断した。

**結果:** 移行当日のメール重複件数 **0件**（深夜 03:00 のアクティブワーカーがゼロだったため）。

---

### 3. IRSA（IAM Roles for Service Accounts）の移行が複雑な理由と対策

**IRSA とは何か（背景）:**  
Kubernetes の Pod が AWS リソース（S3・RDS・Secrets Manager 等）にアクセスする際、IAM ロールを Pod に紐付ける仕組み。OIDC プロバイダー（クラスタごとに異なる URL を持つ）と IAM ロールの `AssumeRolePolicy` が紐付いている。

**問題:**  
福利厚生クラスタの OIDC プロバイダーの URL は：  
`https://oidc.eks.ap-northeast-1.amazonaws.com/id/AAAAAA`（福利厚生クラスタ固有）

人事労務クラスタの OIDC プロバイダーの URL は：  
`https://oidc.eks.ap-northeast-1.amazonaws.com/id/BBBBBB`（人事労務クラスタ固有）

IAM ロールの `AssumeRolePolicy` には「どの OIDC プロバイダーからの `sts:AssumeRoleWithWebIdentity` を許可するか」が明示的に書かれている。つまり、クラスタを変えると IAM ロールの定義も変える必要がある。

**対策（Terraform の変更）:**

```hcl
# Before: 福利厚生クラスタの OIDC プロバイダーを参照
data "aws_iam_openid_connect_provider" "welfare" {
  url = "https://oidc.eks.ap-northeast-1.amazonaws.com/id/AAAAAA"
}

resource "aws_iam_role" "welfare_benefits_app" {
  assume_role_policy = jsonencode({
    Statement = [{
      Action = "sts:AssumeRoleWithWebIdentity"
      Principal = {
        Federated = data.aws_iam_openid_connect_provider.welfare.arn
      }
      Condition = {
        StringEquals = {
          "${data.aws_iam_openid_connect_provider.welfare.url}:sub" =
            "system:serviceaccount:welfare-benefits:welfare-benefits-app"
        }
      }
    }]
  })
}

# After: 人事労務クラスタの OIDC プロバイダーを参照
data "aws_iam_openid_connect_provider" "jinjirommu" {
  url = "https://oidc.eks.ap-northeast-1.amazonaws.com/id/BBBBBB"
}

resource "aws_iam_role" "welfare_benefits_app" {
  assume_role_policy = jsonencode({
    Statement = [{
      Action = "sts:AssumeRoleWithWebIdentity"
      Principal = {
        Federated = data.aws_iam_openid_connect_provider.jinjirommu.arn  # ← 変更
      }
      Condition = {
        StringEquals = {
          "${data.aws_iam_openid_connect_provider.jinjirommu.url}:sub" =  # ← 変更
            "system:serviceaccount:welfare-benefits:welfare-benefits-app"
          # ↑ Namespace と ServiceAccount 名は変わらない
        }
      }
    }]
  })
}
```

**検証ポイント:**  
Integration 環境で事前に「新しい IRSA 設定で Pod が S3・RDS・Secrets Manager にアクセスできるか」をテストした。ここでの失敗は本番移行に進まない判断基準にした。

---

### 4. 段階的移行の設計（なぜ 3フェーズか）

**なぜ一気に本番移行しないのか:**  
「Integration で確認したから本番でも動く」は不確かな前提。特に Kubernetes の環境差異（Node のカーネルバージョン・ネットワークプラグインのバージョン・リソース競合）は Integration では再現しにくい問題を含む。

各フェーズで「ここで問題が出たら本番には進まない」という判断基準を事前に定義した。

```
フェーズ 1: Integration 環境（1週間）
  確認事項:
  ✓ Terraform apply が エラーなく完了する
  ✓ IRSA: Pod が S3 バケットの読み書きができる
  ✓ IRSA: Pod が RDS への接続ができる
  ✓ ArgoCD が新 Application 定義で Sync できる
  ✓ Cron スケジュール変更が正しく適用される
  ✓ Datadog にログが流れている

フェーズ 2: Staging 環境（1週間）
  確認事項:
  ✓ 全 API エンドポイントへの疎通確認（E2E テスト）
  ✓ Cron ジョブが新スケジュールで実行される（1日後に確認）
  ✓ メール送信が重複しない
  ✓ Datadog アラームが誤発報しない
  ✓ 負荷テスト: 通常の 3倍のトラフィックで P99 レイテンシが規定内

  Staging 通過の判断基準:
  - エラー率 < 0.1%（24時間）
  - 全 Cron が正常終了（7日間）
  → これを満たさなければ本番移行日を延期する

フェーズ 3: Production 移行（移行当日）
  タイムライン（後述）
```

---

## 移行当日の詳細タイムライン

```
[事前準備] 移行 3日前
  ├── 全 Cron スケジュール変更を本番に先行デプロイ
  │    （移行当日の変更を減らして当日のリスクを下げる）
  └── CS チームに「2025年5月XX日 深夜 03:00〜04:00 メンテナンス」通知

[移行当日]

23:00: ゴーサイン確認
  ├── Staging 環境での最終動作確認
  ├── SRE チームと Slack でスタンバイ確認
  └── ロールバック手順の確認（後述）

00:00: 移行開始（予定より早くスタート、余裕を持たせる）

  ① 旧クラスタの新規デプロイを停止（ArgoCD を手動 Sync 停止）
      理由: 移行中に誰かが誤ってデプロイして混乱しないよう

  ② Terraform apply（IAM ロール・Namespace・RBAC の変更）
      - `plan` の差分を事前に確認済み。想定外の変更がないことを確認してから `apply`
      - 所要時間: 約 5分

  ③ k8s マニフェスト更新（server URL を人事労務クラスタに変更）
      - ArgoCD の Application 定義を更新
      - 新クラスタへの最初の Sync を実行

  ④ 新クラスタで Pod が正常起動していることを確認
      ```bash
      kubectl --context jinjirommu-prod \
        -n welfare-benefits get pods --watch
      # 全 Pod が Running になることを確認（目安 3分）
      ```

  ⑤ ヘルスチェック確認
      ```bash
      curl https://welfare-benefits-staging.internal/health
      # {"status": "ok", "cluster": "jinjirommu-prod"} を確認
      ```

01:00: DNS / ロードバランサーの切り替え
  ├── ALB のターゲットグループを旧クラスタ → 新クラスタに変更
  │    （AWS コンソール、または Terraform apply）
  └── 切り替え後、5分間 Datadog でエラー率を監視
       - エラー率 > 0.5% → 即座にロールバック（後述）
       - P99 > 2,000ms → 即座にロールバック

01:30: 旧クラスタの段階的スケールダウン
  ├── 旧クラスタの Deployment replicas を 3 → 1 に減らす（完全停止前の確認）
  ├── 5分間、新クラスタの動作が安定していることを確認
  └── replicas を 0 に設定（旧クラスタのアプリを停止）

02:00: 旧クラスタの Node Group スケールダウン
  ├── AWS コンソール から Node Group の desired count を 3 → 0 に変更
  └── EC2 インスタンスが全て終了することを確認

03:00〜04:00: Cron ゼロ時間帯（何もしない）
  └── 全 Cron が 04:00 以降に設定済みのため、この時間帯は静寂

04:00: 最初の Cron が新クラスタで実行される
  └── Datadog ログで正常終了を確認

09:00: 翌朝の最終確認
  ├── 全夜間 Cron の正常終了を確認
  ├── エラー率・レイテンシが正常範囲内であることを確認
  ├── CS チームへ移行完了の報告
  └── 旧クラスタの Node Group を完全削除（Terraform destroy）
```

---

## ロールバック計画

ロールバックが必要な判断基準：
- エラー率 > 0.5% が 5分以上継続
- P99 > 2,000ms が 5分以上継続
- Pod が `CrashLoopBackOff` または `OOMKilled` 状態

**ロールバック手順（目標所要時間: 15分以内）:**

```bash
# Step 1: ALB のターゲットグループを旧クラスタに戻す（3分）
# AWS コンソールまたは:
aws elbv2 modify-target-group --target-group-arn $OLD_TG_ARN ...

# Step 2: 旧クラスタの Deployment replicas を戻す（2分）
kubectl --context welfare-prod \
  -n welfare-benefits scale deployment welfare-benefits-app --replicas=3

# Step 3: 旧クラスタの Node Group を起動（5〜10分）
# ※ 旧 Node Group は完全削除せず、移行成功確認後（翌朝）に削除
# これがロールバックを「高速」にする設計判断
# 旧 Node Group を移行と同時に削除すると、ロールバック時に
# Node の起動を待つ必要があり 10〜15分のダウンタイムが発生する

# Step 4: Datadog でエラー率の回復を確認
```

**なぜ旧 Node Group を「移行当夜は残す」のか:**  
ロールバックの RTO（目標復旧時間）を下げるため。Node が起動済みの状態であれば、Pod の再起動だけで回復できる（2〜3分）。Node から起動する場合は 5〜10分の追加遅延が発生する。旧 Node Group を残すコスト（1夜 = 約 $10）は、この保険として正当化できる。

---

## 変更ファイル一覧と変更内容の概要

| ファイル / リソース | 変更内容 | フェーズ |
|-------------------|---------|---------|
| `terraform/eks/jinjirommu/namespaces.tf` | `welfare-benefits` namespace 追加 | Phase 1 |
| `terraform/iam/welfare-benefits-irsa.tf` | OIDC プロバイダーの参照先を変更 | Phase 1 |
| `terraform/backend.tf` | S3 tfstate バケットを統合バケットに変更 | Phase 1 |
| `k8s/welfare-benefits/deployment.yaml` | `server` URL を人事労務クラスタに変更 | Phase 2 |
| `k8s/welfare-benefits/cronjob.yaml` | 全 12 Cron のスケジュールを 04:00 以降に変更 | 事前デプロイ |
| `argocd/applications/welfare-benefits.yaml` | `destination.server` を変更 | Phase 2 |
| `k8s/welfare-benefits/rbac.yaml` | 人事労務 RBAC に `welfare-benefits` ns の権限追加 | Phase 1 |
| `k8s/welfare-benefits/serviceaccount.yaml` | `eks.amazonaws.com/role-arn` annotation を更新 | Phase 1 |

---

## 移行後の確認チェックリスト

```
□ 全 Pod が Running 状態（kubectl get pods）
□ IRSA: S3 アクセステスト成功
□ IRSA: RDS 接続テスト成功
□ Datadog にメトリクスが流れている
□ Datadog アラームが誤発報していない
□ 全 Cron が新スケジュールで正常実行（24時間後に確認）
□ エラー率が移行前と同等（< 0.1%）
□ P99 レイテンシが移行前と同等
□ 旧クラスタの Node Group が 0 スケール
□ 翌朝 9:00 時点で CS 問い合わせがゼロ
□ 旧クラスタの Node Group を Terraform destroy（確認後）
□ 旧クラスタの ArgoCD Application を削除
□ 旧クラスタの OIDC プロバイダーを削除
```

---

## 実績

| 指標 | 目標 | 実績 |
|------|------|------|
| 本番移行のダウンタイム | 0分 | **0分** |
| メール重複送信 | 0件（目標） | **0件** |
| Cron 二重起動 | 0件 | **0件** |
| ロールバック発動 | なし | **発動なし** |
| EKS アップグレード作業 | ロードマップから除外 | **除外完了** |
| 月次インフラコスト削減 | $350 | **$350 削減** |
| SOC1 準拠 | 準拠レベルへ引き上げ | **達成** |
| 移行後の異常アラーム | 0件 | **0件** |
