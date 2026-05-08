---
title: freee EKSクラスタ統合 - 面接用 deep dive
created: 2026-05-03
updated: 2026-05-09
---

# freee EKSクラスタ統合 - 面接用 deep dive

> 面接で深掘りされた時に見るためのメモ。
> 「すごい移行をしました」ではなく、**なぜ統合したか / 何が危なかったか / どう段階移行したか / 今ならどう改善するか**を話す。

---

## 0. 話す時の方針

- いきなり Kubernetes の細部に入らない
- まずは「なぜ統合が必要だったか」を話す
- 次に「何を移したか」を話す
- その後「リスクと対策」を話す
- 不確かな実装詳細は盛らない
- `やったこと` と `今なら改善すること` を分ける

### 避ける言い方

- 「完璧にゼロリスクで移行しました」
- 「EKS の運用を全部自分で設計しました」
- 「SOC1 対応をこれだけで解決しました」
- 「Cron 二重起動は完全に技術的に防ぎました」

### 使いやすい言い方

- 「独自クラスタを持つ運用コストが、チーム規模に対して重くなっていました」
- 「統合先の人事労務クラスタに寄せることで、運用・監査・権限管理を揃えられるメリットがありました」
- 「移行は integration、staging、production の順に段階的に進めました」
- 「一番気をつけたのは Cron の二重起動です」
- 「当時は技術対応だけでなく、CS 経由の事前通知も含めてリスクを下げました」

---

## 1. 30秒版

- freee福利厚生は、もともと独自の EKS クラスタを持っていた
- 独自クラスタの運用には負荷があった
  - EKS バージョンアップ
  - 権限管理
  - ログ/監視基盤
  - SOC1 準拠観点の統制
  - コスト
- 人事労務側の EKS クラスタに統合する方針になった
- 自分は、福利厚生用 namespace をもらい、周辺設定を段階的に移行した
  - Terraform
  - Kubernetes manifest
  - IAM role
  - RBAC
  - ArgoCD
  - Cron
- 移行は integration → staging → production の順
- 一番注意したのは Cron の二重起動
- 旧クラスタと新クラスタで同時に Cron が動くと、メール二重送信などの事故につながる
- Cron の起動時間を集約し、その時間帯を避けて移行した
- 必要に応じて CS 経由で事前通知も行った
- 結果として、ダウンタイムなしで production 移行できた

---

## 2. 背景

- 対象:
  - freee福利厚生
  - 独自 EKS クラスタで稼働していた

- 移行先:
  - 人事労務側の EKS クラスタ
  - 福利厚生用 namespace を提供してもらう

- 目的:
  - 独自クラスタ運用を減らす
  - 人事労務側の運用基盤に寄せる
  - セキュリティ/監査観点の統制を揃える
  - チームがプロダクト開発に集中できるようにする

---

## 3. なぜ統合したのか

### 運用負荷

- 独自 EKS クラスタを持つと、クラスタ運用が継続的に発生する
- 特に EKS は定期的なバージョンアップが必要
- バージョンアップ対応が数ヶ月ごとに発生する
- 小さめのチームでは、ロードマップを圧迫しやすい

話し方:

- 「クラスタを持つこと自体が、継続的な運用責任を持つことでした」
- 「福利厚生チーム単独で持つには、運用コストが重くなっていました」

### 統制/監査

- 人事労務側のクラスタに寄せると、統制を揃えやすい
- 権限管理、ログ、監査対応を同じ基盤に乗せやすい
- SOC1 準拠の観点でも、独自運用より揃えた方が説明しやすい

注意:

- 「SOC1 がこれで完了した」とは言わない
- 「SOC1 準拠の観点で、運用統制を揃えるメリットがあった」と言う

### コスト

- 独自クラスタには固定費がある
- 統合により、クラスタ単位の運用/費用を圧縮できる
- ただし、コストだけが主目的ではない
- 運用負荷と統制のメリットが大きい

---

## 4. 移行したもの

- Kubernetes namespace
- Kubernetes manifest
  - Deployment
  - Service
  - ConfigMap
  - CronJob
  - Ingress など
- Terraform
  - IAM role
  - namespace 周辺設定
  - ArgoCD 関連設定
- RBAC
  - service account
  - role / role binding
- ArgoCD
  - app 定義
  - sync 対象
  - environment ごとの設定
- 環境
  - integration
  - staging
  - production

話し方:

