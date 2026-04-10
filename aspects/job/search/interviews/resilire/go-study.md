# Resilire 技術面接 Go 集中対策（10日）

> 目標: 「Goを書いたことがある」→「設計判断を語れるシニアエンジニア」
>
> **進捗管理 → [tracker.md](tracker.md)**
> チェックを入れる基準: ノートを見ずに2分で説明できる状態

---

## シニアレベルで語るために（全日共通）

面接官が本当に聞きたいのは「書けるか」ではなく「なぜそう設計するか」。

| 普通の答え | シニアの答え |
|-----------|-----------|
| 「goroutineで並列処理しました」 | 「MLとESの独立したI/Oを並列化しP99を1秒→200msに改善。ただし両方失敗した場合のフォールバックが必要だったのでchannelを使い、errgroupではなく個別結果を扱える設計にしました」 |
| 「errorsパッケージを使いました」 | 「レイヤごとにエラーを変換し、BFF層でHTTPステータスにマッピングしました。errors.Asで型安全に判定し、ログにはコンテキストを付けてラップしています」 |
| 「テストを書きました」 | 「外部APIのレスポンスだけモック。DBはtestcontainersで実際に立ち上げます。Resilireさんと同じ思想で、コンポーネント間はモックしません」 |

**ADRスタイルで答える:**
> 「〇〇を選びました。理由は△△です。××も検討しましたが、□□の理由で採用しませんでした」

---

## 優先度マップ（Resilireの記事に実際に出た順）

| トピック | 優先度 | 記事での登場 |
|---------|--------|------------|
| error handling（errors.As/Is, カスタム型） | ★★★ | MyError・typed nil 問題として記事化 |
| goroutine + channel + context | ★★★ | スレッドセーフ議論、graceful shutdown |
| interface / struct 設計 | ★★★ | 毎週の議論の基盤 |
| table-driven test / testcontainers | ★★★ | テスト文化の核心（Testing Trophy） |
| errgroup | ★★☆ | Pub/Sub retry, 並列処理 |
| sync（Mutex/Once/WaitGroup） | ★★☆ | スレッドセーフ設計 |
| gRPC（読める・概念を語れる） | ★★☆ | BFF↔Backend の通信基盤 |
| for-range のポインタ落とし穴 | ★★☆ | 専用Linterを自作するほど重要視 |
| defer / recover / panic | ★☆☆ | goroutine内のパニック対策 |

---

## Day 1-2：Go の土台（構文・型・interface）

### やること
- Go Tour をやる（https://go.dev/tour/）
  - Basics → Methods and Interfaces まで
  - Concurrency は Day3 に回す
- interface の使い方を自分の言葉で説明できるようにする

### Go Tour Basics チェックリスト
- [ ] 変数宣言（`:=` vs `var`）の違いを言える
- [ ] スライスとマップの基本操作を書ける
- [ ] `for range` の基本を書ける
- [ ] ポインタの基本（`*` と `&`）を説明できる

### interface（シニアレベルの理解）

```go
// interface = 型が持つべきメソッドの集合
// → 宣言不要。満たすだけでOK（duck typing）
type Sounder interface {
    Sound() string
}

type Dog struct{ Name string }
type Cat struct{ Name string }

func (d *Dog) Sound() string { return "woof" }  // ポインタレシーバ
func (c Cat) Sound() string  { return "meow" }  // 値レシーバ

func makeNoise(s Sounder) {
    fmt.Println(s.Sound())
}
```

**シニアの語り方:**
> 「Goのinterfaceは宣言不要のduck typingです。これにより、外部パッケージの型でも自分のinterfaceを実装できます。たとえばテスト時に本物のDBクライアントと同じinterfaceを持つモックを差し込めます」

### 値レシーバ vs ポインタレシーバ

| | 値レシーバ `(d Dog)` | ポインタレシーバ `(d *Dog)` |
|--|---------------------|--------------------------|
| 渡されるもの | コピー | 本物（アドレス） |
| struct の変更 | 元に影響しない | 元に影響する |
| interface の実装 | `Dog` も `*Dog` も満たす | `*Dog` しか満たさない |
| 使うとき | 読み取りのみ、小さい struct | 状態変更が必要、大きい struct |

