# Resilire 技術面接 DB設計 集中対策

> Resilireの記事で実際に登場したテーマに絞る
> 自己弱点：正規化・変更コスト・将来拡張の考慮が甘い
>
> **進捗管理 → [tracker.md](tracker.md)**
> チェックを入れる基準: ノートを見ずに2分で説明できる状態

---

## シニアレベルで語るために

| 普通の答え | シニアの答え |
|-----------|-----------|
| 「インデックスを貼ります」 | 「このクエリはuser_idとcreated_atの複合クエリが多いので複合インデックスを貼ります。deleted_atがNULLのものだけに絞るPartial Indexも追加し、スキャン対象を削除済みを除いた件数に限定します」 |
| 「RLSを使います」 | 「RLSでtenant_idポリシーを設定しアプリレイヤのバグでデータ漏洩しないよう担保します。ただしバッチ処理はRLSをOFFにする必要があり、その境界設計を明確にする必要があります」 |
| 「正規化します」 | 「3NFを基本に設計します。ただしレポート系クエリが多い場合は意図的に非正規化してJOINを減らすことも検討します。CQRSパターンで書き込みは正規化、読み取りは非正規化ViewとするとOLTPとOLAPを両立できます」 |

**面接で必ず言うべきこと:**
1. **なぜそうしたか（ADRスタイル）** — 「〇〇を選びました。理由は△△です。××も検討しましたが□□で採用しませんでした」
2. **トレードオフ** — 「この設計は△△のメリットがありますが、□□のコストがあります」
3. **将来の変更** — 「1年後に〇〇が必要になったとき、この設計は対応できます/追加が必要です」

---

## Resilireが実際に議論していたDBテーマ

1. cursor-based pagination（PKソートの安定性）
2. RLS（Row Level Security）によるマルチテナント分離
3. created_by / updated_by の設計（GDPR対応）
4. Changesetテーブル（変更管理）
5. ENUM型の制約（同一トランザクション問題）
6. Soft delete パターン
7. N+1とJOINの最適化
8. スキーマ分割 vs ホスト分離（モジュラモノリスのDB境界）
9. NULL文字列リテラル問題（CSV COPY）

---

## テーマ1：Pagination（cursor vs offset）

### なぜResilireが問題視したか
timestamp ソートで複数ページを処理するとき、同タイムスタンプのレコードで重複・欠損が発生した。

### offset の問題
```sql
-- データが追加・削除されると結果がずれる
SELECT * FROM items ORDER BY created_at DESC LIMIT 10 OFFSET 20;
-- 21件目を取ろうとした瞬間に新しいデータが入ると、
-- 「20件目」の定義が変わってしまう
```

### cursor-based（Resilireの結論：PKソートが安定）
```sql
-- cursor = 最後に取得したレコードのID
SELECT * FROM items
WHERE id > :last_id
ORDER BY id ASC  -- PKは一意かつ単調増加 → 安定
LIMIT 10;
```

**なぜPKか：**
- 一意性が保証されている（同値なし）
- 単調増加（挿入順が保たれる）
- timestampは同値が起きうる → ページ境界で重複・欠損

### 面接で語れるようにする
> 「timestampでソートするとページ境界で重複や欠損が起きます。PKは一意かつ単調増加なのでカーソルとして安定します。Resilireさんの記事でも同じ結論が出ていて、自分も同意しています」

---

## テーマ2：マルチテナント設計（RLS）

### 基本パターン3つ

**① テナントごとにDB分離**
- 完全分離・セキュリティ最強
- コスト・運用コストが高い

**② スキーマ分離（PostgreSQL）**
```sql
-- テナントごとにスキーマを作る
CREATE SCHEMA tenant_abc;
CREATE TABLE tenant_abc.users (...);
```

