---
name: study
description: 学習セッションの開始・ノート記録・Notion登録。引数: $ARGUMENTS
---

# study — 学習セッション管理

## 引数パース

`$ARGUMENTS` を確認する:
- `<カテゴリ>` のみ → そのカテゴリでセッション開始
- `<カテゴリ> --start HH:MM` → カテゴリ + 開始時刻指定
- 引数なし → 対話でカテゴリを確認する

カテゴリ選択肢: **`aspects/study/` のディレクトリを `ls` で確認してから提示する**（ハードコードしない）

---

## Step 1: 情報収集

未指定の情報をユーザーに確認する（一度にまとめて確認してよい）:

1. **カテゴリ**（必須）: `ls aspects/study/` を実行して現在のディレクトリ一覧を取得し、**AskUserQuestion ツールの選択肢（options）として提示する**（テキスト箇条書きで聞かない）。サブカテゴリがある場合も同様に `ls` で確認して選択肢として提示する
2. **開始時刻**（必須）: `TZ=Asia/Tokyo date` で現在時刻を確認し、未指定なら AskUserQuestion で確認（「今から（HH:MM〜）」をデフォルト選択肢に含める）
3. **終了時刻**（任意）: 未定なら「後で更新」として進める
4. **本**（任意）: 過去ノート（`grep -r "^book:" aspects/study/{category}/notes/`）から使用済みの本を一覧取得し、**AskUserQuestion の選択肢として提示する**（「新しい本を指定する」も選択肢に含める）。テキストで聞かない
5. **Chapter**（任意）: 本が決まったら、過去ノートから最後に勉強した Chapter 番号を確認し、**次の Chapter を推奨（Recommended）として AskUserQuestion で提示する**。選択肢例: 「Chapter 5 (Recommended)」「Chapter 6」「指定する」。数字のみ保存（例: `5`、`12`。「Chapter 5」のようなテキストは不可）

---

## Step 2: 重複チェック

```bash
TZ=Asia/Tokyo date +%Y-%m-%d  # 今日の日付を確認
bun run scripts/validate-entry.ts --date YYYY-MM-DD --title "勉強" --start HH:MM --end HH:MM --db study
```

- **終了コード 1**（類似エントリあり）→ 既存エントリの内容を `notion-fetch` で確認してユーザーに提示し、以下を確認する:
  - **上書き**: 既存エントリを削除して新規作成
  - **追記**: 既存エントリのノートに追記する形で継続（Step 3 をスキップして既存 notion_id を使う）
- **終了コード 0** → 次のステップへ

---

## Step 3: Notion 登録（2ステップ）

### Step 3a: `notion-add.ts` でページ作成 + テンプレート自動適用

カテゴリ・本・Chapter を渡すと callout メタ情報も自動で書き込まれる:

```bash
bun run scripts/notion-add.ts --title "勉強" --date YYYY-MM-DD --start HH:MM --end HH:MM --db study \
  --category "<カテゴリ名>" --book "<本のタイトル>" --chapter "<数字>"
```

出力から page ID を取得する（Notion API で当日の study DB を query して最新エントリの ID を取得）:

```bash
bun -e "
const { getApiKey, loadEnv } = await import('./scripts/lib/notion.ts');
const apiKey = getApiKey();
const env = loadEnv();
const dbId = env['NOTION_STUDY_DB'];
const res = await fetch('https://api.notion.com/v1/databases/' + dbId + '/query', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ' + apiKey, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
  body: JSON.stringify({ page_size: 1, sorts: [{ timestamp: 'created_time', direction: 'descending' }] }),
});
const data = await res.json();
console.log(data.results[0]?.id);
"
```

### Step 3b: プロパティ検証（厳守）

`notion-add.ts` 実行後、**必ず `notion-fetch` でページを取得し、以下のプロパティが設定されているか確認する**:

- `カテゴリ` — カテゴリ名が入っているか
- `本` — 本のタイトルが入っているか（指定時）
- `Chapter` — Chapter 番号が入っているか（指定時）

**いずれかが未設定の場合**、`notion-update-page` で補完する:

```
カテゴリ: <カテゴリ名>
本: <本のタイトル>
Chapter: <数字のみ e.g. "5">
icon: 📖
cover: https://www.notion.so/images/page-cover/gradients_8.png
```

**注意:** プロパティ名にプレフィックス（`select:` `rich_text:` 等）は不要。プロパティ名をそのまま使うこと。

この検証ステップをスキップしない。`notion-add.ts` が自動設定するはずでも、確認なしに信用しない。

---

## Step 4: ローカル MD を作成する

### ファイルパスの決定

- サブカテゴリなし: `aspects/study/{category}/notes/YYYY-MM-DD-1.md`
- サブカテゴリあり: `aspects/study/{category}/{subcategory}/notes/YYYY-MM-DD-1.md`
- 同日に複数セッションある場合は連番: `YYYY-MM-DD-2.md`、`YYYY-MM-DD-3.md` …

本・Chapterはフロントマターに記録するのみで、ファイル名には含めない。

### MD 内容

