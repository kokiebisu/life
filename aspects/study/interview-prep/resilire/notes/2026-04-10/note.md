# Day 2: interface設計パターン・struct・システム設計URLショートナー

## Interface 設計パターン

### ① テスト可能な設計（依存注入）

```go
// ❌ 具体的な型に依存 → テストで本物のAPIを叩く
type Recommender struct {
    client *http.Client
}

// ✅ interfaceに依存 → モックを差し込める
type MLClient interface {
    Fetch(ctx context.Context, userID string) ([]Segment, error)
}

type Recommender struct {
    ml MLClient  // 本物でもモックでもOK
}
```

**ポイント:** structのフィールドにinterfaceを持たせる = 依存注入。本番とテストで実装を差し替えられる。

### ② 小さいinterfaceを組み合わせる

```go
type Reader interface { Read(p []byte) (n int, err error) }
type Writer interface { Write(p []byte) (n int, err error) }
type ReadWriter interface {
    Reader  // 埋め込みで合成
    Writer
}
```

**ポイント:** Goのイディオムは「1〜2メソッドの小さいinterface」。モックが作りやすい。

### ③ interface vs struct

- `interface` = 「何ができるか」の約束（メソッドの集合）
- `struct` = 「何を持つか」のデータ構造と実装

```go
type Storer interface {
    Save(key, value string) error  // 約束
}

type MockStorer struct{}  // 実体
func (m *MockStorer) Save(key, value string) error {
    return nil  // 実装
}
```

**PKにはインデックスが自動で貼られる**（PRIMARY KEY = ユニーク制約 + インデックス自動作成）

## Struct 埋め込み（Embedding）

```go
type Animal struct {
    Name string
}

func (a *Animal) Breathe() {
    fmt.Println(a.Name, "が呼吸する")
}

type Dog struct {
    Animal  // 埋め込み
    Breed string
}

dog := Dog{Animal: Animal{Name: "Rex"}, Breed: "柴犬"}
dog.Breathe()  // Animalのメソッドをそのまま使える
dog.Name       // フィールドも直接アクセスできる
```

**継承との違い:**
- 継承: `Dog is-a Animal`（DogはAnimalでもある）
- 埋め込み: `Dog has-a Animal`（**機能の委譲**。DogはAnimalではない）
- Goでは `Dog` を `Animal` 型として扱えない

---

## システム設計: URLショートナー

### 要件（STEP 1）
- DAU 100万・1ユーザー1日10回短縮
- リダイレクトはリアルタイム
- 可用性: 99.9%
- 一貫性: 結果整合性OK（数秒の遅延許容）

### スケール計算（STEP 2）
- 書き込み: 100万 × 10 / 86400 ≈ **100 QPS**（ピーク300）
- 読み取り: 100万 × 100 / 86400 ≈ **1000 QPS**（ピーク3000）
- 読み取り:書き込み = **10:1** → 読み取りに最適化が必要

### 全体設計（STEP 3）

```
クライアント → [Redis キャッシュ] → APIサーバー → DB
```

**短縮URL生成アルゴリズム:**
- base62（a-z, A-Z, 0-9）で6文字ランダム生成
- 62^6 ≈ 568億通り → 十分
- 衝突時は再生成

**キャッシュ戦略:**
- Read-through（キャッシュミス時にキャッシュがDBから取得）
- TTL: 24時間〜7日（URLは一度作ったら変わらないため長めでOK）
- Eviction Policy: LRU（アクセス頻度の高いURLを残す）

### DBスキーマ（STEP 4）

```sql
CREATE TABLE urls (
    short_url VARCHAR(6) PRIMARY KEY,  -- PKなのでインデックス自動作成
    original_url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
)
```

- `original_url` にインデックス不要（ランダム生成で重複チェックしない方針 → `original_url` で検索しない）
- 重複チェックも `short_url`（PK）で引くので自動インデックスで解決

### ボトルネックと改善（STEP 5）
- **ボトルネック:** DB（読み取り3000 QPS が集中）
- **改善:** Read Replica（Master-Slave構成）で読み取りを分散 + Redisキャッシュでそもそものリクエストを減らす
