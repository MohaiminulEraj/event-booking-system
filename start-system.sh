#!/bin/bash

echo "🚀 Starting Event Booking System..."

# Create required networks
echo "📡 Creating Docker networks..."
docker network create event-booking-network 2>/dev/null || echo "Network already exists"

# Start infrastructure services first
echo "🗄️ Starting infrastructure services..."
docker compose up -d postgres redis nats

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check if database is ready
echo "🔍 Checking database connection..."
while ! docker compose exec -T postgres pg_isready -U postgres; do
  echo "Waiting for PostgreSQL..."
  sleep 2
done

# Initialize database if needed
echo "🗄️ Initializing database..."
docker compose exec -T postgres psql -U postgres -d event_booking -f /docker-entrypoint-initdb.d/init.sql || echo "Database already initialized"

# Start all services
echo "🎪 Starting all microservices..."
docker compose up -d

# Wait a bit for services to start
sleep 5

# Check service health
echo "🩺 Checking service health..."
services=("api-gateway:3000" "user-service:3001" "event-service:3002" "booking-service:3003" "notification-service:3004")

for service in "${services[@]}"; do
  service_name=$(echo $service | cut -d: -f1)
  port=$(echo $service | cut -d: -f2)

  echo "Checking $service_name on port $port..."

  # Try to connect to the service
  timeout=30
  while [ $timeout -gt 0 ]; do
    if curl -s http://localhost:$port/health >/dev/null 2>&1; then
      echo "✅ $service_name is healthy"
      break
    else
      echo "⏳ Waiting for $service_name..."
      sleep 2
      timeout=$((timeout - 2))
    fi
  done

  if [ $timeout -le 0 ]; then
    echo "❌ $service_name failed to start properly"
  fi
done

echo "
🎉 Event Booking System is running!

📊 Service URLs:
• API Gateway:        http://localhost:3000
• User Service:       http://localhost:3001
• Event Service:      http://localhost:3002
• Booking Service:    http://localhost:3003
• Notification Service: http://localhost:3004

📚 API Documentation:
• Swagger UI:         http://localhost:3000/docs
• Health Checks:      http://localhost:3000/health/all

🗄️ Infrastructure:
• PostgreSQL:         localhost:5432 (postgres/postgres)
• Redis:              localhost:6379
• NATS:               localhost:4222

📋 Quick Commands:
• View logs:          docker compose logs -f
• Stop system:        docker compose down
• Restart service:    docker compose restart [service-name]
• View status:        docker compose ps

💡 Test the system:
curl -X GET http://localhost:3000/health/all
curl -X GET http://localhost:3000/api/users
"
