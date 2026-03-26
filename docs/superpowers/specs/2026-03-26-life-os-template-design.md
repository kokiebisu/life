# Life OS Template Design

## Goal

Extract the personal `life` repository into a public, distributable `life-os` GitHub Template that technical users can fork and use as their own personal operating system, with an aspect plugin system for enabling only the life domains they need.

## Architecture

**Two-repository model:**

```
kokiebisu/life-os     ← public GitHub Template (universal aspects only)
       ↓ fork + upstream sync
kokiebisu/life        ← personal repo (adds private aspects)
```

Other users fork `life-os` and add their own private aspects. When `life-os` improves, forks can pull upstream changes. Personal additions are **always additive** (new files/directories only) to prevent merge conflicts.

**Tech Stack:** TypeScript, Bun, Notion API, Claude Code CLI, devcontainer

---

## Repository: `life-os`

### Universal Aspects

| Aspect | Contents |
|--------|----------|
| `diet/` | Meal logs, fridge, pantry, groceries |
| `gym/` | Workout logs, gym profiles |
| `study/` | Learning records |
| `daily/` | General daily logs |
| `events/` | One-off scheduled events |
| `tasks.md` | Task management (Inbox/Archive) |
| `goal.md` | Shared goals (referenced by diet + gym) |

Church, devotions, guitar, sound, reading, and job are **personal aspects** that live only in `life`.

### Directory Structure

```
life-os/
├── aspects/
│   ├── diet/
│   │   ├── aspect.json
│   │   ├── CLAUDE.md
│   │   ├── fridge.md          ← template (personal data removed)
│   │   ├── pantry.md          ← template
│   │   ├── daily/             ← .gitkeep
│   │   └── groceries/         ← .gitkeep
│   ├── gym/
│   │   ├── aspect.json
│   │   ├── CLAUDE.md
│   │   ├── profile.md         ← template (gym membership info)
│   │   ├── logs/              ← .gitkeep
│   │   └── gyms/              ← .gitkeep
│   ├── study/
│   │   ├── aspect.json
│   │   └── CLAUDE.md
│   ├── daily/                 ← .gitkeep
│   ├── events/                ← .gitkeep
│   ├── tasks.md               ← empty Inbox template
│   └── goal.md                ← template
├── scripts/
│   ├── setup.ts               ← NEW: setup wizard
│   └── lib/
│       └── notion.ts          ← existing
├── profile/                   ← all files replaced with TODO templates
├── .devcontainer/
├── .claude/
├── CLAUDE.md                  ← fork-owned (see Upstream Sync section)
├── .gitignore                 ← includes life.config.json
└── package.json
```

### What Gets Removed from Template

Personal data is stripped before the template is published:

| Path | Action |
|------|--------|
| `aspects/diet/daily/*.md` | Delete, keep `.gitkeep` |
| `aspects/events/*.md` | Delete, keep `.gitkeep` |
| `aspects/daily/*.md` | Delete, keep `.gitkeep` |
| `aspects/diet/gym-logs/` | Delete (moved to `aspects/gym/`) |
| `aspects/diet/gym-menu.md` | Delete (replaced by dynamic generation) |
| `aspects/diet/goal.md` | Move to `aspects/goal.md` (template) |
| `profile/*.md` | Replace with TODO placeholder templates |
| `memory-bank/decisions.md` | Empty |
| `.env.local` | Gitignored (already) |
| `life.config.json` | Add to `.gitignore` |

---

## Repository: `life` (Personal Fork)

### Additional Aspects (not in `life-os`)

```
aspects/
  church/
    aspect.json
    CLAUDE.md
    verses.md
    prayer-requests.md
  devotions/
    aspect.json
    CLAUDE.md
  guitar/
    aspect.json
    CLAUDE.md
  sound/
    aspect.json
    CLAUDE.md
  reading/
    aspect.json
    CLAUDE.md
  job/
    aspect.json
    CLAUDE.md
```

### Upstream Sync Rules

**Fork-owned files** (will never be updated by `life-os` upstream — safe to edit freely):
- `CLAUDE.md`
- `profile/*.md`
- `life.config.json` (gitignored, local-only)
- `aspects/<personal-aspects>/` (new directories not in `life-os`)

