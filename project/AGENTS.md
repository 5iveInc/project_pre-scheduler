<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Critical Rules

## データベース操作
- データベースへの書き込み（INSERT / UPDATE / DELETE）は、必ず事前にユーザーの確認を取ること
- seed データ挿入は絶対に実行してはいけません。既存のデータを上書き、削除する行為は禁止です。
- 確認なしにデータを変更してはならない
- 外部DB（Turso）を破壊しないことを前提に実装してください。

## 構成変更
- システム構成・スキーマ・設定変更を行う場合は、必ず事前にユーザーの承認を得ること
- 影響範囲と変更内容を説明した上で確認を取ること

## 確認方法
- 変更前に以下を提示すること：
  - 実行内容
  - 影響範囲
  - ロールバック方法（可能な場合）