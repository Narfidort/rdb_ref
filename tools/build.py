#!/usr/bin/env python3
"""src/index.src.html から index.html を生成する。

<pre class="term" data-run="セッション名"> のブロックについて、`sqlite> ` で始まる文を
実際に sqlite3 で実行し、その出力をブロックに書き込む（出力例を手書きしない）。

  data-run="name"       実行セッション名。同じ名前のブロックは同じ DB を引き継ぐ
  data-reset="library"  このブロックの前に DB を library.sql の初期状態に戻す
  data-reset="empty"    このブロックの前に DB を空にする
  data-fk="off"         PRAGMA foreign_keys=ON を付けずに実行する
  data-max="N"          各文の出力を N 行までに省略する
  data-tx="1"           ブロック内の文を1つの接続で続けて実行する（BEGIN … COMMIT をまたぐ例に使う）

ブロック内の書式:
  sqlite> 文 / ...> 続き   実行される
  % コマンド                シェルのコマンド（実行しない・そのまま表示）
  #! 注記                   そのまま表示
  = 行                      手書きの出力としてそのまま表示
  ^^ 行                     （生成）列名の行
  それ以外の行              捨てる（古い出力）

使い方:  python3 tools/build.py
"""
import html
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "index.src.html"
OUT = ROOT / "index.html"
LIB = ROOT / "data" / "library.sql"

PRE_RE = re.compile(r'<pre class="term"([^>]*)>(.*?)</pre>', re.S)
ATTR_RE = re.compile(r'data-([a-z]+)="([^"]*)"')


def sqlite_bin():
    exe = shutil.which("sqlite3")
    if not exe:
        sys.exit("sqlite3 が見つかりません")
    return exe


class Sessions:
    def __init__(self, tmp: Path, lib_sql: str):
        self.tmp = tmp
        self.lib_sql = lib_sql
        self.paths = {}

    def reset(self, name, kind):
        path = self.tmp / f"{name}.db"
        path.unlink(missing_ok=True)
        if kind == "library":
            subprocess.run([sqlite_bin(), str(path)], input=self.lib_sql, text=True, check=True)
        self.paths[name] = path
        return path

    def get(self, name):
        return self.paths.get(name) or self.reset(name, "empty")


def _prefix(fk: bool) -> str:
    return ".headers on\n.nullvalue NULL\n" + ("PRAGMA foreign_keys=ON;\n" if fk else "")


def _lines(text: str):
    return text.rstrip("\n").split("\n") if text.strip() else []


def _errs(text: str):
    return [re.sub(r" near line \d+", "", l) for l in _lines(text)]


def run_stmt(db: Path, stmt: str, fk: bool):
    """1文を新しい接続で実行する。"""
    p = subprocess.run([sqlite_bin(), str(db)], input=_prefix(fk) + stmt + "\n", text=True, capture_output=True)
    return _lines(p.stdout), _errs(p.stderr)


def run_block_one_connection(db: Path, stmts, fk: bool):
    """ブロック内の文を1つの接続で続けて実行したときの、各文の出力を求める（BEGIN … COMMIT 用）。

    k 番目の文の出力は、ブロック開始時点の DB の複製に対し、1〜k-1 番目を出力なしで実行してから
    k 番目を実行して得る。エラー出力は累積分から直前までの分を差し引く。最後に全文を DB 本体に適用する。
    """
    snap = db.with_suffix(".snap")
    work = db.with_suffix(".work")
    shutil.copy(db, snap)
    results, prev_err = [], 0
    for k, stmt in enumerate(stmts):
        shutil.copy(snap, work)
        silent = "".join(s_ + "\n" for s_ in stmts[:k])
        inp = _prefix(fk) + ".output /dev/null\n" + silent + ".output\n" + stmt + "\n"
        p = subprocess.run([sqlite_bin(), str(work)], input=inp, text=True, capture_output=True)
        errs = _errs(p.stderr)
        results.append((_lines(p.stdout), errs[prev_err:]))
        prev_err = len(errs)
    shutil.copy(snap, db)
    subprocess.run([sqlite_bin(), str(db)], input=_prefix(fk) + ".output /dev/null\n" + "\n".join(stmts) + "\n",
                   text=True, capture_output=True)
    for f in (snap, work):
        f.unlink(missing_ok=True)
    return results


def process_block(attrs: str, body: str, sessions: Sessions):
    a = dict(ATTR_RE.findall(attrs))
    if "run" not in a:
        return None
    name = a["run"]
    if "reset" in a:
        sessions.reset(name, a["reset"])
    db = sessions.get(name)
    fk = a.get("fk") != "off"
    limit = int(a["max"]) if "max" in a else None

    lines = html.unescape(body).strip("\n").split("\n")
    # 文単位にまとめる
    items = []  # ("stmt", [lines]) | ("raw", line)
    for line in lines:
        if line.startswith("sqlite> "):
            items.append(["stmt", [line]])
        elif re.match(r"^\s*\.\.\.> ", line) and items and items[-1][0] == "stmt":
            items[-1][1].append(line)
        elif line.startswith("% ") or line.startswith("#!"):
            items.append(["raw", line])
        elif line.startswith("= "):
            items.append(["raw", line[2:]])
        # それ以外（古い出力）は捨てる

    to_sql = lambda val: "\n".join(re.sub(r"^(sqlite> |\s*\.\.\.> )", "", l) for l in val)
    precomputed = None
    if "tx" in a:
        precomputed = iter(run_block_one_connection(db, [to_sql(v) for k, v in items if k == "stmt"], fk))

    out_lines = []
    for kind, val in items:
        if kind == "raw":
            out_lines.append(val)
            continue
        out_lines.extend(val)
        sql = to_sql(val)
        out, err = next(precomputed) if precomputed else run_stmt(db, sql, fk)
        if out and not sql.lstrip().startswith("."):
            out[0] = "^^ " + out[0]  # 列名の行（.headers on）
        if limit is not None and len(out) > limit + 1:
            total = len(out) - 1  # ヘッダを除く
            out = out[: limit + 1] + [f"#! …（以下省略：全 {total} 行）"]
        out_lines.extend(out)
        out_lines.extend("!! " + e for e in err)

    text = "\n".join(html.escape(l, quote=False) for l in out_lines)
    clean_attrs = re.sub(r'\s*data-(run|reset|fk|max|tx)="[^"]*"', "", attrs)
    return f'<pre class="term"{clean_attrs}>\n{text}\n</pre>'


def main():
    src = SRC.read_text(encoding="utf-8")
    lib_sql = LIB.read_text(encoding="utf-8")
    with tempfile.TemporaryDirectory() as t:
        sessions = Sessions(Path(t), lib_sql)

        def repl(m):
            r = process_block(m.group(1), m.group(2), sessions)
            return r if r is not None else m.group(0)

        out = PRE_RE.sub(repl, src)

    out = out.replace("<!--LIBRARY_SQL_PRE-->", html.escape(lib_sql.strip("\n"), quote=False))
    out = out.replace("<!--LIBRARY_SQL_RAW-->", lib_sql)
    OUT.write_text(out, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
