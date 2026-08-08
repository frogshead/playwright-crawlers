import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { getDbPath } from './utils';

/**
 * Shared, promise-based access to the `posts` table that links Telegram
 * message_ids to job URLs, plus a small `meta` key/value store used to persist
 * the Telegram getUpdates offset between listener runs.
 *
 * The `posts` table is created by storeDb() in utils.ts when crawlers post
 * listings; we (re)create it defensively here so the listener/generator can run
 * standalone against a fresh database.
 */

export interface PostRow {
  message_id: number;
  url: string;
  chat_id: string | null;
  posted_at: string | null;
  reaction_count: number;
  resume_status: string;
}

export async function openDb(): Promise<Database> {
  const db = await open({ filename: getDbPath(), driver: sqlite3.Database });
  await db.exec(`CREATE TABLE IF NOT EXISTS posts (
    message_id INTEGER PRIMARY KEY,
    url TEXT,
    chat_id TEXT,
    posted_at TEXT,
    reaction_count INTEGER DEFAULT 0,
    resume_status TEXT DEFAULT 'pending'
  )`);
  await db.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`);
  return db;
}

export async function getOffset(db: Database): Promise<number> {
  const row = await db.get<{ value: string }>("SELECT value FROM meta WHERE key = 'tg_offset'");
  return row ? parseInt(row.value, 10) : 0;
}

export async function setOffset(db: Database, offset: number): Promise<void> {
  await db.run("INSERT OR REPLACE INTO meta (key, value) VALUES ('tg_offset', ?)", String(offset));
}

/**
 * Set the positive-reaction count for a post. Returns the number of rows
 * updated (0 means we have no record of that message_id — e.g. a manual post).
 */
export async function setReactionCount(db: Database, messageId: number, count: number): Promise<number> {
  const result = await db.run("UPDATE posts SET reaction_count = ? WHERE message_id = ?", count, messageId);
  return result.changes ?? 0;
}

/** Posts that have at least one positive reaction and no resume generated yet. */
export async function getLikedPostsNeedingResume(db: Database): Promise<PostRow[]> {
  return db.all<PostRow[]>(
    "SELECT * FROM posts WHERE reaction_count > 0 AND resume_status = 'pending' ORDER BY posted_at ASC"
  );
}

export async function markResumeStatus(db: Database, messageId: number, status: string): Promise<void> {
  await db.run("UPDATE posts SET resume_status = ? WHERE message_id = ?", status, messageId);
}
