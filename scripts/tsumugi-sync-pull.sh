#!/bin/bash
# Tsumugi → LIFE Daily Tasks Sync (Pull)
# Reads 大株主-assigned tasks from tsumugi beads and creates them in LIFE's Linear.
#
# Usage:
#   ./scripts/tsumugi-sync-pull.sh            # Sync tasks
#   ./scripts/tsumugi-sync-pull.sh --dry-run   # Preview without changes
#
# Prerequisites:
#   - LINEAR_API_KEY in .env.local (LIFE workspace)
#   - python3 available

set -eo pipefail

DRY_RUN="false"
if [ "${1}" = "--dry-run" ]; then
  DRY_RUN="true"
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load LIFE workspace API key
if [ -z "$LINEAR_API_KEY" ]; then
  if [ -f "$REPO_ROOT/.env.local" ]; then
    set -a && source "$REPO_ROOT/.env.local" && set +a
  fi
fi

if [ -z "$LINEAR_API_KEY" ]; then
  echo "Error: LINEAR_API_KEY not set in $REPO_ROOT/.env.local"
  exit 1
fi

BEADS_FILE="$REPO_ROOT/projects/tsumugi/.beads/issues.jsonl"
if [ ! -f "$BEADS_FILE" ]; then
  echo "Error: Beads file not found at $BEADS_FILE"
  exit 1
fi

export LINEAR_API_KEY DRY_RUN BEADS_FILE

python3 << 'PYEOF'
import urllib.request, json, os, sys, re

api_key = os.environ['LINEAR_API_KEY']
dry_run = os.environ.get('DRY_RUN', 'false') == 'true'
beads_file = os.environ['BEADS_FILE']

LIFE_TEAM_ID = "20330fb2-9672-4a8a-89dd-86f9f9c17d78"
DAILY_TASKS_PROJECT_ID = "f0756722-041d-4606-a546-3adcb647c77e"
TSUMUGI_LABEL_ID = "548a7fce-a3b3-4fd1-aea1-ec861e8abbe1"
TODO_STATE_ID = "6d690d7b-9678-4fb3-a898-b029e7c1e403"

if dry_run:
    print("[DRY RUN] Preview mode - no changes will be made")
    print("")

print("Pulling 大株主 tasks from tsumugi into LIFE Daily Tasks...")
print("")

def graphql(query):
    data = json.dumps({"query": query}).encode()
    req = urllib.request.Request("https://api.linear.app/graphql", data=data,
        headers={"Content-Type": "application/json", "Authorization": api_key})
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read())

# Step 1: Read beads and filter 大株主 tasks
tasks = []
with open(beads_file) as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        issue = json.loads(line)
        if issue.get('status') != 'open':
            continue
        is_oonushi = (issue.get('assignee') == '大株主' or
                      '大株主' in (issue.get('labels') or []))
        if not is_oonushi:
            continue
        ext_ref = issue.get('external_ref', '') or ''
        match = re.search(r'(TSU-\d+)', ext_ref)
        if match:
            tasks.append({
                'tsu_id': match.group(1),
                'title': issue.get('title', ''),
                'description': issue.get('description', ''),
                'priority': issue.get('priority', 3),
            })

if not tasks:
    print("No open 大株主 tasks found.")
    sys.exit(0)

print(f"Found {len(tasks)} open 大株主 task(s)")

# Step 2: Get existing LIFE issues with tsumugi label
result = graphql('''
query {
  issues(filter: {
    team: { id: { eq: "%s" } }
    labels: { id: { eq: "%s" } }
    state: { type: { nin: ["canceled"] } }
  }, first: 200) {
    nodes { id identifier title description }
  }
}
''' % (LIFE_TEAM_ID, TSUMUGI_LABEL_ID))

existing = set()
for node in result['data']['issues']['nodes']:
    desc = node.get('description') or ''
    m = re.search(r'<!-- tsumugi:(TSU-\d+) -->', desc)
    if m:
        existing.add(m.group(1))

# Step 3: Create missing issues
created = 0
skipped = 0

for task in tasks:
    if task['tsu_id'] in existing:
        print(f"  Skip {task['tsu_id']}: already exists in Daily Tasks")
        skipped += 1
        continue

    desc_text = (
        f"<!-- tsumugi:{task['tsu_id']} -->\n"
        f"[{task['tsu_id']}](https://linear.app/tsumugi/issue/{task['tsu_id']})\n\n"
        f"{task['description'] or ''}"
    ).strip()

    if dry_run:
        print(f"  [DRY RUN] Would create: {task['title']} (from {task['tsu_id']})")
        created += 1
        continue

    query = '''
    mutation {
      issueCreate(input: {
        teamId: "%s"
        title: %s
        description: %s
        stateId: "%s"
        labelIds: ["%s"]
      }) {
        success
        issue { id identifier title }
      }
    }
    ''' % (
        LIFE_TEAM_ID,
        json.dumps(task['title']),
        json.dumps(desc_text),
        TODO_STATE_ID,
        TSUMUGI_LABEL_ID
    )

    result = graphql(query)
    issue_create = result.get('data', {}).get('issueCreate', {})

    if issue_create.get('success'):
        issue_id = issue_create['issue']['id']
        ident = issue_create['issue']['identifier']
        print(f"  Created {ident}: {task['title']} (from {task['tsu_id']})")

        # Add to Daily Tasks project
        proj_query = '''
        mutation {
          projectUpdate: issueUpdate(id: "%s", input: { projectId: "%s" }) {
            success
          }
        }
        ''' % (issue_id, DAILY_TASKS_PROJECT_ID)
        graphql(proj_query)

        created += 1
    else:
        errors = result.get('errors', [])
        print(f"  Failed: {task['title']} - {json.dumps(errors, ensure_ascii=False)}")

print("")
print(f"Done! Created: {created}, Skipped: {skipped}")
PYEOF
