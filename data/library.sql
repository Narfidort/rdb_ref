-- library.sql : 演習用データベース（図書室の貸出管理）
-- 使い方:  sqlite3 library.db < library.sql
-- 何度実行しても同じ初期状態に戻る。

PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS loans;
DROP TABLE IF EXISTS book_authors;
DROP TABLE IF EXISTS authors;
DROP TABLE IF EXISTS books;
DROP TABLE IF EXISTS students;

CREATE TABLE students (
  sid    TEXT    NOT NULL PRIMARY KEY,
  name   TEXT    NOT NULL,
  class  TEXT    NOT NULL,
  number INTEGER NOT NULL,
  UNIQUE (class, number)
);

CREATE TABLE books (
  bid   TEXT    NOT NULL PRIMARY KEY,
  title TEXT    NOT NULL,
  year  INTEGER,
  pages INTEGER
);

CREATE TABLE authors (
  aid  TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE book_authors (
  bid TEXT NOT NULL REFERENCES books (bid),
  aid TEXT NOT NULL REFERENCES authors (aid),
  PRIMARY KEY (bid, aid)
);

CREATE TABLE loans (
  lid         INTEGER PRIMARY KEY,
  sid         TEXT NOT NULL REFERENCES students (sid),
  bid         TEXT NOT NULL REFERENCES books (bid),
  loan_date   TEXT NOT NULL,
  return_date TEXT,
  CHECK (return_date IS NULL OR return_date >= loan_date)
);

INSERT INTO students VALUES
  ('S01', '佐藤 花子', '1-A', 12),
  ('S02', '鈴木 一郎', '1-A', 15),
  ('S03', '佐藤 花子', '1-B', 12),
  ('S04', '高橋 健',   '1-B', 20),
  ('S05', '田中 美咲', '2-A', 15),
  ('S06', '伊藤 翔',   '2-A', 3);

INSERT INTO books VALUES
  ('B01', '坊っちゃん',         1906, 200),
  ('B02', '吾輩は猫である',     1905, 480),
  ('B03', 'こころ',             1914, 320),
  ('B04', '銀河鉄道の夜',       1934, 180),
  ('B05', '羅生門',             1915, NULL),
  ('B06', 'データベースの基礎', 2020, 300);

INSERT INTO authors VALUES
  ('A01', '夏目漱石'),
  ('A02', '宮沢賢治'),
  ('A03', '芥川龍之介'),
  ('A04', '山田 太郎'),
  ('A05', '川口 恵'),
  ('A06', '森鷗外');

INSERT INTO book_authors VALUES
  ('B01', 'A01'),
  ('B02', 'A01'),
  ('B03', 'A01'),
  ('B04', 'A02'),
  ('B05', 'A03'),
  ('B06', 'A04'),
  ('B06', 'A05');

INSERT INTO loans VALUES
  (1, 'S01', 'B01', '2026-04-10', '2026-04-17'),
  (2, 'S02', 'B01', '2026-04-20', '2026-04-27'),
  (3, 'S03', 'B03', '2026-04-18', NULL),
  (4, 'S01', 'B02', '2026-04-21', '2026-04-28'),
  (5, 'S04', 'B04', '2026-05-01', NULL),
  (6, 'S05', 'B01', '2026-05-02', '2026-05-09'),
  (7, 'S05', 'B06', '2026-05-10', '2026-05-12'),
  (8, 'S01', 'B01', '2026-05-15', NULL);
