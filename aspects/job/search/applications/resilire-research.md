# Resilire 技術調査（全44記事）

> zenn.dev/resilire の全記事を読み込んだキャッシュ。最終更新: 2026-04-09

---

## テックスタック全体

### フロントエンド
- Vite + React + TypeScript（Next.js は使わない。静的ファイルで十分）
- Turborepo + pnpm monorepo
- TanStack Query（React Query）、React Hook Form + Zod
- @generouted/react-router、i18next、Sentry
- Vitest、Cypress、MSW（テスト）
- Orval で OpenAPI から mock factory 自動生成
- Storybook（Chromatic でスナップショット管理）

### バックエンド（Go）
- Go + Echo（BFF層、REST）
- Go + gRPC + SQLBoiler ORM（Backend層）
- PostgreSQL（Cloud SQL）、PostGIS（地理座標）
- sqlc（型安全クエリ生成を検討中）
- カスタムエラー型「MyError」、errors.As() パターン
- testcontainers でインテグレーションテスト

### インフラ
- Google Cloud 全面採用（GKE Autopilot）
- Terraform（IaC）、ArgoCD（CD）、GitHub Actions（CI）
- CodeRabbit（AIコードレビュー）
- Sentry、Prometheus、Grafana、Datadog

### タスク・コミュニケーション
- Asana（プロジェクト管理）、Zapier（自動化）、Slack
- Stoplight（OpenAPI仕様管理）※廃止検討中
- Gather（リモートオフィス）
- Devin（AI自動レビュー）、Greptile（学習型AI）

### AI活用
- Claude Code + MCP（Figma MCP、Asana MCP、Playwright MCP、O3 MCP）
- Cursor
- PRD起点のAI中心開発フロー（`_rules/`, `_templates/`, `_knowledge/`）
- Playwright でE2EテストをPRDから自動生成（検討中）

---

## アーキテクチャの変遷

### SCRM 1.0
- BFF / Backend を分離（将来のマイクロサービス化を見越して）
- BFF: ビジネスロジック + 認証
- Backend: ドメインモデル + DB操作

### SCRM 2.0（現在）
- 問題発生: ビジネスロジックがBFF/Backendに分散
- 複雑クエリ（MAP表示、再帰クエリ）でBackend側に落とす必要が出た
- BatchとDBの間にBackendが挟まり非効率
- **対応:** BFFをProtobuf→JSON変換専用に絞る / Batch+Backend統合

### SCRM 3.0（検討中）
- マイクロサービス vs モジュラモノリス議論 → **モノリス採択**
- 理由: チームが少ない / プロダクトがまだ試行錯誤段階 / JOINできる状態を保ちたい
- **CQRS導入**: Query層はドメインロジック不要、DB直接クエリ
- 新プロダクトはモジュラモノリス方針

---

## 技術的な深さ・レベル感

### 高い技術力が見える箇所
- Go AST を使ったカスタムLinter開発（for range ポインタ問題を自動検出）
- Dependabot + 自動生成ファイル問題を `dependabot.go` ブランクインポートで解決
- sqlc の MIN(timestamp) 型推論問題（PostgreSQL型システムの深い理解）
- 台風経路図: Graham scan 凸包アルゴリズム + GEOS Buffer で自己交差除去（10〜20ms）
- testcontainers でDB直接テスト（mock禁止）
- TanStack Query の retry デフォルト問題に気づき全体方針を変える
- Pub/Sub のメッセージ順序管理、冪等性、graceful shutdown 設計
- cursor-based pagination の PK ソート優位性を議論

### 設計思想の深さ
- ADR文化（2023年〜。ADR導入自体をADRで決めた）
- エラーハンドリング: MyError パターン、typed nil 問題、i18nキー統一
- PATCH → PUT 移行（顧客セキュリティ設定でPATCH禁止のケースへの対応）
- HTTP Method Override ヘッダーも検討
- boolean カラム命名: `has_xxx` / `is_xxx` Lintルール
- barrel file 廃止（未使用コード検出を改善）
- CSV COPY の NULL 文字列リテラル問題
- RLS（Row Level Security）のスコープ整理

---

## QA・テスト戦略

- **Testing Trophy**: 静的解析 > インテグレーション > ユニット > E2E
- フロントエンドカバレッジ 90%以上（CodeCov で閾値設定）
- Orval で OpenAPI → mock factory 自動生成 → テストコスト削減
- モック方針: "APIレスポンスだけモックする"
- Autify（E2E自動化）
- VRT（Chromatic）: フリーティアで検証中
- QA Working Group 始動（2026-03）: E2E・APIテスト改善
- Playwright でE2EシナリオをPRDから自動生成（PoC検討中）
- テスト観点: 単体・結合はエンジニア / E2E戦略はQAがリード
- 一人目QAを採用中（Playwright + GitHub Actions + AI活用できる人）

---

## 開発文化

- **仕組みで守る**: 個人の努力ではなく自動化・ルール化で品質を担保
- **ADR**: `docs/adr/` に backend / frontend / development / spec の区分で管理
- **フルサイクルエンジニア**: 設計→実装→運用→カスタマーサポートまで担当
- **越境前提**: バックエンド担当でもフロントエンド・インフラに手を出す
- **ミーティング文化**: 朝会・金曜振り返り程度。出席任意、テキスト報告可
- **リモートファースト**: 出社義務なし、Gather でバーチャルオフィス
- **能力密度**: "能力密度が高く、優れた人格を持つ人たち"を重視
- **失敗の公開**: GCP試験落ちの反省記事・pgドライバ不一致バグを正直に書く
- **Go愛**: Go Conference 2024 Silver → 2025 Gold スポンサー

---

## インシデント対応

- Zapier で Asana / Slack / Notion を自動連携
- 5つのロール定義（Reporter / Incident Commander / etc.）
- インシデントコマンダーは誰でも担当可能（Asanaのチェックリストで誘導）
- ポストモーテム: まずチームの努力を称えてから課題分析（心理的安全性）
- 1〜2週間で検出からポストモーテムまで完結

---

## プロダクトドメイン（サプライチェーンリスク管理）

- 気象庁XMLデータを解析して災害情報を可視化
- 台風・洪水・地震の被害地域とサプライヤー施設の位置情報を重ねる
- PostGIS で地理座標処理
- BCP（事業継続計画）遵守: 東京・大阪のデュアルリージョン
- エンタープライズ顧客: Auth0でSAML/OIDC SSOをほぼノーコード対応
- 顧客のセキュリティポリシーが厳しい（PATCHメソッド禁止など）

---

## 採用文脈

- **プロダクトエンジニア**: 越境前提、フルサイクル、ユーザー視点
- **一人目QAエンジニア**: 戦略設計・リード役（実行者ではなく設計者）
- Go Conference にシルバー→ゴールドとスポンサー継続（Goエンジニア採用を重視）

---

## 最新の技術課題（2026-03〜04時点）

- Changeset テーブル導入（データ変更管理）
- PDF出力機能の設計（Headless Chrome / バッチ事前生成方式）
- QA WG 始動（E2E・APIテスト体制）
- changeset + 監査ログのパーティショニング戦略
- Pub/Sub の Message Ordering 最小化
- デザインQA自動化（Figma↔コード連携）
- Go 1.24 EOL 対応
- distroless コンテナイメージへの統一
- Playwright E2E 自動化PoC
- AI コードレビュー（Devin 再有効化、Greptile 試験中）
