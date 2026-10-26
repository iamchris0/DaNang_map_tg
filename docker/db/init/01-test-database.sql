-- Runs once, when the db-data volume is first initialised.
-- A separate database for the PostGIS integration tests (tests/test_schema_db.py).
SELECT format('CREATE DATABASE %I', current_database() || '_test')
\gexec
