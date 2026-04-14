package main

import (
	"errors"
	"fmt"
)

g, ctx := errgroup.WithContext(context.Background())

g.Go(func() error {
	return callML(ctx)
})

g.Go(func() error {
	return callES(ctx)
})

if err := g.Wait(); err != nil {
	return err
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