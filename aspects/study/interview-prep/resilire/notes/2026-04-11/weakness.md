# Day 3: 復習で言えなかったこと

## 2026-04-11

### Go: goroutine・channel・context

- **selectの使い方が理解できていなかった**
  - `select` は複数チャネルを**同時に**待つもの
  - `callML(ctx)` と `ctx.Done()` は別々の独立したチャネル
  - どちらか先に来た方が実行される

- **`defer cancel()` と `ctx.Done(): return` の違い**
  - `defer cancel()` → contextのリソース（タイマー等）を解放。メモリリーク防止
  - `case <-ctx.Done(): return` → goroutine自身が「止まれ」を受け取って終了する
  - 両方セットで正しい。片方だけでは不完全

- **`ctx.Done()` で `return` を書き忘れるとgoroutineリーク**
  - 止まれ信号を受け取っても、`return` がないとgoroutineが終わらない
