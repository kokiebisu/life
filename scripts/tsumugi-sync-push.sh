#!/bin/bash
# LIFE Daily Tasks → Tsumugi Linear Sync (Push Done status back)
# When a tsumugi-labeled issue is marked Done in LIFE, this syncs that
# status to the corresponding TSU issue in the tsumugi Linear workspace.
#
# Usage:
#   ./scripts/tsumugi-sync-push.sh            # Sync Done status
#   ./scripts/tsumugi-sync-push.sh --dry-run   # Preview without changes
#
# Prerequisites:
#   - LINEAR_API_KEY in .env.local (LIFE workspace)
#   - LINEAR_API_KEY in projects/tsumugi/.env.local (Tsumugi workspace)
#   - python3 available

set -eo pipefail

DRY_RUN="false"
if [ "${1}" = "--dry-run" ]; then
  DRY_RUN="true"
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load LIFE workspace API key
if [ -f "$REPO_ROOT/.env.local" ]; then
  set -a && source "$REPO_ROOT/.env.local" && set +a
fi
LIFE_API_KEY="$LINEAR_API_KEY"

if [ -z "$LIFE_API_KEY" ]; then
  echo "Error: LINEAR_API_KEY not set in $REPO_ROOT/.env.local"
  exit 1
fi

# Load Tsumugi workspace API key (extract via grep to avoid variable collision)
TSUMUGI_API_KEY=""
if [ -f "$REPO_ROOT/projects/tsumugi/.env.local" ]; then
  TSUMUGI_API_KEY=$(grep '^LINEAR_API_KEY=' "$REPO_ROOT/projects/tsumugi/.env.local" | head -1 | cut -d= -f2- | tr -d '"')
fi

if [ -z "$TSUMUGI_API_KEY" ]; then
  echo "Error: LINEAR_API_KEY not found in $REPO_ROOT/projects/tsumugi/.env.local"
  exit 1
fi

export LIFE_API_KEY TSUMUGI_API_KEY DRY_RUN

python3 << 'PYEOF'
import urllib.request, json, os, sys, re

life_api_key = os.environ['LIFE_API_KEY']
tsumugi_api_key = os.environ['TSUMUGI_API_KEY']
dry_run = os.environ.get('DRY_RUN', 'false') == 'true'

LIFE_TEAM_ID = "20330fb2-9672-4a8a-89dd-86f9f9c17d78"
TSUMUGI_LABEL_ID = "548a7fce-a3b3-4fd1-aea1-ec861e8abbe1"
TSUMUGI_TEAM_ID = "21f06272-3f96-46f2-836c-0d5dd726f931"

if dry_run:
    print("[DRY RUN] Preview mode - no changes will be made")
    print("")

print("Pushing Done status from LIFE Daily Tasks → Tsumugi Linear...")
print("")

def graphql(api_key, query):
    data = json.dumps({"query": query}).encode()
    req = urllib.request.Request("https://api.linear.app/graphql", data=data,
        headers={"Content-Type": "application/json", "Authorization": api_key})
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read())

# Step 1: Get Done issues from LIFE with tsumugi label
result = graphql(life_api_key, '''
query {
  issues(filter: {
    team: { id: { eq: "%s" } }
    labels: { id: { eq: "%s" } }
    state: { name: { eq: "Done" } }
  }, first: 200) {
    nodes { id identifier title description }
  }
}
''' % (LIFE_TEAM_ID, TSUMUGI_LABEL_ID))

done_issues = []
for node in result['data']['issues']['nodes']:
    desc = node.get('description') or ''
    m = re.search(r'<!-- tsumugi:(TSU-\d+) -->', desc)
    if m:
        done_issues.append({
            'life_id': node['identifier'],
            'tsu_id': m.group(1),
            'title': node['title'],
        })

if not done_issues:
    print("No Done tsumugi issues to sync back.")
    sys.exit(0)

print(f"Found {len(done_issues)} Done tsumugi issue(s) in LIFE")

# Step 2: Get tsumugi's Done state ID
result = graphql(tsumugi_api_key, '''
query {
  workflowStates(filter: { team: { id: { eq: "%s" } } }) {
    nodes { id name type }
  }
}
''' % TSUMUGI_TEAM_ID)

tsu_done_state = None
for s in result['data']['workflowStates']['nodes']:
    if s['name'] == 'Done':
        tsu_done_state = s['id']
        break

if not tsu_done_state:
    print("Error: Could not find Done state in tsumugi workspace")
    sys.exit(1)

# Step 3: Update each TSU issue
updated = 0
skipped = 0

for item in done_issues:
    tsu_id = item['tsu_id']

    # Get current state from tsumugi Linear
    result = graphql(tsumugi_api_key,
        'query { issue(id: "%s") { id state { name } } }' % tsu_id)
    issue = result.get('data', {}).get('issue')

    if not issue:
        print(f"  ! {tsu_id}: Not found in tsumugi Linear")
        continue

    if issue['state']['name'] == 'Done':
        print(f"  Skip {tsu_id}: already Done in tsumugi")
        skipped += 1
        continue

    if dry_run:
        print(f"  [DRY RUN] Would mark Done: {tsu_id} - {item['title']}")
        updated += 1
        continue

    result = graphql(tsumugi_api_key,
        'mutation { issueUpdate(id: "%s", input: { stateId: "%s" }) '
        '{ success issue { identifier title state { name } } } }'
        % (issue['id'], tsu_done_state))

    success = result.get('data', {}).get('issueUpdate', {}).get('success')
    if success:
        print(f"  Done {tsu_id}: {item['title']}")
        updated += 1
    else:
        print(f"  Failed {tsu_id}: {item['title']}")

print("")
print(f"Done! Updated: {updated}, Skipped: {skipped}")
PYEOF