```markdown
---
notion_id: <page-id>
date: YYYY-MM-DD
start: HH:MM
end: HH:MM
category: <カテゴリ>
book: <本のタイトル>
chapter: <Chapter>
---

# 勉強 - YYYY-MM-DD

## 🎯 今日の目標・疑問

<ユーザーから聞いた目標・疑問>

## 📝 ノート

（セッション中に追記）

## 🔑 キーワード

（重要用語・概念）

## 💡 まとめ

（セッション終了時に記入）

## ❓ 自分への質問（コーネル式キュー）

（セッション終了時に自動生成）

## ❓ 残った疑問・次回へ

（理解できなかった点、次のセッションで深めたいこと）
```

### キャッシュクリア

```bash
bun run scripts/cache-status.ts --clear
```

---

## Step 5: セッション開始

ユーザーに伝える:

```
セッションを開始しました 📖
📅 YYYY-MM-DD  HH:MM〜
🏷 {カテゴリ}  📗 {本}（あれば）

今日の目標・疑問は何ですか？
```

ユーザーの回答を受け取り、MD と Notion の「🎯 今日の目標・疑問」セクションに書き込む。

---

## Step 6: 対話セッション（ノート取り）

- ユーザーの質問・学習内容に答えながら、**会話の要点を Claude が整理して MD の「📝 ノート」に随時書き込む**
- 重要な用語・概念が出たら「🔑 キーワード」にも追記する
- Notion への書き込み: ノートが一定量溜まったとき、またはユーザーが「メモして」「Notionに書いて」と言ったとき
- Notion 書き込みには `notion-update-page`（`replace_content`）を使い、MD の内容全体を反映する（差分ではなく全文置き換え）

**Notion フォーマットルール（厳守）:**

Notion に書き込む際は、MD をそのまま流し込まず、**Notion のリッチブロックを活用して見やすく整理する。**

| ブロック | 用途 | 例 |
|---------|------|-----|
| `<callout>` | 目標・重要概念・注意点・定義 | 🎯 目標、💡 重要概念、⚠️ 注意点 |
| `<details>`（toggle） | 詳細情報・一覧表の折りたたみ | 制約一覧、命名規則 |
| `<table>` | 比較・一覧・分類 | 正規形の比較、制約の説明 |
| `<columns>` | 対比（2つの視点） | メリット vs デメリット |
| インラインコード | キーワード | `主キー` `CASCADE` `NOT NULL` |

- **箇条書きだけのフラットな構造は避ける**
- 情報の性質に応じて適切なブロックを選ぶ
- Notion Enhanced Markdown 仕様（`notion://docs/enhanced-markdown-spec`）に従う

**同期ルール（厳守）:**
- MD と Notion の内容は常に一致させる
- Notion に書き込んだ後、MD も同じ内容に更新する（逆も同様）
- 片方だけの更新で終わらせない

---

## Step 7: セッション終了

「終わり」「完了」「終了」「おわり」「セッション終了」のいずれかが来たら:

1. **終了確認をする**:
   ```
   セッションを終了してよいですか？まとめと残った疑問を一緒に整理してから閉じます。
   ```

2. ユーザーが確認したら、まとめと残った疑問を一緒に作成する:
   - 「今日学んだことを3点でまとめると？」などと問いかけて内容を引き出す
   - Claude がまとめ文を作成してユーザーに確認してもらう

3. **コーネル式キューを生成する**:
   - ノート内容（📝 ノート + 🔑 キーワード + 💡 まとめ）を分析する
   - 3〜5問の質問を生成する。質問タイプはノート内容に応じて最適なバランスで選ぶ:
     - **概念確認型:** 「〇〇とは？」「〇〇と〇〇の違いは？」
     - **応用型:** 「このケースでどう設計する？」「なぜこの方法を選ぶ？」
     - **判断力型:** 「〇〇のメリット・デメリットは？」「どういう条件で〇〇を使う？」
   - ユーザーの就活目標（テックリード / シニアフルスタック）を踏まえ、面接で問われそうな角度を優先する
   - ユーザーに提示して確認する（追加・削除・修正OK）
   - 確定したキューを MD の `## ❓ 自分への質問（コーネル式キュー）` セクションに書き込む
   - 例:
     ```
     セッションの内容から復習用の質問を作りました:

     1. B-Treeインデックスの計算量は？なぜ「オール4の秀才型」と言えるか？
     2. インデックスが適用されない5つのパターンを挙げよ
     3. カーディナリティが高くてもインデックスが効かないケースとは？
     4. パーティションの3種類（レンジ・リスト・ハッシュ）はそれぞれどういうデータに適しているか？

     追加・修正したい質問はありますか？（なければそのまま保存します）
     ```

4. **MD を最終内容で更新する** （終了時刻 + まとめ + 残った疑問）

5. **Notion に最終内容を同期する** (`notion-update-page` の `replace_content` で MD 全体を反映)
   - 終了時刻も更新: `date:日付:end: YYYY-MM-DDThh:mm:00+09:00`

6. **キャッシュクリア**:
   ```bash
   bun run scripts/cache-status.ts --clear
   ```

7. **完了報告**:
   ```
   セッション終了 ✅

   📅 YYYY-MM-DD  HH:MM〜HH:MM
   🏷 {カテゴリ}  📗 {本}（あれば）

   Notion ✅ / ローカル MD ✅
   📄 aspects/study/{category}/notes/{filename}.md
   ```
