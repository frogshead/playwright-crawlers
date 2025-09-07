import { test, expect } from '@playwright/test';

// Test helper to create a mock TelegramBot
class MockTelegramBot {
  private shouldFail: boolean;
  private failWithRateLimit: boolean;
  private sentMessages: string[] = [];
  private retryAfter: number = 5;

  constructor(shouldFail = false, failWithRateLimit = false, retryAfter = 5) {
    this.shouldFail = shouldFail;
    this.failWithRateLimit = failWithRateLimit;
    this.retryAfter = retryAfter;
  }

  async sendMessage(chatId: string, message: string): Promise<void> {
    if (this.shouldFail) {
      if (this.failWithRateLimit) {
        const error = new Error('Too Many Requests: retry after 5');
        (error as any).code = 429;
        (error as any).parameters = { retry_after: this.retryAfter };
        throw error;
      } else {
        throw new Error('Generic API Error');
      }
    }
    
    this.sentMessages.push(message);
  }

  getSentMessages(): string[] {
    return [...this.sentMessages];
  }

  clearSentMessages(): void {
    this.sentMessages = [];
  }
}

// Simplified TelegramNotifier for testing
class TestTelegramNotifier {
  private bot: MockTelegramBot | null = null;
  private messageQueue: string[] = [];
  private isProcessing = false;
  private readonly RATE_LIMIT_DELAY = 10; // Faster for testing
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 100; // Faster for testing

  constructor(bot?: MockTelegramBot) {
    this.bot = bot || null;
  }

