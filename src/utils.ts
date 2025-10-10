import { Database, OPEN_CREATE, OPEN_READWRITE } from "sqlite3";
import { logger } from "./logger";

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Telegram rate limiting implementation
class TelegramNotifier {
  private bot: any;
  private messageQueue: string[] = [];
  private isProcessing = false;
  private readonly RATE_LIMIT_DELAY = 1000; // 1 second between messages (Telegram allows 30 msg/sec for group, but we'll be conservative)
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 5000; // 5 seconds delay on rate limit error

  constructor() {
    if (process.env.TELEGRAM_API_KEY) {
      try {
        const TelegramBot = require('node-telegram-bot-api');
        this.bot = new TelegramBot(process.env.TELEGRAM_API_KEY);
        logger.info("Telegram bot initialized successfully");
      } catch (error) {
        logger.error("Failed to initialize Telegram bot", { error: error instanceof Error ? error.message : String(error) });
        this.bot = null;
      }
    } else {
      logger.warn("TELEGRAM_API_KEY not found in environment variables");
    }
  }

  public async sendMessage(message: string): Promise<void> {
    if (!this.bot) {
      logger.debug("Telegram bot not configured, skipping notification", { message });
      
      return;
    }
    if (!process.env.TELEGRAM_CHAT_ID) {
      logger.debug("Telegram chat ID not configured, skipping notification", { message });
      return;
    }

    this.messageQueue.push(message);
    
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    if (this.messageQueue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const message = this.messageQueue.shift()!;

    try {
      await this.sendWithRetry(message);
      
      // Wait before processing next message
      if (this.messageQueue.length > 0) {
        await sleep(this.RATE_LIMIT_DELAY);
        this.processQueue();
      } else {
        this.isProcessing = false;
      }
    } catch (error) {
      logger.error("Failed to send Telegram message after retries", { message, error: error instanceof Error ? error.message : String(error) });
      this.isProcessing = false;
    }
  }

  private async sendWithRetry(message: string, retries: number = 0): Promise<void> {
    try {
      await this.bot.sendMessage(process.env.TELEGRAM_CHAT_ID, message);
      logger.info("Telegram notification sent", { message });
    } catch (error: any) {
      logger.error("Telegram API error", { error: error.message });
      
      // Handle rate limiting specifically
      if (error.code === 429 || error.message.includes('Too Many Requests')) {
        const retryAfter = error.parameters?.retry_after || (this.RETRY_DELAY / 1000);
        logger.warn("Rate limited, waiting before retry", { retryAfter, attempt: retries + 1 });
        
        if (retries < this.MAX_RETRIES) {
          await sleep(retryAfter * 1000);
          return this.sendWithRetry(message, retries + 1);
        } else {
          throw new Error(`Max retries exceeded for message: ${message}`);
        }
      }
      
      // Handle other errors
      if (retries < this.MAX_RETRIES) {
        logger.warn("Retrying message send", { attempt: retries + 1, maxRetries: this.MAX_RETRIES });
        await sleep(1000);
        return this.sendWithRetry(message, retries + 1);
      } else {
        throw error;
      }
    }
  }
}

// Singleton instance - lazy initialized
let telegramNotifier: TelegramNotifier | null = null;

function getTelegramNotifier(): TelegramNotifier {
  if (!telegramNotifier) {
    telegramNotifier = new TelegramNotifier();
  }
  return telegramNotifier;
}

async function openUrlInBrowser(url: string): Promise<void> {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  try {
    const platform = process.platform;
    let command: string;

    // Use platform-specific command to open URL in default browser
    if (platform === 'darwin') {
      command = `open "${url}"`;
    } else if (platform === 'win32') {
      command = `start "" "${url}"`;
    } else {
      // Linux and other Unix-like systems
      command = `xdg-open "${url}"`;
    }

    await execAsync(command);
    logger.info("Opened URL in browser", { url });
  } catch (error) {
    throw new Error(`Failed to open URL: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function storeDb(urls: string[], openInBrowser: boolean = false): Promise<void> {
  return new Promise((resolve, reject) => {
    // Store database in data directory for persistence in Docker
    const dbPath = process.env.NODE_ENV === 'production' ? './data/tori.db' : './tori.db';
    const db = new Database(dbPath,
      OPEN_READWRITE | OPEN_CREATE,
      (err) => {
        if (err) {
          logger.error("Database connection error", { error: err.message });
          reject(err);
          return;
        }

        logger.info("Connected to Database");
        db.run("CREATE TABLE IF NOT EXISTS links (url TEXT UNIQUE)", (err) => {
          if (err) {
            logger.error("Error creating table", { error: err.message });
            reject(err);
            return;
          }

          const stmt = db.prepare("INSERT INTO links VALUES (?)");
          let processedCount = 0;
          const totalCount = urls.length;

          if (totalCount === 0) {
            logger.info("No URLs to process");
            resolve();
            return;
          }

          urls.forEach((url) => {
            stmt.run(url, async (err) => {
              processedCount++;

              if (err) {
                logger.debug("Database error (likely duplicate)", { error: err.message });
                logger.debug("URL already in database", { url });
              } else {
                logger.info("Added new URL to database", { url });

                // Send notification for new URLs only using rate-limited system
                try {
                  await getTelegramNotifier().sendMessage(url);
                } catch (telegramError) {
                  logger.error("Failed to send Telegram notification", { url, error: telegramError instanceof Error ? telegramError.message : String(telegramError) });
                }

                // Open URL in browser if flag is set
                if (openInBrowser) {
                  try {
                    await openUrlInBrowser(url);
                  } catch (browserError) {
                    logger.error("Failed to open URL in browser", { url, error: browserError instanceof Error ? browserError.message : String(browserError) });
                  }
                }
              }

              // Check if all URLs have been processed
              if (processedCount === totalCount) {
                stmt.finalize((finalizeErr) => {
                  if (finalizeErr) {
                    logger.error("Error finalizing statement", { error: finalizeErr.message });
                    reject(finalizeErr);
                  } else {
                    logger.info("Database operations completed", { processedCount: totalCount });
                    db.close((closeErr) => {
                      if (closeErr) {
                        logger.error("Error closing database", { error: closeErr.message });
                        reject(closeErr);
                      } else {
                        resolve();
                      }
                    });
                  }
                });
              }
            });
          });
        });
      }
    );
  });
}