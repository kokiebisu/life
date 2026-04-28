package main

import (
	"fmt"
	"slices"
)

func groupAnagrams(strs []string) [][]string {
	m := map[string][]string{}
	//  "ate": ["eat", "tea"],
	//	"ant": ["tan", "nat"],
	//	"abt": ["bat"]
	// もし空の配列なら早期に返す
	for _, w := range strs {
		b := []byte(w)
		slices.Sort(b)
		sorted := string(b)
		m[sorted] = append(m[sorted], w)
	}
	result := make([][]string, 0, len(m))
	for _, value := range m {
		result = append(result, value)
	}
	return result
}

func main() {
	fmt.Println(groupAnagrams([]string{"eat", "tea", "tan", "ate", "nat", "bat"}))
}
