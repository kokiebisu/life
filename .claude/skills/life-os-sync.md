---
name: life-os-sync
description: life-os upstream との同期（pull / status / contrib）。life-os の変更を life に取り込む、または life の generic な変更を life-os に貢献する。
---

# Life OS Sync

`kokiebisu/life-os`（public template）と `kokiebisu/life`（personal fork）の双方向同期を行う。

## コマンド別の動作

### `/life-os-sync` または `/life-os-sync status`

```bash
./scripts/life-os-sync.sh status
```

life と life-os の乖離（ahead/behind）を表示する。

### `/life-os-sync pull`

```bash
./scripts/life-os-sync.sh pull
```

`life-os/main` を `life` にマージする。`.life-private` に定義された personal-only パスは自動的に ours（life 側）で復元される。

マージ後に push する:
```bash
git push origin main
```

### `/life-os-sync contrib`

```bash
./scripts/life-os-sync.sh contrib
```

`life-os` に貢献できる generic なコミット一覧を表示する（scripts/, aspects/diet|gym|study config, .claude/, CLAUDE.md 等を変更したもの）。

表示されたコミットを `life-os` に cherry-pick する手順:
```bash
# life-os を別ディレクトリにクローン（初回のみ）
git clone git@github.com:kokiebisu/life-os.git /tmp/life-os-contrib
cd /tmp/life-os-contrib

# cherry-pick
git cherry-pick <commit-hash>
git push origin main
```

## 関連ファイル

- `.life-private` — personal-only パスの定義
- `docs/life-os-personal-policy.md` — どの aspect が generic/personal かのポリシー
- `scripts/life-os-sync.sh` — 実体スクリプト
