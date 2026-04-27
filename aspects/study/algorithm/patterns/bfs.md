# BFS — Go パターン

## いつ使うか

- **最短経路（無重みグラフ）** が必要なとき → 必ず BFS（DFS では距離が最短にならない）
- レベル順の探索（木の階層別処理）
- 1ステップ = 1コストで広がる問題（ゲームの最少手数・word ladder 等）
- 多発信源 BFS（複数始点から同時に広げる）

## 型（Go）

### グリッド最短距離

```go
var dirs = [4][2]int{{-1, 0}, {1, 0}, {0, -1}, {0, 1}}

func shortestPath(grid [][]byte, sr, sc, tr, tc int) int {
    if grid[sr][sc] == '#' || grid[tr][tc] == '#' {
        return -1
    }
    rows, cols := len(grid), len(grid[0])
    visited := make([][]bool, rows)
    for i := range visited {
        visited[i] = make([]bool, cols)
    }
    queue := [][3]int{{sr, sc, 0}} // {row, col, dist}
    visited[sr][sc] = true
    for len(queue) > 0 {
        cur := queue[0]
        queue = queue[1:]
        r, c, d := cur[0], cur[1], cur[2]
        if r == tr && c == tc {
            return d
        }
        for _, dir := range dirs {
            nr, nc := r+dir[0], c+dir[1]
            if nr < 0 || nr >= rows || nc < 0 || nc >= cols {
                continue
            }
            if visited[nr][nc] || grid[nr][nc] == '#' {
                continue
            }
            visited[nr][nc] = true
            queue = append(queue, [3]int{nr, nc, d + 1})
        }
    }
    return -1
}
```

### レベル順（木）

```go
func levelOrder(root *TreeNode) [][]int {
    if root == nil {
        return nil
    }
    var res [][]int
    queue := []*TreeNode{root}
    for len(queue) > 0 {
        size := len(queue)
        level := make([]int, 0, size)
        for i := 0; i < size; i++ {
            node := queue[i]
            level = append(level, node.Val)
            if node.Left != nil {
                queue = append(queue, node.Left)
            }
            if node.Right != nil {
                queue = append(queue, node.Right)
            }
        }
        queue = queue[size:]
        res = append(res, level)
    }
    return res
}
```

### 多発信源 BFS（rotting oranges 等）

```go
// 全ての腐ったオレンジから同時に BFS
queue := [][3]int{}
for r := 0; r < rows; r++ {
    for c := 0; c < cols; c++ {
        if grid[r][c] == 2 {
            queue = append(queue, [3]int{r, c, 0})
        }
    }
}
// 以降は通常の BFS
```

## Go 特有の落とし穴

- **キューは slice で実装**: `queue[1:]` で先頭取り出し（O(1) amortized）。`container/list` は遅いし API が冗長で実用性低い
- **slice の memory リーク**: `queue = queue[1:]` を長く繰り返すと先頭部分の参照が残る。極端に大きいキューでは `queue = queue[size:]` でレベル一気に切るほうが安全
- **visited をいつマークするか**: **enqueue 時にマーク**（dequeue 時ではない）。dequeue 時マークだと同じノードが重複して enqueue される
- **タプルなしで複数情報を持つ**: `[3]int{r, c, dist}` のように固定長配列で渡す。struct 定義してもいい
- **grid のコピーを破壊しない**: visited を別配列で持つ。grid を `0` に書き換える DFS スタイルは BFS でもできるが、入力破壊が許されない場合に注意

## DFS vs BFS の判断

| 問題 | 使うべき |
|---|---|
| 「最短ステップ数」「最少操作回数」 | **BFS** |
| 「全パターン列挙」「経路の全列挙」 | **DFS / バックトラッキング** |
| 「連結判定」「島カウント」 | **どちらでも OK**（実装の好み） |
| 「サイクル検出（無向）」 | **どちらでも**（DFS のほうが書きやすい） |
| 「トポロジカルソート」 | **BFS（Kahn）または DFS** |

## 典型問題

| # | タイトル | 難易度 | パターン | ノート |
|---|---|---|---|---|
| 102 | Binary Tree Level Order Traversal | Medium | 木 BFS レベル | — |
| 103 | Binary Tree Zigzag Level Order Traversal | Medium | 木 BFS + 方向反転 | — |
| 200 | Number of Islands | Medium | grid BFS | — |
| 994 | Rotting Oranges | Medium | 多発信源 BFS | — |
| 542 | 01 Matrix | Medium | 多発信源 BFS（最短距離） | — |
| 127 | Word Ladder | Hard | グラフ BFS + 単語変換 | — |
| 752 | Open the Lock | Medium | グラフ BFS + 状態空間 | — |
| 286 | Walls and Gates | Medium | 多発信源 BFS | — |
| 1091 | Shortest Path in Binary Matrix | Medium | grid BFS + 8方向 | — |

## 詰まりポイント（解きながら追記）

- （まだ問題を解いていない）
