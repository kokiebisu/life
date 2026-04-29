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

## 動作（spawn 元 = main worktree）

main worktree の場合のみ:

1. branch 名を生成
   - 命名規則: `<prefix>/<short-kebab>-<hash>`
   - **prefix 部分は spawn 先で起動したい skill 名と一致させる**（下の「Spawn 先での挙動」参照）
   - **末尾の hash**: 4–5 文字のランダム hash（同名衝突回避、再 spawn しても別 worktree になる）
     - 生成例: `bash -c "openssl rand -hex 2"` → `a3f7`
     - または: `head -c 4 /dev/urandom | base32 | tr '[:upper:]' '[:lower:]' | tr -d '=' | head -c 5`
   - 例: `kondate/week-plan-a3f7`、`fukushuu/review-x9k2`、`gym/morning-7q4d`、`feat/notion-sync-b2e1`
2. **コンテキスト保存**: ユーザー発言の意図を `.claude/pending-context/<branch>.md` に markdown で書き出す
   - branch 名（prefix）だけでは「どの skill を起動するか」しか伝わらない。**ニュアンス・前提・条件**は明示的に書かないと新セッションには届かない（main セッションの会話履歴は新セッションに引き継がれない）
   - 例: 「明日の朝食、卵使い切りたい」 → branch 名 `kondate/eggs-leftover-a3f7` だけだと「献立を考える」しか伝わらない。pending-context に「卵使い切り方針、明日の朝食限定」を書く
   - 新ウィンドウのセッションが起動時に SessionStart hook（[.claude/hooks/session-start-pending-context.sh](../../.claude/hooks/session-start-pending-context.sh)）でこのファイルを systemMessage として読み込む
   - 読まれたファイルは hook 側で削除される（一回読み）
   - **省略してよいケース**: ユーザー発言が aspect 名だけ（「fukushuu やろう」「ジムログしたい」）で追加のニュアンス・前提・条件が無い場合
3. `Bash` で `./dev <branch>` を実行（既存の worktree mode を呼ぶ）
4. ユーザーに1行で「新ウィンドウで `<branch>` セッション開いた。続きはそっちで」と返す

それ以上の応答は不要。spawn 後の続きの作業は新ウィンドウのセッションで行う。

## Spawn 先での挙動（worktree 内のセッション）

cwd が `.worktrees/<prefix>/...` のセッションは、起動直後に **cwd の branch prefix から対応 skill を自動起動**する。ユーザーの指示を待たない。

### 判定手順

1. `pwd` で cwd を確認
2. `.worktrees/<prefix>/...` の `<prefix>` 部分を抽出
3. `<prefix>` が下記マッピングにあれば、対応 skill を即起動
4. それ以外（`feat/`、`fix/`、`chore/`、`docs/`、`refactor/`）は通常の開発モード（skill 起動不要、ユーザー指示を待つ）

### Prefix → skill マッピング

| prefix | skill |
|--------|-------|
| `fukushuu/` | `/fukushuu` |
| `kondate/` | `/kondate` |
| `gym/` | `/gym` |
| `study/` | `/study` |
| `interview-prep/` | `/interview-prep` |
| `devotion/` | `/devotion` |
| `meal/` | `/meal` |
| `event/` | `/event` |
| `calendar/` | `/calendar` |
| `humanize-ja/` | `/humanize-ja` |
| `defer/` | `/defer` |
| `resume/` | `/resume` |

新しい skill を追加したらこのテーブルにも追加する。

### Why

- `./dev <branch>` で起動したセッションは「何の aspect の作業か」を branch 名で表明している
- prefix を見れば「どの skill を起動するか」は決まる
- ただし、ニュアンス・前提・条件は branch 名では表現できない → pending-context（spawn 元 step 2）と組み合わせて初めて意図が完全に伝わる

## 判断しないケース（= spawn しない）

- 既存セッションで進行中の作業の続き発言
- 軽い質問・雑談・確認
- 1ターンで完結するもの（「〇〇覚えて」「〇〇直して」等）
- spawn 先（`.worktrees/` 配下）のセッション

→ ユーザーが **明示的に新トピックを宣言**した時のみ spawn する。

## Out of scope（今後の検討）

- **完全自動進行**: skill 起動後にユーザー指示を待たず Claude が走り続ける挙動は、各 skill 側の責務（skill 内で進めるかユーザー確認を挟むかを判断する）。新セッション起動時に最初の prompt を自動投入する仕組みは VS Code 拡張仕様の調査後に検討
