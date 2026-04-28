# コードレビュー面接対策セッション（2026-04-28）

## 今日のテーマ

Resilire のコードレビュー技術面接対策。Go の並行処理コードを題材に、レビュアーとして指摘する練習。

---

## コードレビューの優先度ラベル（must / should / nit）

3段階で温度感を分ける。本番面接では**理由 + 修正案**をセットで言語化する。

| ラベル | 意味 | マージ可否 | 例 |
|--------|------|-----------|-----|
| **must / blocker** | バグ・データ破損・セキュリティ・本番事故 | ❌ 直すまでマージ不可 | race condition、SQL injection、resource leak |
| **should** | 設計上問題、運用きつい、テスタビリティ低い | ⚠️ 直してから merge が望ましい（議論可） | errgroup 使うべき、エラー握りつぶし、N+1 |
| **nit / suggestion** | 好み、命名、軽微な可読性 | ✅ そのまま merge OK | 変数名、コメント追加、order |

**面接で評価される話し方:**
> 「これは **must** です。理由は〇〇。修正案としては△△」
> 「これは **nit** なんですが、××だと将来見たとき分かりやすいかもしれません」

優先度に**理由 + 修正案**をセットにする。理由が言えないと「指摘の温度感が分からないレビュアー」と見られる。

---

## 題材コード（Resilire 風: 複数サプライヤーの並列取得）

```go
func (s *Service) GetSuppliers(ctx context.Context, ids []string) ([]SupplierInfo, error) {
	results := make([]SupplierInfo, 0, len(ids))
	var wg sync.WaitGroup

	for _, id := range ids {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if cached, ok := s.cache[id]; ok {
				results = append(results, cached)
				return
			}
			info, err := s.fetchOne(ctx, id)
			if err != nil {
				fmt.Println("error:", err)
				return
			}
			s.cache[id] = info
			results = append(results, info)
		}()
	}
	wg.Wait()
	return results, nil
}
```

---

## 見つけた must（2件）

### must 1: `results` スライスへの concurrent append

**指摘:** 複数 goroutine から `results = append(...)` が同時に走る。

**理由:**
- `append` は CPU 命令的には1命令ではなく、4ステップに分解される:
  1. `len` と `cap` を読む
  2. cap が足りなければ新しい配列を確保（成長率は cap<256 なら 2倍、以降 1.25倍前後）
  3. 末尾に書き込む
  4. 新しいスライスヘッダを代入
- 同時実行されるとデータロスト・上書きが起きる
- `make([]T, 0, len(ids))` で cap を pre-allocate しても **race は依然として起きる**（手順1〜4 自体が racy）
- `go run -race` で必ず検出される

**修正案3つ:**

#### (a) channel で集約
```go
resultCh := make(chan SupplierInfo, len(ids))
for _, id := range ids {
    wg.Add(1)
    go func(id string) {
        defer wg.Done()
        info, err := s.fetchOne(ctx, id)
        if err != nil { return }
        resultCh <- info
    }(id)
}
go func() { wg.Wait(); close(resultCh) }()

results := make([]SupplierInfo, 0, len(ids))
for info := range resultCh { results = append(results, info) }
```
- 書き込み箇所が main goroutine 1つだけ → race が原理的に起きない
- "Don't communicate by sharing memory; share memory by communicating."
- バッファサイズ `len(ids)` で全送信を非同期化、`close` は別 goroutine で全 `Wait()` 後

#### (b) sync.Mutex でガード
```go
var mu sync.Mutex
go func(id string) {
    defer wg.Done()
    info, err := s.fetchOne(ctx, id)
    if err != nil { return }
    mu.Lock()
    defer mu.Unlock()
    results = append(results, info)
}(id)
```
- `Lock()` の直後に `defer Unlock()` がイディオム（panic でも解放）
- 範囲を critical section と呼ぶ

#### (c) errgroup + pre-allocated slice + index 書き込み（**Resilire の本命**）
```go
g, ctx := errgroup.WithContext(ctx)
results := make([]SupplierInfo, len(ids))
for i, id := range ids {
    i, id := i, id
    g.Go(func() error {
        info, err := s.fetchOne(ctx, id)
        if err != nil { return err } // 1つ失敗 → ctx キャンセル → 他も中断
        results[i] = info  // index が違うので race にならない
        return nil
    })
}
if err := g.Wait(); err != nil { return nil, err }
```
- **index ごとに別アドレスを書く → race にならない**
- ctx キャンセル + エラー伝播も無料で付いてくる
- Resilire の文脈（外部 API 並列・1つ失敗で全体打ち切り）に最適