**③ Row Level Security（Resilireの選択）**
```sql
-- 全テナントが同じテーブルを使う
-- tenant_id カラムで分離
ALTER TABLE items ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON items
    USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

### RLSのメリット・デメリット
| | メリット | デメリット |
|--|---------|-----------|
| RLS | スキーマがシンプル、JOINが楽 | 設定漏れで全データ見える、バッチ処理でOFF必要 |

### Resilireが議論していたこと
- バッチ処理はRLS不要なので、RLSあり/なしを目的別に設計
- テナント境界はRLSで担保、バッチは専用設計

### 面接で語れるようにする
> 「RLSはシンプルでJOINも楽になりますが、バッチや内部処理でRLSをOFFにする場面の設計が重要で、目的に応じて使い分ける必要があります」

---

## テーマ3：Audit カラム設計（created_by / updated_by）

### Resilireの議論の経緯
最初はユーザー名を保存 → 循環参照を避けるため
→ IDに戻した理由：
- **GDPR対応**：ユーザーが削除された後も名前が残る問題
- **参照整合性**：IDなら外部キー制約を設けられる

### 設計上の考慮点
```sql
-- シンプルなAudit設計
created_by UUID REFERENCES users(id),
updated_by UUID REFERENCES users(id),
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

**論点：**
- 削除されたユーザーをどう扱うか → soft delete + nullable FK
- RLS適用範囲外の処理（バッチ）での設定方法
- `current_user` や `session` からどう取るか

---

## テーマ4：Soft Delete パターン

### 基本実装
```sql
ALTER TABLE items ADD COLUMN deleted_at TIMESTAMPTZ;

-- 削除
UPDATE items SET deleted_at = NOW() WHERE id = :id;

-- 通常クエリ（削除済みを除外）
SELECT * FROM items WHERE deleted_at IS NULL;
```

### インデックスとの相性問題
```sql
-- deleted_at IS NULL の条件が多い場合
-- Partial Index が有効
CREATE INDEX idx_items_active ON items(id)
WHERE deleted_at IS NULL;
```

### RLSとの組み合わせ
```sql
CREATE POLICY exclude_deleted ON items
    USING (deleted_at IS NULL AND tenant_id = current_setting('app.current_tenant')::uuid);
```

### 面接で語れるようにする
> 「Soft deleteは参照整合性を保ちながら論理削除できますが、クエリに常にWHERE deleted_at IS NULLが必要になるので、Partial Indexで最適化する必要があります。RLSと組み合わせる場合はポリシーにも含めます」

---

## テーマ5：N+1問題とJOIN

### N+1とは
```ruby
# N+1（バッドパターン）
orders = Order.all          # SELECT * FROM orders  → 1クエリ
orders.each do |order|
  order.user.name           # SELECT * FROM users WHERE id = ?  → N回
end
```

### 解決方法
```sql
-- JOINで1回にまとめる
SELECT orders.*, users.name
FROM orders
JOIN users ON orders.user_id = users.id;
```

### Resilireの文脈
- マップ表示で10^3オーダーのJOINが必要なケース
- 再帰クエリ（ツリー構造のサプライチェーンデータ）
- BFF側では対応できずBackend側で複雑クエリを書いた → アーキテクチャ議論に発展

```sql
-- ツリー構造の再帰クエリ（WITH RECURSIVE）
WITH RECURSIVE supply_chain AS (
    SELECT id, parent_id, name, 0 as depth
    FROM suppliers WHERE parent_id IS NULL
    UNION ALL
    SELECT s.id, s.parent_id, s.name, sc.depth + 1
    FROM suppliers s
    JOIN supply_chain sc ON s.parent_id = sc.id
)
SELECT * FROM supply_chain ORDER BY depth;
```

---

## テーマ6：ENUM型の注意点

### Resilireが踏んだ落とし穴
```sql
-- ENUMへの値追加は安全
ALTER TYPE status ADD VALUE 'pending';

-- ただし！同一トランザクション内で新しい値を使うとエラー
BEGIN;
ALTER TYPE status ADD VALUE 'pending';
INSERT INTO orders (status) VALUES ('pending');  -- エラー！
COMMIT;

-- 解決策：マイグレーションを分ける
-- Migration 1: ALTER TYPE
-- Migration 2: INSERT
```

---

## テーマ7：正規化の基本（自己弱点の補強）

### 第1正規形（1NF）：繰り返しグループを排除
```sql
-- NG: 複数値を1カラムに
orders: id, product_ids = "1,2,3"

-- OK: 別テーブルに
order_items: order_id, product_id
```

### 第2正規形（2NF）：部分関数従属を排除
```sql
-- NG: 複合PKの一部にだけ従属するカラムがある
order_items: order_id, product_id, product_name  ← product_nameはproduct_idだけに従属

-- OK: 分離
products: id, name
order_items: order_id, product_id
```