**実務ルール: 同じ struct のメソッドはポインタレシーバに統一する**

### Typed nil 問題（面接頻出）

```go
// interface = (型情報, 値) のペアを内部で持つ
// nil interface = (nil, nil) だけ

func getError() error {
    var e *MyError = nil
    return e  // → (型: *MyError, 値: nil) = nil じゃない！
}

err := getError()
fmt.Println(err == nil)  // false ← 型情報が入っているから

// ✅ 正しい書き方
func getError() error {
    return nil  // → (nil, nil) = 本当の nil
}
```

**シニアの語り方:**
> 「typed nil は interface の内部実装を知っていないとハマります。interface は型情報と値のペアなので、ポインタが nil でも型情報が入っていれば nil 判定になりません。Resilireさんの記事でも取り上げられていて、エラー返却時は直接 nil を返すようにしています」

### interface 設計パターン（シニア向け）

```go
// ① 小さいinterfaceを組み合わせる（Goのイディオム）
type Reader interface { Read(p []byte) (n int, err error) }
type Writer interface { Write(p []byte) (n int, err error) }
type ReadWriter interface { Reader; Writer }  // 埋め込みで合成

// ② テスト可能な設計のためにinterfaceを使う
type MLClient interface {
    Fetch(ctx context.Context, userID string) ([]Segment, error)
}

type Recommender struct {
    ml MLClient  // ← 本物でもモックでも差し込める
}

// ③ 依存関係の逆転（上位レイヤがinterfaceを定義）
// Handler層がRepository interfaceを定義 → DB実装はそれを満たす
```

---

## Day 3：goroutine + channel + context

### やること
- Go Tour の Concurrency セクション
- `context.WithTimeout` / `context.WithCancel` の使い方
- select 文で複数 channel を待つパターン

### goroutine の基本とシニアの語り方

```go
// goroutine = 軽量スレッド（スタック初期2KB、必要に応じて拡張）
// OSスレッドと違いM:Nモデル → GoランタイムがOSスレッドにスケジューリング
go func() {
    // 独立して実行される
}()
```

**面接で聞かれる「goroutineとOSスレッドの違い」:**
> 「OSスレッドはスタックが1MB程度固定ですが、goroutineは2KBから始まり動的に拡張します。また、goroutineはGoランタイムがスケジューリングするのでコンテキストスイッチのコストが低く、数万個同時に立ち上げることができます」

### channel パターン

```go
// ① 基本: goroutineから結果を受け取る
ch := make(chan int, 1)  // バッファ付き → goroutineがブロックしない
go func() {
    ch <- compute()
}()
result := <-ch

// ② select: 複数channelを待つ
select {
case result := <-ch1:
    // ch1から受け取った
case result := <-ch2:
    // ch2から受け取った
case <-ctx.Done():
    // タイムアウトまたはキャンセル
}

// ③ close: 送信側がcloseする（受信側は絶対にcloseしない）
close(ch)
for v := range ch {  // closeされるまでループ
    process(v)
}
```

**シニアが気をつけること:**
- チャネルは送信側がクローズする（受信側がクローズするとパニック）
- バッファなしchannelはgoroutineリークの原因になりやすい
- goroutineが終了する前にchannelが閉じられないよう設計する

### context（キャンセル伝播）

```go
// context.WithTimeout: 子goroutineにタイムアウトを伝える
func fetchRecommendations(ctx context.Context) (Result, error) {
    ctx, cancel := context.WithTimeout(ctx, 800*time.Millisecond)
    defer cancel()  // 必須: リークを防ぐ

    mlCh := make(chan MLResult, 1)
    esCh := make(chan ESResult, 1)

    go func() {
        result, _ := callML(ctx)  // ctx経由でタイムアウトが伝わる
        mlCh <- result
    }()
    go func() {
        result, _ := callES(ctx)
        esCh <- result
    }()

    ml := <-mlCh
    es := <-esCh
    return merge(ml, es), nil
}
```

**なぜ `defer cancel()` が必要か:**
> 「context.WithTimeout はタイマーを作成します。cancel() を呼ばないとタイムアウトまでリソースが残り続けます。タイムアウト前に処理が終わった場合でも即座にリソースを解放するために defer cancel() が必要です」

