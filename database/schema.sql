-- Arlow database schema. Paste this whole file into your D1 database's Console tab and run it once.
-- Safe to run again: every statement uses IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS content (id TEXT PRIMARY KEY, draft TEXT, published TEXT, draft_at TEXT, published_at TEXT);
CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY, mime TEXT NOT NULL, size INTEGER NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS changes (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, action TEXT NOT NULL, detail TEXT);
CREATE TABLE IF NOT EXISTS attempts (ip TEXT PRIMARY KEY, n INTEGER NOT NULL, t INTEGER NOT NULL);
