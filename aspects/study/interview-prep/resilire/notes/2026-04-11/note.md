# Day 3: goroutine・channel・context

## goroutine

- GoランタイムがOSスレッド上に乗せて管理する超軽量スレッド
- 初期スタック ~2KB（OSスレッドは ~1MB）
- 切り替えはユーザー空間で完結 → カーネル切替不要で速い
- 数十万〜数百万単位で作れる
- `main` 関数自体も1つのgoroutine（`go func` なしでもgoroutineの中）

```
Goプロセス（1つのメモリ空間）
  ├── OSスレッド1
  └── OSスレッド2
        ├── goroutine A
        ├── goroutine B
        └── goroutine C
```

**M:N モデル:** 複数のgoroutine（M）を複数のOSスレッド（N）に乗せる

---

## channel

goroutine間でデータをやり取りするキュー。

```go
ch := make(chan int)      // unbuffered（サイズ0）
ch := make(chan int, 3)   // buffered（サイズ3）

ch <- 42    // 送信（受信者が現れるまでブロック）
v := <-ch   // 受信（送信者が来るまでブロック）
```

| | unbuffered | buffered |
|--|-----------|---------|
| 同期 | 送受信が同期 | バッファ満杯までブロックしない |
| イメージ | サイズ0のキュー | サイズNのキュー |

**close の責任は送信側。**
「もう送るものがない」を知っているのは送信側だけ。受信側が close すると、送信側が `ch <- v` したときに panic。

```go
for v := range ch {  // close されたら自動でループ終了
    fmt.Println(v)
}
```

---

## race condition と channel

同じプロセス内のgoroutineはメモリを共有している。同じ変数に同時アクセスすると競合が起きる（race condition）。

Goのスローガン:
> "Don't communicate by sharing memory; share memory by communicating."

channelはデータの**所有権を移転**する設計 → 送信後は送信側が触れなくなる → 競合が起きない。

**注意:** ポインタをchannelで渡すと共有メモリになる。送った後は触らない規律が必要。

---

## context

goroutineに「止まれ」という信号を伝える仕組み。goroutineは外から強制終了できないため、`ctx.Done()` で信号を受け取って**自分で return する**。

```go
ctx, cancel := context.WithTimeout(context.Background(), 800*time.Millisecond)
defer cancel()  // この関数が return するときに呼ばれる

go func() {
    select {
    case result := <-callML(ctx):
        fmt.Println(result)
    case <-ctx.Done():
        return  // 自分で抜ける（return がないとリーク）
    }
}()
```

**`defer cancel()` を書く理由:** `WithTimeout` は内部にタイマーリソースを確保している。`cancel()` しないとタイムアウトまでリソースが解放されない → メモリリーク防止。

**WithTimeout vs WithCancel:**
- `WithTimeout`: 指定時間後に自動キャンセル
- `WithCancel`: `cancel()` を明示的に呼んだときだけキャンセル

---

## 詰まったところ

- OSスレッドとプロセスの区別 → プロセスはメモリ独立、スレッドはメモリ共有
- `defer cancel()` は `go func` のgoroutineではなく、呼び出し元の関数が return するときに呼ばれる
- `ctx.Done()` は信号を受け取るだけ。`return` を書かないと goroutine はリークする

## ❓ 自分への質問（コーネル式キュー）

1. goroutineとOSスレッドの違いは？M:Nモデルとは？
2. unbuffered channelとbuffered channelの違い。closeの責任が送信側にある理由は？
3. context.WithTimeoutとcontext.WithCancelの使い分けは？`defer cancel()` を書く理由は？
