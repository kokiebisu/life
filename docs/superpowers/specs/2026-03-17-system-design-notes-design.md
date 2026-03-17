# System Design Notes 設計仕様

**日付:** 2026-03-17
**対象書籍:** System Design Interview Vol.1/2（Alex Xu 著・日本語版）
**目的:** 面接対策 + 深い理解の両立、対話ベースでノートを埋めていく

---

## ディレクトリ構造

```
aspects/study/system-design/
  README.md                ← インデックス + 復習スケジュール
  components/              ← 部品・コンセプト（caching, load-balancing 等）
  problems/                ← 実サービスの設計問題（URL shortener, YouTube 等）
  fundamentals/            ← 基礎・推定（back-of-envelope, scale-from-zero）
```

### components/ の対象トピック（読み進めながら追加）

- `load-balancing.md`
- `caching.md`
- `cdn.md`
- `consistent-hashing.md`
- `rate-limiter.md`
- `key-value-store.md`
- `database-scaling.md`
- `unique-id-generator.md`

### problems/ の対象トピック

- `url-shortener.md`
- `web-crawler.md`
- `notification-system.md`
- `news-feed.md`
- `chat-system.md`
- `search-autocomplete.md`
- `youtube.md`
- `google-drive.md`

### fundamentals/ の対象トピック

- `back-of-envelope.md`
- `scale-from-zero.md`

---

## ファイルテンプレート

### components/ テンプレート

```markdown
# {トピック名}

## 🧒 一言で言うと（ファインマン式）
小学生に説明するつもりで、自分の言葉で書く。

## なぜ使うか
- 理由1
- 理由2

## 仕組み・設計ポイント
主要な概念・パターン・アルゴリズムを記載。

## トレードオフ
| メリット | デメリット |
|----------|------------|
| ...      | ...        |

## 具体的な数値目安
面接で使える数値・オーダー感を記載。

## 面接での語り方
面接でどう話すか、構成・フレーズを記載。

## よくある面接質問
- 質問1
- 質問2

## ❓ 自分への質問（コーネル式キュー）
読んだ直後に書く。復習時に見て答えられるか確認する。
- 問1
- 問2

## 💡 自分の気づき・疑問（東大式余白）
後から追記OK。sumitsugi への応用や腑に落ちていない点など。

## 出現章
- Vol.X Ch.Y（〇〇の設計問題で登場）
```

### problems/ テンプレート

```markdown
# {サービス名}

## 要件整理
- **機能要件:** ...
- **非機能要件:** 高可用性、低レイテンシ、スケーラブル

## 規模の見積もり（Back-of-envelope）
- QPS（読み取り / 書き込み）:
- ストレージ:
- 帯域幅:

## 高レベル設計
主要コンポーネントとデータフローを記載（テキスト or ASCII図）。

## 詳細設計
重要な設計判断とその理由を記載。

## ボトルネックと対策

## 面接での語り方・流れ

## 使われているコンポーネント
→ [caching.md](../components/caching.md)

## ❓ 自分への質問（コーネル式キュー）

## 💡 自分の気づき・疑問（東大式余白）

## 出現章
- Vol.X Ch.Y
```

---

## README.md の構成

```markdown
# System Design ノート

## インデックス

### Components
| トピック | ファイル | 復習日 |
|----------|----------|--------|
| キャッシュ | components/caching.md | - |
| ...      | ...      | ...    |

### Problems
| サービス | ファイル | 復習日 |
|----------|----------|--------|
| URL短縮  | problems/url-shortener.md | - |
| ...      | ...      | ...    |

### Fundamentals
| トピック | ファイル | 復習日 |
|----------|----------|--------|
| ...      | ...      | ...    |

## 復習スケジュール（間隔反復）
- 翌日: 新しく書いたノートを読み返す
- 1週間後: キュー欄の質問に答えられるか確認
- 1ヶ月後: ファインマン式で口頭説明できるか確認
```

---

## 対話ベースの進め方

1. 章を読んだら「〇〇章読んだ」と Claude に声をかける
2. Claude が質問を投げかけ、答えを引き出しながら各セクションを埋めていく
3. 理解が曖昧な箇所はその場で深掘り・図解・例示
4. 最後に一緒にファイルに書き込む
5. 「自分への質問」セクションを一緒に考えて締める

---

## ノート術の根拠

| 手法 | 適用箇所 | 効果 |
|------|----------|------|
| ファインマン・テクニック | 一言で言うと | 理解の穴を発見 |
| コーネルメソッド | 自分への質問 | アクティブリコール |
| 東大式余白 | 自分の気づき・疑問 | 思考の跡を残す |
| 間隔反復 | README復習スケジュール | 長期記憶への定着 |
