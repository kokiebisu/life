# Sync Sumitsugi Tasks

Sync 大株主-assigned tasks between sumitsugi and LIFE Daily Tasks in Linear.

## What This Does

1. **Pull**: Read sumitsugi's `.beads/issues.jsonl`, find open tasks assigned to 大株主, create them in LIFE's "Daily Tasks" Linear project with the "sumitsugi" label
2. **Events**: Read sumitsugi's `.beads/issues.jsonl`, find open tasks with `event` label and `due_at`, sync to `aspects/sumitsugi/daily/` and Notion calendar (TSU-ID で冪等)
3. **Push**: Find sumitsugi-labeled issues marked Done in LIFE, sync that status back to sumitsugi's Linear workspace

## Steps

1. Update the sumitsugi submodule to latest:

   ```bash
   git submodule update --remote projects/sumitsugi
   ```

2. Run the sync script:

   ```bash
   ./scripts/sumitsugi-sync.sh
   ```

3. If the submodule was updated (new commit), commit the change:

   ```bash
   git add projects/sumitsugi
   git commit -m "chore: update sumitsugi submodule"
   ```

4. Report the results to the user:
   - Whether the submodule was updated (old → new commit)
   - How many tasks were pulled (created vs skipped)
   - How many events were synced (created vs skipped, local + Notion)
   - How many Done statuses were pushed back to sumitsugi