- 「アプリだけ移したのではなく、周辺の IaC、権限、デプロイ設定も含めて移しました」
- 「Kubernetes manifest だけでなく、Terraform / IAM / RBAC / ArgoCD も対象でした」

---

## 5. 移行手順

### 5.1 合意形成

- 人事労務チームと調整
- 福利厚生用 namespace を提供してもらう
- どこまでを福利厚生チームが持つかを整理
- どこからが人事労務基盤側の責任かを整理

話し方:

- 「技術作業の前に、責任境界をすり合わせました」
- 「namespace はもらうが、アプリ設定は福利厚生側で持つ、というように切り分けました」

### 5.2 integration で検証

- まず integration から移行
- manifest / Terraform / ArgoCD の基本動作を確認
- pod が起動するか
- service discovery が問題ないか
- IAM role で必要な AWS resource にアクセスできるか
- Cron が想定通り動くか

### 5.3 staging で本番に近い検証

- staging に展開
- 本番に近い設定で確認
- migration 手順をリハーサル
- rollback 手順も確認
- Cron の起動タイミングを確認

### 5.4 production 移行

- production は最後に実施
- 移行ウィンドウを決める
- Cron の起動時間を避ける
- 必要に応じて CS 経由で事前通知
- 移行後に確認
  - pod 起動
  - ArgoCD sync
  - log
  - monitoring
  - Cron 状態
  - 主要動線

話し方:

- 「環境ごとに段階移行して、各段階で確認してから次に進めました」
- 「本番は staging で手順を固めてから実施しました」

---

## 6. 一番危なかった点: Cron 二重起動

### 何が危ないか

- 旧クラスタと新クラスタが同時に動く期間がある
- その期間に両方の Cron が有効だと、同じ処理が二重に走る
- 影響例:
  - メール二重送信
  - 外部 API 二重呼び出し
  - DB 更新の二重実行
  - ユーザーへの重複通知

### 当時やった対策

- Cron の起動時間を確認
- Cron の起動タイミングを一枠に集約
- その時間帯を避けて migration する
- 二重起動しやすい時間帯に作業しない
- 影響があり得るユーザー/顧客には、CS 経由で事前通知する

話し方:

- 「技術的に全部を複雑に防ぐより、まず危険な時間帯を避ける運用設計にしました」
- 「メール二重送信のようなユーザー影響が出やすいものを重点的に見ました」

### 当時やった可能性が高い対策と、今なら追加する対策

- CronJob を新旧どちらか片方だけ enable にする明示フラグ
- DB lock / advisory lock で job 単位の排他
- job の idempotency key
- dry-run mode
- 手動実行できる runbook
- 記憶では、移行中は Cron を一時 suspend
- 記憶では、移行後に新クラスタだけ unsuspend

短く言う:

- 「当時は起動時間を集約して、その時間帯を避けることでリスクを下げました」
- 「CronJob suspend は入れた記憶があります。今ならさらに DB lock / idempotency も入れたいです」

---

## 7. CronJob suspend と、今なら追加する技術対策の深掘り

### 7.1 CronJob suspend（記憶では実施）

何をするか:

- Kubernetes CronJob には `spec.suspend` がある
- `suspend: true` にすると、新しい Job が作られなくなる
- 既に走っている Job は別途確認が必要

移行時の使い方:

- 移行前:
  - 新クラスタの CronJob は最初 `suspend: true` で作る
  - 旧クラスタ側も、移行直前に必要な CronJob を `suspend: true` にする
- 移行中:
  - 旧新どちらからも Cron が起動しない状態を作る
  - 手動で必要な確認だけ行う
- 移行後:
  - 新クラスタ側だけ `suspend: false` に戻す
  - 旧クラスタ側は suspend のままにする
  - 次回実行時刻に新クラスタだけで起動することを確認する

注意点:

- suspend は「これから作られる Job」を止めるもの
- 既に作られた Job / 実行中 Pod は止まらない
- 直前に Job が作られていないか確認する
- ArgoCD 管理なら、手動変更ではなく manifest / values 側で切り替える

面接で短く:

- 「記憶では、新旧クラスタの Cron 二重起動を避けるために CronJob suspend を使いました」
- 「suspend は既存 Job を止めるものではないので、実行中 Job がないことも確認します」

### 7.2 DB lock / advisory lock

何を防ぐか:

- CronJob が二重に起動しても、実処理が二重に走らないようにする
- Kubernetes 側のミスだけに依存しない
- アプリケーション側でも最後の防波堤を作る