### 第3正規形（3NF）：推移的関数従属を排除
```sql
-- NG: 非キー列が別の非キー列に従属
employees: id, department_id, department_name  ← department_nameはdepartment_idに従属

-- OK: 分離
departments: id, name
employees: id, department_id
```

### 面接での語り方（自己弱点を逆手に）
> 「正規化は以前、変更コストや将来の拡張を後から指摘されることがありました。今は設計時に『このカラムは誰に従属しているか』と『1年後にどう変わりうるか』を先に問うようにしています。完璧ではないですが、設計レビューで穴を指摘される頻度は減っています」

---

## テーマ8：インデックス設計

### 基本
```sql
-- 単純なインデックス
CREATE INDEX idx_users_email ON users(email);

-- 複合インデックス（左端から使われる）
CREATE INDEX idx_orders_user_date ON orders(user_id, created_at);
-- user_id だけのクエリ → 使われる ✓
-- created_at だけのクエリ → 使われない ✗
-- user_id AND created_at → 使われる ✓

-- Partial Index（条件付き）
CREATE INDEX idx_active_orders ON orders(user_id)
WHERE status = 'active';
```

### カーディナリティ
- 高カーディナリティ（値の種類が多い）→ インデックス効果大
- 低カーディナリティ（boolean, status 等）→ インデックス効果小

---

## 想定Q&A集

**Q: テーブル設計で一番大切にしていることは？**
> 「変更コストです。最初の設計が後でどれだけ変えにくくなるかを先に考えるようにしています。特に外部キーの方向と正規化の粒度は、後から変えると影響範囲が大きいので慎重に判断します」

**Q: ページネーションはどう実装しますか？**
> 「cursor-based pagingを使います。offset は大量データで遅くなるのと、ページ取得中にデータが変わると重複・欠損が起きます。cursorとしてPKを使うのが安定で、PKは一意かつ単調増加なので境界問題が起きません」

**Q: マルチテナントのデータ分離はどう設計しますか？**
> 「RLSでtenant_idによるポリシーを設定するアプローチが好みです。スキーマがシンプルになりJOINが楽になります。ただしバッチ処理はRLSをOFFにする必要があるので、その境界設計を明確にする必要があります」

**Q: N+1をどう検出・対処しますか？**
> 「ORMのクエリログを見るか、DatadogやEXPLAIN ANALYZEで遅いクエリを特定します。対処はJOINかeager loadingで、クエリ数をまとめます。ただし必要以上のJOINは別の問題を生むので、必要なデータだけを取るよう設計します」

---

## テーマ9：EXPLAIN ANALYZE の読み方（シニア必須）

実際のクエリが遅いとき、シニアエンジニアは EXPLAIN ANALYZE でボトルネックを特定できる。

```sql
EXPLAIN ANALYZE
SELECT * FROM suppliers
WHERE tenant_id = 'abc' AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 20;
```

```
出力例:
Limit (cost=0.43..12.51 rows=20) (actual time=0.123..0.456 rows=20)
  -> Index Scan Backward using idx_suppliers_tenant on suppliers
       (cost=0.43..150.00 rows=240) (actual time=0.120..0.400 rows=20)
       Index Cond: (tenant_id = 'abc')
       Filter: (deleted_at IS NULL)
       Rows Removed by Filter: 15
```

**読み方のポイント:**
- `Seq Scan` → フルテーブルスキャン → インデックスが効いていない
- `Index Scan` → インデックス使用 → 良い
- `Rows Removed by Filter` → インデックスで絞れなかった行数 → 大きければPartial Index検討
- `actual time` >> `cost` → 統計情報が古い（ANALYZE が必要）
- `loops=N` → 内側のノードがN回実行された（N+1の証拠になることも）

**面接での語り方:**
> 「遅いクエリはまずEXPLAIN ANALYZEで確認します。Seq Scanが出ていればインデックス不足、Rows Removed by Filterが多ければPartial Indexを検討します。コストではなく実際の実行時間（actual time）を見ます」

---

## テーマ10：トランザクション分離レベル

シニアエンジニアは「デフォルトのRead Committedで十分か」を判断できる。

