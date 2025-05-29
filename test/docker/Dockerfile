# Use Node.js 20 Alpine for a lightweight, fresh environment
FROM node:20-alpine

# Install git and other dependencies that the CLI might need
RUN apk add --no-cache git curl bash

# Create a working directory for testing
WORKDIR /test

# Create a non-root user for more realistic testing
RUN addgroup -g 1001 -S testuser && \
    adduser -S testuser -u 1001 -G testuser

# Copy package files and build the CLI from repository root
COPY package*.json pnpm-lock.yaml ./
COPY tsconfig.json ./
COPY src/ ./src/
COPY bin/ ./bin/
COPY test/verify-setup.js ./

# Install dependencies and build
RUN npm ci
RUN npm run build

# Install the CLI globally for testing
RUN npm install -g .

# Switch to non-root user
USER testuser

# Configure npm for the testuser to avoid permission issues
RUN mkdir -p /home/testuser/.npm-global && \
    npm config set prefix '/home/testuser/.npm-global'

# Set up PATH to include user's global npm binaries
ENV PATH="/home/testuser/.npm-global/bin:$PATH"

# Configure git identity for the test user
RUN git config --global user.name "Volo Test User" && \
    git config --global user.email "test@volo-app.local"

# Set working directory for CLI usage
WORKDIR /home/testuser/projects

# Create a simple test script
RUN echo '#!/bin/bash' > /home/testuser/test-cli.sh && \
    echo 'echo "=== Testing create-volo-app CLI ==="' >> /home/testuser/test-cli.sh && \
    echo 'echo "Node version: $(node --version)"' >> /home/testuser/test-cli.sh && \
    echo 'echo "NPM version: $(npm --version)"' >> /home/testuser/test-cli.sh && \
    echo 'echo "Git version: $(git --version)"' >> /home/testuser/test-cli.sh && \
    echo 'echo "Git user: $(git config user.name) <$(git config user.email)>"' >> /home/testuser/test-cli.sh && \
    echo 'echo ""' >> /home/testuser/test-cli.sh && \
    echo 'echo "Testing CLI availability:"' >> /home/testuser/test-cli.sh && \
    echo 'which create-volo-app' >> /home/testuser/test-cli.sh && \
    echo 'echo ""' >> /home/testuser/test-cli.sh && \
    echo 'echo "Testing CLI help:"' >> /home/testuser/test-cli.sh && \
    echo 'echo ""' >> /home/testuser/test-cli.sh && \
    echo 'echo "Available for interactive testing..."' >> /home/testuser/test-cli.sh && \
    chmod +x /home/testuser/test-cli.sh

# Default command runs the test script and then gives you a shell
CMD ["/home/testuser/test-cli.sh"] 