"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.markResumeStatus = exports.getLikedPostsNeedingResume = exports.setReactionCount = exports.setOffset = exports.getOffset = exports.openDb = void 0;
const sqlite3_1 = __importDefault(require("sqlite3"));
const sqlite_1 = require("sqlite");
const utils_1 = require("./utils");
async function openDb() {
    const db = await (0, sqlite_1.open)({ filename: (0, utils_1.getDbPath)(), driver: sqlite3_1.default.Database });
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
exports.openDb = openDb;
async function getOffset(db) {
    const row = await db.get("SELECT value FROM meta WHERE key = 'tg_offset'");
    return row ? parseInt(row.value, 10) : 0;
}
exports.getOffset = getOffset;
async function setOffset(db, offset) {
    await db.run("INSERT OR REPLACE INTO meta (key, value) VALUES ('tg_offset', ?)", String(offset));
}
exports.setOffset = setOffset;
/**
 * Set the positive-reaction count for a post. Returns the number of rows
 * updated (0 means we have no record of that message_id — e.g. a manual post).
 */
async function setReactionCount(db, messageId, count) {
    const result = await db.run("UPDATE posts SET reaction_count = ? WHERE message_id = ?", count, messageId);
    return result.changes ?? 0;
}
exports.setReactionCount = setReactionCount;
/** Posts that have at least one positive reaction and no resume generated yet. */
async function getLikedPostsNeedingResume(db) {
    return db.all("SELECT * FROM posts WHERE reaction_count > 0 AND resume_status = 'pending' ORDER BY posted_at ASC");
}
exports.getLikedPostsNeedingResume = getLikedPostsNeedingResume;
async function markResumeStatus(db, messageId, status) {
    await db.run("UPDATE posts SET resume_status = ? WHERE message_id = ?", status, messageId);
}
exports.markResumeStatus = markResumeStatus;
