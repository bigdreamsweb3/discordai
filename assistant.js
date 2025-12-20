require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ChannelType, Events, ActivityType } = require('discord.js');
const cron = require('node-cron');

const BOT_OWNER_USER_ID = process.env.OWNER_ID;

// ===== CUSTOMIZATION SETTINGS =====
const CONFIG = {
    sendOnStartup: true,           // Send GM message when bot comes online
    scheduleInterval: 12,           // Minutes between GM messages (customize this)
    timeZone: "America/New_York",   // Change to your timezone
    activityCheckInterval: 360      // Minutes between activity checks (6 hours)
};
// ===================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildPresences
    ]
});

const yourChannels = {
    voice: new Set(),
    text: new Set(),
    recentActivity: new Map()
};

const gmMessages = [
    "🌅 Good morning everyone! Hope you all have a great day!",
    "☀️ GM! Wishing you all a productive day ahead!",
    "🌄 Good morning! Let's make today amazing!",
    "🌤️ Morning all! Hope you slept well!",
    "😊 GM! Sending positive vibes your way!",
    "💫 Good morning friends! Time for some coffee ☕",
    "✨ Rise and shine! GM everyone!",
    "🌞 Morning! Let's crush this day!",
    "👋 GM! Hope everyone has a wonderful day!",
    "🌟 Good morning! Another day, another opportunity!",
    "🌼 GM friends! May your day be filled with joy!",
    "🎯 Morning! Time to get things done!",
    "🚀 GM! Let's make today count!",
    "🌈 Good morning! Sending you all good energy!",
    "🦋 GM! Hope you have a beautiful day ahead!"
];

const autoChannels = new Set();

async function findYourChannels() {
    yourChannels.text.clear();
    yourChannels.recentActivity.clear();
    
    console.log(`🔍 Looking for channels where you're active...`);
    
    for (const [guildId, guild] of client.guilds.cache) {
        try {
            const member = await guild.members.fetch(BOT_OWNER_USER_ID).catch(() => null);
            if (!member) continue;
            
            console.log(`🏠 Found you in server: ${guild.name}`);
            
            const textChannels = guild.channels.cache.filter(
                ch => ch.type === ChannelType.GuildText && ch.viewable
            );
            
            for (const [channelId, channel] of textChannels) {
                try {
                    const messages = await channel.messages.fetch({ limit: 50 });
                    const yourMessage = messages.find(m => m.author.id === BOT_OWNER_USER_ID);
                    
                    if (yourMessage) {
                        yourChannels.text.add(channelId);
                        yourChannels.recentActivity.set(channelId, yourMessage.createdTimestamp);
                        console.log(`   📝 Found your activity in: #${channel.name}`);
                    }
                    
                    const mentioned = messages.find(m => m.mentions.users.has(BOT_OWNER_USER_ID));
                    if (mentioned && !yourChannels.text.has(channelId)) {
                        yourChannels.text.add(channelId);
                        console.log(`   📌 You were mentioned in: #${channel.name}`);
                    }
                } catch (error) {
                    // No permission
                }
            }
            
        } catch (error) {
            console.error(`Error checking guild ${guild.name}:`, error.message);
        }
    }
    
    console.log(`✅ Found ${yourChannels.text.size} active text channels`);
    return yourChannels.text;
}

async function sendGMMessage(channelId, customMessage = null) {
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || channel.type !== ChannelType.GuildText) return false;
        
        const permissions = channel.permissionsFor(client.user);
        if (!permissions.has('SendMessages')) return false;
        
        const message = customMessage || gmMessages[Math.floor(Math.random() * gmMessages.length)];
        
        const embed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle('☀️ Good Morning!')
            .setDescription(message)
            .setFooter({ 
                text: `From your assistant • ${new Date().toLocaleDateString()}`,
                iconURL: client.user.displayAvatarURL()
            })
            .setTimestamp();
        
        await channel.send({ embeds: [embed] });
        console.log(`✅ Sent GM to #${channel.name} in ${channel.guild.name}`);
        return true;
    } catch (error) {
        console.error(`Error sending GM to channel ${channelId}:`, error.message);
        return false;
    }
}

