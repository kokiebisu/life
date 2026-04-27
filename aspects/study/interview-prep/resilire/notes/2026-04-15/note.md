# Day 6 セッションノート（2026-04-15）

## Go: table-driven test

### 基本構造

```go
func TestAdd(t *testing.T) {
    tests := []struct {
        name     string
        a, b     int
        expected int
    }{
        {"正の数", 1, 2, 3},
        {"ゼロ", 0, 0, 0},
        {"負の数", -1, -2, -3},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got := Add(tt.a, tt.b)
            assert.Equal(t, tt.expected, got)
        })
    }
}
```

### ポイント

1. テストケースをスライス（struct の slice）で定義
2. `t.Run` でサブテストに名前をつける → 失敗時に `--- FAIL: TestAdd/負の数` と表示される
3. ケースを増やすだけでいい（関数を毎回定義不要）

### "table-driven" の名前の由来

テストケースのスライスが表（テーブル）のように見えるから。

```
name       a    b    expected
─────────────────────────────
"正の数"   1    2    3
"ゼロ"     0    0    0
```

### t.Run を使う理由

失敗したときにどのケースが落ちたか名前で分かるから。
`t.Run` なしだと `--- FAIL: TestAdd` だけで、何番目のケースか自分で探す必要がある。

---

## Go: testcontainers（統合テスト）

### モック vs 実DB

| モック | testcontainers（実DB） |
|--------|----------------------|
| 速い | 遅い |
| SQLの正しさを確認できない | 本物と同じ環境で確認できる |
| DBバージョンアップで検知できない | バージョン変更もテストできる |
| マイグレーション後に乖離が生まれる | マイグレーション後も実際に動く |

### Resilire の方針

「コンポーネント間はモックしない」。DBはtestcontainersで実際に立ち上げる。外部APIのレスポンスのみモック。

**理由:** モックを使ったテストは通るのに、本番のDBでは動かなかった経験から。

### コード例

```go
func TestUserRepository(t *testing.T) {
    ctx := context.Background()
    pgContainer, _ := postgres.RunContainer(ctx,
        testcontainers.WithImage("postgres:16"),
        postgres.WithDatabase("testdb"),
    )
    defer pgContainer.Terminate(ctx)

    connStr, _ := pgContainer.ConnectionString(ctx)
    db, _ := sql.Open("pgx", connStr)
    repo := NewUserRepository(db)

    user, err := repo.FindByID(ctx, "123")
    assert.NoError(t, err)
}
```

### 面接での語り方

> 「Resilireさんと同じ思想で、DBはtestcontainersで実際に立ち上げます。モックだとマイグレーション後に乖離が生まれるリスクがあるためです。DBバージョンアップ時の検証もできます」

---

---

## DB: N+1 問題

1回のクエリで全件取得した後、各レコードに対してN回個別クエリが走る問題。

**解決策:** Eager Loading（JOIN または IN句で一括取得）
- ORMの `Preload` → 内部でIN句を使う
- ORMの `Joins` → JOINを使う
- 概念としてのEager LoadingはORM限定ではない

---

## DB: EXPLAIN ANALYZE

クエリの実行計画と実測値を確認するコマンド。

**見るべき3点:**

| 何を見る | 意味 |
|---------|------|
| `Seq Scan` vs `Index Scan` | Seq = 全件舐めてる（遅い）、Index = インデックス使えてる（速い） |
| `actual time` | 実際にかかった時間（ms） |
| `Rows Removed by Filter` | 捨てた行数。多いほど無駄なスキャンをしている |

---

## システム設計: 問題3 キャッシュ戦略

### Step 1: 要件整理で確認すること

- DAU・1人あたりの検索回数（スケール感）
- **キャッシュの無効化タイミング**: サプライヤー情報が更新されたら即座にキャッシュを消すべきか、TTLまで待っていいか？
- 検索条件の種類（キーがどれだけ爆発するか）
- TTLは要件から決める（「1時間以内に最新」→ TTL=1時間）

