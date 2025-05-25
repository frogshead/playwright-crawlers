FROM mcr.microsoft.com/playwright:v1.23.1-focal

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy project files
COPY . .

# Install Playwright browsers
RUN npx playwright install --with-deps chromium

# Build TypeScript code
RUN npm install -g typescript
RUN tsc

# Create a volume for persistent data
VOLUME [ "/app/data" ]

# Add environment variables (these can be overridden at runtime)
ENV NODE_ENV=production

# Command to run the app
CMD ["node", "build/tori_crawler.js"]
