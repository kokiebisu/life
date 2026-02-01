# プルリクエスト作成

論理的にグループ化された変更でPRを作成します。

## ステップ1: 変更を分析

1. `git status` で現在の状態を確認
2. `git diff --stat origin/main...HEAD` でファイルごとの変更行数を確認
3. `git diff origin/main...HEAD` で実際の変更内容を分析

## ステップ2: 変更をグループ化

すべての変更を以下の観点でグループ化：
- **機能**: 関連する機能（例：「ログイン機能」「検索機能」）
- **タイプ**: 同種の変更（例：「型修正」「依存関係更新」）
- **ドメイン**: 同じ領域（例：「認証」「設定」）

## ステップ3: 必要に応じて分割

1グループが大きすぎる場合：
- 小さな論理単位に分割
- 各PRは独立してレビュー可能に
- 依存関係の順序を維持（基本変更を先に）

ユーザーに確認：
```
グループ1: feat: ログイン機能を追加
  - src/auth/login.ts
  - src/components/login-form.tsx

グループ2: fix: バリデーション改善
  - src/lib/validation.ts
```

## ステップ4: PRを作成

**重要**: `gh pr create` で自動的にPRを作成すること。

各グループについて：

1. **ブランチを作成**（必要な場合）:
   ```bash
   git checkout -b <type>/<short-description>
   ```

2. **グループのファイルのみをステージ**:
   ```bash
   git add <file1> <file2> ...
   ```

3. **コミット**（Conventional Commits形式）:
   - `feat:` - 新機能
   - `fix:` - バグ修正
   - `refactor:` - リファクタリング
   - `docs:` - ドキュメント
   - `chore:` - 雑務

4. **プッシュ**:
   ```bash
   git push -u origin HEAD
   ```

5. **PRを作成**:
   ```bash
   gh pr create --title "<type>: <description>" --body "$(cat <<'EOF'
   ## 概要
   <2-4行の変更内容と理由>

   ## 変更点
   <具体的な変更のリスト>

   ## テスト計画
   - [ ] <確認項目1>
   - [ ] <確認項目2>

   Generated with Claude Code
   EOF
   )"
   ```

## ルール

- **必ずPRを自動作成する** - pushだけで終わらない
- **1つの論理的変更につき1つのPR**
- **Conventional Commits形式のタイトル**を使用