実装イメージ:

- job 開始時に DB で lock を取る
- lock を取れた worker だけ処理を実行する
- lock を取れなかった worker は何もせず終了する
- lock には期限を持たせる
- 終了時に lock を解放する

選択肢:

- PostgreSQL advisory lock
- `job_locks` のようなテーブル
- Redis lock

注意点:

- lock の取りっぱなしに注意する
- timeout / expires_at が必要
- lock owner を持つ
- release 時に owner を確認する
- 長い job なら heartbeat で延長する

面接で短く:

- 「Cron の二重起動を Kubernetes 側だけで防ぐのではなく、アプリ側の DB lock でも防ぎます」
- 「仮に新旧クラスタの両方で Cron が起動しても、DB lock を取れた片方だけが実処理します」

### 7.3 idempotency key

idempotency:

- 同じ処理を複数回実行しても、結果が1回分になるようにすること

何を防ぐか:

- メール二重送信
- 外部 API 二重呼び出し
- 同じレコードの二重作成
- retry 時の重複処理

実装イメージ:

- job 実行単位で一意な key を作る
- 例:
  - `benefit_notification:2026-05-09:company_123:user_456`
  - `monthly_report:2026-05:company_123`
- 送信/実行前に、同じ key が処理済みか確認する
- 処理済みなら skip
- 未処理なら、処理記録を作ってから実行する

DB 制約:

- `idempotency_keys` テーブルを作る
- `key` に unique index
- insert に成功した worker だけ処理する
- insert に失敗した worker は「既に処理済み」と判断する

注意点:

- key の粒度を間違えると、必要な再送まで止める
- key が粗すぎると別ユーザー分まで skip される
- key が細かすぎると二重防止にならない

面接で短く:

- 「二重起動しない前提だけでなく、二重起動しても副作用が1回になるように idempotency key を置きます」

### 7.4 rollback runbook

runbook:

- 障害時に誰が何をするかを書いた手順書

何を書くか:

- 切り戻し判断の条件
- 切り戻し手順
- 誰が判断するか
- 誰に連絡するか
- どの dashboard / log を見るか
- 作業後に何を確認するか

切り戻し判断の例:

- pod が Ready にならない
- ArgoCD sync が失敗する
- 主要 API が失敗する
- error rate が閾値を超える
- Cron が想定外に起動する
- メール送信などの副作用処理に異常がある

切り戻し手順の例:

- 新クラスタ側 CronJob を `suspend: true`
- traffic / routing を旧クラスタへ戻す
- 旧クラスタ側 CronJob を必要に応じて `suspend: false`
- ArgoCD sync 状態を確認
- pod / ingress / log / metrics を確認
- CS / 関係者に状況共有

注意点:

- rollback は「戻せる」と思っているだけでは弱い
- production 前に staging でリハーサルする
- 切り戻しに何分かかるか見積もる
- データ更新が進んだ後に本当に戻せるか確認する

面接で短く:

- 「rollback runbook は、戻すコマンドだけでなく、戻す判断条件と確認項目まで書きます」
- 「移行前に staging で runbook を一度通します」

### 7.5 入れる優先順位

今なら優先順位:

1. rollback runbook
   - production 作業では必須
   - 事故時の判断を速くする
2. DB lock
   - Cron の二重起動に対するアプリ側の防波堤
   - 副作用が大きい job から入れる
3. idempotency key
   - メール送信、外部 API、請求/権限変更などから優先
   - 設計を間違えると必要な再実行まで止めるので慎重に入れる

面接で短く:

- 「CronJob suspend は入れた記憶があります」
- 「今なら rollback runbook を明文化し、副作用の大きい job から DB lock と idempotency key を入れます」

---

## 8. リスクと対策

| リスク | 当時の対策 | 今なら追加 |
|---|---|---|
| Cron 二重起動 | 起動時間集約、作業時間調整、Cron suspend、CS通知 | DB lock、idempotency |
| 権限不足 | IAM/RBAC を環境ごとに確認 | policy diff、最小権限レビュー |
| 権限過多 | 人事労務側と責任境界を整理 | namespace ごとの RBAC audit |
| ArgoCD sync ミス | integration→staging→production | sync wave / health check 強化 |
| rollback 不備 | staging で手順確認 | rollback runbook 明文化 |
| ログ/監視漏れ | 移行後確認 | dashboard / alert 事前作成 |
| 本番差分 | 段階移行 | prod-like staging の差分チェック |

