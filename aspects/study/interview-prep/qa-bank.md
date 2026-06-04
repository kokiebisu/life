# 面接 Q&Aバンク（共通）

> 複数の面接でよく聞かれる技術質問を蓄積するファイル。
> 会社横断で再利用するもの。会社固有の深掘りは `aspects/study/interview-prep/<会社>/` に置く。
> `/fukushuu` で復習。新しく聞かれた質問はここに追記する。

---

## セキュリティ: Row Level Security (RLS)

❓ Row Level Security とは何か。なぜ導入する？
→ DB の行単位でアクセス制御する仕組み。PostgreSQL なら `CREATE POLICY` で SELECT/UPDATE/DELETE に条件を埋め込む。アプリ層で `WHERE tenant_id = ?` を書き忘れてもDBが守る。Defense in depth（多層防御）。

❓ RLS を入れるときに気をつけることは？
→ ①パフォーマンス影響（POLICY の条件が全クエリに乗る）②マイグレーション時に既存クエリが壊れる ③デバッグ難（DBレベルでフィルタされるのでアプリ視点で「データが消えた」ように見える）。導入する前にアプリ層のテナントスコープを徹底できるか先に検討する。

❓ RLS を採用すべきケースは？
→ マルチテナントSaaS で PII を扱う / 監査要件がある / アプリ層のスコープに自信がないとき。逆に、テナント分離がアプリ層で完結していてレビューでカバーできるなら、複雑度を増やしてまで入れない判断もある。

---

## セキュリティ: 脆弱性の種類

❓ Web アプリでよくある脆弱性を5つ挙げてください
→ ①SQL Injection ②XSS（Cross-Site Scripting）③CSRF（Cross-Site Request Forgery）④Broken Access Control / IDOR ⑤SSRF（Server-Side Request Forgery）。OWASP Top 10 ベースで答える。

❓ XSS はなぜ起きる？対策は？
→ **原因:** ユーザー入力をHTMLにそのまま埋め込むと、`<script>` などが実行される。**対策:** ①コンテキストに応じたエスケープ（HTML / JS / URL で違う）②Rails なら ERB の自動エスケープ・`sanitize` を活用 ③Content Security Policy (CSP) で実行ソースを制限 ④信頼できる入力でも DOM 操作で `innerHTML` ではなく `textContent` を使う。

❓ SQL Injection はなぜ起きる？対策は？
→ **原因:** ユーザー入力をSQL文字列に連結すると、構文の一部として解釈される。**対策:** ①プレースホルダ（prepared statement）を使う。Active Record なら `where("name = ?", user_input)` または `where(name: user_input)`。文字列連結（`where("name = '#{user_input}'")`）は禁止 ②ORM を信頼しすぎず、生 SQL を書くときは特に注意 ③最小権限の DB ユーザー（read-only / write 分離）も二重防御として有効。

❓ CSRF とは？対策は？
→ ログイン中のユーザーに、別サイト経由で意図しないリクエストを送らせる攻撃。対策: CSRF トークン（Rails の `protect_from_forgery`）、SameSite Cookie、重要操作は `POST` + トークン必須。

❓ Broken Access Control（IDOR）とは？
→ 認可チェック漏れ。`/users/123/orders` で他人の `123` を入れたら見えてしまうケース。対策: コントローラで「このユーザーがこのリソースを触れるか」を必ず確認する。Pundit / CanCanCan のような認可ライブラリで一箇所に集める。

---

## Rails: Action 系

❓ Rails の RESTful アクションを列挙してください
→ 7つ: `index`（一覧）/ `show`（単体）/ `new`（作成フォーム）/ `create`（作成）/ `edit`（編集フォーム）/ `update`（更新）/ `destroy`（削除）。`resources :foo` でこの7つが自動でルーティングされる。

❓ Rails の Action* モジュールを列挙してください
→ `ActionController`（リクエスト処理）/ `ActionView`（テンプレート）/ `ActionMailer`（メール送信）/ `ActionCable`（WebSocket）/ `ActionDispatch`（ルーティング・ミドルウェア）/ `ActiveJob`（バックグラウンドジョブ）/ `ActiveRecord`（ORM）/ `ActiveStorage`（ファイルアップロード）。

❓ before_action と after_action はいつ使う？
→ コントローラの各アクション前後に共通処理を挟む。例: 認証チェック（`before_action :authenticate_user!`）、ログ記録、リソース取得の重複排除。`around_action` は前後で囲む（トランザクション・計測など）。

---

## Rails: CSV 登録

