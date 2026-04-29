# 自動セッション spawn ルール（厳守）

## トリガー

ユーザーの発言に**新トピック宣言キーワード**が含まれていたら、即 `./dev <branch>` を Bash で実行して新ウィンドウを開く。

キーワード例:

- 「〇〇やりたい」「〇〇始めたい」「〇〇に集中したい」「〇〇やろう」
- 「〇〇に取りかかる」「〇〇をやる」

## 自己ガード（重要）

**現セッションの cwd が `.worktrees/` 配下なら spawn しない。** 普通に応答する。

理由: spawn 先の worktree セッションでさらに spawn が起きると無限ループになる。

判定方法:

- `Bash` で `pwd` を確認 → 結果に `.worktrees/` が含まれるなら spawn off
- spawn が動作するのは main worktree (`/workspaces/life`) のみ

## 動作

main worktree の場合のみ:

1. branch 名を生成
   - 命名規則: `<aspect>/<short-kebab>`
   - 例: `kondate/week-plan`、`feat/notion-sync`、`gym/morning-routine`
2. `Bash` で `./dev <branch>` を実行（既存の worktree mode を呼ぶ）
3. ユーザーに1行で「新ウィンドウで `<branch>` セッション開いた。続きはそっちで」と返す

それ以上の応答は不要。spawn 後の続きの作業は新ウィンドウのセッションで行う。

## 判断しないケース（= spawn しない）

- 既存セッションで進行中の作業の続き発言
- 軽い質問・雑談・確認
- 1ターンで完結するもの（「〇〇覚えて」「〇〇直して」等）
- spawn 先（`.worktrees/` 配下）のセッション

→ ユーザーが **明示的に新トピックを宣言**した時のみ spawn する。

## Out of scope（今後の拡張）

- 新セッションへのコンテキスト引き継ぎは未実装。次フェーズで `.claude/pending-context/<branch>.md` 経由で引き継ぐ予定
- 新ウィンドウでの完全自動進行（最初の prompt を自動投入）は VS Code 拡張仕様の調査後に検討
