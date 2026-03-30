# project_pre-scheduler
5iveの案件管理システムを作りたい。

## 目的
1. 現在の実装のアサイン状況を入力し、全体像を把握。
2. 新しい案件を入れる余地を素早く見つけれるようにしたい。

## DBにはSQLiteを使用
### データ保存の仕組み
SQLiteはデータを書き込むとき、すぐにメインファイル（data.db）に書かないことがあります。  
代わりに「WALファイル（data.db-wal）」という一時的なメモ帳に先に書きます。  

あなたが追加したデータ  
        ↓  
  [data.db-wal]  ← まずここに書く（メモ帳）  
        ↓ しばらくしたら  
  [data.db]      ← 最終的にここに書く（本棚）  
WALからdata.dbへの転記を「チェックポイント」と呼びます。

### DB設計

#### テーブル一覧

| テーブル名 | 概要 |
|---|---|
| `users` | メンバー情報 |
| `projects` | 案件情報 |
| `project_assignees` | 案件と担当者の紐付け（多対多） |
| `project_supports` | 案件とサポートメンバーの紐付け（多対多） |
| `project_key_dates` | 案件のキー日程 |
| `custom_holidays` | カスタム休日 |

---

#### users（メンバー）

| カラム | 型 | 説明 |
|---|---|---|
| id | INTEGER PK | 自動採番 |
| name | TEXT | 氏名 |
| email | TEXT UNIQUE | メールアドレス |
| created_at | TEXT | 作成日時（UTC） |

---

#### projects（案件）

| カラム | 型 | 説明 |
|---|---|---|
| id | INTEGER PK | 自動採番 |
| name | TEXT | 案件名 |
| start_date | TEXT | 開始日（YYYY-MM-DD） |
| end_date | TEXT | 終了日（YYYY-MM-DD） |
| volume | INTEGER | 工数規模 |
| memo | TEXT | メモ |
| archived | INTEGER | アーカイブフラグ（0: 通常, 1: アーカイブ） |
| created_at | TEXT | 作成日時（UTC） |

---

#### project_assignees（担当者）

| カラム | 型 | 説明 |
|---|---|---|
| project_id | INTEGER FK | `projects.id` |
| user_id | INTEGER FK | `users.id` |

`projects` と `users` の多対多中間テーブル。案件のメイン担当者を管理する。

---

#### project_supports（サポートメンバー）

| カラム | 型 | 説明 |
|---|---|---|
| project_id | INTEGER FK | `projects.id` |
| user_id | INTEGER FK | `users.id` |

`projects` と `users` の多対多中間テーブル。担当ではなくサポートとして関わるメンバーを管理する。

---

#### project_key_dates（キー日程）

| カラム | 型 | 説明 |
|---|---|---|
| id | INTEGER PK | 自動採番 |
| project_id | INTEGER FK | `projects.id` |
| date | TEXT | 日付（YYYY-MM-DD） |
| label | TEXT | ラベル（例: 「リリース」など） |

---

#### custom_holidays（カスタム休日）

| カラム | 型 | 説明 |
|---|---|---|
| date | TEXT PK | 日付（YYYY-MM-DD） |

---

#### ER図（概略）

```
users
  ├── project_assignees ──┐
  └── project_supports  ──┤
                          └── projects
                                └── project_key_dates

custom_holidays（単独テーブル）
```

