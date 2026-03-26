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

Other users fork `life-os` and add their own private aspects. When `life-os` improves, forks can pull upstream changes. Personal additions are **always additive** (new files only) to prevent merge conflicts.

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
├── CLAUDE.md
├── life.config.json           ← in .gitignore (fork-side only)
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
| `life.config.json` | Gitignored |

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

- Never directly edit `life-os` base files in the fork (prevents merge conflicts)
- Personal additions are new files/directories only
- `life.config.json` and `profile/` are fork-side only
- Sync command: `git pull upstream main`

---

## Aspect Restructuring (`life` repo)

Changes to make before extracting `life-os`:

| Current | New |
|---------|-----|
| `aspects/diet/gym-logs/` | `aspects/gym/logs/` |
| `aspects/diet/gym-menu.md` | **Deleted** (dynamic via logs + gym profile) |
| `aspects/diet/goal.md` | `aspects/goal.md` |
| *(new)* | `aspects/gym/profile.md` |
| *(new)* | `aspects/gym/gyms/fitplace/minatomirai.md` |

**Why delete `gym-menu.md`:** Claude can dynamically generate today's workout menu by reading the last 3 days of `gym/logs/` (what was trained) and `gyms/fitplace/minatomirai.md` (available machines). A static menu file is redundant.

---

## Aspect Manifest: `aspect.json`

Each aspect declares its Notion databases, required env vars, and available commands:

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
  "commands": ["meal", "kondate", "fridge-sync"],
  "claudeTeam": "6人チーム"
}
```

The `setup.ts` script reads these manifests to know which Notion DBs to create and which env vars to set.

---

## User Config: `life.config.json`

Generated by `bun run setup`. Gitignored in `life-os`, committed in personal forks.

```json
{
  "aspects": {
    "diet": true,
    "gym": true,
    "study": false,
    "church": false
  },
  "notion": {
    "workspaceId": "xxx"
  },
  "user": {
    "name": "",
    "timezone": "Asia/Tokyo",
    "language": "ja"
  }
}
```

Scripts and CLAUDE.md read this file to conditionally activate aspect behavior.

---

## Setup Wizard: `bun run setup`

Interactive CLI that provisions a new user's environment end-to-end:

```
$ bun run setup

🚀 Life OS セットアップ

? Notion API トークンを入力してください: secret_xxx
  ✅ トークンを確認しました

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

🎉 セットアップ完了！
   次のステップ: ./dev でdevcontainerを起動してください
```

**Internal steps:**
1. Validate Notion API token
2. Read `aspect.json` for each selected aspect
3. Create Notion DBs via Notion API, capture IDs
4. Write `.env.local` with all DB IDs
5. Write `life.config.json` with selected aspects and user config

---

## Implementation Phases

### Phase 1: Aspect Restructuring (in `life`)
Restructure `aspects/diet/` and create `aspects/gym/` before extracting the template.

### Phase 2: Aspect Manifests
Add `aspect.json` to each universal aspect (diet, gym, study).

### Phase 3: Setup Script
Build `scripts/setup.ts` — the Notion token input, aspect selection, DB creation, and file generation.

### Phase 4: Template Cleanup
Strip personal data, add `.gitkeep` files, replace `profile/` with TODO templates, add `life.config.json` to `.gitignore`.

### Phase 5: Create `life-os` Repository
Create new public GitHub repository, push the cleaned template, enable "Template repository" in settings.

### Phase 6: Convert `life` to Fork
Add `life-os` as upstream remote to current `life` repo.

---

## Out of Scope

- Mobile app for gym/kondate (separate project, separate spec)
- Community aspect registry / npm packages
- Non-Notion storage backend
- GUI for non-technical users
