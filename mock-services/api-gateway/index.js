const express = require("express");
const axios = require("axios");
const redis = require("redis");
const cors = require("cors");

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Redis client for rate limiting
let redisClient;
async function initRedis() {
  try {
    redisClient = redis.createClient({
      url: process.env.REDIS_URL || "redis://localhost:6379",
    });
    await redisClient.connect();
    console.log("📚 API Gateway connected to Redis");
  } catch (error) {
    console.log("⚠️ Redis not available, rate limiting disabled");
  }
}

// Rate limiting middleware
async function rateLimitMiddleware(req, res, next) {
  if (!redisClient) return next();

  const clientId = req.ip || "unknown";
  const key = `rate_limit:${clientId}`;

  try {
    const requests = await redisClient.incr(key);
    if (requests === 1) {
      await redisClient.expire(key, 60); // 1 minute window
    }

    const remaining = Math.max(0, 100 - requests);
    res.set("X-RateLimit-Remaining", remaining.toString());

    if (requests > 100) {
      return res.status(429).json({
        error: "Too Many Requests",
        message: "Rate limit exceeded (100 requests per minute)",
      });
    }

    next();
  } catch (error) {
    next(); // Continue if Redis fails
  }
}

// Service URLs
const services = {
  user: process.env.USER_SERVICE_URL || "http://localhost:3001",
  event: process.env.EVENT_SERVICE_URL || "http://localhost:3002",
  booking: process.env.BOOKING_SERVICE_URL || "http://localhost:3003",
  notification: process.env.NOTIFICATION_SERVICE_URL || "http://localhost:3004",
};

// Proxy function
async function proxyRequest(serviceUrl, path, method, data, headers) {
  try {
    console.log(`🔄 Proxying ${method} ${serviceUrl}${path}`);

    const config = {
      method,
      url: `${serviceUrl}${path}`,
      timeout: 10000, // Reduced to 10 second timeout
      headers: {
        "Content-Type": "application/json",
        // Only forward essential headers
        ...(headers.authorization && { authorization: headers.authorization }),
      },
    };

    if (data && (method === "POST" || method === "PUT")) {
      config.data = data;
      console.log(`📤 Request data:`, data);
    }

    const response = await axios(config);
    console.log(`✅ Response status: ${response.status}`);
    return response;
  } catch (error) {
    console.error(
      `❌ Proxy error for ${method} ${serviceUrl}${path}:`,
      error.message
    );
    if (error.code) console.error(`🚨 Error code:`, error.code);
    if (error.response) {
      console.error(`🚨 Response status:`, error.response.status);
      console.error(`🚨 Response data:`, error.response.data);
    }
    throw error;
  }
}

// Apply rate limiting to all routes
app.use("/api", rateLimitMiddleware);

// Health check
app.get("/api/health", async (req, res) => {
  const healthChecks = await Promise.allSettled([
    axios.get(`${services.user}/health`).catch(() => ({ status: "unhealthy" })),
    axios
      .get(`${services.event}/health`)
      .catch(() => ({ status: "unhealthy" })),
    axios
      .get(`${services.booking}/health`)
      .catch(() => ({ status: "unhealthy" })),
    axios
      .get(`${services.notification}/health`)
      .catch(() => ({ status: "unhealthy" })),
  ]);

  const serviceNames = [
    "user-service",
    "event-service",
    "booking-service",
    "notification-service",
  ];
  const results = healthChecks.map((check, index) => ({
    service: serviceNames[index],
    healthy: check.status === "fulfilled" && check.value?.status === 200,
  }));

  const allHealthy = results.every((result) => result.healthy);

  res.json({
    status: allHealthy ? "healthy" : "unhealthy",
    timestamp: new Date().toISOString(),
    services: results,
  });
});

app.get("/api/health/gateway", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "api-gateway",
    uptime: process.uptime(),
  });
});

// User routes
app.all("/api/users*", async (req, res) => {
  try {
    const response = await proxyRequest(
      services.user,
      req.url.replace("/api", ""),
      req.method,
      req.body,
      req.headers
    );
    res.status(response.status).json(response.data);
  } catch (error) {
    const status = error.response?.status || 500;
    const data = error.response?.data || { error: "Internal Server Error" };
    res.status(status).json(data);
  }
});

// Event routes
app.all("/api/events*", async (req, res) => {
  try {
    console.log(`🎯 Event route hit: ${req.method} ${req.url}`);
    const response = await proxyRequest(
      services.event,
      req.url.replace("/api", ""),
      req.method,
      req.body,
      req.headers
    );
    console.log(`📨 Event route response: ${response.status}`);
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error(`🚨 Event route error:`, error.message);
    console.error(`🚨 Error details:`, error.code || "No error code");
    const status = error.response?.status || 500;
    const data = error.response?.data || { error: "Internal Server Error" };
    res.status(status).json(data);
  }
});

// Booking routes
app.all("/api/bookings*", async (req, res) => {
  try {
    const response = await proxyRequest(
      services.booking,
      req.url.replace("/api", ""),
      req.method,
      req.body,
      req.headers
    );
    res.status(response.status).json(response.data);
  } catch (error) {
    const status = error.response?.status || 500;
    const data = error.response?.data || { error: "Internal Server Error" };
    res.status(status).json(data);
  }
});

// Notification routes
app.all("/api/notifications*", async (req, res) => {
  try {
    const response = await proxyRequest(
      services.notification,
      req.url.replace("/api", ""),
      req.method,
      req.body,
      req.headers
    );
    res.status(response.status).json(response.data);
  } catch (error) {
    const status = error.response?.status || 500;
    const data = error.response?.data || { error: "Internal Server Error" };
    res.status(status).json(data);
  }
});

// API docs route
app.get("/api/docs", (req, res) => {
  res.json({
    message: "API Documentation",
    endpoints: {
      health: "GET /api/health",
      users: {
        "GET /api/users": "Get all users",
        "POST /api/users": "Create user",
        "GET /api/users/:id": "Get user by ID",
        "PUT /api/users/:id": "Update user",
        "DELETE /api/users/:id": "Delete user",
      },
      events: {
        "GET /api/events": "Get all events",
        "POST /api/events": "Create event",
        "GET /api/events/:id": "Get event by ID",
        "PUT /api/events/:id": "Update event",
        "DELETE /api/events/:id": "Delete event",
      },
      bookings: {
        "GET /api/bookings": "Get all bookings",
        "POST /api/bookings": "Create booking",
        "GET /api/bookings/:id": "Get booking by ID",
        "GET /api/bookings/user/:userId": "Get bookings by user",
      },
      notifications: {
        "GET /api/notifications": "Get all notifications",
        "GET /api/notifications/booking/:bookingId":
          "Get notifications by booking",
      },
    },
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("API Gateway Error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

// Start server
async function startServer() {
  await initRedis();

  app.listen(port, () => {
    console.log(`🚪 API Gateway running on http://localhost:${port}`);
    console.log(`📖 API Documentation: http://localhost:${port}/api/docs`);
    console.log(`🏥 Health Check: http://localhost:${port}/api/health`);
  });
}

startServer();
