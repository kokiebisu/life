---
notion_id: 34cce17f-7b98-81b8-bae0-f278a089a8fe
date: 2026-04-11
category: interview-prep
---

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

## 🔁 復習で詰まったところ

### 2026-04-23
- 旧方式（PR #517 以前）の復習で ❌ 忘れた と判定されたが、詳細な詰まり内容は記録されていない

### 2026-04-11
- **Q: select の使い方は？複数チャネルを同時に待つときどう書く？**
  - 詰まった内容: select の意味を理解できていなかった（`callML(ctx)` と `ctx.Done()` を別物として扱えていなかった）
  - 正解ポイント: select は複数チャネルを**同時に**待つ構文。`callML(ctx)` と `ctx.Done()` は別々の独立したチャネルで、どちらか先に来た方の case が実行される
- **Q: `defer cancel()` と `case <-ctx.Done(): return` の違いと、なぜ両方必要か？**
  - 詰まった内容: 両者の役割を区別できなかった
  - 正解ポイント: `defer cancel()` は context のリソース（タイマー等）を解放してメモリリークを防ぐ。`case <-ctx.Done(): return` は goroutine 自身が「止まれ」を受け取って終了する。両方セットで正しい。片方だけでは不完全
- **Q: `ctx.Done()` で `return` を書き忘れるとどうなる？**
  - 詰まった内容: goroutine リークが発生することを意識できていなかった
  - 正解ポイント: 止まれ信号を受け取っても `return` がないと goroutine が終わらず、リークする
