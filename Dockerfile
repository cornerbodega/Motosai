FROM node:18-alpine
WORKDIR /app

# Copy server package files and install dependencies
COPY server/package*.json ./
RUN npm install --production

# Copy all server files
COPY server/ ./

# Copy built client dist files to the location server expects
COPY client/dist ./client/dist

# Expose port 8080 for Cloud Run
EXPOSE 8080

# Start the server
CMD ["node", "server.js"]
