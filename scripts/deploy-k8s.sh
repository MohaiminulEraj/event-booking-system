#!/bin/bash

echo "☸️  Deploying to Kubernetes..."

# Get the directory of this script and set project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Create namespace
kubectl apply -f "$PROJECT_ROOT/k8s/namespace.yaml"

# Deploy infrastructure
kubectl apply -f "$PROJECT_ROOT/k8s/postgres-deployment.yaml"
kubectl apply -f "$PROJECT_ROOT/k8s/redis-deployment.yaml"
kubectl apply -f "$PROJECT_ROOT/k8s/nats-deployment.yaml"

# Wait for infrastructure
echo "⏳ Waiting for infrastructure..."
kubectl wait --for=condition=ready pod -l app=postgres -n event-booking --timeout=300s
kubectl wait --for=condition=ready pod -l app=redis -n event-booking --timeout=300s
kubectl wait --for=condition=ready pod -l app=nats -n event-booking --timeout=300s

# Deploy microservices
kubectl apply -f "$PROJECT_ROOT/k8s/api-gateway-deployment.yaml"
kubectl apply -f "$PROJECT_ROOT/k8s/user-service-deployment.yaml"
kubectl apply -f "$PROJECT_ROOT/k8s/event-service-deployment.yaml"
kubectl apply -f "$PROJECT_ROOT/k8s/booking-service-deployment.yaml"
kubectl apply -f "$PROJECT_ROOT/k8s/notification-service-deployment.yaml"

# Deploy ingress
kubectl apply -f "$PROJECT_ROOT/k8s/ingress.yaml"

echo "✅ Kubernetes deployment complete!"
echo "🌐 Access via: minikube service api-gateway-service --url -n event-booking"