async function sendGMToAllChannels() {
    console.log(`\n⏰ Sending GM messages...`);
    
    const activeChannels = await findYourChannels();
    let sentCount = 0;
    
    for (const channelId of activeChannels) {
        const lastActivity = yourChannels.recentActivity.get(channelId);
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        
        if (!lastActivity || lastActivity > sevenDaysAgo) {
            const success = await sendGMMessage(channelId);
            if (success) {
                sentCount++;
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }
    
    console.log(`📤 Sent ${sentCount} GM messages`);
    return sentCount;
}

async function sendGMToServer(serverName) {
    const guild = client.guilds.cache.find(g => 
        g.name.toLowerCase().includes(serverName.toLowerCase())
    );
    
    if (!guild) {
        console.log(`❌ Server "${serverName}" not found`);
        return;
    }
    
    const textChannels = guild.channels.cache.filter(
        ch => ch.type === ChannelType.GuildText && ch.viewable
    );
    
    for (const [channelId, channel] of textChannels) {
        if (yourChannels.text.has(channelId)) {
            await sendGMMessage(channelId);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}

function setupScheduledMessages() {
    // Send on startup if enabled
    if (CONFIG.sendOnStartup) {
        console.log('📤 Sending GM on startup...');
        setTimeout(() => sendGMToAllChannels(), 2000);
    }
    
    // Create cron expression for custom interval
    // Convert minutes to cron format (every X minutes)
    const cronExpression = `*/${CONFIG.scheduleInterval} * * * *`;
    
    cron.schedule(cronExpression, async () => {
        console.log(`\n⏰ Scheduled GM check (every ${CONFIG.scheduleInterval} minutes)...`);
        await sendGMToAllChannels();
    }, {
        scheduled: true,
        timezone: CONFIG.timeZone
    });
    
    // Activity check
    const activityCron = `0 */${CONFIG.activityCheckInterval / 60} * * *`;
    cron.schedule(activityCron, async () => {
        console.log(`\n🔄 Checking for your activity in channels...`);
        await findYourChannels();
    });
    
    console.log('⏰ Scheduled tasks configured:');
    console.log(`   • GM messages: Every ${CONFIG.scheduleInterval} minutes`);
    console.log(`   • Activity check: Every ${CONFIG.activityCheckInterval} minutes`);
    console.log(`   • Timezone: ${CONFIG.timeZone}`);
}

client.once(Events.ClientReady, async () => {
    console.log(`🤖 Assistant Bot logged in as ${client.user.tag}`);
    console.log(`👤 Assisting user: ${BOT_OWNER_USER_ID}`);
    
    client.user.setPresence({
        activities: [{ 
            name: 'as your assistant', 
            type: ActivityType.Playing 
        }],
        status: 'online'
    });
    
    await findYourChannels();
    setupScheduledMessages();
    
    console.log('\n🎯 Assistant Bot Commands:');
    console.log('   • Type "!gm" in any channel - Send GM to that channel');
    console.log('   • Type "!gm all" - Send GM to all your active channels');
    console.log('   • Type "!gm server <name>" - Send GM to specific server');
    console.log('   • Type "!findme" - Find channels where you\'re active');
    console.log('   • Type "!channels" - List auto-GM channels');
    console.log('   • Type "!addauto" - Add current channel to auto-GM');
    console.log('   • Type "!removeauto" - Remove from auto-GM');
});

client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;
    
    if (message.author.id !== BOT_OWNER_USER_ID) return;
    
    const content = message.content.toLowerCase();
    
    if (content.startsWith('!gm')) {
        const args = message.content.split(' ');
        
        if (args[1] === 'all') {
            message.reply('🚀 Sending GM to all your active channels...');
            const count = await sendGMToAllChannels();
            message.reply(`✅ Sent ${count} GM messages!`);
            
        } else if (args[1] === 'server' && args[2]) {
            const serverName = args.slice(2).join(' ');
            message.reply(`📤 Sending GM to server: ${serverName}...`);
            await sendGMToServer(serverName);
            message.reply(`✅ Done!`);
            
        } else {
            const success = await sendGMMessage(message.channel.id);
            if (success) {
                await message.react('✅');
            } else {
                message.reply('❌ Could not send message (no permissions?)');
            }
        }
    }
    
    else if (content === '!findme') {
        message.reply('🔍 Scanning for your activity across servers...');
        const channels = await findYourChannels();
        
        if (channels.size === 0) {
            message.reply('📭 No recent activity found in any channels.');
            return;
        }
        
        let response = '📋 **Your Active Channels:**\n';
        let count = 1;
        
        for (const channelId of channels) {
            try {
                const channel = await client.channels.fetch(channelId);
                const lastActive = yourChannels.recentActivity.get(channelId);
                const timeAgo = lastActive ? 
                    `<t:${Math.floor(lastActive / 1000)}:R>` : 
                    'Unknown';
                
                response += `${count}. #${channel.name} (${channel.guild.name}) - Last active: ${timeAgo}\n`;
                count++;
            } catch (error) {
                response += `${count}. Channel ID: ${channelId} (cannot access)\n`;
                count++;
            }
        }
        
        message.reply(response);
    }
    
    else if (content === '!channels') {
        if (autoChannels.size === 0) {
            message.reply('🤖 No channels set for auto-GM. Use `!addauto` to add this channel.');
            return;
        }
        
        let response = '🤖 **Auto-GM Channels:**\n';
        let count = 1;
        
        for (const channelId of autoChannels) {
            try {
                const channel = await client.channels.fetch(channelId);
                response += `${count}. #${channel.name} (${channel.guild.name})\n`;
                count++;
            } catch (error) {
                autoChannels.delete(channelId);
            }
        }
        
        message.reply(response);
    }
    
    else if (content === '!addauto') {
        if (message.channel.type !== ChannelType.GuildText) {
            message.reply('❌ This command only works in text channels.');
            return;
        }
        
        autoChannels.add(message.channel.id);
        message.reply(`✅ Added #${message.channel.name} to auto-GM list!`);
    }
    
    else if (content === '!removeauto') {
        if (autoChannels.has(message.channel.id)) {
            autoChannels.delete(message.channel.id);
            message.reply(`✅ Removed #${message.channel.name} from auto-GM list.`);
        } else {
            message.reply('❌ This channel is not in the auto-GM list.');
        }
    }
    
    else if (content === '!help') {
        const helpEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('🤖 Assistant Bot Help')
            .setDescription('Commands to control your personal assistant')
            .addFields(
                { name: '!gm', value: 'Send GM to current channel' },
                { name: '!gm all', value: 'Send GM to all your active channels' },
                { name: '!gm server <name>', value: 'Send GM to specific server' },
                { name: '!findme', value: 'Find channels where you\'re active' },
                { name: '!channels', value: 'List auto-GM channels' },
                { name: '!addauto', value: 'Add current channel to auto-GM' },
                { name: '!removeauto', value: 'Remove from auto-GM' },
                { name: 'Automated', value: `Sends GM every ${CONFIG.scheduleInterval} minutes` }
            )
            .setFooter({ text: 'Your personal Discord assistant' });
        
        message.reply({ embeds: [helpEmbed] });
    }
});

client.on(Events.MessageCreate, async message => {
    if (message.author.id === BOT_OWNER_USER_ID && message.channel.type === ChannelType.GuildText) {
        yourChannels.text.add(message.channel.id);
        yourChannels.recentActivity.set(message.channel.id, Date.now());
    }
});

client.on(Events.GuildCreate, async guild => {
    console.log(`🎉 Joined new server: ${guild.name}`);
    
    try {
        const member = await guild.members.fetch(BOT_OWNER_USER_ID).catch(() => null);
        if (member) {
            console.log(`   👤 Found you in this server!`);
            await findYourChannels();
        }
    } catch (error) {
        console.error(`Error checking for you in ${guild.name}:`, error.message);
    }
});

client.login(process.env.DISCORD_TOKEN);

process.on('SIGINT', () => {
    console.log('\n👋 Assistant bot shutting down...');
    client.destroy();
    process.exit(0);
});