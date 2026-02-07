# Create Pull Request

Create focused pull requests with changes grouped logically.

## Step 1: Analyze Changes

1. Run `git status` to check current state
2. Run `git diff --stat origin/main...HEAD` to get line counts per file
3. Run `git diff origin/main...HEAD` to analyze actual changes

## Step 2: Group Changes

Analyze all changes and group them by:

- **Feature**: Related functionality
- **Type**: Similar change types (e.g., "config updates", "documentation")
- **Domain**: Same domain area (e.g., same aspect)

For each group, calculate total line changes (additions + deletions).

## Step 3: Split if Needed

If any group is too large:

- Split into smaller logical units
- Each PR should be independently reviewable
- Maintain dependency order (base changes first)

Present groups to user and ask to confirm or adjust groupings.

## Step 4: Create PRs

**IMPORTANT**: You MUST automatically create pull requests using `gh pr create`. DO NOT just push branches and expect the user to create PRs manually.

For each approved group:

1. **Create branch** (if needed):

   ```bash
   git checkout -b <type>/<short-description>
   ```

2. **Stage only group files**:

   ```bash
   git add <file1> <file2> ...
   ```

3. **Commit with conventional commit format**:
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `refactor:` - Code refactoring
   - `docs:` - Documentation
   - `chore:` - Maintenance

4. **Push branch**:

   ```bash
   git push -u origin HEAD
   ```

5. **Immediately create PR** (DO NOT SKIP THIS):

   ```bash
   gh pr create --title "<type>: <description>" --body "$(cat <<'EOF'
   ## Summary
   <2-4 bullet points describing what changed and why>

   ## Changes
   <bulleted list of specific changes made>

   ## Test Plan
   - [ ] <verification step 1>
   - [ ] <verification step 2>

   Generated with Claude Code
   EOF
   )"
   ```

6. **Report PR URL and status** after creation

## Step 5: Wait for CI and Merge

After PR is created:

1. **Monitor CI checks**:

   ```bash
   gh pr checks <pr-number>
   ```

2. **Wait for all checks to pass** - Do NOT proceed if any check fails

3. **Merge PR and delete remote branch**:

   ```bash
   gh pr merge <pr-number> --squash --delete-branch
   ```

4. **Clean up local workspace**:

   ```bash
   git checkout main
   git pull origin main
   ```

## Rules

- **ALWAYS create PRs automatically** - Never just push and tell user to create PR manually
- **Title MUST use conventional commits** format
- **One logical change per PR** - independently reviewable
- **No uncommitted changes** - commit or stash first
- **Dependencies first** - if PR B depends on PR A, create A first
- **Use `gh pr create`** - Not just `git push`
