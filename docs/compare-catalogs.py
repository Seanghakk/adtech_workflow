#!/usr/bin/env python3
"""
Compare two catalog-query output directories as SETS, not as diffed text.

See docs/rollback-test-sync.md. Usage:

    python3 docs/compare-catalogs.py <production_dir> <rollback_test_dir>

Each directory is the output of running docs/catalog-queries.sql against one
project (psql's `\\o` writes relative to its working directory, so run each
one from inside its own directory).

Why sets and not `diff`: a text diff of two pg_dump files — or of two
catalog listings — makes "production has X and rollback-test doesn't" look
very much like "rollback-test has X and production doesn't" to a quick
read, and Brief 091 got exactly that backwards mid-session before catching
it. Printing PROD_ONLY and RBT_ONLY separately removes the ambiguity: each
line says which side it came from, in words.

Exit code is 0 when the two sides are identical and 1 when they are not, so
this can gate a script.
"""

import sys
from pathlib import Path

# One per `\o <name>.out` in docs/catalog-queries.sql, in the order the
# comparison reads most naturally: what exists, then its shape, then who
# may touch it.
FILES = [
    "tables",
    "columns",
    "public_user_profiles_columns",
    "constraints",
    "indexes",
    "functions",
    "functions_public",
    "triggers",
    "rls_enabled",
    "policies",
    "grants",
    "views",
    "schema_grants",
    # Storage (Brief 100 Part E). Bucket CONFIGURATION only — never the
    # objects inside a bucket, which are application data.
    "storage_buckets",
    "storage_tables",
    "storage_rls_enabled",
    "storage_policies",
]


def load(path: Path) -> set[str]:
    if not path.exists():
        raise SystemExit(
            f"missing: {path}\n"
            "Run docs/catalog-queries.sql against that project first — see "
            "docs/rollback-test-sync.md."
        )
    with path.open() as f:
        return {line.rstrip("\n") for line in f if line.strip()}


def unlisted(directory: Path) -> list[str]:
    """Output files on disk that FILES does not mention.

    A query can be added to catalog-queries.sql and simply not compared,
    because nothing connects the two lists. That is not hypothetical: the
    storage buckets went missing on rollback-test for weeks with every
    comparison above reporting clean, since none of them looked at
    storage at all. An unlisted .out file is now a loud failure rather
    than a silent gap.
    """
    return sorted(f.stem for f in directory.glob("*.out") if f.stem not in FILES)


def main() -> int:
    if len(sys.argv) != 3:
        raise SystemExit(__doc__.strip())

    prod_dir, rbt_dir = Path(sys.argv[1]), Path(sys.argv[2])
    differences = 0

    missed = sorted(set(unlisted(prod_dir)) | set(unlisted(rbt_dir)))
    if missed:
        raise SystemExit(
            "These query outputs exist but are not in FILES, so they would "
            "never be compared:\n  "
            + "\n  ".join(missed)
            + "\nAdd them to FILES in this script."
        )

    for name in FILES:
        prod = load(prod_dir / f"{name}.out")
        rbt = load(rbt_dir / f"{name}.out")
        prod_only = sorted(prod - rbt)
        rbt_only = sorted(rbt - prod)

        print(f"\n=== {name} === (prod={len(prod)}, rollback-test={len(rbt)})")
        if not prod_only and not rbt_only:
            print("  IDENTICAL")
            continue

        differences += len(prod_only) + len(rbt_only)
        for line in prod_only:
            print(f"  PROD_ONLY: {line}")
        for line in rbt_only:
            print(f"  RBT_ONLY:  {line}")

    print()
    if differences == 0:
        print("No differences.")
        return 0

    print(f"{differences} difference(s).")
    # A differing function hash is very often pure \r\n vs \n noise in the
    # stored body text rather than a real difference — check the raw bytes
    # with repr() before treating one as meaningful. See the sync doc.
    print("Classify each one before changing anything (sync doc, 'Production is read-only').")
    return 1


if __name__ == "__main__":
    sys.exit(main())
