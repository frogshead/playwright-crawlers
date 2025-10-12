# playwright-crawlers

Getting started project for playwright and typescript learning

## Local Development

Start listening changes and run when saved:

```bash
npm run start:dev
```
or single crawler:

```bash
npx ts-node src/tori_crawler.ts
npx ts-node src/tavastia_crawler.ts
npx ts-node src/krapinpaja_crawler.ts
npx ts-node src/mol_crawler.ts
npx ts-node src/duunitori_crawler.ts
```

### Command Line Options

All crawlers support the following command-line flags:

#### `--open` Flag
Automatically opens newly discovered URLs in your default browser:

```bash
# Open new URLs in browser while crawling
npx ts-node src/tori_crawler.ts --open
npx ts-node src/mol_crawler.ts --open
npx ts-node src/duunitori_crawler.ts --open

# Or with compiled version
npm run build
node build/tori_crawler.js --open
node build/mol_crawler.js --open
npm run start:duunitori -- --open
```

**Note:** Only new URLs (not already in database) will be opened in the browser.

#### `--no-store` Flag
Skips database storage entirely. Useful for testing or previewing results without saving them:

```bash
# Preview URLs without storing (dry run)
npx ts-node src/tori_crawler.ts --no-store

# Preview AND open URLs in browser without storing
npx ts-node src/mol_crawler.ts --no-store --open
npx ts-node src/tavastia_crawler.ts --no-store --open
```

**Use cases:**
- **Testing:** Preview results without polluting the database
- **Browsing:** Quickly open all found URLs without storing or sending notifications
- **Development:** Test crawler functionality without side effects

**Note:** When using `--no-store`, no Telegram notifications will be sent.

#### Custom Search Terms

The search-based crawlers (`tori_crawler`, `mol_crawler`, and `duunitori_crawler`) support custom search terms via command-line arguments. Any non-flag arguments are treated as search terms, overriding the hardcoded defaults.

```bash
# Single custom search term
npx ts-node src/tori_crawler.ts "thinkpad"
npx ts-node src/mol_crawler.ts "python developer"
npx ts-node src/duunitori_crawler.ts "data scientist"

# Multiple custom search terms
npx ts-node src/tori_crawler.ts "arduino" "raspberry pi" "esp32"
npx ts-node src/mol_crawler.ts "python" "golang" "rust" "typescript"
npx ts-node src/duunitori_crawler.ts "react" "vue" "angular"

# Combine with flags
npx ts-node src/tori_crawler.ts --open "macbook"
npx ts-node src/mol_crawler.ts --no-store --open "devops" "kubernetes"
npx ts-node src/duunitori_crawler.ts --no-store "full stack developer"

# With compiled version
npm run build
node build/tori_crawler.js "genelec"
node build/mol_crawler.js --open "react developer" "vue developer"
node build/duunitori_crawler.js --no-store --open "backend developer"
```

**Benefits:**
- **Flexibility:** Search for any terms without modifying source code
- **One-off searches:** Quick searches without permanent configuration changes
- **Testing:** Test specific search terms easily
- **Automation:** Integrate with scripts and automated workflows

**Note:** If no custom search terms are provided, the crawlers use their default hardcoded search terms.

## Running with Docker

### Prerequisites
- Docker and Docker Compose installed on your system

### Setup
1. Copy the environment variables template:
   ```bash
   cp env.example .env
   ```

2. Edit the `.env` file with your actual values:
   ```bash
   nano .env
   ```

### Building and Running

Build the Docker image:
```bash
docker-compose build
```

Run the default crawler (tori_crawler):
```bash
docker-compose up
```

To run a specific crawler, modify the command in docker-compose.yml or run:
```bash
docker-compose run --rm crawler node build/tavastia_crawler.js

# With --open flag to open URLs in browser (requires X11 forwarding or browser in container)
docker-compose run --rm crawler node build/tori_crawler.js --open

# Preview results without storing (dry run)
docker-compose run --rm crawler node build/mol_crawler.js --no-store

# Preview and open URLs without storing
docker-compose run --rm crawler node build/tori_crawler.js --no-store --open

# With custom search terms
docker-compose run --rm crawler node build/tori_crawler.js "thinkpad"
docker-compose run --rm crawler node build/mol_crawler.js "python" "golang"
docker-compose run --rm crawler node build/duunitori_crawler.js "data scientist"

# Combine custom terms with flags
docker-compose run --rm crawler node build/tori_crawler.js --no-store "macbook"
docker-compose run --rm crawler node build/mol_crawler.js --open "devops engineer"
docker-compose run --rm crawler node build/duunitori_crawler.js --no-store --open "full stack"
```

**Note:** The `--open` flag may not work properly in Docker containers without proper display configuration.

### Running in Background
```bash
docker-compose up -d
```

### Viewing Logs
```bash
docker-compose logs -f
```


