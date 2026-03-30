# 模擬面接：システムデザイン（kickflow 一次技術面接対策）

日付: 2026-03-30

---

## お題

**承認ワークフローエンジンを設計してください。**

### 要件（確認済み）

- 承認方式: 直列（順番に全員）・並列（全員承認で通過）の2パターン
- 承認ルートは申請タイプごとに事前設定。申請内容の値（例：金額10万円超）で動的分岐あり
- ステータス: 承認・却下・差し戻し
- 通知: メール + アプリ内通知
- Read-heavy（申請一覧・ステータス確認が頻繁）
- 数百万件のスケーラビリティが必要
- エスカレーション（タイムアウト）はスコープ外
- コメント機能はスコープ外

---

## テーブル設計

```
form_template
  id
  title
  type: 並列 | 直列

approval_request_steps_template
  id
  form_template_id
  step_number
  approver_condition: JSON  # 例: { field: "amount", operator: ">=", value: 100000 }

application
  id
  form_template_id
  applicant_id

approval_request_steps
  id
  application_id
  step_number
  status
  required_approvals_count

approver
  id
  approval_request_step_id
  user_id
  status  # approved | rejected
```

### 設計の意図・ポイント

- `form_template` + `approval_request_steps_template` = ひな型（テンプレート）
- `application` + `approval_request_steps` + `approver` = 実インスタンス
- `approval_request_steps.status` は冗長だが、Read-heavyな要件のためパフォーマンス最適化として保持
- `approver` レコードの存在 = 承認済み、ではなく `status` カラムで承認/却下を管理（差し戻しも考慮）

---

## ロジック設計

### ステップ完了の判定（並列）

```ruby
# approver.after_save
def evaluate_approval_request_steps(step)
  approved_count = step.approvers.where(status: 'approved').count
  if approved_count >= step.required_approvals_count
    step.update(status: 'completed')
  end
end
```

### 次ステップへの遷移（直列）

```ruby
# approval_request_steps.after_update
def on_step_completed(step)
  next_step = find_next_step(step)
  # 次ステップの承認者に通知
  # next_stepをactivateする
end
```

### approver_conditionの評価（動的分岐）

JSON形式でルールを定義し、申請作成時にRubyで評価：

```json
{ "field": "amount", "operator": ">=", "value": 100000 }
```

より複雑な場合は `approval_conditions` テーブルに正規化する方法もある。

---

## 聞けると良かった質問

- 申請フォームの内容はフリーフォームか、テンプレート定義があるか
- 承認ルートはいつ・どのように決まるか
- タイムアウト時のエスカレーション要件はあるか
- Read/Write比率はどちらが多いか

---

## フィードバック

### 良かった点

- テンプレートとインスタンスの分離に自分で気づいた
- Read-heavyの要件を思い出してstatusの冗長化を正当化できた
- イベント駆動 + ActiveRecord after_save hooksという実装レベルまで落とし込めた

### 改善点

- `required_approvals_count` の追加に少し時間がかかった
- 直列・並列のロジック分岐（`form_template.type`をどこで参照するか）が少し曖昧なまま
- `approver_condition` の評価ロジックは後回しになった（スコープ宣言を早めにする）

---

## 未完了トピック（次回続き）

- [ ] 通知設計（メール・アプリ内通知の基盤）
- [ ] APIレイヤー設計
- [ ] スケーラビリティ（数百万件対応）
- [ ] `approver_condition` の評価アーキテクチャ詳細
