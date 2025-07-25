# Event Booking System - Microservices Edition

A production-ready microservices-based event booking system built with NestJS, featuring Redis caching, NATS message queuing, PostgreSQL database, and Kubernetes deployment.

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   API Gateway   │────│     Redis        │────│   Rate Limiter  │
│   Port: 3000    │    │   (Caching +     │    │ (100 req/min)   │
└─────────────────┘    │   Rate Limit)    │    └─────────────────┘
         │              └──────────────────┘
         │
    ┌────┼────┐
    │         │
┌───▼───┐ ┌───▼───┐ ┌─────▼─────┐ ┌─────▼─────┐
│ User  │ │ Event │ │  Booking  │ │Notification│
│Service│ │Service│ │  Service  │ │  Service  │
│:3001  │ │:3002  │ │   :3003   │ │   :3004   │
└───┬───┘ └───┬───┘ └─────┬─────┘ └─────┬─────┘
    │         │           │             │
    └─────────┼───────────┼─────────────┘
              │           │
         ┌────▼────┐ ┌────▼────┐
         │PostgreSQL│ │  NATS   │
         │  :5432   │ │ :4222   │
         └─────────┘ └─────────┘
```

## 🚀 Services

### 1. API Gateway (Port 3000)

- **Purpose**: Single entry point for all client requests
- **Features**:
  - Request routing to microservices
  - Redis-based rate limiting
  - Request/response transformation
  - Health checks aggregation
  - Swagger API documentation

### 2. User Service (Port 3001)

- **Purpose**: User management and authentication
- **Features**:
  - CRUD operations for users
  - Email validation and uniqueness
  - User profile management

### 3. Event Service (Port 3002)

- **Purpose**: Event management and caching
- **Features**:
  - CRUD operations for events
  - Redis caching for frequently accessed events
  - Seat availability management

### 4. Booking Service (Port 3003)

- **Purpose**: Seat booking with race condition handling
- **Features**:
  - Race-condition-safe booking logic
  - Atomic seat reservation
  - NATS message publishing for booking confirmations
  - Integration with User and Event services

### 5. Notification Service (Port 3004)

- **Purpose**: Handle booking notifications
- **Features**:
  - NATS message consumption
  - Booking confirmation storage
  - Notification history tracking

## 📋 Prerequisites

- Node.js 18+
- Docker & Docker Compose
- Minikube (for Kubernetes deployment)
- kubectl
- PostgreSQL client (optional)
- Redis client (optional)

## � Quick Start

### Option 1: One-Command Startup (Recommended)

```bash
# Clone or navigate to the project directory
cd event-booking-system

# Start the entire system
./start-system.sh

# Test the API
./test-api.sh
```

### Option 2: Manual Step-by-Step

```bash
# 1. Start infrastructure services
docker compose up -d postgres redis nats

# 2. Wait for services to be ready (30 seconds)
sleep 30

# 3. Start all microservices
docker compose up -d

# 4. Check service health
curl http://localhost:3000/health/all
```

### Option 3: Local Development

```bash
# Install dependencies for all services
cd mock-services/api-gateway && npm install && cd ../..
cd mock-services/user-service && npm install && cd ../..
cd mock-services/event-service && npm install && cd ../..
cd mock-services/booking-service && npm install && cd ../..
cd mock-services/notification-service && npm install && cd ../..

# Start infrastructure
docker compose up -d postgres redis nats

# Start services individually (in separate terminals)
cd mock-services/api-gateway && npm start
cd mock-services/user-service && npm start
cd mock-services/event-service && npm start
cd mock-services/booking-service && npm start
cd mock-services/notification-service && npm start
```

### API Documentation

Once services are running, access the documentation:

- **API Gateway**: http://localhost:3000/docs
- **Health Checks**: http://localhost:3000/health/all
- **Individual Services**: Each service has `/health` endpoint

## 🔧 Environment Variables

Create `.env` files for each service or use the defaults in `docker compose.yml`:

```bash
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/event_booking

# Redis
REDIS_URL=redis://localhost:6379

# NATS
NATS_URL=nats://localhost:4222

