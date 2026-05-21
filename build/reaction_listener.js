"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = require("dotenv");
const logger_1 = require("./logger");
const utils_1 = require("./utils");
const reactions_db_1 = require("./reactions_db");
/**
 * Drains pending Telegram updates and flags job posts the user marked as
 * interesting into the `posts` table. Designed to run once per day (not as a
 * daemon): Telegram retains updates for 24h, so a daily run catches the day.
 *
 * Two trigger methods are supported:
 *  1. REPLY (works in private DMs): reply to a job post's message. Any reply
 *     flags it; a reply of exactly "-" un-flags it. This is the primary method
 *     since reactions are NOT delivered to bots in private chats.
 *  2. REACTION (groups/channels only, bot must be admin): 👍/❤️ etc. Channels
 *     send anonymous `message_reaction_count`; groups send per-user
 *     `message_reaction`.
 *
 * Requirement: no webhook / other getUpdates consumer may be active for the
 * same bot, or updates will be split between consumers.
 */
const CRAWLER_NAME = 'reaction-listener';
const logger = (0, logger_1.createLogger)(CRAWLER_NAME);
// Emojis that count as a "like" worth generating an application for.
const POSITIVE_EMOJIS = new Set(['👍', '❤️', '❤', '🔥', '👏']);
const ALLOWED_UPDATES = ['message', 'message_reaction', 'message_reaction_count'];
function countPositiveFromReactionCount(reactions) {
    let total = 0;
    for (const r of reactions || []) {
        const emoji = r?.type?.emoji;
        if (r?.type?.type === 'emoji' && emoji && POSITIVE_EMOJIS.has(emoji)) {
            total += r.total_count || 0;
        }
    }
    return total;
}
function countPositiveFromReactionList(reactions) {
    let total = 0;
    for (const r of reactions || []) {
        const emoji = r?.emoji;
        if (r?.type === 'emoji' && emoji && POSITIVE_EMOJIS.has(emoji)) {
            total += 1;
        }
    }
    return total;
}
(async () => {
    (0, dotenv_1.config)();
    const token = (0, utils_1.getTelegramToken)();
    if (!token) {
        logger.error('Telegram token not set (TELEGRAM_API_KEY or TELEGRAM_BOT_TOKEN); cannot poll for reactions');
        process.exit(1);
    }
    const TelegramBot = require('node-telegram-bot-api');
    const bot = new TelegramBot(token); // no polling: we drive getUpdates manually
    const db = await (0, reactions_db_1.openDb)();
    let offset = await (0, reactions_db_1.getOffset)(db);
    logger.info('Starting reaction drain', { offset });
    let totalUpdates = 0;
    let matched = 0;
    let unmatched = 0;
    const MAX_BATCHES = 50; // safety cap
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
        let updates;
        try {
            updates = await bot.getUpdates({ offset, limit: 100, timeout: 10, allowed_updates: ALLOWED_UPDATES });
        }
        catch (error) {
            logger.error('getUpdates failed', { error: error?.message || String(error) });
            break;
        }
        if (!updates || updates.length === 0)
            break;
        for (const update of updates) {
            offset = update.update_id + 1;
            totalUpdates++;
            const rc = update.message_reaction_count;
            const rx = update.message_reaction;
            const msg = update.message;
            let messageId;
            let count;
            if (rc) {
                messageId = rc.message_id;
                count = countPositiveFromReactionCount(rc.reactions);
            }
            else if (rx) {
                messageId = rx.message_id;
                count = countPositiveFromReactionList(rx.new_reaction);
            }
            else if (msg && msg.reply_to_message) {
                // A reply to a tracked job post flags it (or un-flags it with "-").
                messageId = msg.reply_to_message.message_id;
                count = (msg.text || '').trim() === '-' ? 0 : 1;
            }
            if (messageId == null || count == null)
                continue;
            const changed = await (0, reactions_db_1.setReactionCount)(db, messageId, count);
            if (changed > 0) {
                matched++;
                logger.info(count > 0 ? 'Flagged job post' : 'Un-flagged job post', { messageId, count });
            }
            else {
                unmatched++;
                logger.debug('Trigger on unknown message (not a tracked job post)', { messageId });
            }
        }
        await (0, reactions_db_1.setOffset)(db, offset);
    }
    await (0, reactions_db_1.setOffset)(db, offset);
    await db.close();
    logger.info('Reaction drain complete', { totalUpdates, matched, unmatched, offset });
})();
