const express = require("express");
const { Client } = require("pg");
const { connect, StringCodec } = require("nats");
const cors = require("cors");

const app = express();
const port = 3003;

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
    console.log("📋 Booking Service connected to database");

    // NATS connection
    natsConnection = await connect({
      servers: process.env.NATS_URL || "nats://localhost:4222",
    });
    console.log("📋 Booking Service connected to NATS");
  } catch (error) {
    console.error("❌ Connection failed:", error);
    process.exit(1);
  }
}

// Publish event to NATS
async function publishEvent(subject, data) {
  try {
    const sc = StringCodec();
    natsConnection.publish(subject, sc.encode(JSON.stringify(data)));
    console.log(`📤 Published event: ${subject}`, data);
  } catch (error) {
    console.error("NATS publish error:", error);
  }
}

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "booking-service",
    uptime: process.uptime(),
  });
});

// Get all bookings
app.get("/bookings", async (req, res) => {
  try {
    const { user_id, event_id } = req.query;
    let query = `
      SELECT b.*, u.name as user_name, u.email as user_email,
             e.title as event_title, e.date as event_date, e.venue as event_venue
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      JOIN events e ON b.event_id = e.id
    `;

    const conditions = [];
    const values = [];

    if (user_id) {
      conditions.push(`b.user_id = $${values.length + 1}`);
      values.push(user_id);
    }

    if (event_id) {
      conditions.push(`b.event_id = $${values.length + 1}`);
      values.push(event_id);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY b.created_at DESC`;

    const result = await dbClient.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.error("Error getting bookings:", error);
    res.status(500).json({ error: "Failed to get bookings" });
  }
});

// Get booking by ID
app.get("/bookings/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await dbClient.query(
      `
      SELECT b.*, u.name as user_name, u.email as user_email,
             e.title as event_title, e.date as event_date, e.venue as event_venue
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      JOIN events e ON b.event_id = e.id
      WHERE b.id = $1
    `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Booking not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error getting booking:", error);
    res.status(500).json({ error: "Failed to get booking" });
  }
});

// Create booking with race condition handling
app.post("/bookings", async (req, res) => {
  try {
    const { user_id, event_id, seats_booked } = req.body;

    if (!user_id || !event_id || !seats_booked || seats_booked <= 0) {
      return res.status(400).json({
        error: "user_id, event_id, and seats_booked (> 0) are required",
      });
    }

    await dbClient.query("BEGIN");

    // Lock the event row to prevent race conditions
    const eventResult = await dbClient.query(
      `
      SELECT id, title, total_seats,
             (total_seats - COALESCE((SELECT SUM(seats_booked) FROM bookings WHERE event_id = $1), 0)) as available_seats
      FROM events
      WHERE id = $1
      FOR UPDATE
    `,
      [event_id]
    );

    if (eventResult.rows.length === 0) {
      await dbClient.query("ROLLBACK");
      return res.status(404).json({ error: "Event not found" });
    }

    const event = eventResult.rows[0];

    // Check if enough seats are available
    if (event.available_seats < seats_booked) {
      await dbClient.query("ROLLBACK");
      return res.status(409).json({
        error: `Not enough seats available. Available: ${event.available_seats}, Requested: ${seats_booked}`,
      });
    }

    // Verify user exists
    const userResult = await dbClient.query(
      "SELECT id, name, email FROM users WHERE id = $1",
      [user_id]
    );
    if (userResult.rows.length === 0) {
      await dbClient.query("ROLLBACK");
      return res.status(404).json({ error: "User not found" });
    }

    // Create the booking
    const bookingResult = await dbClient.query(
      `
      INSERT INTO bookings (user_id, event_id, seats_booked)
      VALUES ($1, $2, $3)
      RETURNING *
    `,
      [user_id, event_id, seats_booked]
    );

    await dbClient.query("COMMIT");

    const booking = bookingResult.rows[0];
    const user = userResult.rows[0];

    // Publish booking created event
    await publishEvent("booking.created", {
      booking_id: booking.id,
      user_id: user.id,
      user_name: user.name,
      user_email: user.email,
      event_id: event.id,
      event_title: event.title,
      seats_booked: booking.seats_booked,
      created_at: booking.created_at,
    });

    res.status(201).json({
      ...booking,
      user_name: user.name,
      user_email: user.email,
      event_title: event.title,
    });
  } catch (error) {
    await dbClient.query("ROLLBACK");
    console.error("Error creating booking:", error);
    res.status(500).json({ error: "Failed to create booking" });
  }
});

// Cancel booking
app.delete("/bookings/:id", async (req, res) => {
  try {
    const { id } = req.params;

    await dbClient.query("BEGIN");

    // Get booking details before deletion
    const bookingResult = await dbClient.query(
      `
      SELECT b.*, u.name as user_name, u.email as user_email,
             e.title as event_title, e.date as event_date
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      JOIN events e ON b.event_id = e.id
      WHERE b.id = $1
      FOR UPDATE
    `,
      [id]
    );

    if (bookingResult.rows.length === 0) {
      await dbClient.query("ROLLBACK");
      return res.status(404).json({ error: "Booking not found" });
    }

    const booking = bookingResult.rows[0];

    // Check if event is in the past
    if (new Date(booking.event_date) <= new Date()) {
      await dbClient.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Cannot cancel booking for past events" });
    }

    // Delete the booking
    await dbClient.query("DELETE FROM bookings WHERE id = $1", [id]);

    await dbClient.query("COMMIT");

    // Publish booking cancelled event
    await publishEvent("booking.cancelled", {
      booking_id: booking.id,
      user_id: booking.user_id,
      user_name: booking.user_name,
      user_email: booking.user_email,
      event_id: booking.event_id,
      event_title: booking.event_title,
      seats_released: booking.seats_booked,
      cancelled_at: new Date().toISOString(),
    });

    res.status(204).send();
  } catch (error) {
    await dbClient.query("ROLLBACK");
    console.error("Error cancelling booking:", error);
    res.status(500).json({ error: "Failed to cancel booking" });
  }
});

// Get user's bookings
app.get("/users/:user_id/bookings", async (req, res) => {
  try {
    const { user_id } = req.params;
    const result = await dbClient.query(
      `
      SELECT b.*, e.title as event_title, e.date as event_date,
             e.venue as event_venue, e.price as event_price
      FROM bookings b
      JOIN events e ON b.event_id = e.id
      WHERE b.user_id = $1
      ORDER BY e.date ASC
    `,
      [user_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error getting user bookings:", error);
    res.status(500).json({ error: "Failed to get user bookings" });
  }
});

// Get event bookings
app.get("/events/:event_id/bookings", async (req, res) => {
  try {
    const { event_id } = req.params;
    const result = await dbClient.query(
      `
      SELECT b.*, u.name as user_name, u.email as user_email
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      WHERE b.event_id = $1
      ORDER BY b.created_at DESC
    `,
      [event_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error getting event bookings:", error);
    res.status(500).json({ error: "Failed to get event bookings" });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Booking Service Error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

async function startServer() {
  await initConnections();

  app.listen(port, () => {
    console.log(`📋 Booking Service running on http://localhost:${port}`);
  });
}

startServer();
