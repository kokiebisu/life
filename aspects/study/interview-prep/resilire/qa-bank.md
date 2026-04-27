# Resilire 面接対策 Q&Aバンク

> 忘却曲線ベースで復習するための問いを蓄積するファイル。
> `/interview-prep review` で復習セッションを開始。
> セッション終了時に新しい問いを追記していく。

---

## Go: Interface

❓ Goのinterfaceとduck typingの関係を説明してください
→ implementsを明示しなくてもメソッドを実装すれば自動的にinterfaceを満たす。宣言不要。

❓ 値レシーバとポインタレシーバの違いは？いつどちらを使うか？
→ 値レシーバはコピーを渡す（元に影響なし）、ポインタレシーバは本物を渡す（元を変更できる）。基本ポインタレシーバに統一する。同じstructのメソッドは混在させない。

❓ typed nil 問題とは何か。なぜ起きるか。
→ interfaceは(型情報, 値)のペアを持つ。*MyError型のnilをerror interfaceで返すと(*MyError, nil)になり、型情報があるのでnil判定がfalseになる。直接 `return nil` で返すのが正解。

❓ ポインタレシーバで実装したinterfaceに値を渡すとどうなるか？
→ コンパイルエラー。`var s Sounder = Dog{"Rex"}` はエラー。`&Dog{"Rex"}` を渡す必要がある。

---

## Go: Basics

❓ スライスの `a[X:Y]` はコピーを作るか？
→ コピーしない。元の配列への「窓」。b[0]を変えるとa[1]も変わる。コピーしたい場合は `copy()` を使う。

❓ mapのキーが存在するか確認する書き方は？
→ `value, ok := m["key"]` の2値受け取りを使う。`ok` が false なら存在しない。

❓ `:=` と `var` の使い分けは？
→ `:=` は型推論あり・関数内のみ。`var` は型推論なし・パッケージレベルでも使える。後からnilを置き換えるものは `var` で宣言しておく。

---

## DB: 正規化

❓ 1NF・2NF・3NFをそれぞれ一言で説明してください
→ 1NF: 1カラムに複数値を持たない。2NF: 複合PKの一部にしか従属しないカラムを排除。3NF: 非キー列が別の非キー列に従属しない。

❓ 2NF違反が起きる条件は？単一PKのテーブルでも起きるか？
→ 複合主キーのときだけ起きる。単一PKの場合は2NF違反は起きない（その場合は3NF違反になる）。

❓ 3NF違反のパターンを例で説明してください
→ `employees: id, department_id, department_name` → department_id（非キー）→ department_name（非キー）に従属。解決: departmentsテーブルに分離してFKだけ持つ。

❓ `orders: order_id, product_id, product_name, quantity` の問題は何NF違反か？
→ 3NF違反。order_id（PK単一）なので2NFは関係ない。product_id（非キー）→ product_name（非キー）に従属。

---

## DB: N+1

❓ N+1問題とは何か？なぜ起きるか？
→ リスト取得後、各要素に対して別テーブルへの追加クエリが発生し合計1+Nクエリになる問題。ループ内でDB問い合わせをするORMコードで起きやすい。

❓ N+1の解決方法を2つ挙げてください
→ ①JOIN（1SQLで結合）②Eager Loading（IN句でIDをまとめて一括取得 → アプリ側でマージ）

❓ JOINとEager Loadingの使い分けは？
→ テーブル2〜3個・条件シンプル → JOIN。ネストが深い・JOINで行が爆発する・分散DBでJOINできない → Eager Loading（IN句）

❓ Eager Loadingとは何か？「Eager」の意味は？
→ 必要なデータを前もってまとめて取っておく戦略。Eager=前のめり（Lazy=必要になったときに取る の逆）。IN句でIDを一括取得してアプリ側でマージする。

❓ sqlcとGORMの違いは？Resilireはどちらを使っているか？
→ GORMはActiveRecord型ORM（N+1が起きやすい）。sqlcはSQLを先に書いてGoコードを生成（意図しないN+1が起きにくい・型安全）。ResiireはsqlcをUse。

---

## DB: cursor pagination

❓ offset paginationの問題点を2つ挙げてください
→ ①ページが進むほど大量の行を読んで捨てるため遅くなる ②データの挿入・削除があるとズレが生じ、同じデータが2回出たり抜けたりする

❓ cursor-based paginationの仕組みを説明してください
→ 前のページの最後のレコードのIDをカーソルとして次のクエリに渡す。`WHERE id > [cursor]` でインデックスを使って一発で飛べるため、何ページ目でも速度が一定。

