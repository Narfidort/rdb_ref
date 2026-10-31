# リレーショナルデータベースと SQL

SQLite3 による演習資料。第0章で考え方と用語（主キー・外部キー・ER 図・中間テーブル・CRUD・トランザクション）を押さえ、第1〜4章で SQL を実際に打って学ぶ。

- 公開ページ: https://narfidort.github.io/rdb_ref/
- 演習用データベース: [data/library.sql](data/library.sql)

## ビルド

`index.html` は `src/index.src.html` から生成する。本文中の SQL は sqlite3 で実際に実行され、出力が埋め込まれる（出力例を手で書かない）。

```
python3 tools/build.py
```

編集は `src/index.src.html` に対して行うこと。`index.html` を直接編集すると、次のビルドで上書きされる。
