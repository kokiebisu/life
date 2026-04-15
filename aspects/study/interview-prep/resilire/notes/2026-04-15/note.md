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

## Testing Trophy（Resilireの思想）

```
      E2E (少数)
    統合テスト (多数) ← Resilireが最重視
  単体テスト (適量)
静的解析 (全て)
```
