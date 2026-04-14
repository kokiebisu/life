# Shopping

買いたいものリストと食材買い出し記録を管理するaspect。

## ディレクトリ構成

| パス | 内容 |
|-----|------|
| `stores/` | お店別の買いたいものリスト（衣類・雑貨・日用品） |
| `groceries/YYYY-MM-DD.md` | 食材の買い出し実績記録（Notion groceries DB と同期） |

## stores/（ウィッシュリスト）

### ファイル命名

- お店名をスネークケースで命名（例: `uniqlo.md`, `muji.md`, `nitori.md`）
- お店が存在しない場合は新規作成する

### フォーマット

```markdown
# ユニクロ

- [ ] 商品名 | ¥価格 | [リンク](URL) | メモ
```

- チェックボックス形式
- 価格・リンク・メモは任意。わかる範囲で記載する
- 購入後はチェックを入れてから行を削除する

### task-capture 連携（厳守）

「〇〇で〜買いたい」「〇〇の〜が欲しい」などの発言を検出したら:

1. **Web Search で商品を調べる** — 価格・色展開・商品ページURLなどを確認する
2. **該当店舗の `stores/店舗名.md` に追記する** — ファイルがなければ新規作成
3. **`tasks.md` には入れない**（shopping/stores/ で管理するため）
4. ユーザーに「〇〇の stores に追加しておいた」と1行で報告する

> **注意:** 食材・食品の買い出しは `groceries/` で管理する。`stores/` は衣類・雑貨・日用品など。

## groceries/（食材買い出し記録）

- Notion groceries DB と完全同期（`notion-pull.ts` が `aspects/shopping/groceries/` に書き出す）
- `/kondate` スキルの不足食材は groceries DB 経由でここに反映される
- 手動編集は原則しない（`notion-pull.ts` / `notion-grocery-gen.ts` 経由で更新）
