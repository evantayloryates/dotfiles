// node --test src/mcps/kickoff-stage-db/test/
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cell, fileFormat, renderRows, uniqueNames } from '../lib/format.mjs'
import { checkSql, scan, shape, ToolError } from '../lib/sql.mjs'

const ok = (sql, expect) => assert.equal(checkSql(sql), expect ?? checkSql(sql))
const bad = (sql, re) => assert.throws(() => checkSql(sql), (e) => e instanceof ToolError && re.test(e.message), sql)

test('reads pass', () => {
  ok('SELECT 1', 'SELECT 1')
  ok('  select * from clients limit 5;  ', 'select * from clients limit 5')
  ok('WITH a AS (SELECT 1 x) SELECT x FROM a')
  ok('(SELECT 1) UNION (SELECT 2)')
  ok('SHOW TABLES')
  ok('EXPLAIN SELECT 1')
  ok('DESC clients')
  ok('TABLE payers')
  ok('VALUES ROW(1,2)')
})

test('writes and side effects are refused', () => {
  bad('UPDATE clients SET a=1', /UPDATE cannot run/)
  bad('delete from clients', /DELETE cannot run/)
  bad('INSERT INTO x VALUES (1)', /INSERT cannot run/)
  bad('SET SESSION transaction_read_only=OFF', /SET cannot run/)
  bad('CALL p()', /CALL cannot run/)
  bad('DO SLEEP(5)', /DO cannot run/)
  bad('LOCK TABLES clients READ', /LOCK cannot run/)
  bad('WITH a AS (SELECT 1) DELETE FROM clients', /DELETE is not allowed/)
  bad('WITH a AS (SELECT 1) UPDATE clients SET x=1', /UPDATE is not allowed/)
  bad('SELECT * FROM clients FOR UPDATE', /Locking reads/)
  bad('SELECT * FROM clients FOR SHARE', /Locking reads/)
  bad('SELECT * FROM clients LOCK IN SHARE MODE', /SHARE MODE/)
  bad("SELECT 1 INTO OUTFILE '/tmp/x'", /OUTFILE/)
  bad('SELECT SLEEP(10)', /SLEEP/)
  bad('SELECT sleep (10)', /SLEEP/)
  bad('SELECT BENCHMARK(1e9, MD5(1))', /BENCHMARK/)
  bad("SELECT GET_LOCK('x', 10)", /GET_LOCK/)
  bad("SELECT LOAD_FILE('/etc/passwd')", /LOAD_FILE/)
  bad('REPLACE INTO x VALUES (1)', /REPLACE cannot run/)
})

test('second statements are refused, quoted semicolons are not', () => {
  bad('SELECT 1; SELECT 2', /One statement/)
  bad('SELECT 1; DROP TABLE clients', /One statement/)
  ok("SELECT ';' AS s")
  ok('SELECT `a;b` FROM t')
  ok('SELECT 1;')
})

test('comments: removed, but only outside quotes', () => {
  assert.equal(checkSql('SELECT 1 -- hi\n'), 'SELECT 1')
  assert.equal(checkSql('SELECT 1 # hi'), 'SELECT 1')
  assert.equal(checkSql('SELECT /* x */ 1'), 'SELECT   1')
  ok("SELECT '# not a comment', '-- nor this', '/* nor */'")
  assert.equal(checkSql('SELECT 5--1'), 'SELECT 5--1') // arithmetic, not a comment
  bad('/* SELECT */ DELETE FROM x', /DELETE cannot run/)
  bad('SELECT 1 /*! ; DROP TABLE x */', /Executable comments/)
  bad('SELECT /*+ MAX_EXECUTION_TIME(999999) */ 1 FROM t; DELETE FROM t', /One statement/)
  assert.equal(checkSql('SELECT /*+ SET_VAR(max_execution_time=0) */ 1'), 'SELECT   1') // hints dropped
  bad('SELECT 1 -- ; \n; DELETE FROM x', /One statement/)
  bad('-- only a comment', /empty after removing comments/)
})

test('keywords inside strings do not trip the checks', () => {
  ok("SELECT * FROM sms WHERE body LIKE '%sleep(%'")
  ok("SELECT * FROM t WHERE note = 'please delete my account; update me'")
  ok("SELECT 'it''s' AS a, \"say \\\"hi\\\"\" AS b")
  ok('SELECT REPLACE(name, "a", "b") FROM t')
  ok('SELECT updated_at, deleted_at, inserted FROM t')
})

test('malformed input', () => {
  bad('', /required/)
  bad('   ', /required/)
  bad("SELECT 'unterminated", /Unterminated string/)
  bad('SELECT `x', /Unterminated identifier/)
  bad('SELECT /* open', /Unterminated \/\*/)
  bad('x'.repeat(100_001), /100,000/)
  assert.throws(() => checkSql(42), ToolError)
  assert.throws(() => checkSql(null), ToolError)
})

test('shape hides literals', () => {
  const s = shape("SELECT * FROM users WHERE email = 'a@b.com' AND id = 42")
  assert.ok(!s.includes('a@b.com') && !s.includes('42'), s)
  assert.match(s, /email = \? AND id = \?/)
})

test('scan masks strings but keeps identifiers', () => {
  const { masked } = scan("SELECT `sms`.id FROM `sms` WHERE x = 'delete'")
  assert.ok(masked.includes('`sms`') && !masked.includes('delete'))
})

test('cells and rendering', () => {
  assert.equal(cell(null), null)
  assert.equal(cell(Buffer.from([1, 2])), '0x0102')
  assert.equal(cell(Buffer.alloc(100)), '<100 bytes>')
  assert.equal(cell({ a: 1 }), '{"a":1}')
  assert.equal(cell('abcdef', 3), 'abc…<+3 chars>')
  assert.deepEqual(uniqueNames([{ name: 'id' }, { name: 'id' }, { name: 'x' }]), ['id', 'id_2', 'x'])
  const r = renderRows(['a', 'b'], [[1, 'x'], [2, 'y']], { maxCell: 10, maxChars: 1000 })
  assert.equal(r.text, 'columns: ["a","b"]\n[1,"x"]\n[2,"y"]')
  const capped = renderRows(['a'], Array.from({ length: 100 }, () => ['x'.repeat(50)]), { maxCell: 100, maxChars: 300 })
  assert.ok(capped.shown < 100 && capped.shown > 0)
})

test('file formats', () => {
  assert.equal(fileFormat('/a/b.txt'), null)
  const csv = fileFormat('/a/b.CSV')
  assert.equal(csv.header(['a', 'b,c']), 'a,"b,c"\n')
  assert.equal(csv.row(['a', 'b'], ['x"y', null]), '"x""y",\n')
  const tsv = fileFormat('/a/b.tsv')
  assert.equal(tsv.row(['a'], ['a\tb\nc']), 'a\\tb\\nc\n')
  const jl = fileFormat('/a/b.jsonl')
  assert.equal(jl.row(['id', 'id_2'], [1, 2]), '{"id":1,"id_2":2}\n')
})