❓ なぜ `ORDER BY created_at` だけでcursor paginationが問題になるか？
→ 同じcreated_atのレコードが複数あるとカーソル位置が特定できない。`ORDER BY created_at, id` の複合にしてユニーク性を保証する必要がある。

❓ cursor paginationのトレードオフは？
→ メリット: 速度一定・データズレなし。デメリット: 任意ページへジャンプできない（ページ番号から計算できないため）・ソート列にインデックスが必要。

---

## システム設計: キュー設計

❓ APIサーバーが通知を直接送信せずキューに積む理由は？
→ ①レスポンス遅延の防止（I/O待ちでスレッドをブロックしない） ②タイムアウトリスク回避 ③失敗時にDLQ（Dead Letter Queue）でリトライ管理できる

❓ システム設計の5ステップは？
→ ①要件確認（機能・非機能） ②スケール見積もり（QPS・ストレージ） ③全体構成（High-Level Design） ④深掘り（ボトルネック・トレードオフ） ⑤改善案

❓ QPS計算: DAU100万・1ユーザー1日10アクション → QPS は？
→ 1000万 ÷ 86400秒 ≈ 115 QPS（面接では「約100 QPS」と丸める）

❓ 99.9%と99.99%の可用性の違いは？
→ 99.9%（スリーナイン）= 年間約8.7時間ダウン。99.99%（フォーナイン）= 年間約52分。一般SaaSは99.9%が目安。

---

## Go: Error Handling

❓ GoのエラーハンドリングはPythonやRubyと何が違うか？
→ 例外ではなく戻り値としてerrorを返す。制御フローが visible（if err != nilが必ず目に入る）。try/catchはどこで例外が飛ぶか追いにくい。

❓ `%w` と `%v` の違いは？
→ %wはエラーをラップして中に保持する。errors.Is/errors.Asで掘り下げ可能。%vは文字列として埋め込むだけで元のエラーへのアクセスは失われる。

❓ `errors.Is` と `errors.As` の使い分けは？
→ errors.Isはsentinel error（定義済み固定エラー変数）に対してインスタンスが一致するかYes/Noで確認。errors.Asはカスタムエラー型（struct）として取り出して中のフィールドにアクセスしたいとき。

❓ typed nil問題とは何か？なぜ起きるか？対策は？
→ error interfaceは(型情報, 値)のペアを持つ。*MyError型のnilをerror interfaceで返すと(*MyError, nil)になり型情報があるのでnil判定がfalse。対策: nilを返すときは必ず `return nil` と明示する。

## DB: Audit カラム設計

❓ `created_by` をID（UUID）にする理由は？
→ ①参照整合性をDBレベルで担保（存在しないIDは入れられない） ②GDPR対応（名前を文字列で保存すると削除時に全テーブル検索が必要。IDなら個人情報だけ消せる）

❓ ユーザー削除時のON DELETE選択肢とトレードオフは？
→ RESTRICT: 参照があると削除エラー / CASCADE: 関連レコードも全削除（監査ログも消える） / SET NULL: created_byをNULLにする。Resilireの結論はsoft delete + nullable FK。

❓ GDPRへのsoft delete対応でユーザーの個人情報をどう消すか？トレードオフは？
→ ①NULL上書き: 完全に消える・GDPR的に完全。NULLチェックがアプリ全体に必要。 ②削除済み文字列: NULLチェック不要・UIに「削除済み」表示可。IDが残るためGDPR解釈によっては問題になりうる。

## システム設計: 災害アラート

❓ 災害アラートシステムの重要な非機能要件は？
→ ①可用性（災害時こそ稼働必須） ②即時性（数秒を争うレベルではなく、届けばよい） ③冪等性（同じアラートが2回届かないようにする）

❓ APIサーバーが直接10,000通知を送らずキューを使う理由は？
→ スパイク時のタイムアウトリスク・CPU/メモリ圧迫を避けるため。キューに積んでWorkerが順番に処理することでAPIサーバーへの負荷を分離できる。

❓ 失敗した通知メッセージをDLQ以外で管理する方法とトレードオフは？
→ ①DLQ: 失敗メッセージを保持・再処理できる。インフラが増える。 ②即時リトライ（指数バックオフ）: シンプル・インフラ少ない。長時間リトライで後続が詰まる。 ③DBでリトライ管理: 柔軟・可視性高い。実装コストが高い。

## Go: table-driven test / testcontainers

❓ table-driven test とは何か？なぜGoで好まれるか？
→ テストケースをstructのスライスで定義し、t.Runでサブテストに名前をつける書き方。失敗時にどのケースが落ちたか名前で分かる（`--- FAIL: TestAdd/負の数`）。ケースを追加するだけで関数を新たに書かなくていい。