### コーディング課題（Day 3 / Storyの核心）

```
以下を実装してください:
- fetchA() と fetchB() を goroutine で並列実行
- 両方の結果を待って結合して返す
- 全体に 800ms のタイムアウト
- どちらかがエラーでも、もう片方の結果は返す
```

---

## Day 4：error handling（最重要 / Resilireが記事にするほど重視）

### やること
- `errors.New`, `fmt.Errorf("%w", err)`, `errors.Is`, `errors.As` を全部手で書く
- カスタムエラー型を作って `errors.As` で取り出す

### エラーラップとアンラップ

```go
// エラーをラップする（コンテキストを付ける）
err := fmt.Errorf("fetchUser: %w", originalErr)

// errors.Is: エラーの同一性チェック（センチネルエラー）
var ErrNotFound = errors.New("not found")
if errors.Is(err, ErrNotFound) {
    // ErrNotFoundまたはErrNotFoundをラップしたエラー
}

// errors.As: エラーの型チェック（カスタムエラー型の取り出し）
var myErr *MyError
if errors.As(err, &myErr) {
    fmt.Println(myErr.Code)  // 型安全にフィールドにアクセス
}
```

**errors.Is vs errors.As の使い分け:**
> 「errors.Is は『このエラーか？』という同一性チェック。errors.As は『このエラー型か？』という型チェックで、カスタムエラー型のフィールドにアクセスしたい時に使います。センチネルエラーには Is、型情報が必要なら As です」

### Resilireが実際にやっていること（MyErrorパターン）

```go
type MyError struct {
    Code    int
    Message string
}
func (e *MyError) Error() string {
    return fmt.Sprintf("code=%d: %s", e.Code, e.Message)
}

// レイヤごとにエラーを変換
// Repository層
func (r *userRepo) FindByID(ctx context.Context, id string) (*User, error) {
    if notFound {
        return nil, &MyError{Code: 404, Message: "user not found"}
    }
    return nil, fmt.Errorf("FindByID: %w", err)  // DBエラーはラップして上に渡す
}

// Handler層（BFF）
func (h *Handler) GetUser(w http.ResponseWriter, r *http.Request) {
    user, err := h.usecase.GetUser(r.Context(), id)
    if err != nil {
        var myErr *MyError
        if errors.As(err, &myErr) {
            w.WriteHeader(myErr.Code)  // 404, 400 等にマッピング
            return
        }
        w.WriteHeader(500)  // 想定外エラー
    }
}
```

**シニアの語り方（ADRスタイル）:**
> 「エラーはレイヤごとに変換しています。Repository層はDBエラーをドメインエラーにラップ、Handler層でHTTPステータスにマッピング。errors.Asで型安全に判定するので、switch文でコードを分岐するより保守性が高いです」

### typed nil 問題（再確認・面接で確実に問われる）

```go
// ❌ 絶対にやらない
func getError() error {
    var e *MyError = nil
    return e  // (*MyError, nil) → nil ではない
}

// ✅ 正しい
func getError() error {
    return nil  // (nil, nil) → 本当の nil
}
```

---

## Day 5：errgroup + graceful shutdown

### errgroup vs channel の使い分け

```go
// errgroup: 1つでもエラーで全部キャンセルしたい時
g, ctx := errgroup.WithContext(context.Background())
g.Go(func() error { return callML(ctx) })
g.Go(func() error { return callES(ctx) })
if err := g.Wait(); err != nil {
    return err  // 最初のエラーが返る、他はキャンセルされる
}

// channel: エラーがあっても他の結果を使いたい時（Storyのケース）
mlCh := make(chan MLResult, 1)
esCh := make(chan ESResult, 1)
go func() { mlCh <- fetchML(ctx) }()
go func() { esCh <- fetchES(ctx) }()
ml, es := <-mlCh, <-esCh
// MLがエラーでもESの結果は使える
```

**面接で語れるようにする（ADRスタイル）:**
> 「MLとESを並列で叩くとき、errgroupだとMLがエラーになった時点でESの結果も捨てることになります。ESの結果だけ返してユーザーに何かしら見せたかったので、個別goroutineとchannelで受け取る設計にしました。これはStory 1で実際に選んだトレードオフです」

