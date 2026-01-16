# Database Schema Management

This directory contains SQL scripts for database migrations, seeds, and other database-related operations.

## Schema Changes

Whenever you make a change to the database schema (e.g., creating or altering tables, functions, etc.), you must update the `db_schema.txt` file in the root of the project.

This can be done by running the following script:

```bash
./scripts/update_db_schema.sh
```

This script connects to the Supabase database and dumps the current `public` schema to the `db_schema.txt` file.

**Important:** After running the script, review the changes in `db_schema.txt` to ensure they are intended.