# Service URLs (for API Gateway)
USER_SERVICE_URL=http://user-service:3001
EVENT_SERVICE_URL=http://event-service:3002
BOOKING_SERVICE_URL=http://booking-service:3003
NOTIFICATION_SERVICE_URL=http://notification-service:3004
```

## 🗄️ Database Schema

### Users Table

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Events Table

```sql
CREATE TABLE events (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    total_seats INTEGER NOT NULL CHECK (total_seats > 0),
    available_seats INTEGER NOT NULL CHECK (available_seats >= 0),
    event_date TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Bookings Table

```sql
CREATE TABLE bookings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    event_id INTEGER NOT NULL REFERENCES events(id),
    seats_booked INTEGER NOT NULL CHECK (seats_booked > 0),
    booking_status VARCHAR(50) DEFAULT 'confirmed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Notifications Table

```sql
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    booking_id INTEGER NOT NULL REFERENCES bookings(id),
    message TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'sent',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 🌐 API Endpoints

### API Gateway Routes (http://localhost:3000/api)

#### Users

- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

#### Events

- `GET /api/events` - Get all events
- `GET /api/events/:id` - Get event by ID
- `POST /api/events` - Create new event
- `PUT /api/events/:id` - Update event
- `DELETE /api/events/:id` - Delete event

#### Bookings

- `GET /api/bookings` - Get all bookings
- `GET /api/bookings/:id` - Get booking by ID
- `GET /api/bookings/user/:userId` - Get bookings by user
- `POST /api/bookings` - Create new booking

#### Notifications

- `GET /api/notifications` - Get all notifications
- `GET /api/notifications/booking/:bookingId` - Get notifications by booking

#### Health

- `GET /api/health` - System health status
- `GET /api/health/gateway` - API Gateway health

## 🐳 Docker Commands

```bash
# Build all services
docker compose build

# Start services in background
docker compose up -d

# View logs
docker compose logs -f [service-name]

# Stop services
docker compose down

# Remove volumes (database data)
docker compose down -v

# Rebuild and restart
docker compose up --build -d
```

## ☸️ Kubernetes Deployment

### Prerequisites

```bash
# Start Minikube
minikube start

# Enable required addons
minikube addons enable ingress
minikube addons enable metrics-server
```

### Deploy to Kubernetes

```bash
# Apply all Kubernetes manifests
kubectl apply -f k8s/

# Check pod status
kubectl get pods

# Check services
kubectl get services

# Get Minikube service URLs
minikube service list

# Access API Gateway
minikube service api-gateway-service --url
```

### Kubernetes Resources Created

- Deployments for all 5 services
- Services for internal communication
- ConfigMaps for environment variables
- PersistentVolumes for PostgreSQL data
- Ingress for external access

## 🧪 Testing

### Run Tests

```bash
# Run tests for all services
npm run test

# Run tests for specific service
cd services/user-service
npm test

# Run E2E tests
npm run test:e2e
```

### Manual API Testing

#### 1. Create a User

```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com"
  }'
```

#### 2. Create an Event

```bash
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Tech Conference 2025",
    "description": "Annual technology conference",
    "total_seats": 100,
    "event_date": "2025-08-15T09:00:00Z"
  }'
```

#### 3. Create a Booking

```bash
curl -X POST http://localhost:3000/api/bookings \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 1,
    "event_id": 1,
    "seats_booked": 2
  }'
```

## 🔍 Monitoring and Health Checks

### Health Check Endpoints

- API Gateway: `GET /api/health`
- Individual Services: `GET /health`

### Redis Monitoring

```bash
# Connect to Redis CLI
docker exec -it event-booking-system_redis_1 redis-cli

# Check cached events
KEYS event:*

# Check rate limiting
KEYS rate_limit:*
```

### Database Monitoring

```bash
# Connect to PostgreSQL
docker exec -it event-booking-system_postgres_1 psql -U postgres -d event_booking

# Check tables
\dt

# Check data
SELECT * FROM users;
SELECT * FROM events;
SELECT * FROM bookings;
SELECT * FROM notifications;
```

### NATS Monitoring

```bash
# Check NATS connection
curl http://localhost:8222/varz
```

## 🚀 Bonus Features

### 1. Redis Rate Limiting

- Implemented sliding window rate limiting
- 100 requests per minute per IP
- Custom rate limit headers in responses

### 2. Health Check Endpoints

- Individual service health checks
- Aggregated system health via API Gateway
- Kubernetes liveness and readiness probes

### 3. Blue-Green Deployment Simulation

```bash
# Create new version deployment
kubectl apply -f k8s/blue-green/

# Switch traffic to new version
kubectl patch service api-gateway-service -p '{"spec":{"selector":{"version":"green"}}}'

# Rollback if needed
kubectl patch service api-gateway-service -p '{"spec":{"selector":{"version":"blue"}}}'
```

## 🏗️ Development

### Adding a New Service

1. Create new directory in `services/`
2. Copy package.json structure from existing service
3. Implement NestJS modules, controllers, and services
4. Add service to `docker compose.yml`
5. Create Kubernetes manifests
6. Update API Gateway routing

### Local Development

```bash
# Start dependencies only
docker compose up postgres redis nats -d

# Run services individually
cd services/user-service
npm run start:dev

cd services/event-service
npm run start:dev

# etc...
```

## 🔧 Troubleshooting

### Common Issues

1. **Port conflicts**: Ensure ports 3000-3004, 5432, 6379, 4222 are available
2. **Docker memory**: Increase Docker memory limit to 4GB+
3. **Database connection**: Check if PostgreSQL is running and accessible
4. **Redis connection**: Verify Redis service is healthy
5. **NATS connection**: Ensure NATS server is running

### Debugging

```bash
# Check service logs
docker compose logs user-service

# Check database connectivity
docker exec -it event-booking-system_postgres_1 pg_isready

# Check Redis connectivity
docker exec -it event-booking-system_redis_1 redis-cli ping

# Check NATS connectivity
curl -f http://localhost:8222/healthz
```

## 📖 API Documentation

Complete API documentation is available via Swagger UI at:

- http://localhost:3000/api/docs (API Gateway)

The documentation includes:

- All available endpoints
- Request/response schemas
- Example requests
- Error responses
- Authentication requirements

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

## 📞 Support

For issues and questions:

1. Check the troubleshooting section
2. Review service logs: `docker compose logs [service-name]`
3. Check health endpoints: `GET /api/health`
4. Open an issue in the repository

---

**Built with ❤️ using NestJS, PostgreSQL, Redis, NATS, and Kubernetes**