❓ testcontainers を使う理由は？モックとの違いは？
→ DBをDockerコンテナとして実際に立ち上げてテストする。モックだとDBバージョンアップ時に乖離が生まれる、マイグレーション後の確認ができないなど本番との差異が生じる。Resilireは「コンポーネント間はモックしない」方針。

❓ Testing Trophy とは何か？Resilireとの関係は？
→ 統合テストを最重視するテスト戦略のピラミッド（E2E少数・統合テスト多数・単体テスト適量・静的解析全て）。Resilireは「コンポーネント間の結合で問題が起きる」としてこの方針を採用している。

## DB: N+1 / EXPLAIN ANALYZE

❓ N+1問題とは何か？解決策は？
→ 1回のクエリで全件取得後、各レコードに対してN回個別クエリが走る問題。解決はEager Loading（JOINまたはIN句で一括取得）。ORMのPreloadはINを、JoinsはJOINを使う。

❓ EXPLAIN ANALYZEで見るべき3点は？
→ ①Seq Scan vs Index Scan（Seqは全件舐めてる） ②actual time（実際にかかった時間ms） ③Rows Removed by Filter（捨てた行数が多いほど無駄なスキャン）

## システム設計: キャッシュ戦略

❓ キャッシュの置き場所の選択肢とトレードオフは？
→ ①アプリ内メモリ: 速いが複数台で共有できない ②Redis: 全サーバーで共有・TTL管理が楽、ネットワークレイテンシ数ms ③CDN: 最速だが動的検索には向かない。マルチテナントSaaS+動的検索はRedisが定番。

❓ Cache Invalidationの3方式とトレードオフは？
→ ①TTL待ち: シンプル、最大TTL時間古いデータが残る ②イベント駆動: 更新時にキャッシュキーを削除→次の読み込み時にDB取得、即座に反映だが実装複雑 ③Write-through: DBとキャッシュを同時書き換え、常に最新だが更新コストが高い

❓ RedisがSPOFになる問題の対策は？
→ ①レプリケーション（マスター・スレイブ構成） ②フォールバック（ヘルスチェックでRedisの死活を確認し、落ちていたらES/DBに直接問い合わせ）

## コードレビュー面接

❓ コードレビューの優先度ラベル（must / should / nit）の3段階を、それぞれ「マージ可否」「例」とセットで説明してください
→ **must/blocker** = バグ・データ破損・セキュリティ、マージ不可、例: race condition / SQL injection / resource leak。**should** = 設計・運用・テスタビリティの問題、議論の上で直す、例: errgroup 使うべき / エラー握りつぶし / N+1。**nit/suggestion** = 好み・命名・軽微な可読性、そのまま merge OK、例: 変数名・コメント追加・order。**理由 + 修正案**を必ずセットで言語化する。

❓ コードレビュー指摘で「面接で評価される話し方」のテンプレは？
→ 「これは **must** です。理由は〇〇。修正案としては△△」「これは **nit** なんですが、××だと将来見たとき分かりやすいかもしれません」。優先度ラベル + 理由 + 修正案 の3点セット。理由が言えないと「指摘の温度感が分からないレビュアー」と見られる。

## Go: 並行性 race condition

❓ Goで `results = append(results, info)` を複数 goroutine から並行実行すると何が起きるか？
→ race condition。`append` は CPU 命令的に1命令ではなく ①len/cap 読み ②必要なら新配列確保 ③末尾書き込み ④新スライスヘッダ代入 の4ステップに分解される。同時実行されると上書き・データロストが発生。`go run -race` で必ず検出される。

❓ `make([]T, 0, len(ids))` で cap を pre-allocate すれば append の race は防げるか？
→ 防げない。新配列確保（手順②）は走らないが、手順①〜④自体が racy。「len=0 を読む」を A と B が同時に行い、両方が index 0 に書き、両方が len=1 にする → A のデータが B に上書きされて消える。

❓ Go の map に複数 goroutine から書き込むと何が起きるか？panic との違いは？
→ runtime が `fatal error: concurrent map writes` でプロセスごと殺す。これは panic ではなく runtime fatal error なので **recover 不可**。保護されてない map を並行で書く = 本番でプロセス死。対策は `sync.Mutex` / `sync.RWMutex` / `sync.Map`。