### Step 2: スケール見積もり

```
QPS = (DAU × 1人あたり検索回数) / 86400
例: (1万 × 10) / 86400 ≈ 1.2 req/sec
```

### Step 3: アーキテクチャ

```
Client → API Server → [Redis チェック] → ヒット: 即返す
                                        → ミス: ES検索 → Redisに保存 → 返す
```

**キャッシュの置き場所:**
| 場所 | 特徴 | トレードオフ |
|------|------|------------|
| アプリ内メモリ | 速い | 複数台で共有できない |
| Redis | 全サーバーで共有・TTL管理が楽 | ネットワークレイテンシ数ms |
| CDN | 最速 | 動的な検索クエリには向かない |

→ マルチテナントSaaS + 動的検索 = **Redis が定番**

### Step 4: Cache Invalidation（無効化）

| 方法 | 仕組み | トレードオフ |
|------|--------|------------|
| TTL待ち | 1時間後に自然に消える | シンプル。最大1時間古いデータが残る |
| イベント駆動 | 更新時にキャッシュキーを削除 → 次の読み込み時にDBから取得 | 即座に反映。実装が複雑 |
| Write-through | DBとキャッシュを同時に書き換え（削除ではなく上書き） | 常にキャッシュが温まっている。更新コストが高い |

**使い分け:** 「1時間以内に最新」→ TTL待ちで十分。リスクスコアなどリアルタイム性が必要 → イベント駆動。

**Eviction Policy（メモリ満杯時に何を捨てるか）:**
- LRU: 最近使われていないものを捨てる
- LFU: 使用頻度が低いものを捨てる

### Step 5: ボトルネック

**Redisが単一障害点になる問題:**
- 対策1: レプリケーション（マスター・スレイブ構成）
- 対策2: フォールバック — Redisが落ちたらES/DBに直接問い合わせ

```
// 面接での語り方
「Redisが落ちてもサービスは止めません。ヘルスチェックでRedisの死活を確認し、
応答がなければESに直接フォールバックします。パフォーマンスは落ちますが、可用性を優先します」
```

---

## Testing Trophy（Resilireの思想）

```
      E2E (少数)
    統合テスト (多数) ← Resilireが最重視
  単体テスト (適量)
静的解析 (全て)
```

## ❓ 自分への質問（コーネル式キュー）

1. table-driven testのメリットとt.Runを使う理由は？
2. testcontainersを使う理由は？モックDBとのトレードオフは？
3. Cache Invalidationの3つの方法（TTL待ち・イベント駆動・Write-through）の使い分けは？
4. EXPLAIN ANALYZEで見るべき3点は？

## 🔁 復習で詰まったところ

### 2026-04-27 - ❌ 忘れた
- **Q: Cache Invalidationの3つの方法（TTL待ち・イベント駆動・Write-through）の使い分けは？**
  - 詰まった内容: 3方法を完全に忘却
  - 正解ポイント: ① **TTL 待ち** = 期限で自然消滅、シンプル、最大TTL分古いデータ残る、緩い要件向け ② **イベント駆動** = 更新時にキャッシュキー**削除** → 次読み込みで DB→キャッシュ、即反映、実装複雑、リアルタイム必要時 ③ **Write-through** = DB と キャッシュを**同時に上書き**、常に温まり、更新コスト高、読み取り多+更新少時。イベント駆動は「次読み込みで温まる」、Write-through は「書いた瞬間から温まる」が違い
- **Q: EXPLAIN ANALYZEで見るべき3点は？**
  - 詰まった内容: Seq/Index Scan は答えたが、actual time と Rows Removed by Filter を思い出せず（"cost" と回答）
  - 正解ポイント: ① **Seq Scan vs Index Scan**（全件舐めかインデックス使えてるか）② **actual time**（実測時間 ms）③ **Rows Removed by Filter**（フィルタで捨てた行数。多いと無駄なスキャン）。EXPLAIN は cost 推定のみ、EXPLAIN ANALYZE は実行して actual time + actual rows を返す
