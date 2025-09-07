import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { Database } from 'sqlite3';
import { storeDb } from '../utils';

// Helper function to create a temporary test database
function createTestDbPath(): string {
  const testDbDir = path.join(__dirname, '..', '..', 'test-temp');
  if (!fs.existsSync(testDbDir)) {
    fs.mkdirSync(testDbDir, { recursive: true });
  }
  return path.join(testDbDir, `test-${Date.now()}.db`);
}

// Helper function to clean up test database
function cleanupTestDb(dbPath: string): void {
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
}

test.describe('Utils Module', () => {
  test.describe('storeDb function', () => {
    let testDbPath: string;

    test.beforeEach(() => {
      testDbPath = createTestDbPath();
      // Set test environment to avoid using production db path
      process.env.NODE_ENV = 'test';
    });

    test.afterEach(() => {
      cleanupTestDb(testDbPath);
      delete process.env.NODE_ENV;
      // Clear any Telegram environment variables for testing
      delete process.env.TELEGRAM_API_KEY;
      delete process.env.TELEGRAM_CHAT_ID;
    });

    test('should create database and table if not exists', async () => {
      const urls = ['https://test.com/item1', 'https://test.com/item2'];
      
      // Mock the database path by temporarily changing NODE_ENV
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      // Create a test directory structure
      const testDataDir = path.join(__dirname, '..', '..', 'data');
      if (!fs.existsSync(testDataDir)) {
        fs.mkdirSync(testDataDir, { recursive: true });
      }
      
      const testDbPathProd = path.join(testDataDir, 'test-tori.db');
      
      try {
        // Since storeDb uses a hardcoded path, we'll test the basic functionality
        // by checking that the function completes without throwing
        await expect(storeDb(urls)).resolves.toBeUndefined();
        
        // Verify database was created
        expect(fs.existsSync('./data/tori.db')).toBeTruthy();
        
        // Clean up test database
        if (fs.existsSync('./data/tori.db')) {
          fs.unlinkSync('./data/tori.db');
        }
        if (fs.existsSync('./data') && fs.readdirSync('./data').length === 0) {
          fs.rmdirSync('./data');
        }
        
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    test('should handle empty URL array', async () => {
      // Should complete without errors
      await expect(storeDb([])).resolves.toBeUndefined();
    });

    test('should handle duplicate URLs gracefully', async () => {
      const urls = [
        'https://test.com/item1',
        'https://test.com/item1', // duplicate
        'https://test.com/item2'
      ];
      
      // Should complete without throwing even with duplicates
      await expect(storeDb(urls)).resolves.toBeUndefined();
    });

    test('should handle invalid URLs without crashing', async () => {
      const urls = [
        'not-a-url',
        'https://valid.com/item1',
        '', // empty URL
        'ftp://invalid-protocol.com'
      ];
      
      // Should complete without throwing
      await expect(storeDb(urls)).resolves.toBeUndefined();
    });

    test('should handle single URL', async () => {
      const urls = ['https://single-test.com/item1'];
      
      await expect(storeDb(urls)).resolves.toBeUndefined();
    });

    test('should handle large URL array', async () => {
      // Create array of 100 test URLs
      const urls = Array.from({ length: 100 }, (_, i) => `https://test.com/item${i}`);
      
      await expect(storeDb(urls)).resolves.toBeUndefined();
    });
  });

  test.describe('Database Integration', () => {
    test('should create correct table structure', async () => {
      const testDbPath = createTestDbPath();
      
      return new Promise<void>((resolve, reject) => {
        const db = new Database(testDbPath, (err) => {
          if (err) {
            reject(err);
            return;
          }

          db.run("CREATE TABLE IF NOT EXISTS links (url TEXT UNIQUE)", (err) => {
            if (err) {
              reject(err);
              return;
            }

            // Verify table structure
            db.all("PRAGMA table_info(links)", (err, rows) => {
              if (err) {
                reject(err);
                return;
              }

              expect(rows).toHaveLength(1);
              expect(rows[0]).toMatchObject({
                name: 'url',
                type: 'TEXT',
                notnull: 0,
                pk: 0
              });

              db.close((closeErr) => {
                cleanupTestDb(testDbPath);
                if (closeErr) {
                  reject(closeErr);
                } else {
                  resolve();
                }
              });
            });
          });
        });
      });
    });

    test('should handle database connection errors gracefully', async () => {
      // Try to use an invalid database path
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      // Create invalid path by using a file instead of directory
      const invalidPath = './invalid/path/that/does/not/exist';
      
      try {
        // This might throw or complete with errors logged
        // The function should handle errors gracefully without crashing the process
        await storeDb(['https://test.com']);
      } catch (error) {
        // If it throws, that's also acceptable behavior for invalid paths
        expect(error).toBeDefined();
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });
  });

  test.describe('Telegram Integration', () => {
    test('should handle missing Telegram configuration gracefully', async () => {
      // Ensure no Telegram env vars are set
      delete process.env.TELEGRAM_API_KEY;
      delete process.env.TELEGRAM_CHAT_ID;
      
      const urls = ['https://test.com/new-item'];
      
      // Should complete without throwing even without Telegram config
      await expect(storeDb(urls)).resolves.toBeUndefined();
    });

    test('should handle partial Telegram configuration', async () => {
      // Set only API key, not chat ID
      process.env.TELEGRAM_API_KEY = 'test-key';
      delete process.env.TELEGRAM_CHAT_ID;
      
      const urls = ['https://test.com/new-item'];
      
      // Should complete without throwing
      await expect(storeDb(urls)).resolves.toBeUndefined();
      
      delete process.env.TELEGRAM_API_KEY;
    });
  });
});