**Base files** (never edit these in your fork — pull from upstream instead):
- `scripts/`
- `.devcontainer/`
- `.claude/rules/`
- `aspects/<universal-aspects>/aspect.json`
- `aspects/<universal-aspects>/CLAUDE.md`

**Customizing universal aspects without merge conflicts:**
Each universal aspect supports an optional `CLAUDE.local.md` file in the same directory. This file is gitignored in `life-os` but can be created freely in forks. Claude agents are instructed (via root `CLAUDE.md`) to read `CLAUDE.local.md` when present and treat it as a user-specific extension of the aspect's instructions.

Example:
```
aspects/diet/CLAUDE.local.md   ← personal meal preferences, calorie targets, etc.
aspects/gym/CLAUDE.local.md    ← personal gym schedule, injury notes, etc.
```

`life-os` ships `.gitignore` entries for `aspects/*/CLAUDE.local.md`.

Sync command: `git pull upstream main`

If conflicts arise on `CLAUDE.md` or `profile/`, use `git checkout --ours` — these are fork-owned.

---

## Aspect Restructuring (`life` repo)

Changes to make before extracting `life-os`:

| Current | New |
|---------|-----|
| `aspects/diet/gym-logs/` | `aspects/gym/logs/` |
| `aspects/diet/gym-menu.md` | **Deleted** (dynamic via logs + gym profile) |
| `aspects/diet/goal.md` | `aspects/goal.md` |
| *(new)* | `aspects/gym/profile.md` |
| *(new, personal only)* | `aspects/gym/gyms/fitplace/minatomirai.md` |

**Why delete `gym-menu.md`:** Claude can dynamically generate today's workout menu by reading the last 3 days of `gym/logs/` (what was trained) and `gyms/fitplace/minatomirai.md` (available machines). A static menu file is redundant.

**Note:** `aspects/gym/gyms/fitplace/minatomirai.md` is personal data — it stays in `life` only and must not be included in the `life-os` template. The `life-os` template ships `aspects/gym/gyms/` as `.gitkeep` only.

**Path references to update in Phase 1:**

Run `grep -r "diet/gym-logs" .` before starting — update all hits in:
- `.claude/skills/gym/SKILL.md`
- `scripts/*.ts` that reference gym log paths
- Any CLAUDE.md files mentioning the old path

The gym skill persona currently lives in `.claude/skills/gym/SKILL.md` — leave it there. Only the data path changes to `aspects/gym/logs/`.

---

## Aspect Manifest: `aspect.json`

Each aspect declares its Notion databases and available commands:

```json
{
  "name": "diet",
  "description": "食事・冷蔵庫・買い出し管理",
  "notion": {
    "databases": [
      {
        "envKey": "NOTION_MEALS_DB",
        "displayName": "食事",
        "schema": {
          "名前": "title",
          "日付": "date"
        }
      },
      {
        "envKey": "NOTION_GROCERIES_DB",
        "displayName": "買い出し",
        "schema": {
          "件名": "title",
          "日付": "date"
        }
      }
    ]
  },
  "commands": ["meal", "kondate", "fridge-sync"]
}
```

**Schema scope:** `setup.ts` creates only the minimum properties listed (title + date). Additional properties (select options, number fields, etc.) must be added manually via the Notion UI after setup. The setup wizard will print a post-setup checklist per aspect listing any manual steps required.

**Gym aspect example:**

```json
{
  "name": "gym",
  "description": "ジムログ・ワークアウト管理",
  "notion": {
    "databases": [
      {
        "envKey": "NOTION_GYM_DB",
        "displayName": "ジム",
        "schema": {
          "名前": "title",
          "日付": "date"
        }
      }
    ]
  },
  "commands": ["gym"]
}
```

---

## User Config: `life.config.json`

Generated by `bun run setup`. Always gitignored — treat like `.env.local`. Fork owners who want to commit it must run `git add --force life.config.json` and remove it from `.gitignore` manually (not recommended; the file contains a Notion workspace ID).

```json
{
  "aspects": {
    "diet": true,
    "gym": true,
    "study": false
  },
  "user": {
    "name": "",
    "timezone": "Asia/Tokyo",
    "language": "ja"
  }
}
```

**How consumers use this file:**

