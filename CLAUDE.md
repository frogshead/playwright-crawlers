# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript-based web scraping project using Playwright for crawling various Finnish e-commerce and marketplace sites. The crawlers search for specific items and notify via Telegram when new listings are found. Each crawler targets a different website (tori.fi, tavastia.fi, krapinpaja.fi, etc.) and stores URLs in a SQLite database to avoid duplicate notifications.

## Architecture

- **Individual Crawlers**: Each `*_crawler.ts` file implements site-specific scraping logic using Playwright
- **Shared Utilities**: `utils.ts` contains database operations and Telegram notification functionality
- **Database**: SQLite database stores unique URLs to prevent duplicate notifications
- **Notifications**: Telegram bot integration for real-time notifications of new listings
- **Environment**: Supports both local development and Docker deployment

## Development Commands

### Local Development
```bash
# Start development with file watching (runs tori_crawler by default)
npm run start:dev

# Run specific crawler manually
npx ts-node src/tori_crawler.ts
npx ts-node src/tavastia_crawler.ts
npx ts-node src/krapinpaja_crawler.ts
npx ts-node src/mol_crawler.ts
# ... (similar for fillaritori, theseus crawlers)

# Build TypeScript to JavaScript
npm run build

# Run compiled version
npm start
npm run start:mol

# Run in headed mode (with browser window visible for debugging)
# Edit the crawler file and change `const HEADLESS = true` to `const HEADLESS = false`
# Then run normally - useful for debugging search form interactions
```

### Docker Development
```bash
# Setup environment
cp env.example .env
# Edit .env with actual values

# Build and run
docker-compose build
docker-compose up

# Run specific crawler in Docker
docker-compose run --rm crawler node build/tavastia_crawler.js

# Background execution
docker-compose up -d
docker-compose logs -f
```

## Environment Configuration

Required environment variables in `.env`:
- `TELEGRAM_API_KEY`: Bot token for Telegram notifications
- `TELEGRAM_CHAT_ID`: Target chat for notifications
- `NODE_ENV`: Set to 'production' in Docker to use `/app/data/` path for database

## Key Implementation Details

- **Database Path**: Changes based on NODE_ENV (local: `./tori.db`, production: `./data/tori.db`)
- **Crawler Pattern**: Each crawler implements search logic for predefined items arrays
- **Headless Browsing**: Playwright runs in headless mode for production use
- **Error Handling**: Basic error handling for database operations and missing search results
- **Rate Limiting**: Built-in delays between operations to avoid overwhelming target sites

## Testing

Tests are located in `src/tests/` using Playwright test framework:
```bash
# Test files follow *.spec.ts pattern
# Run with standard Playwright test commands
```

## Docker Configuration

- Base image: `mcr.microsoft.com/playwright:v1.23.1-focal`
- Volume mount: `/app/data` for persistent database storage
- Default command runs `tori_crawler.js`
- Includes Chromium browser installation for Playwright

## TODO:
- Update used libraries to latest versions,test compatibility and fix any issues
- Add mol.fi crawler implementation. Search job openings for "ohjelmistokehittäjä", "developer", "software", "rust", "embedded", "devops", "test automation", use web-researcher agent to do access and parsing the job openings.
- Fix telegram notification implementation to respect rate limits and avoid being blocked. We should not see anymore "Unhandled rejection Error: ETELEGRAM: 429 Too Many Requests: retry after 4" errors.
- Add unit tests for utility functions
- Optimize database queries
- Improve logging and monitoring