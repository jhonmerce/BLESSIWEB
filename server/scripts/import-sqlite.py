#!/usr/bin/env python3
"""Read carburant.db and emit its tables/rows as JSON for the Prisma importer."""
import json, sqlite3, sys

path = sys.argv[1] if len(sys.argv) > 1 else "carburant.db"
conn = sqlite3.connect(path)
conn.row_factory = sqlite3.Row
tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
print(json.dumps({name: [dict(row) for row in conn.execute('SELECT * FROM "' + name.replace('"', '""') + '"')] for name in tables}, default=str))
