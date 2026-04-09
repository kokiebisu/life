# Resilire 技術面接 Go 集中対策（10日）

> 4/10〜4/19 / 面接: 4/20前後
> 目標: 「Goを書いたことがある」→「Goの設計判断を語れる」
>
> **進捗管理 → [resilire-tracker.md](resilire-tracker.md)**
> チェックを入れる基準: ノートを見ずに2分で説明できる状態

---

## 優先度マップ（Resilireの記事に実際に出た順）

| トピック | 優先度 | 記事での登場 |
|---------|--------|------------|
| error handling（errors.As/Is, カスタム型） | ★★★ | MyError・typed nil 問題として記事化 |
| goroutine + channel + context | ★★★ | スレッドセーフ議論、graceful shutdown |
| interface / struct 設計 | ★★★ | 毎週の議論の基盤 |
| errgroup | ★★☆ | Pub/Sub retry, 並列処理 |
| table-driven test / testcontainers | ★★☆ | テスト文化の核心 |
| gRPC（読める・概念を語れる） | ★★☆ | BFF↔Backend の通信基盤 |
| for-range のポインタ落とし穴 | ★☆☆ | 専用Linterを自作するほど重要視 |
| defer / recover / panic | ★☆☆ | goroutine内のパニック対策 |

---

## Day 1-2：Go の土台（構文・型・interface）

### やること
- Go Tour をやる（https://go.dev/tour/）
  - Basics → Methods and Interfaces まで
  - Concurrency は Day3 に回す
- interface の使い方を自分の言葉で説明できるようにする

### 確認できたらOKな問い
- `type Stringer interface { String() string }` を実装する struct を書ける
- 値レシーバと ポインタレシーバの違いを言える
- `nil` interface と `nil` ポインタの違いを言える（typed nil 問題の基礎）

### コード課題
```go
// これを書いて動かす
type Animal interface {
    Sound() string
}

type Dog struct{ Name string }
func (d *Dog) Sound() string { return "woof" }

type Cat struct{ Name string }
func (c Cat) Sound() string { return "meow" }

func main() {
    animals := []Animal{&Dog{"Rex"}, Cat{"Mimi"}}
    for _, a := range animals {
        fmt.Println(a.Sound())
    }
}
```

---

## Day 3：goroutine + channel + context

### やること
- Go Tour の Concurrency セクション
- `context.WithTimeout` / `context.WithCancel` の使い方

### 確認できたらOKな問い
- goroutine を立ち上げて結果を channel で受け取るコードを書ける
- `select` で複数 channel を待つコードを書ける
- `context.WithTimeout` でタイムアウトを伝播させる意味を言える

### コード課題（Storyの核心）
```go
// MLとESを並列で叩く、自分のStoryの核心を再現する
func fetchRecommendations(ctx context.Context) (Result, error) {
    ctx, cancel := context.WithTimeout(ctx, 800*time.Millisecond)
    defer cancel()

    mlCh := make(chan MLResult, 1)
    esCh := make(chan ESResult, 1)

    go func() {
        result, _ := callML(ctx)
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
→ これを自分で書いて動かせれば「Goで並列処理を書いた」を自信持って言える

---

## Day 4：error handling（最重要 / Resilireが記事にするほど重視）

### やること
- `errors.New`, `fmt.Errorf("%w", err)`, `errors.Is`, `errors.As` を全部手で書く
- カスタムエラー型を作って `errors.As` で取り出す

### Resilireが実際にやっていること（MyErrorパターン）
```go
type MyError struct {
    Code    int
    Message string
}
func (e *MyError) Error() string {
    return fmt.Sprintf("code=%d: %s", e.Code, e.Message)
}

// 使う側
err := doSomething()
var myErr *MyError
if errors.As(err, &myErr) {
    // MyError として処理
    fmt.Println(myErr.Code)
} else {
    // その他のエラー
}
```

### typed nil 問題（面接で聞かれる可能性大）
```go
// これがなぜ nil にならないか説明できるようにする
func getError() error {
    var e *MyError = nil
    return e  // interface に包まれるので nil ではない！
}

