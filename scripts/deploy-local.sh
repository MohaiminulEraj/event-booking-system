#!/bin/bash

echo "🚀 Deploying Event Booking System locally..."

# Build all Docker images
echo "📦 Building Docker images..."
docker compose build

# Start services
echo "🌟 Starting services..."
docker compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 30

# Check health
echo "🏥 Checking service health..."
curl -f http://localhost:3000/api/health || echo "❌ Health check failed"

echo "✅ Deployment complete!"
echo "📚 API Gateway: http://localhost:3000"
echo "📖 Swagger Docs: http://localhost:3000/api/docs"
