"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storeDb = exports.isTelegramConfigured = exports.sendTelegramDocument = exports.sendTelegramMessage = exports.getDbPath = exports.getTelegramToken = void 0;
const sqlite3_1 = require("sqlite3");
const logger_1 = require("./logger");
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * The Telegram bot token, accepting either TELEGRAM_API_KEY (used in code/docs)
 * or TELEGRAM_BOT_TOKEN (used in some .env files) so the two never silently
 * disagree.
 */
function getTelegramToken() {
    return process.env.TELEGRAM_API_KEY || process.env.TELEGRAM_BOT_TOKEN;
}
exports.getTelegramToken = getTelegramToken;
// Telegram rate limiting implementation
class TelegramNotifier {
    constructor() {
        this.messageQueue = [];
        this.isProcessing = false;
        this.RATE_LIMIT_DELAY = 1000; // 1 second between messages (Telegram allows 30 msg/sec for group, but we'll be conservative)
        this.MAX_RETRIES = 3;
        this.RETRY_DELAY = 5000; // 5 seconds delay on rate limit error
        const token = getTelegramToken();
        if (token) {
            try {
                const TelegramBot = require('node-telegram-bot-api');
                this.bot = new TelegramBot(token);
                logger_1.logger.info("Telegram bot initialized successfully");
            }
            catch (error) {
                logger_1.logger.error("Failed to initialize Telegram bot", { error: error instanceof Error ? error.message : String(error) });
                this.bot = null;
            }
        }
        else {
            logger_1.logger.warn("Telegram token not found (set TELEGRAM_API_KEY or TELEGRAM_BOT_TOKEN)");
        }
    }
    isConfigured() {
        return !!this.bot && !!process.env.TELEGRAM_CHAT_ID;
    }
    /**
     * Queue a text message for sending. Resolves with the Telegram message_id of
     * the sent message (needed to map reactions back to job postings), or null if
     * the bot is not configured.
     */
    sendMessage(message) {
        return new Promise((resolve, reject) => {
            if (!this.bot) {
                logger_1.logger.debug("Telegram bot not configured, skipping notification", { message });
                resolve(null);
                return;
            }
            if (!process.env.TELEGRAM_CHAT_ID) {
                logger_1.logger.debug("Telegram chat ID not configured, skipping notification", { message });
                resolve(null);
                return;
            }
            this.messageQueue.push({ text: message, resolve, reject });
            if (!this.isProcessing) {
                this.processQueue();
            }
        });
    }
    /**
     * Send a document (e.g. a generated resume markdown file) directly, bypassing
     * the text queue. Resolves with the message_id or null if not configured.
     */
    async sendDocument(filePath, caption) {
        if (!this.isConfigured()) {
            logger_1.logger.debug("Telegram bot not configured, skipping document", { filePath });
            return null;
        }
        try {
            const result = await this.bot.sendDocument(process.env.TELEGRAM_CHAT_ID, filePath, caption ? { caption } : {});
            logger_1.logger.info("Telegram document sent", { filePath });
            return result?.message_id ?? null;
        }
        catch (error) {
            logger_1.logger.error("Failed to send Telegram document", { filePath, error: error.message });
            throw error;
        }
    }
    async processQueue() {
        if (this.messageQueue.length === 0) {
            this.isProcessing = false;
            return;
        }
        this.isProcessing = true;
        const item = this.messageQueue.shift();
        try {
            const messageId = await this.sendWithRetry(item.text);
            item.resolve(messageId);
        }
        catch (error) {
            logger_1.logger.error("Failed to send Telegram message after retries", { message: item.text, error: error instanceof Error ? error.message : String(error) });
            item.reject(error);
        }
        // Continue draining the queue regardless of individual message outcome
        if (this.messageQueue.length > 0) {
            await sleep(this.RATE_LIMIT_DELAY);
            this.processQueue();
        }
        else {
            this.isProcessing = false;
        }
    }
    async sendWithRetry(message, retries = 0) {
        try {
            const result = await this.bot.sendMessage(process.env.TELEGRAM_CHAT_ID, message);
            logger_1.logger.info("Telegram notification sent", { message });
            return result?.message_id ?? null;
        }
        catch (error) {
            logger_1.logger.error("Telegram API error", { error: error.message });
            // Handle rate limiting specifically
            if (error.code === 429 || error.message.includes('Too Many Requests')) {
                const retryAfter = error.parameters?.retry_after || (this.RETRY_DELAY / 1000);
                logger_1.logger.warn("Rate limited, waiting before retry", { retryAfter, attempt: retries + 1 });
                if (retries < this.MAX_RETRIES) {
                    await sleep(retryAfter * 1000);
                    return this.sendWithRetry(message, retries + 1);
                }
                else {
                    throw new Error(`Max retries exceeded for message: ${message}`);
                }
            }
            // Handle other errors
            if (retries < this.MAX_RETRIES) {
                logger_1.logger.warn("Retrying message send", { attempt: retries + 1, maxRetries: this.MAX_RETRIES });
                await sleep(1000);
                return this.sendWithRetry(message, retries + 1);
            }
            else {
                throw error;
            }
        }
    }
}
// Singleton instance - lazy initialized
let telegramNotifier = null;
function getTelegramNotifier() {
    if (!telegramNotifier) {
        telegramNotifier = new TelegramNotifier();
    }
    return telegramNotifier;
}
/**
 * Resolve the SQLite database path. Uses ./data/tori.db in production
 * (systemd / Docker) and ./tori.db for local development.
 */