### sync パッケージ（シニア必須）

```go
// Mutex: 複数goroutineから共有データを守る
type Cache struct {
    mu   sync.RWMutex
    data map[string]string
}

func (c *Cache) Get(key string) (string, bool) {
    c.mu.RLock()   // 読み取りロック（複数同時OK）
    defer c.mu.RUnlock()
    v, ok := c.data[key]
    return v, ok
}

func (c *Cache) Set(key, value string) {
    c.mu.Lock()    // 書き込みロック（排他）
    defer c.mu.Unlock()
    c.data[key] = value
}

// sync.Once: 初期化を1回だけ実行
var once sync.Once
var instance *Singleton

func GetInstance() *Singleton {
    once.Do(func() {
        instance = &Singleton{}
    })
    return instance
}
```

**Resilireとの接続:**
> 「Resilireさんのブログで『ライブラリのスレッドセーフ性をドキュメントで確認する文化』が紹介されていました。自分もgoroutineで共有データを使う際は必ずsync.RWMutexを使い、ドキュメントに記載がない場合は保守的にロックを使います」

---

## Day 6：テスト（Resilireの文化の核心）

### Testing Trophy（Resilireの思想）

```
      E2E (少数)
    統合テスト (多数) ← Resilireが最重視
  単体テスト (適量)
静的解析 (全て)
```

> 「単体テストだけ増やしても、コンポーネント間の結合で問題が起きる。Resilireさんの記事で『コンポーネント間はモックしない』と書かれていた。自分もDBはtestcontainersで実際に立ち上げ、外部APIのレスポンスだけモックする方針をとっています」

### table-driven test（これを知らないとGoエンジニアに見えない）

```go
func TestAdd(t *testing.T) {
    tests := []struct {
        name     string
        a, b     int
        expected int
    }{
        {"positive", 1, 2, 3},
        {"zero", 0, 0, 0},
        {"negative", -1, -2, -3},
        {"overflow case", math.MaxInt, 1, math.MinInt},  // エッジケースも
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got := Add(tt.a, tt.b)
            assert.Equal(t, tt.expected, got)
        })
    }
}
```

### testcontainers（統合テストの書き方）

```go
func TestUserRepository(t *testing.T) {
    ctx := context.Background()

    // 実際のPostgreSQLコンテナを起動
    pgContainer, err := postgres.RunContainer(ctx,
        testcontainers.WithImage("postgres:16"),
        postgres.WithDatabase("testdb"),
        postgres.WithUsername("user"),
        postgres.WithPassword("password"),
    )
    require.NoError(t, err)
    defer pgContainer.Terminate(ctx)

    connStr, _ := pgContainer.ConnectionString(ctx)
    db, _ := sql.Open("pgx", connStr)

    repo := NewUserRepository(db)
    // 本物のDBで統合テスト
    user, err := repo.FindByID(ctx, "123")
    assert.NoError(t, err)
    assert.Equal(t, "123", user.ID)
}
```

---

## Day 7：gRPC（概念と読み方）

### 目標：「BFFとBackendの間でgRPCを使う設計」を語れること

```protobuf
// .proto ファイル: interfaceの定義（言語に依存しない）
syntax = "proto3";

service UserService {
    rpc GetUser (GetUserRequest) returns (User);
    rpc StreamUsers (StreamRequest) returns (stream User);  // サーバーストリーミング
}

message GetUserRequest { string id = 1; }
message User { string id = 1; string name = 2; }
```

**REST vs gRPC の使い分け（ADRスタイル）:**
> 「外部公開APIはRESTにしました。クライアントが多様で、ブラウザからもcurlでもアクセスできる必要があったためです。BFFとBackend間はgRPCにしました。Protobufで型安全に定義でき、HTTP/2のストリーミングが必要なケースもあったためです。内部通信の型不整合バグをコンパイル時に検出できる点も採用理由の一つです」

---

## Day 8：for-range の落とし穴 + defer/recover

### for-range ポインタ問題（Resilireが専用Linterを作るほど重要視）

