// Syntax-only detectors. Never evaluate clipboard code or resolve YAML aliases.
// Read UTF-8 on stdin and return a small JSON result for the Python coordinator.
'use strict';

const fs = require('node:fs');

function nodes(root) {
  const result = [];
  const pending = [root];
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== 'object') continue;
    if (typeof value.type === 'string') result.push(value);
    for (const [key, child] of Object.entries(value)) {
      if (!['loc', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)) {
        if (Array.isArray(child)) pending.push(...child);
        else if (child && typeof child === 'object') pending.push(child);
      }
    }
  }
  return result;
}

function sourceType(text) {
  const { parse } = require('@babel/parser');
  for (const plugins of [['jsx', 'typescript'], ['typescript']]) {
    try {
      const ast = parse(text, { plugins, sourceType: 'unambiguous', attachComment: false });
      const all = nodes(ast);
      // An unclosed intrinsic JSX tag can parse as a TS angle assertion. Keep
      // primitive/uppercase type assertions, but do not guess for <div>text.
      if (all.some(node => node.type === 'TSTypeAssertion' && node.typeAnnotation.type === 'TSTypeReference' &&
          /^[a-z]/.test(node.typeAnnotation.typeName.name))) continue;
      const ts = all.some(node => node.type.startsWith('TS') ||
        node.importKind === 'type' || node.exportKind === 'type' || node.accessibility);
      const jsx = all.some(node => node.type === 'JSXElement' || node.type === 'JSXFragment');
      if (jsx) {
        // Bare HTML/XML also parses as JSX. Only code surrounding markup or a
        // JSX-specific construct makes it a JSX file; preserve ordinary markup.
        const expressions = ast.program.body;
        const bare = expressions.length === 1 && expressions[0].type === 'ExpressionStatement' &&
          ['JSXElement', 'JSXFragment'].includes(expressions[0].expression.type);
        const specific = all.some(node => ['JSXFragment', 'JSXExpressionContainer', 'JSXSpreadAttribute'].includes(node.type) ||
          (node.type === 'JSXOpeningElement' && (node.name.type === 'JSXMemberExpression' || /^[A-Z]/.test(node.name.name))) ||
          (node.type === 'JSXAttribute' && /^(?:className|htmlFor|on[A-Z])/.test(node.name.name)));
        if (bare && !specific) return { extension: null, javascript: true };
      }
      return { extension: jsx ? (ts ? 'tsx' : 'jsx') : ts ? 'ts' : null, javascript: true };
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }
  return { extension: null, javascript: false };
}

function isYaml(text) {
  // JSON was already tried by the coordinator. Do not relabel broken JSON as
  // YAML just because YAML allows missing values or extra flow punctuation.
  if (/^\s*(?:\{\s*"|\[\s*(?:"|-?\d|true\b|false\b|null\b))/.test(text)) return false;
  const yaml = require('yaml');
  const docs = yaml.parseAllDocuments(text, { strict: true, uniqueKeys: true, prettyErrors: false, logLevel: 'silent' });
  if (!docs.length || docs.some(doc => doc.errors.length || doc.warnings.length)) return false;
  const explicit = /^(?:%YAML\s|---(?:\s|$))/m.test(text);
  return docs.every(doc => {
    const root = doc.contents;
    if (!yaml.isCollection(root) || !root.items.length) return false;
    let invalidAlias = false;
    const anchors = new Set();
    yaml.visit(doc, (_, node) => {
      if (node && node.anchor) anchors.add(node.anchor);
      if (yaml.isAlias(node) && !anchors.has(node.source)) invalidAlias = true;
    });
    if (invalidAlias) return false;
    if (explicit || root.flow) return true;
    if (yaml.isMap(root)) {
      return root.items.length > 1 || root.items.some(pair => yaml.isCollection(pair.value) ||
        (yaml.isScalar(pair.value) && (['BLOCK_LITERAL', 'BLOCK_FOLDED'].includes(pair.value.type) ||
          (pair.value.value !== null && typeof pair.value.value !== 'string'))));
    }
    // A plain bullet list is equally likely to be prose/Markdown.
    return root.items.some(item => yaml.isCollection(item)) ||
      (root.items.length > 1 && root.items.every(item => yaml.isScalar(item) && typeof item.value !== 'string'));
  });
}

function isCss(text) {
  const css = require('css-tree');
  const t = css.tokenTypes;
  const opening = new Map([[t.Function, t.RightParenthesis], [t.LeftParenthesis, t.RightParenthesis],
    [t.LeftSquareBracket, t.RightSquareBracket], [t.LeftCurlyBracket, t.RightCurlyBracket]]);
  const closing = new Set([t.RightParenthesis, t.RightSquareBracket, t.RightCurlyBracket]);
  const stack = [];
  let broken = false;
  css.tokenize(text, (type, start, end) => {
    if (opening.has(type)) stack.push(opening.get(type));
    else if (closing.has(type) && stack.pop() !== type) broken = true;
    if ([t.BadString, t.BadUrl].includes(type)) broken = true;
    if (type === t.Comment && !text.slice(start, end).endsWith('*/')) broken = true;
    if (type === t.String && text[end - 1] !== text[start]) broken = true;
  });
  if (broken || stack.length) return false;
  try {
    const ast = css.parse(text, { parseCustomProperty: true, onParseError(error) { throw error; } });
    let declarations = 0;
    let blocks = 0;
    css.walk(ast, node => {
      if (node.type === 'Raw') broken = true;
      if (node.type === 'Declaration') {
        declarations++;
        if (!node.value || (node.value.children && node.value.children.isEmpty)) broken = true;
      }
      if (node.type === 'Block') blocks++;
    });
    return !broken && declarations > 0 && blocks > 0;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return false;
  }
}

function isSql(text) {
  const leading = text.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, '');
  if (!/^(?:SELECT|WITH|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|TRUNCATE)\b/i.test(leading)) return false;
  if (/^SELECT\b/i.test(leading) && !/;\s*$|\bFROM\b|^SELECT\s+(?:\d|['"*])/i.test(leading)) return false;
  // Load individual dialects instead of all of node-sql-parser's grammars.
  for (const dialect of ['postgresql', 'mysql', 'sqlite', 'transactsql']) {
    const { Parser } = require(`node-sql-parser/build/${dialect}`);
    try {
      const ast = new Parser().astify(text);
      const statements = Array.isArray(ast) ? ast : [ast];
      if (statements.length && statements.every(statement => statement &&
          ['select', 'insert', 'update', 'delete', 'create', 'alter', 'drop', 'truncate'].includes(
            statement.type || (statement.stmt && statement.stmt.type)))) return true;
    } catch (_) { /* Another supported dialect may accept this statement. */ }
  }
  return false;
}

function isGraphql(text) {
  const { parse } = require('graphql/language');
  try {
    return parse(text, { noLocation: true, maxTokens: 100000 }).definitions.length > 0;
  } catch (error) {
    if (error.name !== 'GraphQLError') throw error;
    return false;
  }
}

function isDiff(text) {
  if (!/^(?:diff --git |--- |Index: )/.test(text)) return false;
  const { parsePatch } = require('diff');
  try {
    const patches = parsePatch(text);
    return patches.length > 0 && patches.every(patch => patch.oldFileName && patch.newFileName &&
      patch.hunks.length > 0 && patch.hunks.some(hunk => hunk.lines.some(line => /^[+-]/.test(line))));
  } catch (_) {
    return false;
  }
}

function infer(text) {
  if (isDiff(text.trimStart())) return { extension: 'diff' };
  const source = sourceType(text);
  const graphql = isGraphql(text);
  if (source.extension && graphql) {
    // GraphQL interfaces and enums can also be syntactically valid TypeScript.
    if (/:\s*(?:string|number|boolean|unknown|any|never|void)\b/.test(text)) return source;
    if (/:\s*\[?(?:String|ID|Int|Float|Boolean)\b/.test(text)) return { extension: 'graphql' };
    return { extension: 'txt' };
  }
  if (source.extension) return source;
  if (graphql) {
    if (isYaml(text)) {
      // Flow mappings and GraphQL aliases overlap. Typed YAML values are a
      // useful clue; all-string mappings/aliases alone remain ambiguous.
      return { extension: /:\s*(?:true|false|null|-?\d)\b/.test(text) ? 'yaml' : 'txt' };
    }
    return { extension: 'graphql' };
  }
  if (isSql(text)) return { extension: 'sql' };
  if (isCss(text)) return { extension: 'css' };
  if (isYaml(text)) return { extension: 'yaml' };
  return source;
}

if (require.main === module) {
  try {
    process.stdout.write(JSON.stringify(infer(fs.readFileSync(0, 'utf8'))));
  } catch (_) {
    // Never echo parser diagnostics: they may contain clipboard contents.
    process.exitCode = 1;
  }
}

module.exports = { infer };
