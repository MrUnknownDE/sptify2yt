FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy source code
COPY src/ ./src/

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "src/server.js"]
