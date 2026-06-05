# Dockerfile
FROM node:20-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy package dependency definitions
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy the rest of the application files
COPY . .

# Expose the application port
EXPOSE 3000

# Define start command
CMD ["npm", "start"]
