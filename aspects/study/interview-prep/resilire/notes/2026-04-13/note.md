# Day 4: error handling / audit columns / 災害アラート

## Go: Error Handling

### エラーは値（value）

GoはPython/Rubyのような例外（try/catch）ではなく、エラーを戻り値として扱う。

```go
result, err := someFunc()
if err != nil {
    // エラー処理
}
```

- **制御フローが見える** — `if err != nil` が必ず目に入る
- try/catchはどこで例外が飛ぶか読まないと分からない

---

### %w vs %v

```go
fmt.Errorf("failed: %w", originalErr)  // ラップ（中に保持）
fmt.Errorf("failed: %v", originalErr)  // 文字列として埋め込むだけ
```

- `%w` → `errors.Is` / `errors.As` で中を掘り下げてアクセスできる
- `%v` → 元のエラーへのアクセスは失われる

**%w のユースケース:** エラーに文脈を足しながら元のエラーも保持したい

```go
return fmt.Errorf("fetchUser id=%d: %w", id, err)
// "handleRequest: fetchUser id=42: connection refused" と積み重なる
```

---

### errors.Is vs errors.As

| | 使う場面 | 取れるもの |
|--|---------|----------|
| `errors.Is` | sentinel error（定義済み固定エラー変数） | Yes/No |
| `errors.As` | カスタムエラー型（struct） | structのフィールド |

```go
// errors.Is — インスタンスの一致確認
var ErrNotFound = errors.New("not found")
errors.Is(err, ErrNotFound)  // true/false

// errors.As — 型として取り出す
var myErr *MyError
if errors.As(err, &myErr) {
    fmt.Println(myErr.Code)  // フィールドにアクセス
}
```

**`errors.As` の第2引数はポインタのポインタ（`&myErr`）。** errors.Asが「ここに書き込む」ためにアドレスが必要。

---

### typed nil 問題

Goのinterfaceは `(型情報, 値)` の2つを持つ。

```go
func getError() error {
    var p *MyError = nil
    return p  // (*MyError, nil) → nil判定がfalse！
}

err := getError()
fmt.Println(err == nil)  // false
```

**対策: nilを返すときは必ず `return nil` と明示する**

```go
func getError() error {
    var p *MyError = nil
    if p == nil {
        return nil  // (nil, nil) → nil判定がtrue
    }
    return p
}
```

---

## DB: Audit カラム設計（created_by / updated_by）

### なぜ文字列ではなくIDで保存するか

```sql
-- ❌ 文字列
created_by TEXT  -- "田中太郎"

-- ✅ UUID（FK）
created_by UUID REFERENCES users(id)
```

**理由1: GDPR対応**
名前を文字列で保存するとユーザー削除時に全テーブルを検索して消す必要がある。
IDにしておけば個人情報（name/email等）だけ消してIDは残せる。

**理由2: 参照整合性**
DBレベルで「存在しないIDは入れられない」と保証できる。文字列はタイポしても気づけない。

---

### ON DELETE の選択肢

| 設定 | 動作 | 使い所 |
|------|------|--------|
| `RESTRICT`（デフォルト） | 参照があると削除エラー | 誤削除防止 |
| `CASCADE` | 関連レコードも全削除 | 監査ログも消えるので危険 |
| `SET NULL` | created_byをNULLにする | ユーザー削除後も記録を残したい |

**Resilireの結論: soft delete + nullable FK**
- ユーザーを物理削除しない（`deleted_at`を付ける）
- 個人情報（name/email）だけ別途消す
- IDは残るのでFK制約も壊れない

---

### 個人情報の消し方とトレードオフ

| 方法 | メリット | デメリット |
|------|---------|-----------|
| NULL上書き | GDPR的に完全 | アプリ全体でNULLチェックが必要 |
| 削除済み文字列（`[削除済み]`） | NULLチェック不要・UI表示しやすい | ID残存のためGDPR解釈によっては問題 |

---

## システム設計: 問題1 災害アラート

### 重要な非機能要件

- **可用性** — 災害時こそ稼働必須
- **即時性** — 数秒を争うレベルではない（届けばよい）
- **冪等性** — 同じアラートが2回届かないようにする

### スケール

```
1,000テナント × 10ユーザー = 10,000通知
10,000 ÷ 60秒 ≈ 170 QPS
平時は0、災害発生瞬間にスパイク
```

### 全体構成

```
災害検知API
  └── キュー（テナント単位で1,000メッセージ）
        └── Worker（並列処理）
              ├── 成功 → 通知送信完了
              └── 失敗（3回リトライ）→ DLQ
                    └── DLQ専用Worker
                          ├── リトライ可能（ネットワーク等）→ 一定時間後に再試行
                          └── リトライ不可（無効アドレス等）→ ログ + アラート
```

### 失敗メッセージ管理の選択肢とトレードオフ

| 方法 | メリット | デメリット |
|------|---------|-----------|
| **DLQ** | 失敗メッセージを保持・再処理できる | インフラが増える |
| **即時リトライ（指数バックオフ）** | シンプル・インフラ少ない | 長時間リトライで後続が詰まる |
| **DBでリトライ管理** | 柔軟・可視性高い | 実装コストが高い |

### キューの粒度

- テナント単位で1メッセージ（1,000件）にする
- 成功/失敗をテナント単位で追跡できる
- 1件失敗しても他のテナントに影響しない
