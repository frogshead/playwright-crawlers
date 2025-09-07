"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.greet = greet;
exports.storeDb = storeDb;
const sqlite3_1 = require("sqlite3");
function greet(name) {
    console.log("hello " + name + " there!");
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function storeDb(urls) {
    // Store database in data directory for persistence in Docker
    const dbPath = process.env.NODE_ENV === 'production' ? './data/tori.db' : './tori.db';
    const db = new sqlite3_1.Database(dbPath, sqlite3_1.OPEN_READWRITE | sqlite3_1.OPEN_CREATE, (err) => {
        if (err) {
            console.log(err.message);
        }
        else {
            console.log("Connected to Database");
            db.run("CREATE TABLE IF NOT EXISTS links (url TEXT UNIQUE)");
            const stmt = db.prepare("INSERT INTO links VALUES (?)");
            urls.forEach(url => {
                stmt.run(url, (err) => {
                    if (err) {
                        console.log(err.message);
                        console.log("Url already in database: ", url);
                    }
                    else {
                        console.log("Added url: ", url);
                        const TelegramBot = require('node-telegram-bot-api');
                        const bot = new TelegramBot(process.env.TELEGRAM_API_KEY);
                        bot.sendMessage(process.env.TELEGRAM_CHAT_ID, url);
                        sleep(100);
                    }
                });
            });
            stmt.finalize();
        }
    });
}
