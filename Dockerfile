# Multi-stage build

# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Backend with frontend static files
FROM node:20-alpine
WORKDIR /app

# Copy backend
COPY backend/package*.json ./
RUN npm install --production

COPY backend/ ./

# Copy frontend build
COPY --from=frontend-build /app/frontend/dist ./public

# Create logs directory
RUN mkdir -p logs

# Expose port
EXPOSE 3001

# Start the application
CMD ["node", "src/index.js"]