```sql
-- PostgreSQLのデフォルト: READ COMMITTED
-- → 他のトランザクションがコミットした内容は即座に見える

-- 問題が起きるケース: Phantom Read
BEGIN;
SELECT COUNT(*) FROM orders WHERE status = 'pending';
-- 別トランザクションがINSERTしてCOMMITした
SELECT COUNT(*) FROM orders WHERE status = 'pending';
-- 件数が増えた！（Phantom Read）
COMMIT;

-- 解決: SERIALIZABLE または SELECT FOR UPDATE
BEGIN;
SELECT COUNT(*) FROM orders WHERE status = 'pending' FOR UPDATE;
-- 対象行をロック → 他のトランザクションはWAITする
COMMIT;
```

**分離レベル早見表:**

| レベル | Dirty Read | Non-repeatable Read | Phantom Read | 用途 |
|-------|-----------|--------------------|-----------|----|
| READ UNCOMMITTED | 発生 | 発生 | 発生 | 通常使わない |
| READ COMMITTED | なし | 発生 | 発生 | PostgreSQLデフォルト |
| REPEATABLE READ | なし | なし | 発生 | 財務集計 |
| SERIALIZABLE | なし | なし | なし | 在庫管理・予約 |

**面接での語り方:**
> 「在庫管理のような『同時に複数ユーザーが同じレコードを更新する』ケースにはSERIALIZABLEかSELECT FOR UPDATEが必要です。ただし分離レベルを上げるとロック競合でパフォーマンスが下がるので、必要な箇所だけ上げます。通常のCRUDはREAD COMMITTEDで十分です」

---

## テーマ11：CQRSとRead Model設計

Resilireが「SCRM 3.0でCQRS実装」を進めていると記事で言及。

```
CQRS = Command Query Responsibility Segregation
Write側 (Command): 正規化されたDB（整合性重視）
Read側 (Query): 非正規化されたView/テーブル（パフォーマンス重視）
```

```sql
-- Write側（正規化・3NF）
suppliers, facilities, risk_assessments, changesets ...

-- Read側（非正規化・JOINなしで取れる）
CREATE MATERIALIZED VIEW supplier_summary AS
SELECT
    s.id,
    s.name,
    s.tenant_id,
    COUNT(f.id) as facility_count,
    MAX(ra.score) as latest_risk_score,
    MAX(ra.assessed_at) as last_assessed_at
FROM suppliers s
LEFT JOIN facilities f ON f.supplier_id = s.id AND f.deleted_at IS NULL
LEFT JOIN LATERAL (
    SELECT score, assessed_at FROM facility_risk_assessments
    WHERE facility_id = f.id
    ORDER BY assessed_at DESC LIMIT 1
) ra ON TRUE
WHERE s.deleted_at IS NULL
GROUP BY s.id, s.name, s.tenant_id;

-- インデックス
CREATE UNIQUE INDEX ON supplier_summary(id);
CREATE INDEX ON supplier_summary(tenant_id);

-- 更新（バックグラウンドで定期実行またはイベント駆動）
REFRESH MATERIALIZED VIEW CONCURRENTLY supplier_summary;
```

**面接での語り方:**
> 「サプライヤーのダッシュボード画面ではJOINが複数必要でクエリが重かったので、CQRSパターンでRead Modelを作りました。Materialized Viewにサマリデータを非正規化して保持し、更新はイベント駆動で非同期に実行。ダッシュボードのレイテンシを500ms→50msに改善しました」

---

## テーブル設計 実践問題

> **進め方:** 解答を見る前に自分でスキーマを書く。5分考えて出なければヒントだけ見る。

---

### 問題1: サプライヤー管理システム（Resilire直結）

**要件:**
- 企業はサプライヤー（取引先）を複数登録できる
- サプライヤーは複数の施設（工場・倉庫）を持つ
- 施設は住所と緯度経度を持つ
- 施設に対してリスク評価（スコア・評価日）を記録する
- 複数のテナント（企業）が同一DBを使う

**ヒント（5分後に見る）:**
<details>
<summary>ヒントを見る</summary>

- テナント分離はどうする？（RLS or tenant_id カラム）
- 施設の座標: `POINT` 型 or `latitude/longitude` 2カラム
- リスク評価は「最新のみ」と「履歴全部」どちらが要件か？→ 履歴テーブルにする
- サプライヤーの親子関係（子会社）を表現するか？→ 自己参照FK
</details>

