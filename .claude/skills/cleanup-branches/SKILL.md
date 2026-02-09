# Cleanup Merged Branches

Clean up local and remote branches that have been merged into the main branch.

## Step 1: Identify Merged Branches

1. **List local branches**:

   ```bash
   git branch | grep -v "^\* main$" | grep -v "^  main$" | sed 's/^[* ] //'
   ```

2. **Check for merged PRs (handles squash-merged branches)**:

   ```bash
   gh pr list --state merged --json number,headRefName --jq '.[].headRefName'
   ```

3. **Cross-reference** local branches with merged PRs to identify candidates for deletion:
   - Branches that appear in both lists are safe to delete
   - Show both traditional merged branches and squash-merged branches

4. **Show summary** to user:

   ```
   Local branches that can be deleted (X):
   - feat/feature-a (squash-merged in PR #123)
   - fix/bug-fix-b (traditionally merged)

   Remote branches to delete (Y):
   - feat/feature-a
   - fix/bug-fix-b
   ```

**Note:** Squash-merged branches won't show up in `git branch --merged` because their commits were squashed into a single new commit on main. We use GitHub PR data to identify these.

## Step 2: Confirm Deletion

Ask user to confirm before proceeding. Present options:

- Delete both local and remote branches
- Delete only local branches
- Delete only remote branches
- Cancel

## Step 3: Delete Branches

Based on user selection:

### Delete Local Branches

```bash
git branch -D <branch1> <branch2> <branch3> ...
```

Use `-D` (force delete) instead of `-d` to avoid issues with branches that were squash-merged.

### Delete Remote Branches

```bash
git push origin --delete <branch1> <branch2> <branch3> ...
```

### Prune Remote References

After deleting remote branches, clean up stale remote-tracking references:

```bash
git remote prune origin
```

## Step 4: Verify Cleanup

1. **Show remaining local branches**:

   ```bash
   git branch
   ```

2. **Show remaining remote branches**:

   ```bash
   git branch -r
   ```

3. **Report summary**:
   ```
   Cleanup complete!
   - Deleted X local branches
   - Deleted Y remote branches
   - Remaining: Z local branches, W remote branches
   ```

## Safety Rules

- **NEVER delete main/master** branch
- **NEVER delete current branch** (checkout main first if needed)
- **NEVER delete branches with unpushed commits** (warn user)
- **Always confirm** before deleting
- **Show clear summary** of what will be deleted
- **Verify branches are merged** before deleting

## Edge Cases

1. **Current branch is not main**:
   - Switch to main first: `git checkout main`
   - Pull latest changes: `git pull`

2. **Uncommitted changes**:
   - Warn user about uncommitted changes
   - Suggest stashing: `git stash`

3. **Squash-merged branches**:
   - `git branch --merged` won't show squash-merged branches
   - Must use `gh pr list --state merged` to find them
   - User confirmation is important since git can't verify the merge
   - Use `-D` (force delete) instead of `-d` when deleting

4. **Branches not merged but pushed to remote**:
   - List these separately
   - Warn user they may contain unmerged work
   - Only delete if user explicitly confirms

5. **Authentication required for remote**:
   - Ensure gh CLI is authenticated
   - Use `gh auth status` to check

## Example Output

```
Checking for merged branches...

Found 5 local branches that can be deleted:
  - feat/location-picker (squash-merged in PR #45)
  - feat/date-picker (squash-merged in PR #46)
  - fix/typo-fix (traditionally merged)
  - docs/update-readme (squash-merged in PR #47)
  - chore/cleanup (traditionally merged)

Found 3 remote merged branches:
  - feat/location-picker
  - feat/date-picker
  - fix/typo-fix

How would you like to clean up these merged branches?
[Options selected: Delete both local and remote branches]

Deleting local branches...
✓ Deleted feat/location-picker
✓ Deleted feat/date-picker
✓ Deleted fix/typo-fix
✓ Deleted docs/update-readme
✓ Deleted chore/cleanup

Deleting remote branches...
✓ Deleted origin/feat/location-picker
✓ Deleted origin/feat/date-picker
✓ Deleted origin/fix/typo-fix

Pruning remote references...
✓ Pruned 5 stale references

Cleanup complete!
- Deleted 5 local branches
- Deleted 3 remote branches
- Remaining: 1 local branch (main), 1 remote branch (origin/main)
```
