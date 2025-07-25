# Event Booking System - Postman Collection

## 🚀 **Quick Start**

1. **Import Collection:** `Event-Booking-System.postman_collection.json`
2. **Set Base URL:** `http://localhost:3000` (default)
3. **Start Testing:** Run Health Check first

---

## 📋 **API Endpoints**

### **🏥 Health Check**

- `GET /api/health` - System health status

### **👤 Users (Full CRUD)**

- `POST /api/users` - Create user
- `GET /api/users` - Get all users
- `GET /api/users/{id}` - Get user by ID
- `PUT /api/users/{id}` - Update user

### **🎪 Events (Full CRUD)**

- `POST /api/events` - Create event
- `GET /api/events` - Get all events (with available seats)
- `GET /api/events/{id}` - Get event by ID
- `PUT /api/events/{id}` - Update event

### **🎫 Bookings**

- `POST /api/bookings` - Create booking (race-condition safe)
- `GET /api/bookings` - Get all bookings
- `GET /api/bookings/{id}` - Get booking by ID
- `DELETE /api/bookings/{id}` - Cancel booking

### **📧 Notifications**

- `GET /api/notifications` - Get all notifications

### **⚡ Race Condition Tests**

- `POST /api/bookings` - Concurrent booking test

---

## 🎯 **Demo Workflow**

**Complete Test Sequence:**

1. **Health Check** → Verify system running
2. **Create User** → Auto-saves `userId`
3. **Create Event** → Auto-saves `eventId`
4. **Create Booking** → Uses saved IDs
5. **Update User/Event** → Test PUT endpoints
6. **Get Notifications** → Verify NATS messaging

**Race Condition Test:**

- Create event with 5 total seats
- Run "Concurrent Booking Test" 10x rapidly
- Verify only 5 bookings succeed (409 conflicts for rest)

---

## 🔧 **Auto-Variables**

Collection automatically manages:

- `userId` - Set after user creation
- `eventId` - Set after event creation
- `bookingId` - Set after booking creation
- `baseUrl` - Default: `http://localhost:3000`

---

## ✅ **Built-in Tests**

- ✅ Status code validation
- ✅ Response structure checks
- ✅ Required field verification
- ✅ Race condition handling
- ✅ Error message validation

---

## 🎬 **Video Demo Tips**

1. **Start with Health Check** - Prove system works
2. **Show Complete CRUD** - Create → Read → Update → Delete
3. **Demonstrate Race Conditions** - Multiple concurrent bookings
4. **Highlight Auto-Variables** - IDs automatically extracted
5. **Show Notifications** - NATS messaging in action

---

## 🐛 **Troubleshooting**

**Connection Issues:**

- Verify services running: `./start-system.sh` or `./demo-prep.sh`
- Check port forwarding active
- Confirm base URL is correct

**Variable Issues:**

- Run "Create User" and "Create Event" first
- Check Test Results tab for variable setting
- Verify environment selected

---

## 📊 **Collection Features**

✅ **Full CRUD Operations** - Complete API coverage
✅ **Race Condition Testing** - Concurrent request handling
✅ **Auto-Variable Management** - Seamless ID passing
✅ **Built-in Validation** - Professional test scripts
✅ **NATS Messaging Test** - Async notification verification

This collection provides complete testing coverage for the Event Booking System microservices! 🚀