**解答例:**
```sql
-- テナント（企業）
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- サプライヤー（自己参照で親子会社を表現）
CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    parent_id UUID REFERENCES suppliers(id),  -- 親会社がある場合
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- 施設（PostGIS使うなら GEOGRAPHY 型）
CREATE TABLE facilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    latitude DECIMAL(9,6) NOT NULL,
    longitude DECIMAL(9,6) NOT NULL,
    deleted_at TIMESTAMPTZ
);

-- リスク評価履歴（最新は別途VIEWかアプリ側でMAX取得）
CREATE TABLE facility_risk_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES facilities(id),
    score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
    assessed_at TIMESTAMPTZ NOT NULL,
    assessed_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS設定
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY supplier_tenant_isolation ON suppliers
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- インデックス
CREATE INDEX idx_suppliers_tenant ON suppliers(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_facilities_supplier ON facilities(supplier_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_risk_facility_date ON facility_risk_assessments(facility_id, assessed_at DESC);
```

**面接で語るポイント:**
- 「リスク評価を履歴テーブルにしたのは、最新スコアだけでなくトレンドも見たいと判断したから」
- 「自己参照FKで親子会社を表現できますが、深いネストはWITH RECURSIVEが必要になる」
- 「PostGISを使うならlatitude/longitudeより`GEOGRAPHY(POINT, 4326)`型の方が距離計算が正確」

---

### 問題2: 変更履歴管理（Changesetテーブル）

**要件（Resilireが実際に作っている機能）:**
- サプライヤー情報の変更を全て記録したい
- 誰が・いつ・どのフィールドを・何から何に変えたかを追跡
- 一括インポートで大量変更されたものをまとめて「1回の変更」として扱いたい

**ヒント（5分後に見る）:**
<details>
<summary>ヒントを見る</summary>

- 「変更のまとまり」をChangeset、「個々の変更」をChangeとして2テーブルに分ける
- フィールド名と新旧の値をどう保存する？（JSONB vs 行ごとに3カラム）
- 変更前の値はNULL（新規追加）になりうる
</details>

**解答例:**
```sql
-- 変更のまとまり（インポート1回 = 1changeset）
CREATE TABLE changesets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source TEXT NOT NULL  -- 'manual', 'csv_import', 'api'
);

-- 個々の変更記録
CREATE TABLE changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    changeset_id UUID NOT NULL REFERENCES changesets(id),
    table_name TEXT NOT NULL,      -- 'suppliers', 'facilities'
    record_id UUID NOT NULL,       -- 変更されたレコードのID
    field_name TEXT NOT NULL,      -- 'name', 'address'
    old_value TEXT,                -- 変更前（新規追加はNULL）
    new_value TEXT,                -- 変更後（削除はNULL）
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_changes_record ON changes(table_name, record_id);
CREATE INDEX idx_changes_changeset ON changes(changeset_id);
```

**設計の選択肢と議論:**

| アプローチ | メリット | デメリット |
|-----------|---------|-----------|
| field_name + old/new_value カラム | シンプル、クエリが書きやすい | 型情報が失われる |
| JSONB で `{field: {old, new}}` | 一行で多フィールドまとめられる | 特定フィールドの検索が重い |
| テーブルごとに専用の変更テーブル | 型安全、インデックス効率 | テーブル数が爆発 |

**面接で語るポイント:**
- 「Resilireさんのブログでもこのテーブルを実際に設計されていて、changesetとchangeを分けるアプローチが紹介されていました」
- 「old_value/new_valueをTEXTにするとすべての型を統一的に扱えますが、数値比較が文字列比較になるトレードオフがあります」

---

### 問題3: 通知システムのスキーマ設計

**要件:**
- 複数チャンネル（メール・Slack・プッシュ）で通知を送る
- ユーザーはチャンネルごとに通知の種類をON/OFFできる
- 送信履歴（成功・失敗・リトライ回数）を記録する
- 未読/既読の管理が必要

**ヒント（5分後に見る）:**
<details>
<summary>ヒントを見る</summary>

- 通知の「内容」と「配信先・ステータス」は分けた方がいい（1通知を複数チャンネルで送るため）
- ユーザー設定はENUMで管理するか、JSONBにするか
- リトライ設計: `next_retry_at` カラムを持つとバッチ処理しやすい
</details>

