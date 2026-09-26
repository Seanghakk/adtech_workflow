/**
 * A 'use server' file may export ONLY async functions.
 *
 * WHY THIS EXISTS. On 26 Sep 2026 a single line —
 *
 *     export const coverageInitialState: CoverageState = { ... }
 *
 * — in a 'use server' file took down every server action on the project
 * setup route in production. Next.js validates this at MODULE EVALUATION,
 * which happens when a server action is first invoked, so:
 *
 *   * `next build` exited 0 and never mentioned it;
 *   * tsc, eslint and 278 tests were all clean;
 *   * GET on the page rendered perfectly, because the render path does not
 *     evaluate the actions module;
 *   * the first POST returned "A server error occurred", and the error named
 *     a file the user had not touched.
 *
 * Nothing in the toolchain caught it. This rule is the cheap half of the fix
 * — it catches this exact mistake at edit time. The smoke test
 * (supabase/../tests, npm run test:smoke) is the half that catches the wider
 * class: code that only fails when something actually loads it.
 *
 * WHAT IS ALLOWED:
 *   export async function foo() {}        async function declaration
 *   export const foo = async () => {}     async arrow / function expression
 *   export type X = ...                   erased at compile, no runtime export
 *   export interface X {}                 same
 *   export { type X }                     same
 *
 * WHAT IS NOT:
 *   export const x = {}                   object — the one that bit us
 *   export const x = 1                    literal
 *   export function foo() {}              NOT async
 *   export default anything-not-async
 *   export { somethingValue }             a value re-export
 *
 * The rule is deliberately conservative: where it cannot prove an export is
 * an async function, it reports. A false positive costs a moved line; a false
 * negative costs a production outage behind a green build.
 */

const MESSAGE =
  "A 'use server' file may export only async functions. `{{name}}` is {{what}}. " +
  'Next.js throws at module evaluation, which no build or test here catches — ' +
  'move it to a plain module beside its type.';

function hasUseServerDirective(node) {
  // Directives are string-expression statements before any other statement.
  for (const statement of node.body) {
    if (
      statement.type !== 'ExpressionStatement' ||
      statement.expression.type !== 'Literal' ||
      typeof statement.expression.value !== 'string'
    ) {
      // Stop at the first non-directive; directives may not appear later.
      break;
    }
    if (statement.expression.value === 'use server') return true;
  }
  return false;
}

function describeInit(init) {
  if (!init) return 'a declaration with no initialiser';
  if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') {
    return init.async ? null : 'a function that is not async';
  }
  if (init.type === 'ObjectExpression') return 'an object';
  if (init.type === 'ArrayExpression') return 'an array';
  if (init.type === 'Literal') return `a ${typeof init.value} literal`;
  if (init.type === 'TSAsExpression' || init.type === 'TSSatisfiesExpression') {
    return describeInit(init.expression);
  }
  return 'not provably an async function';
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        "enforce that a 'use server' file exports only async functions, which Next.js requires at runtime",
    },
    schema: [],
    messages: { invalid: MESSAGE },
  },

  create(context) {
    const source = context.sourceCode ?? context.getSourceCode();
    if (!hasUseServerDirective(source.ast)) return {};

    function report(node, name, what) {
      context.report({ node, messageId: 'invalid', data: { name, what } });
    }

    return {
      ExportNamedDeclaration(node) {
        // `export type { X }` / `export interface` — erased, always fine.
        if (node.exportKind === 'type') return;

        const decl = node.declaration;

        if (!decl) {
          // export { a, b } — a specifier list. Type-only specifiers are fine.
          for (const spec of node.specifiers) {
            if (spec.exportKind === 'type') continue;
            report(spec, spec.local?.name ?? 'export', 'a re-exported value');
          }
          return;
        }

        if (decl.type === 'TSInterfaceDeclaration' || decl.type === 'TSTypeAliasDeclaration') {
          return; // erased
        }

        if (decl.type === 'FunctionDeclaration') {
          if (!decl.async) {
            report(decl, decl.id?.name ?? 'export', 'a function that is not async');
          }
          return;
        }

        if (decl.type === 'VariableDeclaration') {
          for (const d of decl.declarations) {
            const what = describeInit(d.init);
            if (what) report(d, d.id?.name ?? 'export', what);
          }
          return;
        }

        if (decl.type === 'ClassDeclaration') {
          report(decl, decl.id?.name ?? 'export', 'a class');
        }
      },

      ExportDefaultDeclaration(node) {
        const d = node.declaration;
        const isAsyncFn =
          (d.type === 'FunctionDeclaration' ||
            d.type === 'ArrowFunctionExpression' ||
            d.type === 'FunctionExpression') &&
          d.async;
        if (!isAsyncFn) {
          report(node, 'default', describeInit(d) ?? 'not an async function');
        }
      },
    };
  },
};
