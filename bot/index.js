require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require('discord.js');
const mongoose = require('mongoose');
const express = require('express');
const Key = require('../models/Key');
const GuildConfig = require('../models/GuildConfig');

// ============================================
// EXPRESS SERVER SETUP (MUST BE FIRST!)
// ============================================
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    status: 'Bot is running!',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    bot: client.user ? client.user.tag : 'Connecting...'
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    bot: client.user ? client.user.tag : 'Connecting...',
    guilds: client.guilds ? client.guilds.cache.size : 0,
    uptime: Math.floor(process.uptime()),
    memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB'
  });
});

app.get('/ping', (req, res) => {
  res.send('Pong!');
});

// START EXPRESS SERVER IMMEDIATELY
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Keep-alive server running on port ${PORT}`);
  console.log(`🔗 Server is listening on 0.0.0.0:${PORT}`);
});

// Handle server errors
server.on('error', (error) => {
  console.error('❌ Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
  }
});

// ============================================
// DISCORD BOT SETUP
// ============================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Bot: Connected to MongoDB'))
  .catch(err => console.error('❌ Bot: MongoDB connection error:', err));

// Bot ready event
client.once('ready', () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
  console.log(`📊 Serving ${client.guilds.cache.size} servers`);
  client.user.setActivity('!setup to configure', { type: 3 }); // Type 3 = WATCHING
});

// Handle all Discord errors
client.on('shardError', error => {
  console.error('❌ Websocket error:', error);
});

client.on('shardDisconnect', (event, id) => {
  console.log(`⚠️ Shard ${id} disconnected`, event);
});

client.on('shardReconnecting', id => {
  console.log(`🔄 Shard ${id} reconnecting...`);
});

client.on('warn', info => {
  console.warn('⚠️ Discord warning:', info);
});

client.on('debug', info => {
  // Only log important debug info
  if (info.includes('Session') || info.includes('Ready') || info.includes('Heartbeat')) {
    console.log('🐛 Discord debug:', info);
  }
});

// Message handler for !setup command
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith('!setup')) return;

  // Check permissions
  if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return message.reply('❌ You need Administrator permission to use this command.');
  }

  const setupData = {};
  const filter = m => m.author.id === message.author.id;
  const timeout = 60000; // 1 minute per question

  try {
    await message.reply('🔧 **Setup Wizard Started!** Please answer the following questions:');

    // Question 1: Verification Channel
    await message.channel.send('**Question 1/5:** Mention the channel for the verification embed.');
    let collected = await message.channel.awaitMessages({ filter, max: 1, time: timeout, errors: ['time'] });
    let channelMatch = collected.first().content.match(/<#(\d+)>/);
    if (!channelMatch) {
      return message.channel.send('❌ Setup cancelled: Invalid channel mention.');
    }
    setupData.verificationChannelId = channelMatch[1];

    // Question 2: Success Message
    await message.channel.send('**Question 2/5:** Send the success message content. Use `{user}` to mention the verified member.');
    collected = await message.channel.awaitMessages({ filter, max: 1, time: timeout, errors: ['time'] });
    setupData.successMessage = collected.first().content;

    // Question 3: Success Channel
    await message.channel.send('**Question 3/5:** Mention the channel for the success message.');
    collected = await message.channel.awaitMessages({ filter, max: 1, time: timeout, errors: ['time'] });
    channelMatch = collected.first().content.match(/<#(\d+)>/);
    if (!channelMatch) {
      return message.channel.send('❌ Setup cancelled: Invalid channel mention.');
    }
    setupData.successChannelId = channelMatch[1];

    // Question 4: Verification Role
    await message.channel.send('**Question 4/5:** Mention the verification role (to be added).');
    collected = await message.channel.awaitMessages({ filter, max: 1, time: timeout, errors: ['time'] });
    let roleMatch = collected.first().content.match(/<@&(\d+)>/);
    if (!roleMatch) {
      return message.channel.send('❌ Setup cancelled: Invalid role mention.');
    }
    setupData.verificationRoleId = roleMatch[1];

    // Question 5: Removed Role
    await message.channel.send('**Question 5/5:** Mention the removed role (to be removed).');
    collected = await message.channel.awaitMessages({ filter, max: 1, time: timeout, errors: ['time'] });
    roleMatch = collected.first().content.match(/<@&(\d+)>/);
    if (!roleMatch) {
      return message.channel.send('❌ Setup cancelled: Invalid role mention.');
    }
    setupData.removedRoleId = roleMatch[1];

    // Save configuration
    await GuildConfig.findOneAndUpdate(
      { guildId: message.guild.id },
      { ...setupData, setupComplete: true, updatedAt: new Date() },
      { upsert: true, new: true }
    );

    await message.channel.send('✅ **Setup Complete!** Posting verification embed...');

    // Create and send verification embed
    await sendVerificationEmbed(message.guild.id, setupData.verificationChannelId);

  } catch (error) {
    if (error.message === 'time') {
      return message.channel.send('❌ Setup cancelled: Timeout. Please run `!setup` again.');
    }
    console.error('Setup error:', error);
    message.channel.send('❌ An error occurred during setup. Please try again.');
  }
});

// Function to send verification embed
async function sendVerificationEmbed(guildId, channelId) {
  try {
    const guild = client.guilds.cache.get(guildId);
    const channel = guild.channels.cache.get(channelId);

    if (!channel) {
      console.error('Verification channel not found');
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('Content Verification Required')
      .setDescription(
        '🔹 Click on the **Generate Key** button.\n' +
        '🔹 Wait to get redirected on the ads page.\n' +
        '🔹 Watch the ads & copy the generated key.\n' +
        '🔹 Press **Redeem Key** and follow the steps.\n' +
        '🔹 Done! Enjoy our content!'
      )
      .setImage('https://media.discordapp.net/attachments/1437535111871598693/1450888114838180045/copy_1C3B6226-9D89-4687-95B2-0E9F6E357F18.jpg?ex=6964791a&is=6963279a&hm=fd95865f3afc974f7d3475be44b9c5f6a1f34f11c1548a783466cd64d80e4c31&=&format=webp&width=1240&height=825')
      .setColor('#5865F2');

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setLabel('Generate Key')
          .setStyle(ButtonStyle.Link)
          .setURL(process.env.WEBSITE_URL || 'http://localhost:3000'),
        new ButtonBuilder()
          .setCustomId('redeem_key')
          .setLabel('Redeem Key')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('need_help')
          .setLabel('Need Help? (Tutorial)')
          .setStyle(ButtonStyle.Secondary)
      );

    await channel.send({ embeds: [embed], components: [row] });
    console.log('✅ Verification embed posted successfully');

  } catch (error) {
    console.error('Error sending verification embed:', error);
  }
}

// Interaction handler
client.on('interactionCreate', async (interaction) => {
  try {
    // Handle button clicks
    if (interaction.isButton()) {
      if (interaction.customId === 'redeem_key') {
        const modal = new ModalBuilder()
          .setCustomId('verification_modal')
          .setTitle('Verification');

        const keyInput = new TextInputBuilder()
          .setCustomId('key_input')
          .setLabel('Enter your Key')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Enter your verification key here');

        const row = new ActionRowBuilder().addComponents(keyInput);
        modal.addComponents(row);

        await interaction.showModal(modal);
      }

      if (interaction.customId === 'need_help') {
        await interaction.reply({
          content: '📺 **Tutorial Video:**\nhttps://media.discordapp.net/attachments/1437535111871598693/1451223219947442419/copy_D4B807F2-796D-4FA8-9EDF-8F07DEEC79A9.mov?ex=69645fb2&is=69630e32&hm=7045f0586468cc2d746c663d571bda13ea89c4853fb98dba6a0ce065e884813d&',
          ephemeral: true
        });
      }
    }

    // Handle modal submissions
    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'verification_modal') {
        const keyValue = interaction.fields.getTextInputValue('key_input').trim();

        // Find key in database
        const keyDoc = await Key.findOne({ key: keyValue, status: 'unused' });

        if (!keyDoc) {
          return interaction.reply({
            content: '❌ Invalid or used key. Please generate a new key.',
            ephemeral: true
          });
        }

        // Get guild configuration
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });

        if (!config || !config.setupComplete) {
          return interaction.reply({
            content: '❌ Server is not configured yet. Please contact an administrator.',
            ephemeral: true
          });
        }

        // Mark key as used
        keyDoc.status = 'used';
        keyDoc.usedAt = new Date();
        keyDoc.usedBy = interaction.user.id;
        await keyDoc.save();

        // Get member and roles
        const member = interaction.member;
        const verificationRole = interaction.guild.roles.cache.get(config.verificationRoleId);
        const removedRole = interaction.guild.roles.cache.get(config.removedRoleId);

        // Add verification role
        if (verificationRole) {
          await member.roles.add(verificationRole);
        }

        // Remove the specified role
        if (removedRole && member.roles.cache.has(config.removedRoleId)) {
          await member.roles.remove(removedRole);
        }

        // Send success message
        const successChannel = interaction.guild.channels.cache.get(config.successChannelId);
        if (successChannel) {
          const successMsg = config.successMessage.replace('{user}', `<@${member.id}>`);
          await successChannel.send(successMsg);
        }

        // Reply to user
        await interaction.reply({
          content: '✅ Verified successfully! You now have access to the server.',
          ephemeral: true
        });

        console.log(`✅ User ${interaction.user.tag} verified with key: ${keyValue}`);
      }
    }

  } catch (error) {
    console.error('Interaction error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ An error occurred. Please try again or contact an administrator.',
        ephemeral: true
      });
    }
  }
});

// Error handlers
client.on('error', error => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    client.destroy();
    process.exit(0);
  });
});

// Login to Discord
console.log('🔄 Attempting to login to Discord...');
console.log('🔑 Token present:', !!process.env.DISCORD_TOKEN);
console.log('🔑 Token length:', process.env.DISCORD_TOKEN ? process.env.DISCORD_TOKEN.length : 0);

client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log('✅ Discord login successful'))
  .catch(err => {
    console.error('❌ Discord login failed:', err.message);
    console.error('❌ Error code:', err.code);
    console.error('❌ Full error:', err);
    process.exit(1);
  });