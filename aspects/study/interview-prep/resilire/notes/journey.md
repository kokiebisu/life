# Resilire 面接対策ジャーニー（日次ログ）

> 4/20前後の面接に向けた10日間の学習ログ。tracker.md を削除する際に日次ログだけ退避したもの。

## 2026-04-09
今日やったこと:
- Go Day1: interface・値/ポインタレシーバ・typed nil・Basics（スライス・マップ・:=）
- DB: 正規化（1NF/2NF/3NF・間違えやすいパターン）・N+1・Eager Loading・sqlc
- 復習システム構築（qa-bank.md・review-log.json・/interview-prep review）
- DB: cursor-based pagination（offset との比較・仕組み・トレードオフ・データズレ）
- システム設計: 5ステップフレームワーク（Step 1-2 途中まで）・非機能要件・可用性の数値

詰まったところ:
- 2NF vs 3NF の区別（単一PKの場合は2NF違反は起きない）
- スライスがコピーを作らないこと
- offset pagination のデータズレ問題
- cursor の ORDER BY 複合カーソルが必要な理由

## 2026-04-10（Day 2）
今日やったこと:
- Go: interface設計パターン（依存注入・小さいinterface・struct埋め込み）、コーディング3問
- システム設計: URLショートナー（5ステップ通し）

詰まったところ:
- 短縮URL生成アルゴリズム（ランダム生成・base62）を知らなかった
- PKに自動インデックスが貼られることを知らなかった
- キャッシュのTTL判断プロセスを知らなかった

## 2026-04-13（Day 4）
今日やったこと:
- Go: error handling（errors.Is / errors.As / %w / typed nil）
- コーディング: カスタムエラー型 NotFoundError を実装・errors.As で取り出し
- 模擬面接: Q4全問回答
- DB: audit columns（created_by をIDにする理由・GDPR・参照整合性・soft delete・ON DELETE選択肢・NULLvs削除済み文字列のトレードオフ）
- システム設計: 問題1 災害アラート（非機能要件・スケール・キュー設計・DLQ・リトライ可能/不可能の分類）

詰まったところ:
- errors.Is vs errors.As の違い（structかどうかの切り分けで理解）
- typed nil の説明（問題・理由・対策まで言えた）
- テナント・サプライヤー・施設の概念整理が必要だった
- システム設計で選択肢を全て出してトレードオフも提示する習慣（次回から改善）

## 2026-04-14（Day 5）
今日やったこと:
- Go: errgroup（WaitGroupとの違い・g.Goの仕組み・channel vs errgroupの使い分け）
- DB: soft delete（deleted_at / deleted_by / GDPR / Partial Index）・ENUM（同一トランザクション問題）・インデックス設計（B-tree・複合インデックスの左端ルール・Partial Index）・RLS文法
- システム設計: 問題2 大量CSVインポート（非同期アーキテクチャ・GCS・Pub/Sub ACK方式・チャンク分割・バルクINSERT・COPYコマンド）

詰まったところ:
- ワーカークラッシュ時の冗長性（ACK方式とDBジョブ管理の組み合わせ）
- エラー行の返し方（CSVダウンロード方式がベター）
- COPYコマンドの詳細

## 2026-04-15（Day 6）
今日やったこと:
- Go: table-driven test（構造・t.Run・名前の由来）、testcontainers（モックvsDB実立ち上げ）、Testing Trophy
- DB: N+1（Eager Loading・IN句・JOIN）、EXPLAIN ANALYZE（Seq Scan / actual time / Rows Removed）
- システム設計: 問題3 キャッシュ戦略（Redis・Invalidation3方式・フォールバック）

詰まったところ:
- t.Run の目的をすぐに言えなかった
- Eviction Policy と Cache Invalidation を混同した
- キャッシュ戦略は骨格は言えるが選択肢+トレードオフまで練習が必要

## 2026-04-27（Graph/Tree Day 1）
今日やったこと:
- アルゴリズム: グラフ vs ツリー、隣接リスト（map[string][]string）vs struct方式の比較
- ID vs 名前のトレードオフ（メモリ・ユニーク性・DB整合）
- BFS（Goコード + トレース実演）・DFS（再帰版）
- BFS/DFS 使い分け基準（最短ホップ→BFS、cycle検出→DFS）
- DFS 3色塗り分けでの cycle 検出（GRAY/BLACK の区別が必要な理由）
- Notion `勉強（トピック別）` DB に「カテゴリ: アルゴリズム」追加・本セッション登録

詰まったところ:
- 最初「ツリー構造」が全部表せると思っていた → 親が複数いるケースで限界に気づいた
- struct方式の限界（インデックスが別途必要）が腑に落ちるまで2回説明
- map の値を `[]Node` ではなく `[]string` にする理由（つながりとデータの分離）

次回（Graph/Tree Day 2）:
- コーディング R-G1: n次サプライヤー検索（BFS + depth制限）の実装
- コーディング R-G2: 循環依存検出（DFS 3色）の実装
- 余裕があればトポロジカルソート

## 2026-04-28（コードレビュー面接対策）
今日やったこと:
- コードレビューの優先度ラベル（must/should/nit）と理由+修正案セットの言語化
- PR レビュー実践: Resilire 風の並列サプライヤー取得コード
- must 2件発見: results スライス concurrent append / s.cache map concurrent r/w
- append の内部4ステップと cap pre-allocate でも race が残る理由
- 修正案3案（channel / sync.Mutex / errgroup + index 書き込み）のトレードオフ

詰まったところ:
- 「最後の append の後に return が無い」と誤読（不要だった）
- race の指摘を最初「channel が無い」と手段で言ってしまった（理由→修正案→トレードオフの順が正解）
- fetchOne 周りの must（ctx 伝播・resp.Body close・エラー握りつぶし等）は次回継続

明日やること:
- 同じ題材で fetchOne 周りの残り must/should/nit を出し切る
- もしくは別 PR レビュー問題で慣らす
