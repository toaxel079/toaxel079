const mongoose = require('mongoose');

const keySchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  status: {
    type: String,
    enum: ['unused', 'used'],
    default: 'unused'
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400 // Auto-delete after 24 hours
  },
  usedAt: {
    type: Date
  },
  usedBy: {
    type: String
  }
});

module.exports = mongoose.model('Key', keySchema);