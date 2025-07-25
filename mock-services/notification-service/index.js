const express = require("express");
const { Client } = require("pg");
const { connect } = require("nats");
const cors = require("cors");

const app = express();
const port = 3004;

app.use(cors());
app.use(express.json());

// Database and NATS connections
let dbClient, natsConnection;

async function initConnections() {
  try {
    // PostgreSQL connection
    dbClient = new Client({
      connectionString:
        process.env.DATABASE_URL ||
        "postgresql://postgres:postgres@localhost:5432/event_booking",
    });
    await dbClient.connect();
    console.log("📧 Notification Service connected to database");

    // NATS connection
    natsConnection = await connect({
      servers: process.env.NATS_URL || "nats://localhost:4222",
    });
    console.log("📧 Notification Service connected to NATS");

    // Subscribe to booking events
    await subscribeToBookingEvents();
  } catch (error) {
    console.error("❌ Connection failed:", error);
    process.exit(1);
  }
}

// Subscribe to NATS events
async function subscribeToBookingEvents() {
  // Subscribe to booking created events
  const bookingCreatedSub = natsConnection.subscribe("booking.created");
  (async () => {
    for await (const msg of bookingCreatedSub) {
      try {
        const data = JSON.parse(new TextDecoder().decode(msg.data));
        await handleBookingCreated(data);
      } catch (error) {
        console.error("Error handling booking.created:", error);
      }
    }
  })();

  // Subscribe to booking cancelled events
  const bookingCancelledSub = natsConnection.subscribe("booking.cancelled");
  (async () => {
    for await (const msg of bookingCancelledSub) {
      try {
        const data = JSON.parse(new TextDecoder().decode(msg.data));
        await handleBookingCancelled(data);
      } catch (error) {
        console.error("Error handling booking.cancelled:", error);
      }
    }
  })();

  console.log("📧 Subscribed to booking events");
}

// Handle booking created event
async function handleBookingCreated(data) {
  try {
    const notificationData = {
      booking_id: data.booking_id,
      message: `Your booking for "${data.event_title}" has been confirmed. ${data.seats_booked} seat(s) reserved.`,
    };

    await createNotification(notificationData);
    console.log(`📧 Booking confirmation sent for booking ${data.booking_id}`);
  } catch (error) {
    console.error("Error handling booking created:", error);
  }
}

// Handle booking cancelled event
async function handleBookingCancelled(data) {
  try {
    const notificationData = {
      booking_id: data.booking_id,
      message: `Your booking for "${data.event_title}" has been cancelled. ${data.seats_released} seat(s) released.`,
    };

    await createNotification(notificationData);
    console.log(`📧 Booking cancellation sent for booking ${data.booking_id}`);
  } catch (error) {
    console.error("Error handling booking cancelled:", error);
  }
}

// Create notification in database
async function createNotification(data) {
  try {
    const result = await dbClient.query(
      `
      INSERT INTO notifications (booking_id, message)
      VALUES ($1, $2)
      RETURNING *
    `,
      [data.booking_id, data.message]
    );

    return result.rows[0];
  } catch (error) {
    console.error("Error creating notification:", error);
    throw error;
  }
}

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "notification-service",
    uptime: process.uptime(),
  });
});

// Get all notifications
app.get("/notifications", async (req, res) => {
  try {
    const { user_id, type, read } = req.query;
    let query = "SELECT * FROM notifications";
    const conditions = [];
    const values = [];

    if (user_id) {
      conditions.push(`user_id = $${values.length + 1}`);
      values.push(user_id);
    }

    if (type) {
      conditions.push(`type = $${values.length + 1}`);
      values.push(type);
    }

    if (read !== undefined) {
      conditions.push(`read = $${values.length + 1}`);
      values.push(read === "true");
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }

    query += " ORDER BY created_at DESC";

    const result = await dbClient.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.error("Error getting notifications:", error);
    res.status(500).json({ error: "Failed to get notifications" });
  }
});

// Get notification by ID
app.get("/notifications/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await dbClient.query(
      "SELECT * FROM notifications WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error getting notification:", error);
    res.status(500).json({ error: "Failed to get notification" });
  }
});

// Create manual notification
app.post("/notifications", async (req, res) => {
  try {
    const { user_id, type, title, message, metadata } = req.body;

    if (!user_id || !type || !title || !message) {
      return res.status(400).json({
        error: "user_id, type, title, and message are required",
      });
    }

    const notificationData = {
      user_id,
      type,
      title,
      message,
      metadata: metadata || {},
    };

    const notification = await createNotification(notificationData);
    res.status(201).json(notification);
  } catch (error) {
    console.error("Error creating notification:", error);
    res.status(500).json({ error: "Failed to create notification" });
  }
});

// Mark notification as read
app.patch("/notifications/:id/read", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await dbClient.query(
      `
      UPDATE notifications
      SET read = true, read_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

// Mark all user notifications as read
app.patch("/users/:user_id/notifications/read-all", async (req, res) => {
  try {
    const { user_id } = req.params;
    const result = await dbClient.query(
      `
      UPDATE notifications
      SET read = true, read_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND read = false
      RETURNING COUNT(*)
    `,
      [user_id]
    );

    res.json({
      message: "All notifications marked as read",
      updated_count: result.rowCount,
    });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res.status(500).json({ error: "Failed to mark all notifications as read" });
  }
});

// Get user notifications
app.get("/users/:user_id/notifications", async (req, res) => {
  try {
    const { user_id } = req.params;
    const { type, read, limit = 50 } = req.query;

    let query = "SELECT * FROM notifications WHERE user_id = $1";
    const values = [user_id];

    if (type) {
      query += ` AND type = $${values.length + 1}`;
      values.push(type);
    }

    if (read !== undefined) {
      query += ` AND read = $${values.length + 1}`;
      values.push(read === "true");
    }

    query += ` ORDER BY created_at DESC LIMIT $${values.length + 1}`;
    values.push(parseInt(limit));

    const result = await dbClient.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.error("Error getting user notifications:", error);
    res.status(500).json({ error: "Failed to get user notifications" });
  }
});

// Get unread notification count for user
app.get("/users/:user_id/notifications/unread-count", async (req, res) => {
  try {
    const { user_id } = req.params;
    const result = await dbClient.query(
      "SELECT COUNT(*) as unread_count FROM notifications WHERE user_id = $1 AND read = false",
      [user_id]
    );

    res.json({ unread_count: parseInt(result.rows[0].unread_count) });
  } catch (error) {
    console.error("Error getting unread count:", error);
    res.status(500).json({ error: "Failed to get unread count" });
  }
});

// Delete notification
app.delete("/notifications/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await dbClient.query(
      "DELETE FROM notifications WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting notification:", error);
    res.status(500).json({ error: "Failed to delete notification" });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Notification Service Error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

async function startServer() {
  await initConnections();

  app.listen(port, () => {
    console.log(`📧 Notification Service running on http://localhost:${port}`);
  });
}

startServer();
