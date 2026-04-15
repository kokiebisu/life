# システム設計 Chapter 優先度（選考企業基準）

> `/interview-prep` のシステム設計セッション開始時に必ず参照すること。
> 優先度は応募予定の企業ドメインをもとに決定（2026-04-15時点）。

---

## 優先順位

| 優先度 | Chapter | テーマ | 関連企業 |
|--------|---------|--------|---------|
| 1 | **Ch.12** | チャットシステム | Azit（ドライバー↔ライダーリアルタイム通信）・Resilire（WebSocket通知）・DeNA（Showroom/Pococha） |
| 2 | **Ch.13** | 検索オートコンプリート | kickflow（承認者・フォーム検索）・Azit・Resilire |
| 3 | **Ch.11** | ニュースフィードシステム | DeNA（ランキング・レコメンド）・kickflow（承認フロー活動履歴）・Resilire |
| 4 | **Ch.14** | Youtubeの設計 | DeNA専用（Showroom/Pococha のライブ配信）。DeNA受けるなら必須 |
| 5 | **Ch.9**  | Webクローラ | Resilire特化（気象庁XMLクローリング）。system-design.md 問題1でCrawlerは既にカバー済みなので追加コスト小 |
| 6 | **Ch.15** | Google Driveの設計 | どの社も低優先。kickflowのドキュメント添付に多少関係する程度 |

---

## 企業別の重点テーマ

| 企業 | 最重要 Chapter | 補足 |
|------|--------------|------|
| **Resilire** | Ch.9（クローラ）・Ch.12（チャット） | system-design.md の問題1〜5が主軸。Chapterは補強用 |
| **Azit (CREW)** | Ch.12（チャット） | ライドシェアのリアルタイム通信が核心。マッチングシステムも聞かれる可能性あり（6Chapterの範囲外） |
| **kickflow** | Ch.13（オートコンプリート） | DBのRLS・マルチテナント・ワークフロー状態機械の方が聞かれやすい可能性もある |
| **DeNA** | Ch.12（チャット）・Ch.14（Youtube） | Pococha/Showroomが軸。1M件/30分のランキング集計も頻出トピック |
| **NOT A HOTEL** | なし | テック系の面接ではない。事業理解・ドメイン知識を優先 |

---

## 備考

- Resilire向けの問題1〜5（`resilire/system-design.md`）はこのChapter優先度とは別軸で進める
- 各Chapterを学ぶ際は「この会社のどのドメインに紐づくか」を常に意識して語り口を作る