function getDbPath() {
    return process.env.NODE_ENV === 'production' ? './data/tori.db' : './tori.db';
}
exports.getDbPath = getDbPath;
/** Queue a Telegram text message. Resolves with the sent message_id (or null). */
function sendTelegramMessage(message) {
    return getTelegramNotifier().sendMessage(message);
}
exports.sendTelegramMessage = sendTelegramMessage;
/** Send a document (e.g. a resume markdown file) to the configured chat. */
function sendTelegramDocument(filePath, caption) {
    return getTelegramNotifier().sendDocument(filePath, caption);
}
exports.sendTelegramDocument = sendTelegramDocument;
/** Whether Telegram credentials are present and the bot initialized. */
function isTelegramConfigured() {
    return getTelegramNotifier().isConfigured();
}
exports.isTelegramConfigured = isTelegramConfigured;
async function openUrlInBrowser(url) {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    try {
        const platform = process.platform;
        let command;
        // Use platform-specific command to open URL in default browser
        if (platform === 'darwin') {
            command = `open "${url}"`;
        }
        else if (platform === 'win32') {
            command = `start "" "${url}"`;
        }
        else {
            // Linux and other Unix-like systems
            command = `xdg-open "${url}"`;
        }
        await execAsync(command);
        logger_1.logger.info("Opened URL in browser", { url });
    }
    catch (error) {
        throw new Error(`Failed to open URL: ${error instanceof Error ? error.message : String(error)}`);
    }
}
async function storeDb(urls, openInBrowser = false, skipDatabase = false) {
    // If skipDatabase is true, just open URLs in browser if requested
    if (skipDatabase) {
        logger_1.logger.info("Skipping database storage (--no-store flag)", { urlCount: urls.length, openInBrowser });
        if (openInBrowser) {
            const asyncOperations = [];
            urls.forEach((url) => {
                logger_1.logger.info("Opening URL in browser (no-store mode)", { url });
                const browserPromise = openUrlInBrowser(url).catch((browserError) => {
                    logger_1.logger.error("Failed to open URL in browser", { url, error: browserError instanceof Error ? browserError.message : String(browserError) });
                });
                asyncOperations.push(browserPromise);
            });
            await Promise.all(asyncOperations);
            logger_1.logger.info("All URLs processed (no-store mode)", { urlCount: urls.length });
        }
        else {
            logger_1.logger.info("No action taken (no-store without --open)", { urlCount: urls.length });
        }
        return Promise.resolve();
    }
    // Normal database storage mode
    return new Promise((resolve, reject) => {
        // Store database in data directory for persistence in Docker
        const dbPath = getDbPath();
        const db = new sqlite3_1.Database(dbPath, sqlite3_1.OPEN_READWRITE | sqlite3_1.OPEN_CREATE, (err) => {
            if (err) {
                logger_1.logger.error("Database connection error", { error: err.message });
                reject(err);
                return;
            }
            logger_1.logger.info("Connected to Database");
            db.serialize(() => {
                // posts maps each Telegram message_id back to the job URL it announced,
                // so the reaction listener can tie a 👍/❤️ on a post to its job posting.
                db.run(`CREATE TABLE IF NOT EXISTS posts (
          message_id INTEGER PRIMARY KEY,
          url TEXT,
          chat_id TEXT,
          posted_at TEXT,
          reaction_count INTEGER DEFAULT 0,
          resume_status TEXT DEFAULT 'pending'
        )`, (postsErr) => {
                    if (postsErr) {
                        logger_1.logger.error("Error creating posts table", { error: postsErr.message });
                    }
                });
                db.run("CREATE TABLE IF NOT EXISTS links (url TEXT UNIQUE)", (err) => {
                    if (err) {
                        logger_1.logger.error("Error creating table", { error: err.message });
                        reject(err);
                        return;
                    }
                    const stmt = db.prepare("INSERT INTO links VALUES (?)");
                    let processedCount = 0;
                    const totalCount = urls.length;
                    const asyncOperations = [];
                    if (totalCount === 0) {
                        logger_1.logger.info("No URLs to process");
                        resolve();
                        return;
                    }
                    urls.forEach((url) => {
                        stmt.run(url, (err) => {
                            processedCount++;
                            if (err) {
                                logger_1.logger.debug("Database error (likely duplicate)", { error: err.message });
                                logger_1.logger.debug("URL already in database", { url });
                            }
                            else {
                                logger_1.logger.info("Added new URL to database", { url });
                                // Send notification for new URLs only using rate-limited system.
                                // Record the resulting message_id so reactions on this post can
                                // later be mapped back to the job URL.
                                const telegramPromise = getTelegramNotifier().sendMessage(url)
                                    .then((messageId) => {
                                    if (messageId == null)
                                        return;
                                    db.run("INSERT OR REPLACE INTO posts (message_id, url, chat_id, posted_at) VALUES (?, ?, ?, ?)", [messageId, url, process.env.TELEGRAM_CHAT_ID || null, new Date().toISOString()], (postErr) => {
                                        if (postErr) {
                                            logger_1.logger.error("Failed to record post mapping", { url, messageId, error: postErr.message });
                                        }
                                    });
                                })
                                    .catch((telegramError) => {
                                    logger_1.logger.error("Failed to send Telegram notification", { url, error: telegramError instanceof Error ? telegramError.message : String(telegramError) });
                                });
                                asyncOperations.push(telegramPromise);
                                // Open URL in browser if flag is set
                                if (openInBrowser) {
                                    const browserPromise = openUrlInBrowser(url).catch((browserError) => {
                                        logger_1.logger.error("Failed to open URL in browser", { url, error: browserError instanceof Error ? browserError.message : String(browserError) });
                                    });
                                    asyncOperations.push(browserPromise);
                                }
                            }
                            // Check if all URLs have been processed
                            if (processedCount === totalCount) {
                                // Wait for all async operations to complete before finalizing
                                Promise.all(asyncOperations).finally(() => {
                                    stmt.finalize((finalizeErr) => {
                                        if (finalizeErr) {
                                            logger_1.logger.error("Error finalizing statement", { error: finalizeErr.message });
                                            reject(finalizeErr);
                                        }
                                        else {
                                            logger_1.logger.info("Database operations completed", { processedCount: totalCount });
                                            db.close((closeErr) => {
                                                if (closeErr) {
                                                    logger_1.logger.error("Error closing database", { error: closeErr.message });
                                                    reject(closeErr);
                                                }
                                                else {
                                                    resolve();
                                                }
                                            });
                                        }
                                    });
                                });
                            }
                        });
                    });
                });
            }); // end db.serialize
        });
    });
}
exports.storeDb = storeDb;