---

## 9. シニア面接で突っ込まれた時

### Q1. なぜクラスタ統合が良い判断だった？

- 独自クラスタは、持っているだけで継続運用が必要
- EKS バージョンアップ対応が定期的に発生する
- 小さめのプロダクトチームでは負荷が大きい
- 人事労務側の基盤に寄せることで、運用・監査・権限・ログを揃えられる
- 福利厚生チームはプロダクト開発に集中しやすくなる

短く言う:

- 「クラスタを減らすことで、チームが持つべきでない運用負荷を下げました」
- 「コストだけでなく、統制と運用責任の整理が主目的でした」

### Q2. 統合すると blast radius が広がらない？

blast radius:

- 障害が起きた時に影響が広がる範囲

答え方:

- 広がるリスクはある
- だから namespace / RBAC / resource quota / network policy で境界を作る必要がある
- 統合クラスタに載せるからこそ、アプリ単位の責任境界を明確にする
- すべてを同じ権限で動かすのは避ける

今なら:

- namespace ごとの resource quota
- limit range
- network policy
- service account 分離
- ArgoCD project 分離
- alert / dashboard も namespace 単位で分ける

短く言う:

- 「統合は blast radius のリスクもあるので、namespace と権限で境界を作る前提です」

### Q3. なぜ namespace 統合で十分だった？

- 福利厚生は人事労務と近いドメイン
- 完全に別クラスタを持つほどの独立運用メリットが薄かった
- 共有基盤に寄せることで、監査や運用の説明がしやすい
- namespace で論理分離し、必要な権限だけ付ける判断にした

注意:

- 「namespace だけで完全分離できる」とは言わない
- 「namespace + RBAC + IAM + network/resource 制御で分離する」と言う

### Q4. rollback はどう考えた？

- production 前に staging で手順を確認
- 旧クラスタをすぐ消さず、一定期間戻せる状態を残す
- ArgoCD / manifest / Terraform の差分を把握する
- DNS / routing / Cron の切り戻しポイントを決める

今なら:

- rollback runbook を明文化
- 切り戻し判断の閾値を決める
- 例:
  - pod が起動しない
  - 主要動線が失敗する
  - error rate が閾値超え
  - Cron が想定外に起動した

短く言う:

- 「旧クラスタを即時削除せず、切り戻せる状態を残すのが大事です」

### Q5. production 移行時、何を確認した？

- ArgoCD sync が成功している
- pod が Ready
- readiness / liveness probe が通る
- service / ingress が疎通する
- app log に異常がない
- error rate が上がっていない
- Cron が想定外に起動していない
- 主要な画面/ API が動く
- 外部連携が必要な場合は疎通確認

短く言う:

- 「pod が起きたかだけでなく、主要動線、ログ、Cron、監視まで確認しました」

### Q6. Terraform state や ArgoCD の扱いは？

答え方:

- IaC の管理対象が変わるので、差分を小さく切る
- Terraform と ArgoCD の責任範囲を混ぜない
- Terraform はクラスタ周辺/IAM/namespace など
- ArgoCD は Kubernetes manifest の継続適用
- 手動変更を残さず、最終的にコード管理に寄せる

今なら:

- Terraform plan を環境ごとに確認
- ArgoCD app diff を確認
- 変更単位を小さくする
- PR ごとに integration → staging → production の順で適用

短く言う:

- 「Terraform と ArgoCD の責任範囲を分け、差分を小さくして段階適用しました」

### Q7. SOC1 的には何が良くなる？

- 権限管理を共通基盤に寄せやすい
- 監査ログや運用手順を揃えやすい
- 独自クラスタごとの例外運用を減らせる
- レビュー対象を減らせる
- ただし、これだけで SOC1 対応が完了するわけではない

短く言う:

- 「SOC1 そのものを解決したというより、監査で説明しやすい運用統制に寄せました」

### Q8. Cron 二重起動は、技術対策だけで防ぐべきでは？

答え方:

- 理想は技術的に防ぐこと
- ただし当時は、移行スコープ・影響範囲・工数を見て、運用対策も併用した
- 起動時間を集約し、危険な時間帯を避ける
- CS 経由で事前通知し、影響が出た時に問い合わせが混乱しないようにする

当時やった記憶:

- CronJob suspend

今なら追加:

- DB lock
- idempotency key
- dry-run
- runbook

短く言う:

- 「技術対策が理想ですが、当時は移行リスクと工数を見て、運用対策も合わせました」

