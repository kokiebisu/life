# Sync Tsumugi Tasks

Sync 大株主-assigned tasks between tsumugi and LIFE Daily Tasks in Linear.

## What This Does

1. **Pull**: Read tsumugi's `.beads/issues.jsonl`, find open tasks assigned to 大株主, create them in LIFE's "Daily Tasks" Linear project with the "tsumugi" label
2. **Events**: Read tsumugi's `.beads/issues.jsonl`, find open tasks with `event` label and `due_at`, sync to `aspects/tsumugi/events/` and Notion calendar (TSU-ID で冪等)
3. **Push**: Find tsumugi-labeled issues marked Done in LIFE, sync that status back to tsumugi's Linear workspace

## Steps

1. Run the sync script:

   ```bash
   ./scripts/tsumugi-sync.sh
   ```

2. Report the results to the user:
   - How many tasks were pulled (created vs skipped)
   - How many events were synced (created vs skipped, local + Notion)
   - How many Done statuses were pushed back to tsumugi
