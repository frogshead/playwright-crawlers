import { Database, OPEN_CREATE, OPEN_READWRITE } from "sqlite3";

export function greet(name:string) {
    console.log("hello " + name +  " there!");
}

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
        console.log("Telegram bot initialized successfully");
      } catch (error) {
        console.error("Failed to initialize Telegram bot:", error);
        this.bot = null;
      }
    } else {
      console.log("TELEGRAM_API_KEY not found in environment variables");
    }
  }

  public async sendMessage(message: string): Promise<void> {
    if (!this.bot) {
      console.log("Telegram bot not configured, skipping notification:", message);
      
      return;
    }
    if (!process.env.TELEGRAM_CHAT_ID) {
      console.log("Telegram chat ID not configured, skipping notification:", message);
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
      console.error("Failed to send Telegram message after retries:", message, error);
      this.isProcessing = false;
    }
  }

  private async sendWithRetry(message: string, retries: number = 0): Promise<void> {
    try {
      await this.bot.sendMessage(process.env.TELEGRAM_CHAT_ID, message);
      console.log("Telegram notification sent:", message);
    } catch (error: any) {
      console.error("Telegram API error:", error.message);
      
      // Handle rate limiting specifically
      if (error.code === 429 || error.message.includes('Too Many Requests')) {
        const retryAfter = error.parameters?.retry_after || (this.RETRY_DELAY / 1000);
        console.log(`Rate limited, waiting ${retryAfter} seconds before retry...`);
        
        if (retries < this.MAX_RETRIES) {
          await sleep(retryAfter * 1000);
          return this.sendWithRetry(message, retries + 1);
        } else {
          throw new Error(`Max retries exceeded for message: ${message}`);
        }
      }
      
      // Handle other errors
      if (retries < this.MAX_RETRIES) {
        console.log(`Retrying message send (attempt ${retries + 1}/${this.MAX_RETRIES})`);
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

export async function storeDb(urls: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    // Store database in data directory for persistence in Docker
    const dbPath = process.env.NODE_ENV === 'production' ? './data/tori.db' : './tori.db';
    const db = new Database(dbPath,
      OPEN_READWRITE | OPEN_CREATE,
      (err) => {
        if (err) {
          console.log("Database connection error:", err.message);
          reject(err);
          return;
        }

        console.log("Connected to Database");
        db.run("CREATE TABLE IF NOT EXISTS links (url TEXT UNIQUE)", (err) => {
          if (err) {
            console.error("Error creating table:", err.message);
            reject(err);
            return;
          }

          const stmt = db.prepare("INSERT INTO links VALUES (?)");
          let processedCount = 0;
          const totalCount = urls.length;

          if (totalCount === 0) {
            console.log("No URLs to process");
            resolve();
            return;
          }

          urls.forEach((url) => {
            stmt.run(url, async (err) => {
              processedCount++;
              
              if (err) {
                console.log("Database error:", err.message);
                console.log("URL already in database:", url);
              } else {
                console.log("Added new URL to database:", url);
                
                // Send notification for new URLs only using rate-limited system
                try {
                  await getTelegramNotifier().sendMessage(url);
                } catch (telegramError) {
                  console.error("Failed to send Telegram notification for:", url, telegramError);
                }
              }

              // Check if all URLs have been processed
              if (processedCount === totalCount) {
                stmt.finalize((finalizeErr) => {
                  if (finalizeErr) {
                    console.error("Error finalizing statement:", finalizeErr.message);
                    reject(finalizeErr);
                  } else {
                    console.log(`Database operations completed. Processed ${totalCount} URLs.`);
                    db.close((closeErr) => {
                      if (closeErr) {
                        console.error("Error closing database:", closeErr.message);
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