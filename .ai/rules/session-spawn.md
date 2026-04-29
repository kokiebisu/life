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
2. `Bash` で `./dev <branch>` を実行（既存の worktree mode を呼ぶ）
3. ユーザーに1行で「新ウィンドウで `<branch>` セッション開いた。続きはそっちで」と返す

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

- `./dev <branch>` で起動したセッションは「何をしに開かれたか」を branch 名で表明している
- prefix を見れば spawn 元の意図（どの aspect に取り組むか）が分かる
- pending-context のような追加機構なしに、命名規則だけで自動 skill 起動が成立する

## 判断しないケース（= spawn しない）

- 既存セッションで進行中の作業の続き発言
- 軽い質問・雑談・確認
- 1ターンで完結するもの（「〇〇覚えて」「〇〇直して」等）
- spawn 先（`.worktrees/` 配下）のセッション

→ ユーザーが **明示的に新トピックを宣言**した時のみ spawn する。

## Out of scope（今後の検討）

- **複雑な context 引き継ぎ**: branch 名で表現できない context（特定ファイル参照、過去会話の要点等）が必要な場合は別途検討。pending-context 機構（SessionStart hook 経由）の追加が候補だが、現状は branch prefix → skill 起動で実用的に対応できることが多い
- **完全自動進行**: skill 起動後にユーザー指示を待たず Claude が走り続ける挙動は、各 skill 側の責務（skill 内で進めるかユーザー確認を挟むかを判断する）
