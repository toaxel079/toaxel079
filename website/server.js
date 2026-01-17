require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const { customAlphabet } = require('nanoid');
const Key = require('../models/Key');

const app = express();
const PORT = process.env.PORT || 3000;

// Generate random alphanumeric keys
const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 16);

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Website: Connected to MongoDB'))
  .catch(err => console.error('❌ Website: MongoDB connection error:', err));

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'views')));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/api/generate-key', async (req, res) => {
  try {
    let uniqueKey;
    let keyExists = true;

    // Generate unique key
    while (keyExists) {
      uniqueKey = nanoid();
      const existing = await Key.findOne({ key: uniqueKey });
      keyExists = !!existing;
    }

    // Save key to database
    const newKey = new Key({
      key: uniqueKey,
      status: 'unused'
    });

    await newKey.save();

    console.log(`✅ Generated new key: ${uniqueKey}`);

    res.json({
      success: true,
      key: uniqueKey
    });

  } catch (error) {
    console.error('Error generating key:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate key'
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

app.listen(PORT, () => {
  console.log(`🌐 Website running on port ${PORT}`);
  console.log(`🔗 Access at: http://localhost:${PORT}`);
});