# Sliding Window — Go パターン

## いつ使うか

連続した部分配列・部分文字列に対する制約（最大長・最小長・特定条件を満たす）を求める問題。

- 「longest / shortest / minimum / maximum substring (subarray) ...」
- 「at most K distinct ...」「exactly K ...」
- 全探索 O(n²) を O(n) に落とせるサイン

## 型（Go）

### 可変長ウィンドウ（条件を満たす最大・最小）

```go
func longestValid(s string) int {
    count := make(map[byte]int)
    best, l := 0, 0
    for r := 0; r < len(s); r++ {
        count[s[r]]++
        for /* 制約を破る条件 */ {
            count[s[l]]--
            if count[s[l]] == 0 {
                delete(count, s[l])
            }
            l++
        }
        if r-l+1 > best {
            best = r - l + 1
        }
    }
    return best
}
```

### 固定長ウィンドウ

```go
func maxSumK(nums []int, k int) int {
    sum := 0
    for i := 0; i < k; i++ { sum += nums[i] }
    best := sum
    for i := k; i < len(nums); i++ {
        sum += nums[i] - nums[i-k]
        if sum > best { best = sum }
    }
    return best
}
```

## Go 特有の落とし穴

- **string vs []byte vs []rune**: ASCII のみなら `s[i]` (byte)。Unicode が混ざるなら `[]rune(s)` してから index アクセス
- **map[byte]int の delete**: count が 0 になったら `delete()` で消す。`m[k] == 0` と「キーが存在しない」を区別したい場面で重要
- **固定アルファベット**: ASCII 小文字のみなら `[26]int` を使う（map より高速）
- **長さ計算**: `r - l + 1`（両端含む）。off-by-one を毎回確認

## 典型問題

| # | タイトル | 難易度 | パターン | ノート |
|---|---|---|---|---|
| 3 | Longest Substring Without Repeating Characters | Medium | 可変長 | [2026-04-27](../notes/2026-04-27-1.md) |
| 76 | Minimum Window Substring | Hard | 可変長 + count match | — |
| 159 | Longest Substring with At Most Two Distinct Characters | Medium | 可変長 + 個数制限 | — |
| 209 | Minimum Size Subarray Sum | Medium | 可変長 + 合計制約 | — |
| 424 | Longest Repeating Character Replacement | Medium | 可変長 + 最頻文字 | — |
| 438 | Find All Anagrams in a String | Medium | 固定長 + count match | — |
| 567 | Permutation in String | Medium | 固定長 + count match | — |
| 643 | Maximum Average Subarray I | Easy | 固定長 | — |

ノートを書いたら「ノート」列にリンクを足す。

## 詰まりポイント（解きながら追記）

- **`r++` の位置**: `longest = max(...)` の **前**に `r++` するとウィンドウ長 `r-l+1` がズレる。inner for 抜けた直後に best 更新→そのあと r++（または `for r := 0; r < n; r++` スタイルで自動化）
- **`while` がない**: Go の `for cond { ... }` で代替
- **連鎖代入 `l = r = 0` 不可**: `l, r := 0, 0`
