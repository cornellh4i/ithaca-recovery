import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";

// AST-based structural check (not text/grep-based) that every mutation/admin
// route actually calls requireRole() and checks its result before proceeding —
// as opposed to a route that merely imports requireRole, or calls it but
// ignores the return value. Routes not listed in PUBLIC_ROUTES are assumed to
// need the guard; add new intentionally-public routes to the allowlist below
// rather than to individual route files' exclusions.

const API_ROOT = path.resolve(__dirname, "../../app/api");

const PUBLIC_ROUTES = new Set([
  "auth/[...nextauth]/route.ts", // NextAuth's own handler, not a custom route
  "auth/status/route.ts", // public session-status probe by design
  "retrieve/meeting/route.ts",
  "retrieve/meeting/day/route.ts",
  "retrieve/meeting/week/route.ts",
  "retrieve/meeting/range/route.ts",
  "retrieve/meeting/month/route.ts",
  "retrieve/meeting/[id]/route.ts",
]);

function findRouteFiles(dir: string, base = dir): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return findRouteFiles(fullPath, base);
    return entry.name === "route.ts" ? [path.relative(base, fullPath)] : [];
  });
}

function containsReturn(node: ts.Node): boolean {
  let found = false;
  const inner = (n: ts.Node) => {
    if (found) return;
    if (ts.isReturnStatement(n)) {
      found = true;
      return;
    }
    ts.forEachChild(n, inner);
  };
  inner(node);
  return found;
}

// True only if a variable is assigned `requireRole(...)` (optionally awaited)
// AND that same variable is later checked with `instanceof Response` in an
// if-statement whose body returns — the actual guard pattern, not just a
// mention of `requireRole` somewhere in the file.
function hasRequireRoleGuard(sourceText: string): boolean {
  const sourceFile = ts.createSourceFile("route.ts", sourceText, ts.ScriptTarget.Latest, true);
  const guardedVarNames = new Set<string>();
  let foundGuard = false;

  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
      const init = ts.isAwaitExpression(node.initializer) ? node.initializer.expression : node.initializer;
      if (ts.isCallExpression(init) && ts.isIdentifier(init.expression) && init.expression.text === "requireRole") {
        guardedVarNames.add(node.name.text);
      }
    }

    if (
      ts.isIfStatement(node) &&
      ts.isBinaryExpression(node.expression) &&
      node.expression.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword &&
      ts.isIdentifier(node.expression.left) &&
      guardedVarNames.has(node.expression.left.text) &&
      ts.isIdentifier(node.expression.right) &&
      node.expression.right.text === "Response" &&
      containsReturn(node.thenStatement)
    ) {
      foundGuard = true;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return foundGuard;
}

describe("hasRequireRoleGuard detector", () => {
  test("catches the correct pattern", () => {
    expect(hasRequireRoleGuard(`
      export const GET = async () => {
        const auth = await requireRole(Role.ADMIN);
        if (auth instanceof Response) return auth;
      };
    `)).toBe(true);
  });

  test("rejects requireRole imported but never called", () => {
    expect(hasRequireRoleGuard(`
      import { requireRole } from "../../../../services/auth";
      export const GET = async () => {
        return NextResponse.json({ ok: true });
      };
    `)).toBe(false);
  });

  test("rejects requireRole called but its result ignored", () => {
    expect(hasRequireRoleGuard(`
      export const GET = async () => {
        await requireRole(Role.ADMIN);
        return NextResponse.json({ ok: true });
      };
    `)).toBe(false);
  });

  test("rejects an instanceof Response check on an unrelated variable", () => {
    expect(hasRequireRoleGuard(`
      export const GET = async () => {
        const auth = await requireRole(Role.ADMIN);
        const other = await somethingElse();
        if (other instanceof Response) return other;
      };
    `)).toBe(false);
  });
});

const allRouteFiles = findRouteFiles(API_ROOT);
const guardedRouteFiles = allRouteFiles.filter((f) => !PUBLIC_ROUTES.has(f));

test("PUBLIC_ROUTES allowlist has no stale/typo'd entries", () => {
  const stale = [...PUBLIC_ROUTES].filter((f) => !allRouteFiles.includes(f));
  expect(stale).toEqual([]);
});

test.each(guardedRouteFiles)("%s has a requireRole() guard that checks and returns on failure", (routeFile) => {
  const sourceText = fs.readFileSync(path.join(API_ROOT, routeFile), "utf8");
  expect(hasRequireRoleGuard(sourceText)).toBe(true);
});