**面接での3案の使い分け:**
- 短く済ませたい → **Mutex**
- 結果集約・パイプライン → **channel**
- ctx キャンセル + エラー伝播もまとめたい → **errgroup**（外部API 並列の定石）

### must 2: `s.cache` map への concurrent read/write

**指摘:** `if cached, ok := s.cache[id]` の読みと `s.cache[id] = info` の書きが複数 goroutine から同時。

**理由:**
- Go の map は concurrent write 時に runtime が即 **fatal error** でプロセスを殺す
- panic ではないので recover 不可
- 「保護されてない map を並行で書く」は本番で**プロセス死**を意味する

**修正案:**
- `sync.Mutex` でガード
- read-heavy なキャッシュなら `sync.RWMutex`（読みは並列、書きのみ排他）
- もしくは `sync.Map`（ベンチマークで判断）

```go
type Service struct {
    client *http.Client
    mu     sync.RWMutex
    cache  map[string]SupplierInfo
}

s.mu.RLock()
cached, ok := s.cache[id]
s.mu.RUnlock()

s.mu.Lock()
s.cache[id] = info
s.mu.Unlock()
```

**面接小技:** 「Resilire のキャッシュ実装でどれを採用してます？」と最後に聞くと逆質問への自然な布石になる。

---

## 残り未検出（次回継続）

ヒント2 で `fetchOne` 周りを示唆したところで時間切れ。次回続きから:

- `s.client.Get(url)` に ctx を渡していない（ctx 伝播の must）
- `resp.Body` を `Close()` していない（resource leak の must）
- `json.NewDecoder(resp.Body).Decode(&info)` のエラーを無視（must）
- HTTP ステータスコードチェック無し（4xx/5xx で空 struct 返却）
- `fmt.Println` でエラー握りつぶし → エラーを返り値で集約すべき（must / should）
- `GetSuppliers` の戻り値 `error` が常に nil（should）
- WaitGroup vs errgroup（should）
- cache に TTL/eviction 無し → メモリリーク（should）
- `NewService` が `*http.Client` を受け取らない → テスト困難（should）
- URL 生成で `url.PathEscape` を使っていない（nit）
- magic number `30 * time.Second`（nit）

---

## 詰まったところ・気づき

### 誤読したところ
- 「最後の `results = append` の後に `return` がない」と指摘したが、これは誤り
- ステートメントが続かないので `return` 不要（`defer wg.Done()` が走る）
- ただし「処理を打ち切るべき」という直感そのものは正解（`if err != nil` の return は OK）

### race の言語化が惜しかった
- 最初「channel で送り届けられていない」と言ったが、これは**手段**の話
- 正しくは「**race condition でデータ破損する**（理由）→ 修正案2つ提示（手段）→ トレードオフ」の順で話すべき
- 2回目以降は型に沿って「**must**: race condition で本番ロスト or panic、修正案は (a)(b)」と言えるようになった

### append の中身を理解
- `append` は1命令ではなく4ステップ（len/cap 読み → 必要なら配列確保 → 書き込み → ヘッダ代入）
- cap pre-allocate でも race は残る（手順自体が racy）
- 別メモリに張り替わるとさらに地獄: 2つの goroutine が別配列確保 → 片方の append が消える

### channel vs Mutex の使い分け
- データ集約・パイプライン → channel
- 単に共有状態を守る → Mutex
- ctx キャンセル + エラー伝播 → **errgroup**（Resilire の本命）

---

## ❓ 自分への質問（コーネル式キュー）

1. コードレビューの優先度ラベル（must / should / nit）の3段階を、それぞれ「マージ可否」「例」とセットで言えるか？
2. `append` がアトミックでない理由（4ステップ）を説明できるか？cap を pre-allocate しても race が残る理由は？
3. 並行な集約処理を直す3つの修正案（channel / Mutex / errgroup）の使い分けを、「いつどれを選ぶか」で言えるか？
4. Go の map に concurrent write すると何が起きるか？panic との違いは？
5. `Lock()` の直後に `defer Unlock()` を書くイディオムの理由は？
