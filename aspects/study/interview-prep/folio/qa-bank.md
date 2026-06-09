# FOLIO 面接対策 — Q&Aバンク

## アルゴリズム / Selection Sort

❓ Selection Sort の考え方を説明してください
→ 未ソート部分の最小値を探して先頭と交換する、を繰り返す。計算量は O(n²)

❓ 内側ループの開始インデックスはなぜ `i+1` にするのか
→ `minIndex = i` で仮の最小値を先頭に設定済みなので、自分自身との比較は不要

## サービス実装 / TODO CRUD

❓ 自動採番IDを正しく実装するには
→ `id: nextId++`（後置インクリメント）。先に`++`すると最初のIDが2になる

❓ updateTodo の `done` パラメータを使い忘れるとどうなるか
→ 常に `done: true` になり、false に戻せなくなる

❓ deleteTodo で「削除できた」を返す条件は
→ `filteredTodos.length !== todos.length`（長さが変わった = 削除された）

## サービス実装 / ページネーション

❓ ページネーションの開始インデックスの計算式は
→ `(page - 1) * limit`（0ベース）

❓ 末尾ページで件数が足りない場合の対処は
→ 不要。`slice()` は範囲外を指定しても自動で止まる。`Math.min` は不要

## サービス実装 / ツリー再帰

❓ ツリーをDFS順にフラット化する方法は
→ 自分をpushしてから子を再帰ループする。クロージャで result 配列を共有するパターンが典型

❓ `flatMap` を使ったシンプルな書き方は
→ `return [category, ...(category.children ?? []).flatMap(flattenCategories)]`
