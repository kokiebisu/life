# DFS — Go パターン

## いつ使うか

- 木・グラフを「深く掘る」探索（経路列挙・全パターン探索）
- バックトラッキング（順列・組合せ・部分集合・N-Queens）
- 連結成分の判定・grid の島カウント
- メモ化（top-down DP）

## 型（Go）

### 二分木の再帰 DFS

```go
type TreeNode struct {
    Val         int
    Left, Right *TreeNode
}

func dfs(node *TreeNode) int {
    if node == nil {
        return 0
    }
    l := dfs(node.Left)
    r := dfs(node.Right)
    return max(l, r) + 1
}
```

### グリッド DFS（島カウント等）

```go
var dirs = [4][2]int{{-1, 0}, {1, 0}, {0, -1}, {0, 1}}

func dfsGrid(grid [][]byte, r, c int) {
    if r < 0 || r >= len(grid) || c < 0 || c >= len(grid[0]) {
        return
    }
    if grid[r][c] != '1' {
        return
    }
    grid[r][c] = '0' // visited マーク（破壊的）
    for _, d := range dirs {
        dfsGrid(grid, r+d[0], c+d[1])
    }
}
```

### バックトラッキング（順列）

```go
func permute(nums []int) [][]int {
    var res [][]int
    path := make([]int, 0, len(nums))
    used := make([]bool, len(nums))
    var bt func()
    bt = func() {
        if len(path) == len(nums) {
            cp := make([]int, len(path))
            copy(cp, path)
            res = append(res, cp)
            return
        }
        for i, n := range nums {
            if used[i] {
                continue
            }
            used[i] = true
            path = append(path, n)
            bt()
            path = path[:len(path)-1]
            used[i] = false
        }
    }
    bt()
    return res
}
```

## Go 特有の落とし穴

- **スライスは参照型**: `path` を `res` に直接 append すると後で変更が伝播する。**必ず `copy()` してから append**
- **クロージャの再帰**: `var bt func(); bt = func() { ... bt() ... }` のパターン（function literal の再帰呼び出しに変数宣言が必要）
- **可視ノードの管理**: visited を別 map で持つ vs grid を直接書き換える。grid 書き換えは最速だが破壊的（呼び出し元が再利用できない）
- **再帰深さ**: Go の goroutine スタックは初期 8KB だが動的拡張するので、純再帰で 10⁵ 深さでも基本通る。ただし深すぎる場合はイテレーティブ DFS（stack 自前実装）を検討

## 典型問題

| # | タイトル | 難易度 | パターン | ノート |
|---|---|---|---|---|
| 200 | Number of Islands | Medium | grid DFS | — |
| 695 | Max Area of Island | Medium | grid DFS + 面積 | — |
| 130 | Surrounded Regions | Medium | 境界から DFS | — |
| 417 | Pacific Atlantic Water Flow | Medium | 双方向 DFS | — |
| 46 | Permutations | Medium | バックトラッキング | — |
| 78 | Subsets | Medium | バックトラッキング | — |
| 39 | Combination Sum | Medium | バックトラッキング + 重複OK | — |
| 543 | Diameter of Binary Tree | Easy | 木 DFS + グローバル更新 | — |
| 124 | Binary Tree Maximum Path Sum | Hard | 木 DFS + 部分木戻り値 | — |

## 詰まりポイント（解きながら追記）

- （まだ問題を解いていない）
