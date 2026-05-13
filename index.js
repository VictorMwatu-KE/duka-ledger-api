const express = require('express');
const app = express();

// Middleware so we can read JSON later
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Health check endpoint — senior devs always add this first
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: "alive", 
    message: "Duka Ledger API running",
    timestamp: new Date().toISOString()
  });
});

// Root route so Render doesn't 404
app.get('/', (req, res) => {
  res.send('Duka Ledger API — Go to /health');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