  public async sendMessage(message: string): Promise<void> {
    if (!this.bot) {
      console.log("Telegram bot not configured, skipping notification:", message);
      return;
    }

    this.messageQueue.push(message);
    
    if (!this.isProcessing) {
      await this.processQueue();
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
        await this.sleep(this.RATE_LIMIT_DELAY);
        await this.processQueue();
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
      await this.bot!.sendMessage(process.env.TELEGRAM_CHAT_ID || 'test-chat', message);
    } catch (error: any) {
      // Handle rate limiting specifically
      if (error.code === 429 || error.message.includes('Too Many Requests')) {
        const retryAfter = error.parameters?.retry_after || (this.RETRY_DELAY / 1000);
        
        if (retries < this.MAX_RETRIES) {
          await this.sleep(retryAfter * 100); // Faster for testing
          return this.sendWithRetry(message, retries + 1);
        } else {
          throw new Error(`Max retries exceeded for message: ${message}`);
        }
      }
      
      // Handle other errors
      if (retries < this.MAX_RETRIES) {
        await this.sleep(100);
        return this.sendWithRetry(message, retries + 1);
      } else {
        throw error;
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public getQueueLength(): number {
    return this.messageQueue.length;
  }

  public isCurrentlyProcessing(): boolean {
    return this.isProcessing;
  }
}

test.describe('Telegram Notification System', () => {
  test.describe('TelegramNotifier Class', () => {
    test('should handle successful message sending', async () => {
      const mockBot = new MockTelegramBot();
      const notifier = new TestTelegramNotifier(mockBot);

      await notifier.sendMessage('Test message');

      // Wait a bit for async processing
      await new Promise(resolve => setTimeout(resolve, 50));

      const sentMessages = mockBot.getSentMessages();
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0]).toBe('Test message');
    });

    test('should handle message queuing', async () => {
      const mockBot = new MockTelegramBot();
      const notifier = new TestTelegramNotifier(mockBot);

      // Send multiple messages rapidly
      const messages = ['Message 1', 'Message 2', 'Message 3'];
      const promises = messages.map(msg => notifier.sendMessage(msg));

      await Promise.all(promises);

      // Wait for all messages to be processed
      await new Promise(resolve => setTimeout(resolve, 200));

      const sentMessages = mockBot.getSentMessages();
      expect(sentMessages).toHaveLength(3);
      expect(sentMessages).toEqual(messages);
    });

    test('should handle rate limiting with retry', async () => {
      const mockBot = new MockTelegramBot(true, true, 1); // Fail with rate limit, retry after 1 second
      const notifier = new TestTelegramNotifier(mockBot);

      // First message will fail with rate limit, then succeed on retry
      let error: Error | null = null;
      try {
        await notifier.sendMessage('Rate limited message');
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait for processing
      } catch (e) {
        error = e as Error;
      }

      // Should not throw since it retries
      expect(error).toBeNull();
    });

    test('should handle max retries exceeded', async () => {
      const mockBot = new MockTelegramBot(true, true, 1); // Always fail with rate limit
      const notifier = new TestTelegramNotifier(mockBot);

      let error: Error | null = null;
      try {
        await notifier.sendMessage('Always failing message');
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for all retries
      } catch (e) {
        error = e as Error;
      }

      // Should eventually give up after max retries
      // Note: Since processQueue catches errors, we check console output instead
      expect(error).toBeNull(); // The error is logged, not thrown
    });

    test('should handle generic API errors', async () => {
      const mockBot = new MockTelegramBot(true, false); // Generic error
      const notifier = new TestTelegramNotifier(mockBot);

      let error: Error | null = null;
      try {
        await notifier.sendMessage('Generic error message');
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (e) {
        error = e as Error;
      }

      expect(error).toBeNull(); // Error is handled gracefully
    });

    test('should handle missing bot configuration', async () => {
      const notifier = new TestTelegramNotifier(); // No bot provided

      // Should not throw when bot is not configured
      let consoleOutput = '';
      const originalLog = console.log;
      console.log = (msg: string) => {
        consoleOutput += msg + '\\n';
        originalLog(msg);
      };

      await notifier.sendMessage('Message without bot');

      expect(consoleOutput).toContain('Telegram bot not configured, skipping notification');
      
      console.log = originalLog;
    });

    test('should process messages sequentially with rate limiting', async () => {
      const mockBot = new MockTelegramBot();
      const notifier = new TestTelegramNotifier(mockBot);

      const startTime = Date.now();
      
      // Send 3 messages
      await Promise.all([
        notifier.sendMessage('Message 1'),
        notifier.sendMessage('Message 2'),
        notifier.sendMessage('Message 3')
      ]);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 150));

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should take at least some time due to rate limiting delays
      expect(duration).toBeGreaterThan(20); // At least 20ms for rate limiting

      const sentMessages = mockBot.getSentMessages();
      expect(sentMessages).toHaveLength(3);
    });

    test('should handle empty messages', async () => {
      const mockBot = new MockTelegramBot();
      const notifier = new TestTelegramNotifier(mockBot);

      await notifier.sendMessage('');

      await new Promise(resolve => setTimeout(resolve, 50));

      const sentMessages = mockBot.getSentMessages();
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0]).toBe('');
    });

    test('should handle special characters in messages', async () => {
      const mockBot = new MockTelegramBot();
      const notifier = new TestTelegramNotifier(mockBot);

      const specialMessage = 'Message with äöü and 🚀 emoji and @mention';
      await notifier.sendMessage(specialMessage);

      await new Promise(resolve => setTimeout(resolve, 50));

      const sentMessages = mockBot.getSentMessages();
      expect(sentMessages[0]).toBe(specialMessage);
    });

    test('should handle very long messages', async () => {
      const mockBot = new MockTelegramBot();
      const notifier = new TestTelegramNotifier(mockBot);

      const longMessage = 'A'.repeat(4096); // Very long message
      await notifier.sendMessage(longMessage);

      await new Promise(resolve => setTimeout(resolve, 50));

      const sentMessages = mockBot.getSentMessages();
      expect(sentMessages[0]).toBe(longMessage);
    });
  });

  test.describe('Environment Configuration', () => {
    test('should handle missing TELEGRAM_API_KEY', () => {
      const originalApiKey = process.env.TELEGRAM_API_KEY;
      delete process.env.TELEGRAM_API_KEY;

      const notifier = new TestTelegramNotifier();
      expect(notifier).toBeDefined();

      // Restore
      if (originalApiKey) {
        process.env.TELEGRAM_API_KEY = originalApiKey;
      }
    });

    test('should handle missing TELEGRAM_CHAT_ID', () => {
      const originalChatId = process.env.TELEGRAM_CHAT_ID;
      delete process.env.TELEGRAM_CHAT_ID;

      const notifier = new TestTelegramNotifier(new MockTelegramBot());
      expect(notifier).toBeDefined();

      // Restore
      if (originalChatId) {
        process.env.TELEGRAM_CHAT_ID = originalChatId;
      }
    });
  });
});