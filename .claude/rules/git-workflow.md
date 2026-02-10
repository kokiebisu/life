# Git Workflow

## Commit Message Format

```
<type>: <description>

<optional body>
```

Types: feat, fix, refactor, docs, chore

## Pull Request Workflow

**Complete PR Workflow:**

1. Create/update PR
2. Wait for CI checks (`gh pr checks`) - all must pass
3. If any CI check fails: fix iteratively, then go back to step 2
4. Check for PR review comments (`gh pr view <number> --comments`)
5. If relevant comments exist: address them, push fixes, go back to step 2
6. Merge PR (`gh pr merge <number> --squash --delete-branch`)
7. Switch to main (`git checkout main`)
8. Pull latest changes (`git pull origin main`)
9. Clean up merged branches (see Post-Merge Cleanup below)

**When to merge automatically:**

- Docs updates (README, CLAUDE.md, comments, etc.)
- Config changes
- Small fixes
- Refactoring (no behavior changes)

**Only wait for user approval when:**

- Breaking changes
- Major structural decisions
- Large features spanning many files

## Creating Multiple PRs from Grouped Changes

For each PR group, follow this exact sequence:

1. **Create branch**: `git checkout -b <branch-name>`
2. **Stage ONLY files for this group**: `git add <specific-files>`
3. **Verify**: `git status` - MUST show only files intended for this PR
4. **Commit**: `git commit -m "..."`
5. **Push and create PR**: `git push -u origin HEAD && gh pr create ...`
6. **Wait for CI, merge**: `gh pr merge <number> --squash --delete-branch`
7. **Return to main**: `git checkout main && git pull origin main`
8. **Repeat** for next group

**Key Rules:**

- **ONE group per branch** - Never mix groups
- **Explicit staging** - Use `git add <specific-file>`, NOT `git add .` or `git add -A`
- **Always verify** - Run `git status` before committing
- **Sequential processing** - Complete PR1 (merge) before starting PR2
- **Clean state** - Return to main between PRs

## Post-Merge Cleanup

After every PR merge, clean up stale branches:

1. **Delete merged local branches**:

   ```bash
   # List local branches (excluding main)
   git branch | grep -v "^\* main$" | grep -v "^  main$" | sed 's/^[* ] //'
   # Cross-reference with merged PRs (handles squash-merged branches)
   gh pr list --state merged --json headRefName --jq '.[].headRefName'
   # Delete branches that appear in both lists
   git branch -D <merged-branches>
   ```

2. **Prune stale remote references**:

   ```bash
   git remote prune origin
   ```

**Notes:**

- `git branch --merged` does not detect squash-merged branches — use `gh pr list --state merged` instead
- Use `-D` (force) instead of `-d` to handle squash-merged branches
- NEVER delete `main`/`master` or the current branch
- Warn user if any branch has unpushed commits before deleting
