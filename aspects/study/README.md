# Study - 学習管理

技術面接対策・ソフトウェアエンジニアリングの学習を管理します。

## 活用方法

### アルゴリズム学習

CS基礎・面接対策・実務応用を統合したアルゴリズム学習は `algorithms/README.md` を参照。

### 学習ロードマップ

段階的な学習計画は `roadmap.md` を参照してください。

## 学習セッションの記録

`/study` コマンドで学習セッションを開始できます。

- Notion Study DB にセッションを登録（カレンダー連携）
- Claude と対話しながらコーネル式ノートを記録
- ローカル MD と Notion ページを同期管理
- ファイルパス: `aspects/study/{category}/notes/YYYY-MM-DD-{book-slug}.md`

### 使い方

```
/study                          # 対話式でカテゴリ・時刻を確認
/study algorithms               # カテゴリ指定
/study algorithms --start 14:00 # 開始時刻も指定
```
