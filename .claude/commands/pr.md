---
description: Create Pull Request. Supports Agent Teams for parallel multi-PR workflows.
allowed-tools: Bash, Read, Edit, Write, Grep, Glob, Task
---

# Create Pull Request

Create focused pull requests with changes grouped logically and limited to 200 lines each.
When multiple independent groups exist and Agent Teams is available, spawns parallel teammates for simultaneous PR creation.

## Step 1: Analyze Changes

1. Run `git status` to check current state
2. Run `git diff --stat origin/main...HEAD` to get line counts per file
3. Run `git diff origin/main...HEAD` to analyze actual changes

## Step 2: Group Changes

Analyze all changes and group them by:

- **Feature**: Related functionality (e.g., "location picker", "date range picker")
- **Type**: Similar change types (e.g., "type fixes", "dependency updates")
- **Domain**: Same domain area (e.g., "auth", "listing", "admin")

For each group, calculate total line changes (additions + deletions).

Mark inter-group dependencies: does group B require group A's changes to build/work?

## Step 3: Split if Needed

If any group exceeds 200 lines:

- Split into smaller logical units
- Each PR should be independently reviewable
- Maintain dependency order (base changes first)

Present groups to user with dependency info:

```
Group 1: feat: add location picker (156 lines) [independent]
  - src/components/location-picker.tsx (+120, -0)
  - src/lib/geocoding.ts (+36, -0)

Group 2: fix: improve date range validation (89 lines) [independent]
  - src/components/date-range-picker.tsx (+45, -12)
  - src/lib/date-utils.ts (+32, -0)

Group 3: feat: use location in search (45 lines) [depends on Group 1]
  - src/components/search.tsx (+30, -15)

Strategy: Groups 1 & 2 in parallel, then Group 3 after Group 1 merges.
```

Ask user to confirm or adjust groupings.

## Step 4: Run Verification

Before creating any PRs, verify the full codebase passes:

1. **Run test suite**:

   ```bash
   bun run test
   ```

2. **Run type check**:

   ```bash
   bun run typecheck
   ```

3. **Run linter**:

   ```bash
   bun run lint
   ```

4. **Run build**:
   ```bash
   bun run build
   ```

If any check fails:

- **STOP** - Do not proceed with PR creation
- Report the failing checks to user
- Ask user how to proceed (fix issues or skip PR)

## Step 5: Route — Single vs Parallel

**Decision point based on group count and Agent Teams availability:**

- **1 group** → Step 6A (single PR, sequential)
- **2+ independent groups, Agent Teams available** → Step 6B (parallel via Agent Teams)
- **2+ groups, Agent Teams unavailable or groups have dependencies** → Step 6A sequentially, respecting dependency order

To check Agent Teams availability:

- The env var `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` must be set
- Must be in an interactive CLI session (not CI/headless)

If Agent Teams is available but all groups have chain dependencies (each depends on the previous), fall back to Step 6A sequential.

---

## Step 6A: Single PR Flow (Sequential)

**IMPORTANT**: You MUST automatically create pull requests using `gh pr create`. DO NOT just push branches and expect the user to create PRs manually.

For each approved group (in dependency order):

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
   - `test:` - Tests
   - `chore:` - Maintenance
   - `perf:` - Performance
   - `ci:` - CI/CD

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
   - [ ] <verification step 3>

   Generated with Claude Code
   EOF
   )"
   ```

6. **Monitor CI and merge** (per PR):

   ```bash
   gh pr checks <pr-number>
   # Wait for all checks to pass
   gh pr merge <pr-number> --squash --delete-branch
   ```

7. **Clean up local workspace**:

   ```bash
   git checkout main
   git pull origin main
   if git show-ref --verify --quiet refs/heads/<feature-branch-name>; then
     git branch -d <feature-branch-name>
   fi
   ```

8. If more groups remain, return to substep 1 for the next group.

---

## Step 6B: Parallel PR Flow (Agent Teams)

When 2+ independent groups exist and Agent Teams is available, spawn teammates for parallel execution.

### Phase 1: Prepare Worktrees

Create one worktree per independent group:

```bash
for each group {n}:
  bun run worktree:create pr-group-{n}
```

Copy the relevant files for each group into its worktree (each worktree starts from main, so the changed files from the current branch need to be applied).

For each worktree:

```bash
# From the current branch, checkout only this group's files into the worktree
cd /workspace/.worktrees/pr-group-{n}
git checkout <current-branch> -- <file1> <file2> ...
```

### Phase 2: Spawn PR Team

Create an agent team with one teammate per independent group. Use **delegate mode**.

```
Create an agent team for parallel PR creation.
Spawn {N} teammates, one per PR group below.
Use delegate mode -- coordinate only, do not implement yourself.