**解答例:**
```sql
-- 通知本体（何を送るか）
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    type TEXT NOT NULL,           -- 'disaster_alert', 'risk_score_changed'
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    metadata JSONB,               -- 付随情報（facility_id など）
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 配信（誰に・どのチャンネルで）
CREATE TABLE notification_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES notifications(id),
    user_id UUID NOT NULL REFERENCES users(id),
    channel TEXT NOT NULL,        -- 'email', 'slack', 'push'
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'sent', 'failed'
    retry_count INTEGER NOT NULL DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,          -- 既読管理
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ユーザー通知設定
CREATE TABLE notification_preferences (
    user_id UUID NOT NULL REFERENCES users(id),
    notification_type TEXT NOT NULL,
    channel TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (user_id, notification_type, channel)
);

-- インデックス
CREATE INDEX idx_deliveries_pending ON notification_deliveries(next_retry_at)
    WHERE status = 'pending';
CREATE INDEX idx_deliveries_user_unread ON notification_deliveries(user_id, created_at DESC)
    WHERE read_at IS NULL;
```

**面接で語るポイント:**
- 「notificationsとdeliveriesを分けたのは、1つの通知をメール+Slackの両方で送るケースがあるため」
- 「next_retry_at カラムを持たせるとバッチでWHERE next_retry_at <= NOWが書けてリトライが楽になります」
- 「Partial Indexで `status = 'pending'` のものだけをインデックス化し、スキャンを減らしています」

---

### 問題4: インポート/エクスポートジョブ管理

**要件（Resilireのシステム設計問題と連動）:**
- CSVインポートを非同期で処理する
- ファイルのアップロード → バリデーション → 取り込みの3ステップ
- 進捗をリアルタイムで表示したい（完了件数/全件数）
- 取り込みエラーを行ごとに記録する

**解答例:**
```sql
CREATE TABLE import_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    created_by UUID NOT NULL REFERENCES users(id),
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,        -- Cloud Storageのパス
    status TEXT NOT NULL DEFAULT 'pending',
        -- 'pending', 'validating', 'processing', 'done', 'failed'
    total_rows INTEGER,
    processed_rows INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 行ごとのエラー記録
CREATE TABLE import_job_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES import_jobs(id),
    row_number INTEGER NOT NULL,
    field_name TEXT,
    error_message TEXT NOT NULL,
    raw_value TEXT
);

CREATE INDEX idx_import_errors_job ON import_job_errors(job_id);
```

---

### 実践問題 セルフレビューチェックリスト

設計を書いたら以下を確認:

- [ ] **主キーは何か？** — UUID vs BIGINT、gen_random_uuid() の使用
- [ ] **外部キーの方向は正しいか？** — 循環参照がないか
- [ ] **tenant_id はあるか？** — マルチテナントでの分離
- [ ] **削除はどうするか？** — Hard delete vs Soft delete の選択理由を言えるか
- [ ] **タイムスタンプカラムはあるか？** — created_at, updated_at（+ deleted_at）
- [ ] **TIMESTAMPTZ か TIMESTAMP か？** — タイムゾーン対応のため TIMESTAMPTZ を選ぶ
- [ ] **インデックスは何が必要か？** — よく使うWHERE条件、Partial Index
- [ ] **正規化は十分か？** — 1NF/2NF/3NF を意識したか
- [ ] **将来の変更に耐えられるか？** — 「1年後に○○が必要になったら？」を考えたか

---

## Go勉強との組み合わせ方（1日5時間）

| 日 | Go（3h） | DB設計（2h） |
|----|----------|------------|
| 1 | Go Tour基礎 | テーマ7（正規化）+ テーマ5（N+1） |
| 2 | interface・struct | テーマ1（cursor pagination） |
| 3 | goroutine・channel・context | テーマ2（RLS） |
| 4 | error handling | テーマ3（audit columns） |
| 5 | errgroup・graceful shutdown | テーマ4（soft delete） |
| 6 | table-driven test | テーマ6（ENUM）+ テーマ8（インデックス） |
| 7 | gRPC概念 | DB Q&A集を声に出して練習 |
| 8 | for-range落とし穴・defer | 苦手テーマを再確認 |
| 9 | 実践コーディング（recommendation service） | 設計問題を1問解く |
| 10 | 全体復習・STAR声出し練習 | 全Q&Aを声に出す |
