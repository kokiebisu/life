package main

type Storer interface {
	Save(key string, value string) error
}

type Cacher interface {
	Get(key string) (string, bool)
	Set(key string, value string)
}

// ------

type MockStorer struct {}

func (m *MockStorer) Save(key string, value string) error {
	return nil
}

// ------
type MemoryCache struct {
	h map[string]string
}

type MockMemoryCache struct {
	h map[string]string
}

func (mc *MemoryCache) Get(key string) (string, bool) {
	if value, ok := mc.h[key]; ok {
		return value, true
	}
	return "", false
}

func (mc *MemoryCache) Set(key string, value string) {
	mc.h[key] = value
}

func (m *MockMemoryCache) Get(key string) (string, bool) {
	return "", false
}

func (m *MockMemoryCache) Set(key string, value string) {
	m.h[key] = value
}

// -------

type DataService struct {
	c Cacher
	s Storer
}

func (ds *DataService) Store(key string, value string) error {
	ds.c.Set(key, value)
	return ds.s.Save(key, value)
}

func main() {
	ms := &MockStorer{}
	mc := &MemoryCacher{h: map[string]string{}}

	ds := DataService{c: mc, s: ms}
	ds.Store()
}	