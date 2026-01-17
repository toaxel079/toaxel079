
const mongoose = require('mongoose');

const guildConfigSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  verificationChannelId: {
    type: String,
    required: true
  },
  successMessage: {
    type: String,
    required: true
  },
  successChannelId: {
    type: String,
    required: true
  },
  verificationRoleId: {
    type: String,
    required: true
  },
  removedRoleId: {
    type: String,
    required: true
  },
  setupComplete: {
    type: Boolean,
    default: false
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('GuildConfig', guildConfigSchema);