### Q9. これをリードしたと言える範囲は？

言えること:

- 人事労務チームとの調整
- 移行対象の洗い出し
- Terraform / manifest / IAM / RBAC / ArgoCD の移行
- integration → staging → production の段階移行
- Cron 二重起動リスクの整理
- production 移行の実施/確認

注意:

- 基盤全体の設計を全部自分が作ったとは言わない
- 人事労務側の既存クラスタ/基盤に乗せてもらった
- 自分は福利厚生側の移行をリードした、と言う

短く言う:

- 「EKS 基盤全体を作ったというより、福利厚生の独自クラスタを人事労務基盤へ統合する移行をリードしました」

---

## 10. 面接での話し方テンプレ

### 10.1 最初の回答

「freee福利厚生では、独自 EKS クラスタを人事労務側のクラスタへ統合する移行をリードしました。

背景として、独自クラスタを持っていると EKS のバージョンアップや権限管理、ログ、監査対応などの運用負荷が継続的に発生していました。福利厚生チーム単独で持つには重く、人事労務側の基盤に寄せることで運用と統制を揃えられるメリットがありました。

移行では、人事労務チームと調整して福利厚生用 namespace を用意してもらい、Terraform、Kubernetes manifest、IAM、RBAC、ArgoCD 周りを integration、staging、production の順に段階移行しました。

一番注意したのは Cron の二重起動です。旧クラスタと新クラスタで同じ Cron が同時に動くと、メール二重送信などの事故につながるため、Cron の起動時間を集約し、その時間帯を避けて production 移行しました。必要に応じて CS 経由の事前通知も行い、結果としてダウンタイムなしで移行できました。」

### 10.2 深掘りされた時

- なぜ統合:
  - 独自 EKS の運用負荷を下げるため
  - SOC1 観点で運用統制を揃えるため
  - 権限/ログ/監視基盤を共通化しやすくするため

- 何を移した:
  - namespace
  - manifest
  - Terraform
  - IAM
  - RBAC
  - ArgoCD
  - CronJob

- どう安全に移した:
  - integration → staging → production
  - production 前に手順を固める
  - Cron 起動時間を避ける
  - 移行後に pod / log / ArgoCD / Cron / 主要動線を確認

- 一番危なかったこと:
  - Cron 二重起動
  - メール二重送信
  - 外部連携の二重実行

- 当時やった記憶:
  - CronJob suspend

- 今なら追加する:
  - DB lock
  - idempotency key
  - rollback runbook
  - namespace quota / network policy

---

## 11. 実装済み / 改善案の整理

| 項目 | 状態 | 面接での扱い |
|---|---|---|
| 人事労務チームとの namespace 調整 | 実施 | やったこととして話す |
| integration → staging → production 段階移行 | 実施 | やったこととして話す |
| Terraform 移行 | 実施 | やったこととして話す |
| Kubernetes manifest 移行 | 実施 | やったこととして話す |
| IAM / RBAC 移行 | 実施 | やったこととして話す |
| ArgoCD 設定移行 | 実施 | やったこととして話す |
| Cron 起動時間の整理 | 実施 | やったこととして話す |
| CS 経由の事前通知 | 実施 | 運用対策として話す |
| CronJob suspend | 記憶では実施 | 確認できたら実施として話す |
| DB lock / idempotency | 改善案 | 今なら追加 |
| rollback runbook 明文化 | 改善案 | 今なら追加 |
| namespace quota / network policy | 改善案 | 今なら追加 |

---

## 12. 自分の評価

- 良かった点:
  - 独自クラスタ運用の負荷を構造的に減らした
  - 人事労務側と調整し、責任境界を作った
  - integration → staging → production の段階移行にした
  - Cron 二重起動という具体的な事故パターンを先に潰した
  - 技術対策だけでなく、CS 通知も含めてリスクを下げた

- 弱かった点:
  - CronJob suspend は入れた記憶があるが、DB lock や idempotency まではより堅くできた
  - rollback runbook はもっと明文化できた
  - namespace 分離の resource quota / network policy は今なら確認したい
  - 移行後の dashboard / alert は事前にもっと整備したい

- 面接での着地点:
  - 「クラスタ統合で、運用負荷と統制の問題を減らした」
  - 「production 移行では Cron 二重起動を一番警戒した」
  - 「CronJob suspend は入れた記憶があり、今なら lock / idempotency / rollback runbook まで整える」