- **Scripts** read `life.config.json` at runtime using a dynamic import with graceful fallback:
  ```ts
  import { existsSync } from 'fs'
  if (!existsSync('./life.config.json')) {
    console.error('life.config.json not found. Run: bun run setup')
    process.exit(1)
  }
  const config = await import('./life.config.json')
  if (!config.aspects.gym) process.exit(0) // aspect not enabled
  ```
  This prevents cryptic module-not-found errors for users who haven't run setup yet.
- **`life-os` ships `life.config.example.json`** (committed, not gitignored) as a reference. `bun run setup` copies it to `life.config.json` and fills in values.
- **CLAUDE.md** references the config conceptually: the session-start hook runs `/from:notion`, which in turn checks active aspects before syncing. Claude agents read `life.config.json` directly when deciding which aspects to consider.
- **`bun run setup`** is the only writer of `life.config.json`.

---

## Setup Wizard: `bun run setup`

Interactive CLI that provisions a new user's environment end-to-end:

```
$ bun run setup

🚀 Life OS セットアップ

? Notion API トークンを入力してください: secret_xxx
  ✅ トークンを確認しました

? DB の親ページを指定してください
  (Notion ページ URL を貼るか、Enter で "Life OS" ページを自動作成):
  → [Enter]
  ✅ "Life OS" ページを作成しました (id: xxx)

? 使用する aspects を選択してください:
  ✅ diet     — 食事・冷蔵庫・買い出し管理
  ✅ gym      — ジムログ
  ❌ study    — 学習記録

? 言語設定: ja
? タイムゾーン: Asia/Tokyo

📦 Notion DB を作成中...
  ✅ 食事 DB        (id: xxx)
  ✅ 買い出し DB    (id: xxx)
  ✅ ジム DB        (id: xxx)

✅ .env.local を生成しました
✅ life.config.json を生成しました

📋 手動セットアップが必要な項目:
  diet: Notion の "食事" DB に "カロリー (number)" プロパティを追加してください

🎉 セットアップ完了！
   次のステップ: ./dev でdevcontainerを起動してください
```

**Internal steps:**
1. Validate Notion API token
2. Ask for parent page URL (or create a new top-level "Life OS" page)
3. Read `aspect.json` for each selected aspect
4. Create Notion DBs under the parent page via Notion API, capture IDs
5. Write `.env.local` with all DB IDs and token
6. Write `life.config.json` with selected aspects and user config
7. Print post-setup checklist for any manual Notion property additions

---

## Implementation Phases

### Phase 1: Aspect Restructuring (in `life`)
1. Run `grep -r "diet/gym-logs" .` and list all files to update
2. Create `aspects/gym/` with subdirectories
3. Move `aspects/diet/gym-logs/` → `aspects/gym/logs/`
4. Create `aspects/gym/profile.md` and `aspects/gym/gyms/fitplace/minatomirai.md`
5. Move `aspects/diet/goal.md` → `aspects/goal.md`
6. Delete `aspects/diet/gym-menu.md`
7. Update all path references found in step 1

### Phase 2: Aspect Manifests
Add `aspect.json` to each universal aspect (diet, gym, study) using the schema defined above.

### Phase 3: Setup Script
Build `scripts/setup.ts`:
- Notion token validation
- Parent page selection / auto-creation
- Aspect selection (reads all `aspect.json` files)
- Notion DB creation via API
- `.env.local` and `life.config.json` generation
- Post-setup checklist output

### Phase 4: Template Cleanup
- Add `life.config.json` to `.gitignore`
- Strip personal data (see table above), add `.gitkeep` files
- Replace `profile/*.md` with TODO placeholder templates
- Replace `memory-bank/decisions.md` with empty template

### Phase 5: Create `life-os` Repository
1. Create new public GitHub repository (`kokiebisu/life-os`)
2. Push the cleaned codebase as initial commit
3. Go to repository Settings → General → check **"Template repository"**

### Phase 6: Convert `life` to Fork
Add `life-os` as upstream remote: `git remote add upstream https://github.com/kokiebisu/life-os`

---

## Out of Scope

- Mobile app for gym/kondate (separate project, separate spec)
- Community aspect registry / npm packages
- Non-Notion storage backend
- GUI for non-technical users