```go
// ❌ バグパターン（Go 1.21以前）
users := []User{{Name: "A"}, {Name: "B"}}
ptrs := []*string{}
for _, u := range users {
    ptrs = append(ptrs, &u.Name)  // 全部最後のuのアドレスを指す！
}
// ptrs[0] と ptrs[1] が同じアドレスになる

// ✅ Go 1.21以前の正しい書き方
for i := range users {
    ptrs = append(ptrs, &users[i].Name)  // スライスのアドレスを直接使う
}

// ✅ Go 1.22以降: ループ変数がイテレーションごとにコピーされるので問題なし
```

**Resilireとの接続（面接で刺さる一言）:**
> 「Resilireさんが go/analysis でこのパターンを検出するカスタムLinterを作られていましたよね。Go 1.22以降は仕様変更で解消されましたが、それ以前のコードを読む場合や、チームに周知する意味でも重要な落とし穴だと思っています」

### defer / recover / panic

```go
// goroutine内のpanicはrecover()で捕まえないとプロセスが死ぬ
func safeGo(fn func()) {
    go func() {
        defer func() {
            if r := recover(); r != nil {
                log.Printf("recovered from panic: %v", r)
            }
        }()
        fn()
    }()
}

// deferの実行順は LIFO（後に書いたものが先に実行）
func example() {
    defer fmt.Println("3")  // 最後に実行
    defer fmt.Println("2")
    defer fmt.Println("1")  // 最初に実行
}
```

---

## Day 9：実践コーディング

### 課題：Story 1のGoコアを再現する

```
recommendation-service/
  main.go
  handler.go        // HTTP handler
  recommender.go    // 並列処理 + フォールバック
  recommender_test.go  // table-driven test
```

`recommender.go` の核心:
```go
type Recommender struct {
    ml    MLClient
    es    ESClient
    cache CacheClient
}

func (r *Recommender) Get(ctx context.Context, userID string) ([]Segment, error) {
    ctx, cancel := context.WithTimeout(ctx, 800*time.Millisecond)
    defer cancel()

    mlCh := make(chan []Segment, 1)
    esCh := make(chan []Segment, 1)

    go func() { mlCh <- r.ml.Fetch(ctx, userID) }()
    go func() { esCh <- r.es.Search(ctx, userID) }()

    ml, es := <-mlCh, <-esCh

    if ml != nil {
        return merge(ml, es), nil  // 両方使える場合はマージ
    }
    if es != nil {
        return es, nil  // MLが落ちてもESで返す（フォールバック）
    }
    return r.cache.GetTop5(ctx), nil  // 両方落ちたらキャッシュ
}
```

**面接での語り方:**
> 「GoでマイクロサービスをGroundtruthでゼロから構築しました。MLとESを並列で叩き、P99を1秒以内に抑えました。この設計のポイントはフォールバック階層です。MLが落ちてもESで返せる、両方落ちてもキャッシュで返せる、という3段構えにしました。errgroupではなくchannelを使ったのは、片方のエラーで全体をキャンセルしたくなかったからです」

---

## Day 10：面接前日

- `tracker.md` の逆質問を再確認
- STARストーリーを声に出して練習（Go版 Story 1 を3分で言えるか）
- 「GCPは未経験ですが、KubernetesはEKSで深く触っています」を自然に言えるか確認

---

## 面接当日のGo質問への答え方指針

**「Goの経験を教えてください」**
> 「GroundtruthでレコメンデーションのマイクロサービスをGoでゼロから構築しました。MLとElasticsearchをgoroutineで並列実行してP99 1秒以内を達成した経験があります。freeeではRuby/TypeScriptがメインだったので、Goのより深い設計パターン——errgroupとchannelの使い分け、errors.Asによる型安全なエラーハンドリングなど——は直近で改めて整理しています」

**「goroutineでの並列処理、具体的にどう書きますか」**
→ Day 3/9 で実際に書いたコードをベースに、errgroupとchannelの使い分けまで語る

**「errors.AsとIs の違いは？」**
→ 同一性チェック vs 型チェック、それぞれのユースケースを具体例で答える

**「テストはどう書いていますか？」**
→ Testing Trophy、table-driven test、testcontainers、モックはAPIレスポンスのみ

**深すぎる質問が来たら**
> 「その部分は正直まだ経験が浅いです。ただ〇〇の観点は理解していて、実務で使いながら深めたいと思っています」
→ 知らないのに答えようとするより信頼される
