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

  // Validation
  if (!item || typeof item!== 'string' || item.trim() === '') {
    return res.status(400).json({ error: 'Item must be a non-empty string' });
  }

  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO sales (item, amount) VALUES ($1, $2) RETURNING *',
      [item.trim(), numAmount]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/sale/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query('DELETE FROM sales WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sale not found' });
    }
    
    res.json({ success: true, deleted: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/sale/:id', async (req, res) => {
  const { id } = req.params;
  const { item, amount } = req.body;

  // Validation - same as POST
  if (!item || typeof item !== 'string' || item.trim() === '') {
    return res.status(400).json({ error: 'Item must be a non-empty string' });
  }

  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number' });
  }

  try {
    const result = await pool.query(
      'UPDATE sales SET item = $1, amount = $2 WHERE id = $3 RETURNING *',
      [item.trim(), numAmount, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/sales', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sales ORDER BY created_at DESC');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));



