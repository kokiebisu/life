# Church Aspect

## 聖書通読ステータスの確認（厳守）

bible-reading.csv や Notion の聖書通読ページを作成・更新するときは、**csv だけを信じず、必ず `aspects/church/devotions/` の最新ファイルを確認する。**

- どの書巻を読んでいるか → devotion ファイルのタイトル・本文に記録されている
- 完了しているかどうか → csv の `status` は更新が遅れることがある。devotion ファイルで実態を確認する

```bash
# 最近読んだ書巻を確認
grep -rh "^# " aspects/church/devotions/ | sort | tail -20
```
