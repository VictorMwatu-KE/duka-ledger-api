require('dotenv').config();

const cors = require('cors');
const express = require('express');
const { Pool } = require('pg');
const app = express();

app.use(cors());
app.use(express.json());

// Add this for debugging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});


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

// Products table

pool.query(`
  CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    buying_price DECIMAL(10,2) NOT NULL DEFAULT 0,
    selling_price DECIMAL(10,2) NOT NULL DEFAULT 0,
    quantity INT NOT NULL DEFAULT 0,
    unit VARCHAR(20) DEFAULT 'pcs',
    reorder_level INT DEFAULT 5,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )
`);

pool.query(`
  CREATE TABLE IF NOT EXISTS sales (
    id SERIAL PRIMARY KEY,
    employee_id INT,
    employee_name VARCHAR(100),
    total_amount DECIMAL(10,2) NOT NULL,
    payment_method VARCHAR(20) NOT NULL, -- 'cash' or 'mpesa'
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'completed', 'cancelled'
    otp VARCHAR(6),
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS sale_items (
    id SERIAL PRIMARY KEY,
    sale_id INT REFERENCES sales(id) ON DELETE CASCADE,
    product_id INT REFERENCES products(id),
    product_name VARCHAR(255),
    quantity INT NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL
  );

  CREATE TABLE IF NOT EXISTS otps (
    id SERIAL PRIMARY KEY,
    sale_id INT REFERENCES sales(id) ON DELETE CASCADE,
    code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
  );
`)

// See Api status
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


// ---------- PRODUCTS CRUD ----------
app.get('/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/products', async (req, res) => {
  const { name, buying_price, selling_price, quantity, unit, reorder_level } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO products (name, buying_price, selling_price, quantity, unit, reorder_level)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, buying_price, selling_price, quantity, unit, reorder_level]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/products/:id', async (req, res) => {
  const { id } = req.params;
  const { name, buying_price, selling_price, quantity, unit, reorder_level } = req.body;
  try {
    const result = await pool.query(
      `UPDATE products
       SET name=$1, buying_price=$2, selling_price=$3, quantity=$4, unit=$5, reorder_level=$6, updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [name, buying_price, selling_price, quantity, unit, reorder_level, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM products WHERE id = $1', [id]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//=========SALES ROUTES=========
app.put('/sale/:id', async (req, res) => {
  const { id } = req.params;
  const { item, amount } = req.body;

  if (!item || typeof item!== 'string' || item.trim() === '') {
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
    const { minAmount } = req.query;

    let query = 'SELECT * FROM sales ORDER BY id';
    let params = [];

    if (minAmount) {
      const num = Number(minAmount);
      if (!isNaN(num) && num >= 0) {
        query = 'SELECT * FROM sales WHERE amount >= $1 ORDER BY id';
        params = [num];
      }
    }

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// 1. Create sale + generate OTP for cash
app.post('/sales', async (req, res) => {
  const { employee_name, items, payment_method } = req.body;
  // items = [{product_id, quantity}]

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get product details and calculate total
    let total = 0;
    const itemDetails = [];

    for (let item of items) {
      const prodRes = await client.query('SELECT * FROM products WHERE id = $1', [item.product_id]);
      if (prodRes.rows.length === 0) throw new Error(`Product ${item.product_id} not found`);

      const product = prodRes.rows[0];
      if (product.quantity < item.quantity) throw new Error(`Not enough stock for ${product.name}`);

      const subtotal = product.selling_price * item.quantity;
      total += subtotal;
      itemDetails.push({
        product_id: product.id,
        product_name: product.name,
        quantity: item.quantity,
        unit_price: product.selling_price,
        subtotal
      });
    }

    // Insert sale
    const saleRes = await client.query(
      `INSERT INTO sales (employee_name, total_amount, payment_method, status, created_at)
       VALUES ($1, $2, $3, 'pending', NOW()) RETURNING id`,
      [employee_name || 'Staff', total, payment_method]
    );
    const saleId = saleRes.rows[0].id;

    // Insert sale items
    for (let item of itemDetails) {
      await client.query(
        `INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [saleId, item.product_id, item.product_name, item.quantity, item.unit_price, item.subtotal]
      );
    }

    let otpCode = null;
    // If cash, generate OTP
    if (payment_method === 'cash') {
      otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min expiry
      await client.query(
        `INSERT INTO otps (sale_id, code, expires_at) VALUES ($1, $2, $3)`,
        [saleId, otpCode, expiresAt]
      );
    }

    await client.query('COMMIT');

    res.json({
      sale_id: saleId,
      total_amount: total,
      otp: otpCode, // only sent for cash
      message: payment_method === 'cash'? 'OTP generated' : 'Sale created'
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /sales error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// 2. Verify OTP and complete sale
app.post('/sales/verify-otp', async (req, res) => {
  const { sale_id, otp } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check OTP
    const otpRes = await client.query(
      `SELECT * FROM otps WHERE sale_id = $1 AND code = $2 AND used = FALSE AND expires_at > NOW()`,
      [sale_id, otp]
    );

    if (otpRes.rows.length === 0) {
      throw new Error('Invalid or expired OTP');
    }

    // Mark sale as completed
    await client.query(`UPDATE sales SET status = 'completed' WHERE id = $1`, [sale_id]);

    // Reduce product quantities
    const itemsRes = await client.query(`SELECT * FROM sale_items WHERE sale_id = $1`, [sale_id]);
    for (let item of itemsRes.rows) {
      await client.query(
        `UPDATE products SET quantity = quantity - $1 WHERE id = $2`,
        [item.quantity, item.product_id]
      );
    }

    // Mark OTP as used
    await client.query(`UPDATE otps SET used = TRUE WHERE id = $1`, [otpRes.rows[0].id]);

    await client.query('COMMIT');
    res.json({ message: 'Sale completed successfully' });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /sales/verify-otp error:', err.message);
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// 3. Get sales history with filters
app.get('/sales', async (req, res) => {
  const { filter } = req.query; // day, month, year

  let dateFilter = '';
  if (filter === 'day') dateFilter = "WHERE DATE(created_at) = CURRENT_DATE";
  if (filter === 'month') dateFilter = "WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)";
  if (filter === 'year') dateFilter = "WHERE DATE_TRUNC('year', created_at) = DATE_TRUNC('year', CURRENT_DATE)";

  try {
    const result = await pool.query(
      `SELECT * FROM sales ${dateFilter} ORDER BY created_at DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /sales error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
