package main

import "fmt"

func lengthOfLongestSubstring(s string) int {
	// ここに実装
	// left, right pointerを用意する
	// right pointer will iterate through the string
	// we will keep track of the occurence of the characters
	// the left, right pointer will indicate the window
	count, l, r, longest := make(map[byte]int), 0, 0, 0
	for r < len(s) {
		// add to count map
		count[c]++
		// check if the hashmap has any characters with occurence higher than 1
		for count[s[r]] > 1 {
			count[s[l]]--
			l++
		}
		// update to latest
		// in typescript there is something like Math.max(A, B). wonder if there is something similar in Go
		longest = max(longest, r - l + 1)
		r++
	}

	return longest
}

func main() {
	fmt.Println(lengthOfLongestSubstring("abcabcbb")) // 3
    fmt.Println(lengthOfLongestSubstring("bbbbb"))    // 1
    fmt.Println(lengthOfLongestSubstring("pwwkew"))   // 3
    fmt.Println(lengthOfLongestSubstring(""))         // 0
}