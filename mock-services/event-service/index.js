const express = require("express");
const { Client } = require("pg");
const redis = require("redis");
const cors = require("cors");

const app = express();
const port = 3002;

app.use(cors());
app.use(express.json());

// Database and Redis connections
let dbClient, redisClient;

async function initConnections() {
  try {
    // PostgreSQL connection
    dbClient = new Client({
      connectionString:
        process.env.DATABASE_URL ||
        "postgresql://postgres:postgres@localhost:5432/event_booking",
    });
    await dbClient.connect();
    console.log("🎪 Event Service connected to database");

    // Redis connection
    redisClient = redis.createClient({
      url: process.env.REDIS_URL || "redis://localhost:6379",
    });
    await redisClient.connect();
    console.log("🎪 Event Service connected to Redis");
  } catch (error) {
    console.error("❌ Connection failed:", error);
    process.exit(1);
  }
}

// Cache helper functions
const CACHE_TTL = 300; // 5 minutes

async function getCachedData(key) {
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error("Redis get error:", error);
    return null;
  }
}

async function setCachedData(key, data, ttl = CACHE_TTL) {
  try {
    await redisClient.setEx(key, ttl, JSON.stringify(data));
  } catch (error) {
    console.error("Redis set error:", error);
  }
}

async function invalidateCache(pattern) {
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  } catch (error) {
    console.error("Redis invalidate error:", error);
  }
}

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "event-service",
    uptime: process.uptime(),
  });
});

// Get all events
app.get("/events", async (req, res) => {
  try {
    const cacheKey = "events:all";
    let events = await getCachedData(cacheKey);

    if (!events) {
      const result = await dbClient.query(`
        SELECT e.*,
               (e.total_seats - COALESCE(SUM(b.seats_booked), 0)) as current_available_seats
        FROM events e
        LEFT JOIN bookings b ON e.id = b.event_id
        GROUP BY e.id
        ORDER BY e.event_date ASC
      `);
      events = result.rows;
      await setCachedData(cacheKey, events);
    }

    res.json(events);
  } catch (error) {
    console.error("Error getting events:", error);
    res.status(500).json({ error: "Failed to get events" });
  }
});

// Get event by ID
app.get("/events/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const cacheKey = `event:${id}`;
    let event = await getCachedData(cacheKey);

    if (!event) {
      const result = await dbClient.query(
        `
        SELECT e.*,
               (e.total_seats - COALESCE(SUM(b.seats_booked), 0)) as current_available_seats
        FROM events e
        LEFT JOIN bookings b ON e.id = b.event_id
        WHERE e.id = $1
        GROUP BY e.id
      `,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Event not found" });
      }

      event = result.rows[0];
      await setCachedData(cacheKey, event);
    }

    res.json(event);
  } catch (error) {
    console.error("Error getting event:", error);
    res.status(500).json({ error: "Failed to get event" });
  }
});

// Create event
app.post("/events", async (req, res) => {
  try {
    const { title, description, event_date, total_seats } = req.body;

    if (!title || !event_date || !total_seats) {
      return res.status(400).json({
        error: "Title, event_date, and total_seats are required",
      });
    }

    const eventDate = new Date(event_date);
    if (eventDate <= new Date()) {
      return res
        .status(400)
        .json({ error: "Event date must be in the future" });
    }

    const result = await dbClient.query(
      `INSERT INTO events (title, description, event_date, total_seats, available_seats)
       VALUES ($1, $2, $3, $4, $4) RETURNING *`,
      [title, description, eventDate, total_seats]
    );

    // Invalidate cache
    await invalidateCache("events:*");

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating event:", error);
    res.status(500).json({ error: "Failed to create event" });
  }
});

// Update event
app.put("/events/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, event_date, total_seats } = req.body;

    // Check if event exists
    const existingEvent = await dbClient.query(
      "SELECT * FROM events WHERE id = $1",
      [id]
    );
    if (existingEvent.rows.length === 0) {
      return res.status(404).json({ error: "Event not found" });
    }

    // Validate date if provided
    if (event_date) {
      const eventDate = new Date(event_date);
      if (eventDate <= new Date()) {
        return res
          .status(400)
          .json({ error: "Event date must be in the future" });
      }
    }

    const updateFields = [];
    const updateValues = [];
    let valueIndex = 1;

    if (title) {
      updateFields.push(`title = $${valueIndex++}`);
      updateValues.push(title);
    }

    if (description !== undefined) {
      updateFields.push(`description = $${valueIndex++}`);
      updateValues.push(description);
    }

    if (event_date) {
      updateFields.push(`event_date = $${valueIndex++}`);
      updateValues.push(new Date(event_date));
    }

    if (total_seats) {
      updateFields.push(`total_seats = $${valueIndex++}`);
      updateValues.push(total_seats);
      updateFields.push(`available_seats = $${valueIndex++}`);
      updateValues.push(total_seats);
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    updateValues.push(id);

    const query = `UPDATE events SET ${updateFields.join(
      ", "
    )} WHERE id = $${valueIndex} RETURNING *`;
    const result = await dbClient.query(query, updateValues);

    // Invalidate cache
    await invalidateCache("events:*");
    await invalidateCache(`event:${id}`);

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating event:", error);
    res.status(500).json({ error: "Failed to update event" });
  }
});

// Delete event
app.delete("/events/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Check if there are any bookings for this event
    const bookingCheck = await dbClient.query(
      "SELECT COUNT(*) FROM bookings WHERE event_id = $1",
      [id]
    );
    if (parseInt(bookingCheck.rows[0].count) > 0) {
      return res
        .status(400)
        .json({ error: "Cannot delete event with existing bookings" });
    }

    const result = await dbClient.query(
      "DELETE FROM events WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Event not found" });
    }

    // Invalidate cache
    await invalidateCache("events:*");
    await invalidateCache(`event:${id}`);

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting event:", error);
    res.status(500).json({ error: "Failed to delete event" });
  }
});

// Get event availability
app.get("/events/:id/availability", async (req, res) => {
  try {
    const { id } = req.params;
    const cacheKey = `event:${id}:availability`;
    let availability = await getCachedData(cacheKey);

    if (!availability) {
      const result = await dbClient.query(
        `
        SELECT
          e.total_seats,
          COALESCE(SUM(b.seats_booked), 0) as booked_seats,
          (e.total_seats - COALESCE(SUM(b.seats_booked), 0)) as available_seats
        FROM events e
        LEFT JOIN bookings b ON e.id = b.event_id
        WHERE e.id = $1
        GROUP BY e.id, e.total_seats
      `,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Event not found" });
      }

      availability = result.rows[0];
      await setCachedData(cacheKey, availability, 60); // Cache for 1 minute due to frequent updates
    }

    res.json(availability);
  } catch (error) {
    console.error("Error getting event availability:", error);
    res.status(500).json({ error: "Failed to get event availability" });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Event Service Error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

async function startServer() {
  await initConnections();

  app.listen(port, () => {
    console.log(`🎪 Event Service running on http://localhost:${port}`);
  });
}

startServer();