❓ CSV 登録の実装で気をつけることは？
→ freee 福利厚生で従業員 CSV 登録を扱った経験ベース。①パース時のエンコーディング（UTF-8 BOM / Shift_JIS 両対応）②全行バリデーションしてからまとめてエラーを返す（途中までインサート → ロールバックは UX が悪い）③大量データはバックグラウンド処理（Sidekiq + ActiveJob）にして進捗を DB に保存、UI でポーリング ④CSV Injection（`=` や `@` で始まるセルがダウンロード時に Excel で式実行される）対策 ⑤監査ログ（誰がいつ何件アップロードしたか）。

❓ 大量データのバルクインサートはどうする？
→ `insert_all` / `upsert_all`（Rails 6+）で1クエリにまとめる。Active Record の `create!` ループはバリデーション・コールバックが走る代わりに遅い。バルクなら数千行/秒。ただしバリデーションは事前にアプリ層で済ませる必要がある。

❓ 重複行の扱いは？
→ 業務キー（従業員番号など）で `upsert_all` する。新規 INSERT と既存 UPDATE を同時に処理。または、事前に既存レコードを `pluck` で全件取って差分計算してからバルク投入する。

---

## Rails / React のバージョン

❓ freee で使っていた Rails のバージョンは？
→ Rails 7 系。`要確認: 具体的なマイナーバージョン（7.0 / 7.1 / 7.2）` ※面接前に当時の Gemfile を確認するか、freee 公開ブログから推測

❓ React のバージョンは？
→ React 18 系。Suspense / 並行レンダリング世代。`要確認: 17 or 18`

❓ Next.js は使ったことある？
→ 個人プロジェクトと Coinmiles 時代に使用。`要確認: Pages Router か App Router か` / `要確認: SSR / SSG / ISR どれを使ったか`。直近の業務では React + Rails の構成だったので、Next.js は本業では使っていない、と素直に伝える。

---

## テスト

❓ 単体テストを書くときに気をつけていることは？
→ ①テスト名で「何をテストしているか」が読めるようにする（`describe '#calculate_total' do it 'returns sum of items' end`）②外部依存（API / DB / 時刻）はモックや stub で切る ③1テスト = 1 観点。複数のアサーションを詰め込まない ④AAA パターン（Arrange / Act / Assert）で構造を統一 ⑤カバレッジ 100% を目的化しない。重要なロジックを厚く、CRUD は薄くという優先順位を意識。

❓ 本番環境へのテストは書いたことあるか？
→ freee では、ステージング環境で E2E テスト（Playwright）を回してからリリース。本番では smoke テスト（read-only の疎通確認）のみ。**気をつけたこと:** ①副作用のあるテストは本番で絶対走らせない ②認証情報は Secrets Manager 経由でジョブから取得 ③カナリアリリース + フィーチャーフラグで段階的に有効化 ④Datadog / Bugsnag で異常検知し、エラー率が閾値超えたら自動ロールバック。

❓ TDD はやっていた？
→ 状況による。コアロジック・複雑な仕様（外部連携の認証フロー、業務計算）は Red-Green-Refactor。CRUD やプロトタイプは後追いでテストを書く。TDD を盲信せず、設計が固まっていない段階では手戻りコストの方が高いと判断するときもある。

---

## AI 活用

❓ 開発で AI をどう活用している？
→ freee Eラーニングで AI 駆動開発を導入した経験ベース。**個人技ではなくプロセスに組み込む** ことを意識した。①設計フェーズ: Design Doc / PRD の壁打ち相手として Claude を使う ②実装フェーズ: PR を小さくする command（タスク分解・差分プレビュー）③レビュー: CodeRabbit / Claude GitHub Actions で AI レビューを CI に組み込み ④実行環境: Claude Code を devcontainer 内で動かす。ホスト環境に影響しないので、ジュニアが安全に使える。

❓ AI を使ってジュニアが壊さない構造をどう作った？
→ ①Claude Code は devcontainer 内のみ ②AI が書いたコードも必ず人間レビュー + AI レビューを通る ③PR を小さく保つ command で、AI 生成物のレビュー粒度を制御 ④失敗時のロールバックコストを下げる（小さい PR = 戻しやすい）。結果として、ジュニアが AI を使いながら自走してフィーチャーを届けられる状態になった。

❓ AI に任せていることと、人間がやるべきことの線引きは？
→ **AI に任せる:** 定型実装、ボイラープレート、テストの第一稿、ドキュメント整形、コードレビューの一次フィルタ。**人間がやる:** 設計判断、優先度判断、ビジネス文脈の翻訳、AI 出力の妥当性チェック、最終的なマージ判断。AI は「思考の補助」であって「意思決定の主体」にはしない。

---

## メモ

- バージョン系の質問は事前に当時の Gemfile / package.json で確認する。曖昧な数字を言わない
- 「使ったことある？」系は、ない場合は素直に「業務ではない、個人で触った程度」と答える。盛らない
- セキュリティ系は OWASP Top 10 をベースに、自分の経験（freee の OEM 連携・認証設計）と紐付けて話す