Groups:
1. Teammate "pr-group-1": {type}: {description} ({line_count} lines)
   Worktree: /workspace/.worktrees/pr-group-1
   Files: {file1}, {file2}, ...

2. Teammate "pr-group-2": {type}: {description} ({line_count} lines)
   Worktree: /workspace/.worktrees/pr-group-2
   Files: {file1}, {file2}, ...

[... up to 5 groups]
```

#### Teammate Prompt

````
You are creating a PR for one group of changes in the sumitsugi project (Next.js/TypeScript/Bun).

## Your Group
**Title:** {type}: {description}
**Files:** {file list}
**Line count:** {additions + deletions}

## Your Worktree
Work ONLY in: /workspace/.worktrees/pr-group-{n}
cd /workspace/.worktrees/pr-group-{n}

## Steps (follow exactly)
1. Verify the changed files are present: `git diff --stat origin/main`
2. Run verification in your worktree:
   - `bun run test:run`
   - `bun run lint`
   - `bun run typecheck`
   - `bun run build`
   If any fail, message the lead with the error.
3. Stage explicitly: `git add <files>` (NEVER `git add .` or `-A`)
4. Commit: `git commit -m "{type}: {description}"`
5. Push: `git push -u origin HEAD`
6. Create PR:
   ```bash
   gh pr create --title "{type}: {description}" --body "$(cat <<'EOF'
   ## Summary
   <2-4 bullet points>

   ## Changes
   <bulleted list>

   ## Test Plan
   - [ ] <step 1>
   - [ ] <step 2>

   Generated with Claude Code
   EOF
   )"
   ```
7. CI Loop (max 5 iterations):
   - `gh pr checks <pr-number>`
   - If fail: `gh run view <id> --log-failed` -> fix -> push -> repeat
8. Message the lead when done with: group number, PR URL, CI status
````

### Phase 3: Coordinate

The lead monitors teammate progress:

- Track each teammate's PR URL and CI status
- If a teammate hits CI failure after 5 iterations: mark as blocked, continue with others
- When all independent teammates finish: proceed to merge

### Phase 4: Merge All

Merge all successful PRs:

```bash
# For each PR (no dependency order needed -- they're independent)
gh pr merge <pr-number> --squash --delete-branch
```

### Phase 5: Handle Dependent Groups

If there are groups that depend on now-merged groups:

1. Pull latest main
2. Repeat Step 6B Phase 1-4 for the next batch of unblocked groups
3. Continue until all groups are processed

### Phase 6: Worktree Cleanup

**3 SEPARATE Bash calls per worktree (CRITICAL -- never chain):**

```bash
# Call 1: Ensure CWD is safe
cd /workspace

# Call 2: Remove worktree
git worktree remove /workspace/.worktrees/pr-group-{n} --force

# Call 3: Clean up branches and pull
git branch -D pr-group-{n} 2>/dev/null; git pull origin main
```

### Phase 7: Dismiss Team

Dismiss the agent team after all PRs are merged and worktrees cleaned up.

---

## Step 7: Report

Print summary:

```
## PR Summary
| # | Group | PR | Status | Lines |
|---|-------|----|--------|-------|
| 1 | feat: add location picker | #142 | merged | 156 |
| 2 | fix: date range validation | #143 | merged | 89 |

Mode: {sequential | parallel (Agent Teams)}
Total PRs: {N} | Merged: {X} | Failed: {Y}
```

## Step 8: Task Closure

After all PRs are merged, close related tasks:

```bash
source .env.local && bd close <id>
./scripts/linear-done.sh TSU-xxx
```

Update DASHBOARD.md if applicable.

## Rules

- **ALWAYS create PRs automatically** - Never just push and tell user to create PR manually
- **All checks must pass** before pushing (test, lint, type check, build)
- **Max 200 lines per PR** (additions + deletions)
- **Title MUST use conventional commits** format
- **One logical change per PR** - independently reviewable
- **No uncommitted changes** - commit or stash first
- **Dependencies first** - if PR B depends on PR A, merge A first
- **Use `gh pr create`** - Not just `git push`
- **Parallel when possible** - Use Agent Teams for 2+ independent groups
- **Sequential fallback** - Always works, even without Agent Teams