❓ 並行な集約処理を直す3つの修正案と、それぞれをいつ選ぶか？
→ ①**channel で集約**: 各 goroutine は送るだけ・main 1人で受けて append。データ集約・パイプライン的な使い方に。"share memory by communicating"。 ②**sync.Mutex**: append を `mu.Lock(); defer mu.Unlock()` でガード。短く済ませたいとき。 ③**errgroup + pre-allocated slice + index 書き込み**: index ごとに別アドレスを書くので race にならない。ctx キャンセル + エラー伝播も付いてくる。**外部 API 並列の定石、Resilire の本命**。

❓ `sync.Mutex` で `Lock()` の直後に `defer Unlock()` を書くイディオムの理由は？
→ 関数の途中で `return` や panic が起きても defer は実行されるため、ロックリーク（Unlock 忘れ → 次の Lock で永遠に待つデッドロック）を防げる。

❓ `sync.Mutex` と `sync.RWMutex` の使い分けは？
→ Mutex は読みも書きも排他（同時に1人）。RWMutex は読みは並列（RLock）・書きのみ排他（Lock）。read-heavy なキャッシュは RWMutex、書き込みも多いなら Mutex の方がオーバーヘッドが小さい。

❓ channel で結果集約するときバッファサイズを `len(ids)` にする理由は？
→ バッファ無しだと送信は受信が読むまでブロックする。`wg.Wait()` 後に close する設計の場合、送信中に受信が始まっていないとデッドロック。バッファ `len(ids)` あれば全 goroutine が受信前に送信完了できる。

❓ `errgroup.WithContext` を使った並列処理で、各 goroutine の結果をどう集めると race にならないか？
→ pre-allocated slice（`make([]T, len(ids))`）に対して **index ごとに書き込む**。`results[i] = info` は別アドレスへの書き込みなので race にならない。append のように共有スライスヘッダを更新しないのが鍵。

## アルゴリズム: Graph / Tree

❓ ツリーとグラフの違いは？
→ ツリーは「親が1つ・ループなし」のグラフの特殊形。グラフは親が複数OK・ループOK。現実のサプライチェーンは親が複数いるためツリーで表せない（村田製作所がデンソーにもボッシュにもパナソニックにも供給する等）。

❓ Goでグラフを表現する定番データ構造は？なぜstructの`Children []*Node`を使わないのか？
→ 隣接リスト `map[string][]string` を使う。struct方式だと（1）名前で引けないので別途インデックスが必要、（2）同名ノードが別オブジェクトになりやすく整合性が崩れる。mapならkey=名前/IDで一意・O(1)アクセス・エッジ追加が`append`一発。

❓ グラフ構造とノードの属性データを別の map で持つ理由は？
→ 役割を分ける。`graph map[ID][]ID`はつながりだけ、`suppliers map[ID]Supplier`はノードの属性。これで（1）データ重複なし、（2）属性更新が1箇所で済む、（3）`map[ID][]Node`にすると同一ノードがコピーされてズレる。

❓ エッジ存在チェックを O(1) で行うにはどうする？
→ `map[string][]string`を`map[string]map[string]struct{}`に変える。`graph["村田"]["デンソー"]`でO(1)。`struct{}`はゼロサイズなのでメモリ最適。トレードオフ: 隣接ノードの順序は失われる。

❓ BFSとDFSの使い分けは？
→ 最短ホップ数→BFS（レベル=距離）、到達可能ノード全列挙→どっちでも、循環依存検出→DFS（コールスタック=今のパス）、トポロジカルソート→DFS。

❓ BFSで visited を enqueue 時にマークする理由は？dequeue 時ではダメか？
→ enqueue 時にマークしないと同じノードがキューに何度も入る（メモリ・時間が無駄、最悪指数爆発）。enqueue 時にマークすれば各ノードは一度しかキューに入らない。

❓ Goでキューを表現するときの定番イディオムと注意点は？
→ `queue := []string{...}`、enqueue は `append(queue, x)`、dequeue は `current := queue[0]; queue = queue[1:]`。`queue[1:]`は内部的にO(n)のため大規模では`container/list`やring bufferを使う。面接では読みやすさ優先でslice方式でOK。

❓ DFSで cycle 検出するときに 3色塗り分け（WHITE/GRAY/BLACK）が必要な理由は？
→ 2値のvisited(true/false)だと、A→B、A→C、B→Cのとき A→B→C 後に A→C を試すと「Cはvisited」で誤って cycle 判定してしまう。GRAY=今のパス上、BLACK=訪問完了して戻った、を区別すれば「GRAYを踏んだ時だけcycle」と正確に判定できる。

❓ BFSの計算量は？
→ 時間 O(V+E)、空間 O(V)。各ノード1回・各エッジ1回処理。visitedとqueueでV個分のメモリ。

<!-- 以下に新しいセッションの問いを追記していく -->
