package main

import "fmt"

func main() {
	m := map[string]int{"a": 1, "b": 2}

	first := m["a"]
	second := m["b"]

	fmt.Println(first, second)

	if value, ok := m["a"]; ok {
		fmt.Println(value)
	}
}