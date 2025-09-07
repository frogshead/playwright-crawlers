# playwright-crawlers

Getting started project for playwright and typescript learning

## Local Development

Start listening changes and run when saved:

```bash
npm run start:dev
```
or single crawler:

```bash
npx ts-node src/tori_crawler.ts;
npx ts-node src/tavastia_crawler.ts;
npx ts-node src/krapinpaja_crawler.ts;
```

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
```

### Running in Background
```bash
docker-compose up -d
```

### Viewing Logs
```bash
docker-compose logs -f
```


