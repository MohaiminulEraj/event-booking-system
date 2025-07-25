#!/bin/bash

echo "🧪 Testing Event Booking System API..."

API_BASE="http://localhost:3000/api"

echo "1. Testing health checks..."
curl -s "$API_BASE/../health/all" | jq '.' || echo "Health check failed"

echo -e "\n2. Creating test user..."
USER_RESPONSE=$(curl -s -X POST "$API_BASE/users" \
  -H "Content-Type: application/json" \
  -d '{"name": "John Doe", "email": "john@example.com"}')
echo $USER_RESPONSE | jq '.'
USER_ID=$(echo $USER_RESPONSE | jq -r '.id')

echo -e "\n3. Creating test event..."
EVENT_RESPONSE=$(curl -s -X POST "$API_BASE/events" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Tech Conference 2024",
    "description": "Annual technology conference",
    "date": "2024-12-31T18:00:00Z",
    "venue": "Convention Center",
    "total_seats": 100,
    "price": 99.99
  }')
echo $EVENT_RESPONSE | jq '.'
EVENT_ID=$(echo $EVENT_RESPONSE | jq -r '.id')

echo -e "\n4. Listing all events..."
curl -s "$API_BASE/events" | jq '.'

echo -e "\n5. Creating booking..."
BOOKING_RESPONSE=$(curl -s -X POST "$API_BASE/bookings" \
  -H "Content-Type: application/json" \
  -d "{
    \"user_id\": $USER_ID,
    \"event_id\": $EVENT_ID,
    \"seats_booked\": 2
  }")
echo $BOOKING_RESPONSE | jq '.'
BOOKING_ID=$(echo $BOOKING_RESPONSE | jq -r '.id')

echo -e "\n6. Checking event availability..."
curl -s "$API_BASE/events/$EVENT_ID/availability" | jq '.'

echo -e "\n7. Getting user bookings..."
curl -s "$API_BASE/users/$USER_ID/bookings" | jq '.'

echo -e "\n8. Getting user notifications..."
curl -s "$API_BASE/users/$USER_ID/notifications" | jq '.'

echo -e "\n9. Testing race condition handling (multiple simultaneous bookings)..."
for i in {1..3}; do
  curl -s -X POST "$API_BASE/bookings" \
    -H "Content-Type: application/json" \
    -d "{
      \"user_id\": $USER_ID,
      \"event_id\": $EVENT_ID,
      \"seats_booked\": 30
    }" &
done
wait

echo -e "\n10. Final event availability check..."
curl -s "$API_BASE/events/$EVENT_ID/availability" | jq '.'

echo -e "\n✅ API testing completed!"
