require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Create table if it doesn't exist
pool.query(`
  CREATE TABLE IF NOT EXISTS sales (
    id SERIAL PRIMARY KEY,
    item TEXT NOT NULL,
    amount INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )
`);

app.get('/health', (req, res) => {
  res.json({ status: "alive", message: "Duka Ledger API running" });
});

app.post('/sale', async (req, res) => {
  const { item, amount } = req.body;
  if (!item ||!amount) return res.status(400).json({ error: "item and amount required" });
  
  try {
    const result = await pool.query(
      'INSERT INTO sales (item, amount) VALUES ($1, $2) RETURNING *',
      [item, amount]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

app.get('/sales', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sales ORDER BY created_at DESC');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
