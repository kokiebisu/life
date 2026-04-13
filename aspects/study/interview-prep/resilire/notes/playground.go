package main

import (
	"errors"
	"fmt"
)

type NotFoundError struct {
	ID int
	Resource string
}

func (nfe *NotFoundError) Error() string {
	return fmt.Sprintf("not found: %s id=%d", nfe.Resource, nfe.ID)
}

func findUser(id int) error {
	if id == 0 {
		return &NotFoundError{ID: id, Resource: "user"}
	}
	return nil
}

func main() {
	var notFoundError *NotFoundError
	err := findUser(0)
	if errors.As(err, &notFoundError) {
		fmt.Println(notFoundError.ID)
		fmt.Println(notFoundError.Resource)
		fmt.Println(err.Error())
	}
}