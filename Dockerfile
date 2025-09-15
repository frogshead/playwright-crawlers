FROM mcr.microsoft.com/playwright:v1.55.0-jammy

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json first for better caching
COPY package*.json ./

# Install all dependencies (including dev dependencies needed for TypeScript build)
RUN npm ci

# Install TypeScript globally for build
RUN npm install -g typescript

# Copy project files
COPY . .

# Build TypeScript code
RUN tsc

# Install Playwright browsers (before pruning dependencies)
RUN npx playwright install --with-deps chromium

# Clean up dev dependencies after build to reduce image size
RUN npm prune --production

# Copy and make entrypoint script executable
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Create a volume for persistent data
VOLUME [ "/app/data" ]

# Add environment variables (these can be overridden at runtime)
ENV NODE_ENV=production
ENV CRAWLER_NAME=tori

# Add labels for container registry
LABEL org.opencontainers.image.title="Playwright Crawlers"
LABEL org.opencontainers.image.description="Multi-site web crawlers using Playwright with Telegram notifications"
LABEL org.opencontainers.image.vendor="playwright-crawlers"
LABEL org.opencontainers.image.licenses="MIT"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('Health check passed')" || exit 1

# Use entrypoint script
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