// 正しい書き方
func getError() error {
    return nil  // 直接 nil を返す
}
```

### 確認できたらOKな問い
- `errors.Is` と `errors.As` の違いを言える
- typed nil が問題になるケースを例示できる
- `fmt.Errorf("wrap: %w", err)` で wrap する意味を言える

---

## Day 5：errgroup + graceful shutdown

### やること
- `golang.org/x/sync/errgroup` を使ったコードを書く
- graceful shutdown のパターン（Resilireが記事で議論していた）

### errgroup vs channel の使い分け
```go
// errgroup: 1つでもエラーで全部キャンセルしたい時
g, ctx := errgroup.WithContext(context.Background())
g.Go(func() error { return callML(ctx) })
g.Go(func() error { return callES(ctx) })
if err := g.Wait(); err != nil {
    return err
}

// channel: エラーがあっても他の結果を使いたい時（Storyのケース）
// → errgroup は使わずに個別channel で受け取る
```

### 面接で語れるようにする
> 「MLとESを並列で叩くとき、errgroup だと ML がエラーになった時点で ES の結果も捨てることになる。ES の結果だけ返したかったので、個別 goroutine と channel で受け取る設計にしました」

---

## Day 6：テスト（Resilireの文化の核心）

### やること
- table-driven test を書く（Goのテストの基本形）
- `testify` の `assert` / `require` を使う

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
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            assert.Equal(t, tt.expected, Add(tt.a, tt.b))
        })
    }
}
```

### Resilireの「モックはAPIレスポンスだけ」思想を語れるようにする
> 「コンポーネント間はモックしない。外部API呼び出しのレスポンスだけをモックする。DBは testcontainers で実際に立ち上げてテストする」

---

## Day 7：gRPC（概念と読み方）

### 目標：コードを書けなくていい。「BFFとBackendの間でgRPCを使う設計」を語れること

### 最低限知っておくこと
- `.proto` ファイルでインターface定義 → `protoc` でGoコード生成
- HTTP/2ベースで双方向ストリーミングができる
- REST vs gRPC の使い分け：内部通信はgRPC（型安全・高速）、外部公開はREST

### Resilireの文脈で語れるようにする
> 「BFFとBackendの間はgRPCで通信していました。内部通信はProtobufで型安全に定義できる点と、パフォーマンスの観点でgRPCを選んでいました」

---

## Day 8：for-range の落とし穴 + defer/recover

### for-range ポインタ問題（Resilireが専用Linterを作るほど重要視）
```go
// バグパターン（Go 1.22以前）
users := []User{{Name: "A"}, {Name: "B"}}
names := []*string{}
for _, u := range users {
    names = append(names, &u.Name)  // 全部最後のuを指す！
}

// 正しい
for i := range users {
    names = append(names, &users[i].Name)
}
```

> 「Resilireさんが go/analysis でこのパターンを検出するLinterを作られていましたよね。Go 1.22以降はループ変数がイテレーションごとにコピーされるので解消されましたが、それ以前の挙動は罠でした」
→ 記事を読んでいることを示しつつ、内容を理解して語れる

---

## Day 9：実践コーディング

### 課題：自分のStoryのGoコアを再現する
以下を実際に書いて動かす：

```
recommendation-service/
  main.go
  handler.go        // HTTP handler
  recommender.go    // 並列処理 + フォールバック
  recommender_test.go  // table-driven test
```

`recommender.go` の核心：
```go
type Recommender struct {
    ml MLClient
    es ESClient
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
        return merge(ml, es), nil
    }
    if es != nil {
        return es, nil  // MLが落ちてもESで返す
    }
    return r.cache.GetTop5(ctx), nil  // フォールバック
}
```

これを動かせれば面接で「実際に書きました」と言える。

---

## Day 10：面接前日

- resilire-prep.md の逆質問を再確認
- STARストーリーを声に出して練習（Go版 Story 1 を3分で言えるか）
- 「GCPは未経験ですが、KubernetesはEKSで深く触っています」を自然に言えるか確認

---

## 面接当日のGo質問への答え方指針

**「Goの経験を教えてください」**
> 「GroundtruthでレコメンデーションのマイクロサービスをGoでゼロから構築しました。MLとElasticsearchを goroutine で並列実行してP99 1秒以内を達成した経験があります。freeeではRuby/TypeScriptがメインだったので、Goのより深い設計パターン——errgroup や errors.As の使い方など——は直近で改めて整理しています」

**「goroutineでの並列処理、具体的にどう書きますか」**
→ Day 3/9 で実際に書いたコードをベースに答える

**「errors.AsとIs の違いは？」**
→ Day 4 で理解したことをそのまま答える

**深すぎる質問が来たら**
> 「その部分は正直まだ経験が浅いです。ただ〇〇の観点は理解していて、実務で使いながら深めたいと思っています」
→ 知らないのに答えようとするより信頼される
