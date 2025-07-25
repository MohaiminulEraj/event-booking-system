const express = require("express");
const { Client } = require("pg");
const cors = require("cors");

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

// Database connection
let dbClient;
async function initDatabase() {
  try {
    dbClient = new Client({
      connectionString:
        process.env.DATABASE_URL ||
        "postgresql://postgres:postgres@localhost:5432/event_booking",
    });
    await dbClient.connect();
    console.log("👤 User Service connected to database");
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    process.exit(1);
  }
}

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "user-service",
    uptime: process.uptime(),
  });
});

// Get all users
app.get("/users", async (req, res) => {
  try {
    const result = await dbClient.query(
      "SELECT * FROM users ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error getting users:", error);
    res.status(500).json({ error: "Failed to get users" });
  }
});

// Get user by ID
app.get("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await dbClient.query("SELECT * FROM users WHERE id = $1", [
      id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error getting user:", error);
    res.status(500).json({ error: "Failed to get user" });
  }
});

// Create user
app.post("/users", async (req, res) => {
  try {
    const { name, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: "Name and email are required" });
    }

    // Check if email already exists
    const existingUser = await dbClient.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: "Email already exists" });
    }

    const result = await dbClient.query(
      "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *",
      [name, email]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ error: "Failed to create user" });
  }
});

// Update user
app.put("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email } = req.body;

    // Check if user exists
    const existingUser = await dbClient.query(
      "SELECT * FROM users WHERE id = $1",
      [id]
    );
    if (existingUser.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if email already exists (excluding current user)
    if (email) {
      const emailCheck = await dbClient.query(
        "SELECT id FROM users WHERE email = $1 AND id != $2",
        [email, id]
      );
      if (emailCheck.rows.length > 0) {
        return res.status(409).json({ error: "Email already exists" });
      }
    }

    const updateFields = [];
    const updateValues = [];
    let valueIndex = 1;

    if (name) {
      updateFields.push(`name = $${valueIndex++}`);
      updateValues.push(name);
    }

    if (email) {
      updateFields.push(`email = $${valueIndex++}`);
      updateValues.push(email);
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    updateValues.push(id);

    const query = `UPDATE users SET ${updateFields.join(
      ", "
    )} WHERE id = $${valueIndex} RETURNING *`;
    const result = await dbClient.query(query, updateValues);

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Failed to update user" });
  }
});

// Delete user
app.delete("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await dbClient.query(
      "DELETE FROM users WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error("User Service Error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

async function startServer() {
  await initDatabase();

  app.listen(port, () => {
    console.log(`👤 User Service running on http://localhost:${port}`);
  });
}

startServer();
