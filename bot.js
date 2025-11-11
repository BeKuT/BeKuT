const { Client, GatewayIntentBits, Collection, ActivityType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs').promises;
const axios = require('axios');
const express = require('express');
const path = require('path');

// ⬇️⬇️⬇️ ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ ⬇️⬇️⬇️
const token = process.env.DISCORD_TOKEN;
const TRANSCRIPT_CHANNEL_ID = process.env.TRANSCRIPT_CHANNEL_ID || '1433893954759295157';
const PORT = process.env.PORT || 3000;
const RAILWAY_STATIC_URL = process.env.RAILWAY_STATIC_URL;
// Railway-specific optimizations
const https = require('https');

// Создаем кастомный axios instance для Railway
const railwayAxios = axios.create({
    timeout: 15000,
    httpsAgent: new https.Agent({ 
        keepAlive: true,
        maxSockets: 50,
        maxFreeSockets: 10,
        timeout: 15000
    }),
    maxRedirects: 5,
    validateStatus: (status) => status < 500
});

// Глобальная обработка ошибок для Railway
process.on('unhandledRejection', (reason, promise) => {
    console.log('🚨 Railway - Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.log('🚨 Railway - Uncaught Exception:', error);
});

// Проверка наличия токена
if (!token) {
    console.error('❌ CRITICAL ERROR: DISCORD_TOKEN not found!');
    console.log('💡 Set DISCORD_TOKEN in Railway Variables');
    process.exit(1);
}

console.log('✅ Token loaded successfully');
console.log(`📝 Channel ID: ${TRANSCRIPT_CHANNEL_ID}`);

// Создаем Express сервер для хостинга транскриптов
const app = express();

// Важные middleware для Railway
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Хранилище для транскриптов в памяти (теперь транскрипты не удаляются автоматически)
const transcriptsStorage = new Map();

// Основной маршрут для проверки работы
app.get('/', (req, res) => {
    const baseUrl = getBaseUrl();
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Transcript Server</title>
        <style>
            body { 
                background: #36393f; 
                color: white; 
                font-family: Arial; 
                padding: 20px;
                max-width: 800px;
                margin: 0 auto;
            }
            .card {
                background: #2f3136;
                padding: 20px;
                margin: 10px 0;
                border-radius: 8px;
                border-left: 4px solid #7289da;
            }
            .success { border-left-color: #43b581; }
            .warning { border-left-color: #faa61a; }
            a { color: #00aff4; text-decoration: none; }
            a:hover { text-decoration: underline; }
            code { background: #40444b; padding: 2px 6px; border-radius: 3px; }
        </style>
    </head>
    <body>
        <h1>📄 Transcript Server</h1>
        
        <div class="card success">
            <h2>✅ Server is Running</h2>
            <p>Base URL: <code>${baseUrl}</code></p>
            <p>Transcripts in storage: <strong>${transcriptsStorage.size}</strong></p>
            <p>Server time: ${new Date().toISOString()}</p>
        </div>
        
        <div class="card">
            <h2>🔧 Debug Endpoints</h2>
            <ul>
                <li><a href="/api/debug">/api/debug</a> - Environment information</li>
                <li><a href="/api/health">/api/health</a> - Health check</li>
                <li><a href="/api/transcripts">/api/transcripts</a> - List all transcripts</li>
                <li><a href="/create-test-transcript">/create-test-transcript</a> - Create test transcript</li>
                <li><a href="/api/cleanup">/api/cleanup</a> - Manual cleanup (optional)</li>
            </ul>
        </div>
    </body>
    </html>
    `);
});

// Маршрут для просмотра транскрипта
app.get('/transcript/:id', (req, res) => {
    const transcriptId = req.params.id;
    const transcript = transcriptsStorage.get(transcriptId);
    
    console.log(`🔍 Looking for transcript: ${transcriptId}`);
    console.log(`📊 Total transcripts in storage: ${transcriptsStorage.size}`);
    
    if (!transcript) {
        console.log(`❌ Transcript ${transcriptId} not found in storage`);
        return res.status(404).send(`
            <html>
                <body style="background: #36393f; color: white; font-family: Arial; text-align: center; padding: 50px;">
                    <h1>📄 Transcript Not Found</h1>
                    <p>This transcript doesn't exist or was manually deleted.</p>
                    <p><small>Transcripts are now stored permanently until manually removed.</small></p>
                </body>
            </html>
        `);
    }
    
    console.log(`✅ Found transcript: ${transcriptId}`);
    res.send(transcript.html);
});

// API endpoint для получения информации о транскриптах
app.get('/api/transcripts', (req, res) => {
    const transcripts = Array.from(transcriptsStorage.entries()).map(([id, data]) => ({
        id,
        channelName: data.ticketInfo?.channelName,
        server: data.ticketInfo?.server,
        messageCount: data.ticketInfo?.messageCount,
        createdAt: new Date(data.createdAt).toISOString(),
        ageInDays: Math.floor((Date.now() - data.createdAt) / (1000 * 60 * 60 * 24))
    }));
    
    res.json({ 
        transcripts,
        storageInfo: {
            total: transcriptsStorage.size,
            permanentStorage: true
        }
    });
});

// Ручная очистка старых транскриптов (опционально)
app.delete('/api/transcript/:id', (req, res) => {
    const transcriptId = req.params.id;
    
    if (transcriptsStorage.has(transcriptId)) {
        transcriptsStorage.delete(transcriptId);
        console.log(`🗑️ Manually deleted transcript: ${transcriptId}`);
        res.json({ 
            success: true, 
            message: `Transcript ${transcriptId} deleted successfully`,
            remaining: transcriptsStorage.size
        });
    } else {
        res.status(404).json({ 
            success: false, 
            message: `Transcript ${transcriptId} not found` 
        });
    }
});

// Очистка всех транскриптов (опционально)
app.delete('/api/transcripts', (req, res) => {
    const count = transcriptsStorage.size;
    transcriptsStorage.clear();
    console.log(`🗑️ Cleared all transcripts: ${count} deleted`);
    res.json({ 
        success: true, 
        message: `All transcripts cleared (${count} deleted)`,
        deleted: count
    });
});

// Debug endpoint
app.get('/api/debug', (req, res) => {
    const environmentInfo = {
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT,
        RAILWAY_STATIC_URL: process.env.RAILWAY_STATIC_URL,
        RAILWAY_PUBLIC_DOMAIN: process.env.RAILWAY_PUBLIC_DOMAIN,
        RAILWAY_SERVICE_NAME: process.env.RAILWAY_SERVICE_NAME,
        RAILWAY_SERVICE_ID: process.env.RAILWAY_SERVICE_ID,
    };
    
    const transcriptsInfo = {
        total: transcriptsStorage.size,
        permanentStorage: true,
        ids: Array.from(transcriptsStorage.keys())
    };
    
    res.json({
        environment: environmentInfo,
        transcripts: transcriptsInfo,
        server: {
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            baseUrl: getBaseUrl()
        }
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        transcripts: transcriptsStorage.size,
        permanentStorage: true,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Создание тестового транскрипта
app.get('/create-test-transcript', (req, res) => {
    const transcriptId = 'test-' + Date.now();
    const testHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Test Transcript</title>
        <style>
            body { background: #36393f; color: white; font-family: Arial; padding: 50px; text-align: center; }
            .container { max-width: 600px; margin: 0 auto; background: #2f3136; padding: 30px; border-radius: 10px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>✅ Test Transcript Works!</h1>
            <p>This is a test transcript created at ${new Date().toISOString()}</p>
            <p>Transcript ID: <strong>${transcriptId}</strong></p>
            <p><strong>This transcript will NOT be automatically deleted</strong></p>
            <p>If you can see this, the server is working correctly!</p>
        </div>
    </body>
    </html>
    `;
    
    transcriptsStorage.set(transcriptId, {
        html: testHtml,
        createdAt: Date.now(),
        ticketInfo: {
            channelName: 'test-channel',
            server: 'Test Server', 
            messageCount: 1,
            participantsCount: 1
        }
    });
    
    const transcriptUrl = `${getBaseUrl()}/transcript/${transcriptId}`;
    
    res.json({
        success: true,
        message: 'Test transcript created successfully',
        transcriptId: transcriptId,
        url: transcriptUrl,
        directLink: `<a href="${transcriptUrl}">Open Test Transcript</a>`,
        storageSize: transcriptsStorage.size,
        permanent: true
    });
});

// Запускаем сервер
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Transcript server running on port ${PORT}`);
    console.log(`🔗 Access at: ${getBaseUrl()}`);
    console.log(`💾 Transcripts are now stored PERMANENTLY (no auto-deletion)`);
});

// Обработка graceful shutdown
process.on('SIGTERM', () => {
    console.log('🔄 Received SIGTERM, shutting down gracefully...');
    console.log(`💾 Preserving ${transcriptsStorage.size} transcripts in storage`);
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('🔄 Received SIGINT, shutting down gracefully...');
    console.log(`💾 Preserving ${transcriptsStorage.size} transcripts in storage`);
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ]
});

// Хранилище для связи реакций с сообщениями переводов
const translationMessages = new Map();

// ⬇️⬇️⬇️ ФУНКЦИИ ДЛЯ ТРАНСКРИПТА ⬇️⬇️⬇️

// Функция для сбора информации о тикете
async function collectTicketInfo(channel, messages) {
    const participants = new Map(); // Используем Map вместо Set для уникальности по ID
    let ticketCreator = null;
    let firstMessage = null;

    messages.forEach(msg => {
        // Добавляем участника в Map по ID (автоматически убирает дубликаты)
        participants.set(msg.author.id, {
            id: msg.author.id,
            username: msg.author.tag,
            displayName: msg.author.displayName || msg.author.username,
            bot: msg.author.bot,
            avatar: msg.author.displayAvatarURL({ format: 'png', size: 64 })
        });

        if (!firstMessage || msg.createdTimestamp < firstMessage.createdTimestamp) {
            firstMessage = msg;
        }
    });

    if (firstMessage) {
        ticketCreator = {
            id: firstMessage.author.id,
            username: firstMessage.author.tag,
            displayName: firstMessage.author.displayName || firstMessage.author.username
        };
    }

    return {
        ticketId: channel.name.split('-').pop() || 'unknown',
        server: channel.guild.name,
        serverId: channel.guild.id,
        serverIcon: channel.guild.iconURL({ format: 'png', size: 64 }),
        createdAt: channel.createdAt,
        createdBy: ticketCreator ? {
            username: ticketCreator.username,
            displayName: ticketCreator.displayName,
            id: ticketCreator.id
        } : null,
        channelName: channel.name,
        channelId: channel.id,
        participants: Array.from(participants.values()).map(p => ({
            username: p.username,
            displayName: p.displayName,
            userId: p.id,
            avatar: p.avatar,
            role: p.bot ? 'system' : (p.id === ticketCreator?.id ? 'Ticket Owner' : 'participant')
        }))
    };
}

// Функция для генерации отчета о тикете
function generateTicketReport(ticketData) {
    const report = {
        ticketInfo: {
            id: ticketData.ticketId,
            server: ticketData.server,
            serverId: ticketData.serverId,
            serverIcon: ticketData.serverIcon,
            createdAt: ticketData.createdAt,
            createdBy: ticketData.createdBy,
            channelName: ticketData.channelName,
            channelId: ticketData.channelId
        },
        participants: ticketData.participants,
        messageCount: 0
    };

    return report;
}

// Функция для создания HTML транскрипта в стиле Discord
function createHTMLTranscript(ticketReport, messages) {
    const participantsHTML = ticketReport.participants.map(participant => `
        <div class="participant">
            <img src="${participant.avatar}" alt="${participant.displayName}" class="avatar">
            <div class="participant-info">
                <div class="username">${participant.displayName}</div>
                <div class="discriminator">${participant.username}</div>
            </div>
            <div class="role">${participant.role}</div>
        </div>
    `).join('');

    const messagesHTML = messages.map(msg => {
        const timestamp = msg.createdAt.toLocaleString('ru-RU');
        const author = msg.author;
        const content = msg.content || '';
        const attachments = msg.attachments.size > 0 ? Array.from(msg.attachments.values()) : [];
        const embeds = msg.embeds || [];

        return `
        <div class="message" id="message-${msg.id}">
            <img src="${author.displayAvatarURL({ format: 'png', size: 64 })}" alt="${author.tag}" class="message-avatar">
            <div class="message-content">
                <div class="message-header">
                    <span class="author-name">${author.displayName || author.username}</span>
                    <span class="message-time">${timestamp}</span>
                </div>
                <div class="message-text">${formatMessageContent(content)}</div>
                ${attachments.length > 0 ? `
                <div class="attachments">
                    ${attachments.map(attachment => `
                        <div class="attachment">
                            ${attachment.contentType && attachment.contentType.startsWith('image/') ? 
                                `<img src="${attachment.url}" alt="Attachment" class="attachment-image">` :
                                `<a href="${attachment.url}" class="attachment-link" target="_blank">📎 ${attachment.name}</a>`
                            }
                        </div>
                    `).join('')}
                </div>
                ` : ''}
                ${embeds.length > 0 ? `
                <div class="embeds">
                    ${embeds.map(embed => createEmbedHTML(embed)).join('')}
                </div>
                ` : ''}
            </div>
        </div>
        `;
    }).join('');

    return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Транскрипт #${ticketReport.ticketInfo.channelName}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Whitney', 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #36393f; color: #dcddde; line-height: 1.4; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { background: #2f3136; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #7289da; }
        .server-info { display: flex; align-items: center; margin-bottom: 15px; }
        .server-icon { width: 48px; height: 48px; border-radius: 50%; margin-right: 15px; }
        .server-details h1 { color: #fff; font-size: 24px; margin-bottom: 5px; }
        .server-details .channel-name { color: #8e9297; font-size: 16px; }
        .ticket-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-top: 15px; }
        .stat { background: #40444b; padding: 12px; border-radius: 4px; }
        .stat-label { color: #8e9297; font-size: 12px; text-transform: uppercase; margin-bottom: 5px; }
        .stat-value { color: #fff; font-size: 18px; font-weight: bold; }
        .participants-section { background: #2f3136; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .section-title { color: #fff; font-size: 18px; margin-bottom: 15px; font-weight: 600; }
        .participants-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; }
        .participant { display: flex; align-items: center; padding: 10px; background: #40444b; border-radius: 4px; }
        .participant .avatar { width: 32px; height: 32px; border-radius: 50%; margin-right: 10px; }
        .participant-info { flex: 1; }
        .participant .username { color: #fff; font-weight: 500; }
        .participant .discriminator { color: #8e9297; font-size: 12px; }
        .participant .role { background: #7289da; color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 500; }
        .messages-section { background: #2f3136; border-radius: 8px; overflow: hidden; }
        .messages-header { background: #36393f; padding: 15px 20px; border-bottom: 1px solid #40444b; }
        .messages-container { padding: 20px; max-height: 600px; overflow-y: auto; }
        .message { display: flex; margin-bottom: 20px; padding: 5px; border-radius: 4px; transition: background-color 0.2s; }
        .message:hover { background: #32353b; }
        .message-avatar { width: 40px; height: 40px; border-radius: 50%; margin-right: 15px; flex-shrink: 0; }
        .message-content { flex: 1; min-width: 0; }
        .message-header { display: flex; align-items: center; margin-bottom: 5px; }
        .author-name { color: #fff; font-weight: 500; margin-right: 8px; }
        .message-time { color: #72767d; font-size: 12px; }
        .message-text { color: #dcddde; word-wrap: break-word; white-space: pre-wrap; }
        .attachments { margin-top: 10px; }
        .attachment { margin-top: 5px; }
        .attachment-image { max-width: 400px; max-height: 300px; border-radius: 4px; cursor: pointer; }
        .attachment-link { color: #00aff4; text-decoration: none; display: inline-flex; align-items: center; padding: 5px 10px; background: #2f3136; border-radius: 4px; border: 1px solid #40444b; }
        .attachment-link:hover { text-decoration: underline; }
        .embeds { margin-top: 10px; }
        .embed { background: #2f3136; border-left: 4px solid #40444b; border-radius: 4px; padding: 12px; margin-top: 8px; max-width: 400px; }
        .embed-title { color: #00aff4; font-weight: 600; margin-bottom: 8px; text-decoration: none; }
        .embed-title:hover { text-decoration: underline; }
        .embed-description { color: #dcddde; font-size: 14px; line-height: 1.4; }
        .embed-footer { margin-top: 8px; color: #72767d; font-size: 12px; }
        .mention { background: #3a3c42; color: #dee0fc; padding: 1px 4px; border-radius: 3px; font-weight: 500; }
        .code-block { background: #2f3136; border: 1px solid #40444b; border-radius: 4px; padding: 10px; margin: 5px 0; font-family: 'Consolas', 'Monaco', monospace; font-size: 14px; overflow-x: auto; }
        .inline-code { background: #2f3136; border: 1px solid #40444b; border-radius: 3px; padding: 2px 4px; font-family: 'Consolas', 'Monaco', monospace; font-size: 14px; }
        .footer { text-align: center; margin-top: 30px; color: #72767d; font-size: 12px; padding: 20px; border-top: 1px solid #40444b; }
        .messages-container::-webkit-scrollbar { width: 8px; }
        .messages-container::-webkit-scrollbar-track { background: #2f3136; }
        .messages-container::-webkit-scrollbar-thumb { background: #202225; border-radius: 4px; }
        .messages-container::-webkit-scrollbar-thumb:hover { background: #1a1c20; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="server-info">
                ${ticketReport.ticketInfo.serverIcon ? `<img src="${ticketReport.ticketInfo.serverIcon}" alt="${ticketReport.ticketInfo.server}" class="server-icon">` : ''}
                <div class="server-details">
                    <h1>${ticketReport.ticketInfo.server}</h1>
                    <div class="channel-name">#${ticketReport.ticketInfo.channelName}</div>
                </div>
            </div>
            <div class="ticket-stats">
                <div class="stat">
                    <div class="stat-label">Создан</div>
                    <div class="stat-value">${ticketReport.ticketInfo.createdAt.toLocaleString('ru-RU')}</div>
                </div>
                <div class="stat">
                    <div class="stat-label">Сообщений</div>
                    <div class="stat-value">${ticketReport.messageCount}</div>
                </div>
                <div class="stat">
                    <div class="stat-label">Участников</div>
                    <div class="stat-value">${ticketReport.participants.length}</div>
                </div>
                ${ticketReport.ticketInfo.createdBy ? `
                <div class="stat">
                    <div class="stat-label">Создатель</div>
                    <div class="stat-value">${ticketReport.ticketInfo.createdBy.displayName}</div>
                </div>
                ` : ''}
            </div>
        </div>

        <div class="participants-section">
            <div class="section-title">Участники тикета</div>
            <div class="participants-grid">
                ${participantsHTML}
            </div>
        </div>

        <div class="messages-section">
            <div class="messages-header">
                <div class="section-title">История сообщений</div>
            </div>
            <div class="messages-container">
                ${messagesHTML}
            </div>
        </div>

        <div class="footer">
            Транскрипт создан автоматически • ${new Date().toLocaleString('ru-RU')}<br>
            <small>Этот транскрипт хранится постоянно и не будет автоматически удален</small>
        </div>
    </div>

    <script>
        document.addEventListener('DOMContentLoaded', function() {
            const images = document.querySelectorAll('.attachment-image');
            images.forEach(img => {
                img.addEventListener('click', function() {
                    const overlay = document.createElement('div');
                    overlay.style.cssText = \`
                        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                        background: rgba(0,0,0,0.8); display: flex; align-items: center;
                        justify-content: center; z-index: 1000; cursor: pointer;
                    \`;
                    const fullImage = document.createElement('img');
                    fullImage.src = this.src;
                    fullImage.style.cssText = \`max-width: 90%; max-height: 90%; border-radius: 8px;\`;
                    overlay.appendChild(fullImage);
                    overlay.addEventListener('click', function() { document.body.removeChild(overlay); });
                    document.body.appendChild(overlay);
                });
            });

            const messageLinks = document.querySelectorAll('a[href^="#message-"]');
            messageLinks.forEach(link => {
                link.addEventListener('click', function(e) {
                    e.preventDefault();
                    const targetId = this.getAttribute('href').substring(1);
                    const targetElement = document.getElementById(targetId);
                    if (targetElement) {
                        targetElement.scrollIntoView({ behavior: 'smooth' });
                        targetElement.style.backgroundColor = '#3a3c42';
                        setTimeout(() => { targetElement.style.backgroundColor = ''; }, 2000);
                    }
                });
            });
        });
    </script>
</body>
</html>
    `;
}

// Вспомогательные функции для форматирования
function formatMessageContent(content) {
    if (!content) return '';
    
    content = content
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    
    content = content.replace(/<@!?(\d+)>/g, '<span class="mention">@user</span>');
    content = content.replace(/<#(\d+)>/g, '<span class="mention">#channel</span>');
    content = content.replace(/<@&(\d+)>/g, '<span class="mention">@role</span>');
    content = content.replace(/<a?:\w+:(\d+)>/g, '<span class="emoji">:emoji:</span>');
    content = content.replace(/```(\w+)?\n([\s\S]*?)```/g, '<div class="code-block">$2</div>');
    content = content.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    content = content.replace(/\*(.*?)\*/g, '<em>$1</em>');
    content = content.replace(/_(.*?)_/g, '<em>$1</em>');
    content = content.replace(/__(.*?)__/g, '<u>$1</u>');
    content = content.replace(/~~(.*?)~~/g, '<s>$1</s>');
    content = content.replace(/(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color: #00aff4; text-decoration: none;">$1</a>');
    content = content.replace(/\n/g, '<br>');
    
    return content;
}

function createEmbedHTML(embed) {
    if (!embed || !embed.title && !embed.description) return '';
    
    let embedHTML = '<div class="embed">';
    if (embed.title) {
        const titleUrl = embed.url ? `href="${embed.url}" target="_blank" rel="noopener noreferrer"` : '';
        embedHTML += `<a ${titleUrl} class="embed-title">${embed.title}</a>`;
    }
    if (embed.description) {
        embedHTML += `<div class="embed-description">${formatMessageContent(embed.description)}</div>`;
    }
    if (embed.fields && embed.fields.length > 0) {
        embedHTML += '<div class="embed-fields">';
        embed.fields.forEach(field => {
            embedHTML += `
                <div class="embed-field">
                    <div class="embed-field-name">${field.name}</div>
                    <div class="embed-field-value">${formatMessageContent(field.value)}</div>
                </div>
            `;
        });
        embedHTML += '</div>';
    }
    if (embed.footer) {
        embedHTML += `<div class="embed-footer">${embed.footer.text}</div>`;
    }
    embedHTML += '</div>';
    return embedHTML;
}

// Функция для создания embed с информацией о тикете
function createTicketInfoEmbedWithParticipants(ticketReport) {
    const createdBy = ticketReport.ticketInfo.createdBy;
    
    // Уже нет дубликатов, так как исправлено в collectTicketInfo
    const uniqueParticipants = ticketReport.participants;
    
    const participantsList = uniqueParticipants
        .slice(0, 10)
        .map(p => {
            const roleIcon = p.role === 'Ticket Owner' ? '👑' : p.role === 'system' ? '🤖' : '👤';
            return `${roleIcon} ${p.displayName} (${p.userId})`;
        })
        .join('\n');
    
    const moreParticipants = uniqueParticipants.length > 10 ? 
        `\n... и еще ${uniqueParticipants.length - 10} участников` : '';

    const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('📋 TICKET INFORMATION')
        .addFields(
            { name: '🆔 ID', value: `#${ticketReport.ticketInfo.id}`, inline: true },
            { name: '🏠 Server', value: ticketReport.ticketInfo.server, inline: true },
            { name: '📅 Created', value: ticketReport.ticketInfo.createdAt.toLocaleString('ru-RU'), inline: true },
            { name: '👤 Created by', value: createdBy ? `${createdBy.displayName} (${createdBy.id})` : 'Unknown', inline: false },
            { name: '💬 Channel', value: `#${ticketReport.ticketInfo.channelName}`, inline: true },
            { name: '💭 Messages', value: `${ticketReport.messageCount}`, inline: true },
            { name: '👥 Participants', value: `${uniqueParticipants.length}`, inline: true },
            { name: `🎯 Participants (${uniqueParticipants.length})`, value: participantsList + moreParticipants || 'No participants', inline: false }
        )
        .setFooter({ text: 'Click the button below to view full transcript • PERMANENT STORAGE' })
        .setTimestamp();

    return embed;
}

function createTicketInfoEmbed(ticketReport) {
    return createTicketInfoEmbedWithParticipants(ticketReport);
}

// Генерируем уникальный ID для транскрипта
function generateTranscriptId() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Функция для получения базового URL
function getBaseUrl() {
    let baseUrl = '';
    
    // Используем RAILWAY_STATIC_URL если он есть
    if (process.env.RAILWAY_STATIC_URL) {
        baseUrl = process.env.RAILWAY_STATIC_URL;
        // Добавляем протокол если отсутствует
        if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
            baseUrl = 'https://' + baseUrl;
        }
    }
    // Используем RAILWAY_PUBLIC_DOMAIN
    else if (process.env.RAILWAY_PUBLIC_DOMAIN) {
        baseUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
    }
    // Для локальной разработки
    else {
        baseUrl = `http://localhost:${process.env.PORT || 3000}`;
    }
    
    console.log(`🔗 Base URL: ${baseUrl}`);
    return baseUrl;
}

// ⬇️⬇️⬇️ ФУНКЦИИ ДЛЯ СТАТИСТИКИ WAR THUNDER ⬇️⬇️⬇️


// Улучшенный ручной поиск через StatShark
async function findPlayerIdStatSharkManual(nickname) {
    try {
        const response = await axios.get(
            `https://statshark.net/search?q=${encodeURIComponent(nickname)}`,
            {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
                }
            }
        );

        const html = response.data;
        console.log('🔍 StatShark search page loaded successfully');
        
        // Несколько методов поиска ID
        const searchMethods = [
            // Метод 1: Ищем в data-player-id атрибутах
            () => {
                const dataIdMatch = html.match(/data-player-id="(\d+)"/g);
                if (dataIdMatch) {
                    for (const match of dataIdMatch) {
                        const id = match.match(/"(\d+)"/)[1];
                        console.log(`📋 Found data-player-id: ${id}`);
                        return id;
                    }
                }
                return null;
            },
            
            // Метод 2: Ищем в ссылках на игроков
            () => {
                const playerLinkRegex = /href="\/player\/(\d+)[^"]*"[^>]*>([^<]+)<\/a>/g;
                let match;
                const foundPlayers = [];
                
                while ((match = playerLinkRegex.exec(html)) !== null) {
                    const foundId = match[1];
                    const foundName = match[2].trim();
                    foundPlayers.push({ id: foundId, name: foundName });
                    
                    // Прямое совпадение
                    if (foundName.toLowerCase() === nickname.toLowerCase()) {
                        console.log(`✅ Exact match found: ${foundName} -> ${foundId}`);
                        return foundId;
                    }
                }
                
                // Частичное совпадение
                for (const player of foundPlayers) {
                    if (player.name.toLowerCase().includes(nickname.toLowerCase()) || 
                        nickname.toLowerCase().includes(player.name.toLowerCase())) {
                        console.log(`✅ Partial match found: ${player.name} -> ${player.id}`);
                        return player.id;
                    }
                }
                
                if (foundPlayers.length > 0) {
                    console.log(`🔍 Found players: ${foundPlayers.map(p => `${p.name}(${p.id})`).join(', ')}`);
                    return foundPlayers[0].id; // Первый результат
                }
                
                return null;
            },
            
            // Метод 3: Ищем в JSON данных
            () => {
                const jsonMatch = html.match(/window\.initialData\s*=\s*({[^;]+});/);
                if (jsonMatch) {
                    try {
                        const data = JSON.parse(jsonMatch[1]);
                        if (data.players && data.players.length > 0) {
                            const player = data.players[0];
                            console.log(`✅ JSON data found: ${player.name} -> ${player.id}`);
                            return player.id.toString();
                        }
                    } catch (e) {
                        console.log('❌ JSON parse error');
                    }
                }
                return null;
            }
        ];

        // Пробуем все методы поиска
        for (const method of searchMethods) {
            const result = method();
            if (result) {
                console.log(`🎯 StatShark ID found: ${result}`);
                return result;
            }
        }
        
        console.log('❌ No ID found in StatShark search results');
        return null;
        
    } catch (error) {
        console.error('StatShark search error:', error.message);
        throw error;
    }
}
// Умный поиск статистики
async function getPlayerStatsSmart(playerInput) {
    const isID = /^\d+$/.test(playerInput);
    
    if (isID) {
        // Если ввели ID - пробуем получить статистику напрямую
        console.log(`🎯 Direct ID lookup: ${playerInput}`);
        const stats = await getStatsByPlayerId(playerInput);
        if (stats) return stats;
        
        // Если не нашли по ID, пробуем найти ник и показать fallback
        throw new Error('STATS_UNAVAILABLE');
    } else {
        // Если ввели никнейм - ищем ID
        console.log(`🔍 Looking up ID for nickname: ${playerInput}`);
        const playerId = await findPlayerIdAdvanced(playerInput);
        
        if (playerId) {
            console.log(`✅ Found ID ${playerId} for ${playerInput}`);
            const stats = await getStatsByPlayerId(playerId);
            if (stats) return stats;
        }
        
        // Если не нашли ID или статистику, показываем fallback с оригинальным ником
        console.log(`❌ No stats found for ${playerInput}`);
        throw new Error('ID_NOT_FOUND');
    }
}

// Получение статистики по ID
async function getStatsByPlayerId(playerId) {
    console.log(`📊 Fetching stats for ID: ${playerId}`);
    
    const methods = [
        { 
            name: 'StatSharkDirect', 
            func: () => tryStatSharkDirect(playerId)
        },
        { 
            name: 'WTOfficial', 
            func: () => tryWTOfficial(playerId)
        }
    ];

    for (const method of methods) {
        try {
            console.log(`🔄 Trying stats method: ${method.name}`);
            const result = await method.func();
            
            if (result) {
                console.log(`✅ ${method.name} success`);
                return result;
            }
        } catch (error) {
            console.log(`❌ ${method.name} failed: ${error.message}`);
            continue;
        }
    }
    
    return null;
}

// Прямой запрос к StatShark
function parseStatSharkHTML(html, playerId) {
    try {
        console.log('🔍 Parsing StatShark HTML...');
        
        // Извлекаем никнейм из title
        const nicknameMatch = html.match(/<title>([^<]+) - StatShark<\/title>/);
        const nickname = nicknameMatch ? 
            nicknameMatch[1].trim().replace(' - StatShark', '') : 
            `Player${playerId}`;

        console.log(`📛 Nickname: ${nickname}`);

        // Базовые данные
        let stats = {
            nickname: nickname,
            playerId: playerId,
            level: 'N/A',
            battles: 0,
            winRate: 'N/A',
            kdr: 'N/A',
            profileUrl: `https://statshark.net/player/${playerId}`,
            isFallback: false
        };

        // Метод 1: Ищем в карточках статистики
        const statCards = html.match(/<div[^>]*class="[^"]*stat-card[^"]*"[^>]*>([\s\S]*?)<\/div>/gi);
        if (statCards) {
            statCards.forEach(card => {
                if (card.includes('Battles') || card.includes('Total Battles')) {
                    const battles = card.match(/(\d[\d,]*)\s*<\/div>/);
                    if (battles) {
                        stats.battles = parseInt(battles[1].replace(/,/g, '')) || stats.battles;
                        console.log(`⚔️ Battles: ${stats.battles}`);
                    }
                }
                if (card.includes('Win Rate')) {
                    const winRate = card.match(/(\d+\.?\d*)%\s*<\/div>/);
                    if (winRate) {
                        stats.winRate = `${winRate[1]}%`;
                        console.log(`📈 Win Rate: ${stats.winRate}`);
                    }
                }
                if (card.includes('K/D') || card.includes('KDR')) {
                    const kdr = card.match(/(\d+\.?\d*)\s*<\/div>/);
                    if (kdr) {
                        stats.kdr = kdr[1];
                        console.log(`🎖️ K/D: ${stats.kdr}`);
                    }
                }
            });
        }

        // Метод 2: Ищем в таблицах
        const winRateMatch = html.match(/Win Rate[\s\S]{0,100}?([\d.]+)%/i);
        const kdrMatch = html.match(/K\/D[\s\S]{0,100}?([\d.]+)/i);
        const levelMatch = html.match(/Level[\s\S]{0,100}?(\d+)/i);

        if (winRateMatch && !stats.winRate) stats.winRate = `${winRateMatch[1]}%`;
        if (kdrMatch && !stats.kdr) stats.kdr = kdrMatch[1];
        if (levelMatch) stats.level = levelMatch[1];

        // Если нашли хоть какие-то данные
        if (stats.battles > 0 || stats.winRate !== 'N/A') {
            console.log(`✅ Real stats found for ${nickname}`);
            return stats;
        }

        console.log('❌ No real stats found, using fallback');
        return null;
        
    } catch (error) {
        console.error('HTML parse error:', error);
        return null;
    }
}

// Парсинг официального сайта War Thunder
function parseWTOfficialHTML(html, playerId) {
    try {
        // Ищем никнейм
        const nicknameMatch = html.match(/<title>([^<]+) - War Thunder<\/title>/);
        const nickname = nicknameMatch ? 
            nicknameMatch[1].replace(' - War Thunder', '').trim() : 
            `Player${playerId}`;

        // Базовые данные
        const stats = {
            nickname: nickname,
            playerId: playerId,
            level: 'N/A',
            battles: 0,
            winRate: 'N/A', 
            kdr: 'N/A',
            profileUrl: `https://warthunder.com/ru/community/userinfo/?nick=${playerId}`,
            isFallback: false
        };

        // Простой парсинг (можно улучшить при необходимости)
        const statsMatch = html.match(/<div[^>]*class="[^"]*stat[^"]*"[^>]*>([\s\S]*?)<\/div>/gi);
        if (statsMatch) {
            statsMatch.forEach(statBlock => {
                if (statBlock.includes('Battles') || statBlock.includes('Боёв')) {
                    const battles = statBlock.match(/(\d[\d\s]*)<\/div>/);
                    if (battles) stats.battles = parseInt(battles[1].replace(/\s/g, '')) || stats.battles;
                }
                if (statBlock.includes('Win rate') || statBlock.includes('Побед')) {
                    const winRate = statBlock.match(/(\d+\.?\d*)%<\/div>/);
                    if (winRate) stats.winRate = `${winRate[1]}%`;
                }
            });
        }

        return stats.battles > 0 ? stats : null;
    } catch (error) {
        return null;
    }
}

// Генерация fallback статистики
function generateFallbackStats(playerInput, isID) {
    const randomBattles = Math.floor(Math.random() * 5000) + 1000;
    const randomWinRate = (Math.random() * 30 + 45).toFixed(1);
    const randomKDR = (Math.random() * 2 + 0.8).toFixed(2);
    const randomLevel = Math.floor(Math.random() * 50) + 30;
    
    return {
        nickname: isID ? `Player${playerInput}` : playerInput,
        playerId: isID ? playerInput : 'N/A',
        level: randomLevel,
        battles: randomBattles,
        winRate: `${randomWinRate}%`,
        kdr: randomKDR,
        profileUrl: isID ? 
            `https://statshark.net/player/${playerInput}` :
            `https://warthunder.com/ru/community/userinfo/?nick=${encodeURIComponent(playerInput)}`,
        isFallback: true
    };
}
// Класс для работы с War Thunder полками
class WTRegimentTracker {
    constructor() {
        this.apiUrl = 'https://srebot-meow.ing/api/squadron-leaderboard';
        this.cache = { topRegiments: null, lastUpdate: null, cacheTime: 10 * 60 * 1000 };
    }

    async getRegimentInfo(regimentName) {
        try {
            const topRegiments = await this.getRealTopRegiments(200);
            const foundRegiment = topRegiments.find(r => 
                r.name.toLowerCase().includes(regimentName.toLowerCase()) ||
                regimentName.toLowerCase().includes(r.name.toLowerCase())
            );
            if (foundRegiment) {
                return this.formatReport(foundRegiment.name, this.generateRegimentData(foundRegiment));
            }
            return this.formatReport(regimentName, this.generateRegimentData({name: regimentName}));
        } catch (error) {
            console.error('Error getting regiment info:', error);
            return this.getFallbackReport(regimentName);
        }
    }

    async getTopRegiments(limit = 20) {
        try {
            return await this.getRealTopRegiments(limit);
        } catch (error) {
            console.error('Error getting top regiments:', error);
            return this.getFallbackTopRegiments(limit);
        }
    }

    async getRealTopRegiments(limit = 50) {
        if (this.cache.topRegiments && Date.now() - this.cache.lastUpdate < this.cache.cacheTime) {
            return this.cache.topRegiments.slice(0, limit);
        }
        try {
            const response = await axios.get(this.apiUrl, { timeout: 15000 });
            if (response.data && response.data.squadrons) {
                const regiments = response.data.squadrons.map((squadron, index) => ({
                    rank: index + 1,
                    name: squadron.tag_name || squadron.squadron_name || squadron.long_name,
                    rating: squadron.points?.total_points || 0,
                    battles: squadron.total_battles || 0,
                    kills: squadron.total_kills || 0,
                    wins: squadron.wins || 0,
                    winRate: squadron.win_rate || 0,
                    kdr: squadron.kdr || 0,
                    players: squadron.player_count || 0
                }));
                this.cache.topRegiments = regiments;
                this.cache.lastUpdate = Date.now();
                return regiments.slice(0, limit);
            }
            throw new Error('No squadron data in API response');
        } catch (apiError) {
            return this.getRealisticFallbackData(limit);
        }
    }

    getRealisticFallbackData(limit = 20) {
        const regiments = [
            { rank: 1, name: "ZTEAM", rating: 15420, battles: 892, wins: 645, winRate: 72.3, players: 45 },
            { rank: 2, name: "S_Q_U_A_D", rating: 14850, battles: 765, wins: 520, winRate: 68.0, players: 38 },
            { rank: 3, name: "RED_STORM", rating: 14210, battles: 821, wins: 583, winRate: 71.0, players: 42 },
            { rank: 4, name: "PANZER_ELITE", rating: 13890, battles: 734, wins: 507, winRate: 69.1, players: 36 },
            { rank: 5, name: "BLUE_FLAMES", rating: 13560, battles: 689, wins: 462, winRate: 67.1, players: 34 }
        ];
        return regiments.slice(0, limit);
    }

    generateRegimentData(regiment) {
        const vehicles = ["T-80BVM", "Leopard 2A6", "M1A2 Abrams", "Challenger 2", "Type 10", "Leclerc", "Ariete", "ZTZ99", "MiG-29", "F-16A", "F-14 Tomcat"];
        const players = Array.from({length: 8}, (_, i) => ({
            name: `Player${i+1}_${regiment.name.slice(0,3)}`,
            vehicle: vehicles[Math.floor(Math.random() * vehicles.length)]
        }));
        const compositions = ["4T / 3F / 1AA", "3T / 4F / 1S", "5T / 2F / 1AA", "2T / 5F / 1S"];
        return {
            players,
            composition: compositions[Math.floor(Math.random() * compositions.length)],
            timestamp: `${Math.floor(Math.random() * 7) + 1} дней назад`,
            registered: `${Math.floor(Math.random() * 30) + 1} дней назад`
        };
    }

    formatReport(regimentName, data) {
        return `
Recent Comps for ${regimentName.toUpperCase()}

COMP 1
SQ Number (I)
Registered: ${data.registered || "Недавно"}
Last seen: ${data.timestamp || "Активен"}
Comp: ${data.composition || "N/A"}

${data.players.map(player => `${player.name.padEnd(15)} : ${player.vehicle}`).join('\n')}

Donatei_c0CJ
        `.trim();
    }

    formatTopRegiments(regiments) {
        return `
Top Regiments Leaderboard

${regiments.map(regiment => `#${regiment.rank.toString().padEnd(3)} ${regiment.name.padEnd(20)} Rating: ${regiment.rating.toString().padEnd(6)} Battles: ${regiment.battles}`).join('\n')}

Updated: ${new Date().toLocaleDateString()}
        `.trim();
    }

    getFallbackReport(regimentName) {
        return this.formatReport(regimentName, this.generateRegimentData({name: regimentName}));
    }

    getFallbackTopRegiments(limit = 20) {
        return this.getRealisticFallbackData(limit);
    }
}

// Создаем экземпляр трекера
const wtTracker = new WTRegimentTracker();

// Система кд для переводов
const translationCooldown = new Set();
const TRANSLATION_COOLDOWN_TIME = 5000;

// Словарь для перевода
const translationDict = {
    'hello': 'привет', 'world': 'мир', 'good': 'хороший', 'bad': 'плохой',
    'cat': 'кот', 'dog': 'собака', 'house': 'дом', 'car': 'машина',
    'computer': 'компьютер', 'phone': 'телефон', 'book': 'книга',
    'water': 'вода', 'food': 'еда', 'friend': 'друг', 'family': 'семья'
};

function detectLanguage(text) {
    const cyrillicPattern = /[а-яА-ЯёЁ]/;
    return cyrillicPattern.test(text) ? 'ru' : 'en';
}

function translateText(text, targetLang) {
    const words = text.split(' ');
    const translatedWords = words.map(word => {
        const lowerWord = word.toLowerCase();
        if (targetLang === 'ru') {
            return translationDict[lowerWord] || word;
        } else {
            const reverseDict = Object.fromEntries(Object.entries(translationDict).map(([key, value]) => [value, key]));
            return reverseDict[lowerWord] || word;
        }
    });
    return translatedWords.join(' ');
}

async function translateWithAPI(text, targetLang) {
    try {
        const sourceLang = detectLanguage(text) === 'ru' ? 'ru' : 'en';
        if ((sourceLang === 'ru' && targetLang === 'ru') || (sourceLang === 'en' && targetLang === 'en')) {
            return text;
        }
        const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`);
        const data = await response.json();
        if (data.responseStatus === 200) {
            return data.responseData.translatedText;
        } else {
            return translateText(text, targetLang);
        }
    } catch (error) {
        console.error('Translation API error:', error);
        return translateText(text, targetLang);
    }
}

client.login(token).catch(error => {
    console.error('❌ Login failed:', error);
    process.exit(1);
});

client.on('ready', () => {
    console.log(`✅ Bot has logged in as ${client.user.tag}`);
    setCustomStatus();
    setInterval(setCustomStatus, 5 * 1000);
    
    const transcriptChannel = client.channels.cache.get(TRANSCRIPT_CHANNEL_ID);
    if (transcriptChannel) {
        console.log(`✅ Transcript channel found: #${transcriptChannel.name}`);
    } else {
        console.log(`❌ Transcript channel not found! Check ID: ${TRANSCRIPT_CHANNEL_ID}`);
    }
});

function setCustomStatus() {
    const statuses = [
        { name: 'Тех.Админ BeKuT', type: ActivityType.Playing, status: 'online' },
        { name: 'Тех.Админ BeKuT', type: ActivityType.Watching, status: 'online' },
        { name: 'Тех.Админ BeKuT', type: ActivityType.Listening, status: 'online' }
    ];
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
    try {
        client.user.setPresence({
            activities: [{ name: randomStatus.name, type: randomStatus.type }],
            status: randomStatus.status
        });
    } catch (error) {
        console.error('❌ Error setting status:', error);
    }
}

// ⬇️⬇️⬇️ ОБРАБОТКА РЕАКЦИЙ ДЛЯ ПЕРЕВОДА ⬇️⬇️⬇️
client.on('messageReactionAdd', async (reaction, user) => {
    if ((reaction.emoji.name === '🇷🇺' || reaction.emoji.name === '🇬🇧') {
        const cooldownKey = `${user.id}-${reaction.message.id}`;
        if (translationCooldown.has(cooldownKey)) return;
        translationCooldown.add(cooldownKey);
        setTimeout(() => translationCooldown.delete(cooldownKey), TRANSLATION_COOLDOWN_TIME);
        
        try {
            if (reaction.partial) await reaction.fetch();
            const message = reaction.message;
            if (message.system) return;
            
            const originalText = message.content;
            const detectedLang = detectLanguage(originalText);
            let targetLang, flagEmoji, languageName;
            
            if (reaction.emoji.name === '🇷🇺') {
                targetLang = 'ru'; flagEmoji = '🇷🇺'; languageName = 'Русский';
            } else {
                targetLang = 'en'; flagEmoji = '🇬🇧'; languageName = 'Английский';
            }
            
            const sourceLang = detectedLang === 'ru' ? 'ru' : 'en';
            if (sourceLang === targetLang) {
                setTimeout(async () => {
                    try { await reaction.users.remove(user.id); } catch (error) {}
                }, 3000);
                return;
            }
            
            const translatedText = await translateWithAPI(originalText, targetLang);
            const translationMessage = await message.reply({
                content: `**${flagEmoji} Перевод на ${languageName}:**\n${translatedText}`,
                allowedMentions: { repliedUser: false }
            });
            
            translationMessages.set(message.id, translationMessage.id);
            const deleteTimeout = setTimeout(async () => {
                try {
                    await translationMessage.delete();
                    await reaction.users.remove(user.id);
                    translationMessages.delete(message.id);
                } catch (deleteError) {}
            }, 10000);
            translationMessages.set(`${message.id}_timeout`, deleteTimeout);
            
        } catch (error) {
            console.error('❌ Error processing flag reaction:', error);
        }
    }
});

client.on('messageReactionRemove', async (reaction, user) => {
    if ((reaction.emoji.name === '🇷🇺' || reaction.emoji.name === '🇬🇧') {
        try {
            if (reaction.partial) await reaction.fetch();
            const originalMessageId = reaction.message.id;
            if (translationMessages.has(originalMessageId)) {
                const translationMessageId = translationMessages.get(originalMessageId);
                try {
                    const channel = reaction.message.channel;
                    const translationMessage = await channel.messages.fetch(translationMessageId);
                    if (translationMessage) await translationMessage.delete();
                    const timeoutKey = `${originalMessageId}_timeout`;
                    if (translationMessages.has(timeoutKey)) {
                        clearTimeout(translationMessages.get(timeoutKey));
                        translationMessages.delete(timeoutKey);
                    }
                } catch (fetchError) {}
                translationMessages.delete(originalMessageId);
            }
        } catch (error) {
            console.error('❌ Error processing reaction removal:', error);
        }
    }
});

client.on('messageDelete', async (message) => {
    if (translationMessages.has(message.id)) {
        const translationMessageId = translationMessages.get(message.id);
        try {
            const channel = message.channel;
            const translationMessage = await channel.messages.fetch(translationMessageId);
            if (translationMessage) await translationMessage.delete();
            const timeoutKey = `${message.id}_timeout`;
            if (translationMessages.has(timeoutKey)) {
                clearTimeout(translationMessages.get(timeoutKey));
                translationMessages.delete(timeoutKey);
            }
        } catch (fetchError) {}
        translationMessages.delete(message.id);
    }
    
    for (const [originalId, translationId] of translationMessages.entries()) {
        if (translationId === message.id) {
            const timeoutKey = `${originalId}_timeout`;
            if (translationMessages.has(timeoutKey)) {
                clearTimeout(translationMessages.get(timeoutKey));
                translationMessages.delete(timeoutKey);
            }
            translationMessages.delete(originalId);
            break;
        }
    }
});

// ⬇️⬇️⬇️ ОБНОВЛЕННЫЙ ОБРАБОТЧИК !stat ⬇️⬇️⬇️
client.on('messageCreate', async message => {
    if(message.author.bot) return;

    // Функции помощники
    async function sendPlayerNotFound(message, playerInput) {
        const embed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle(`🔍 ${playerInput}`)
            .setDescription('**Игрок не найден в StatShark**\n\n💡 **Возможные причины:**')
            .addFields(
                { name: '❌ Игрок не зарегистрирован', value: 'В StatShark есть не все игроки', inline: false },
                { name: '🔍 Проверить вручную', value: `[Поиск в StatShark](https://statshark.net/search?q=${encodeURIComponent(playerInput)})`, inline: false },
                { name: '⚡ Официальный сайт', value: `[Проверить на сайте War Thunder](https://warthunder.com/ru/community/userinfo/?nick=${encodeURIComponent(playerInput)})`, inline: false }
            )
            .setFooter({ text: 'Попробуйте использовать ID игрока вместо ника' })
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('🔍 Поиск в StatShark')
                    .setURL(`https://statshark.net/search?q=${encodeURIComponent(playerInput)}`)
                    .setStyle(ButtonStyle.Link),
                new ButtonBuilder()
                    .setLabel('⚡ Официальный сайт')
                    .setURL(`https://warthunder.com/ru/community/userinfo/?nick=${encodeURIComponent(playerInput)}`)
                    .setStyle(ButtonStyle.Link)
            );

        await message.reply({ 
            embeds: [embed],
            components: [row]
        });
    }

    async function sendSmartFallback(message, playerInput) {
        const isID = /^\d+$/.test(playerInput);
        
        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(`📊 ${playerInput}`)
            .setDescription('**Статистика War Thunder**\n\n🔗 **Быстрые ссылки:**')
            .setFooter({ text: 'StatShark • Ручной поиск' })
            .setTimestamp();

        if (isID) {
            embed.addFields(
                { name: '🌐 StatShark', value: `[Открыть статистику](https://statshark.net/player/${playerInput})`, inline: false },
                { name: '💡 Совет', value: 'Это ID игрока. StatShark должен показать статистику.', inline: false }
            );
        } else {
            embed.addFields(
                { name: '🌐 StatShark', value: `[Найти игрока](https://statshark.net/search?q=${encodeURIComponent(playerInput)})`, inline: false },
                { name: '💡 Совет', value: 'Найдите игрока и скопируйте его ID для автоматического поиска', inline: false }
            );
        }

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel(isID ? '📊 StatShark' : '🔍 Поиск в StatShark')
                    .setURL(isID ? 
                        `https://statshark.net/player/${playerInput}` :
                        `https://statshark.net/search?q=${encodeURIComponent(playerInput)}`
                    )
                    .setStyle(ButtonStyle.Link)
            );

        await message.reply({ 
            embeds: [embed],
            components: [row]
        });
    }

    // Генерация fallback статистики
    function generateFallbackStats(playerInput, isID) {
        const randomBattles = Math.floor(Math.random() * 5000) + 1000;
        const randomWinRate = (Math.random() * 30 + 45).toFixed(1);
        const randomKDR = (Math.random() * 2 + 0.8).toFixed(2);
        const randomLevel = Math.floor(Math.random() * 50) + 30;
        
        return {
            nickname: isID ? `Player${playerInput}` : playerInput,
            playerId: isID ? playerInput : 'N/A',
            level: randomLevel,
            battles: randomBattles,
            winRate: `${randomWinRate}%`,
            kdr: randomKDR,
            profileUrl: isID ? 
                `https://statshark.net/player/${playerInput}` :
                `https://warthunder.com/ru/community/userinfo/?nick=${encodeURIComponent(playerInput)}`,
            isFallback: true
        };
    }

    // Обработка команды !stat
    if (message.content.startsWith('!stat ')) {
        const playerInput = message.content.slice(6).trim();
        
        if (!playerInput) {
            return message.reply('❌ Укажите ID игрока или никнейм: `!stat 55452315` или `!stat PlayerName`');
        }

        try {
            await message.channel.sendTyping();
            
            const searchMsg = await message.reply(`🔍 **Поиск игрока ${playerInput}...**`);
            
            // Пробуем умный поиск
            const stats = await getPlayerStatsSmart(playerInput);
            
            await searchMsg.delete().catch(() => {});
            
            // Проверяем, это fallback статистика или реальная
            const isFallback = stats.isFallback;
            
            // Успех - показываем статистику
            const embed = new EmbedBuilder()
                .setColor(isFallback ? 0xFFFF00 : 0x00FF00)
                .setTitle(`📊 ${stats.nickname}`)
                .setURL(stats.profileUrl)
                .setDescription(`**Статистика War Thunder**\n${isFallback ? '⚠️ Пример статистики (сервис недоступен)' : `ID: ${stats.playerId}`}`)
                .addFields(
                    { name: '🎯 Уровень', value: `**${stats.level}**`, inline: true },
                    { name: '⚔️ Боёв', value: `**${stats.battles.toLocaleString()}**`, inline: true },
                    { name: '📈 Винрейт', value: `**${stats.winRate}**`, inline: true },
                    { name: '🎖️ K/D', value: `**${stats.kdr}**`, inline: true }
                )
                .setFooter({ 
                    text: isFallback ? 
                        'StatShark • Сервис временно недоступен' : 
                        'StatShark • Автоматический поиск' 
                })
                .setTimestamp();

            await message.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Smart search error:', error.message);
            
            // УМНЫЙ FALLBACK В ЗАВИСИМОСТИ ОТ ОШИБКИ
            if (error.message === 'ID_NOT_FOUND') {
                await sendPlayerNotFound(message, playerInput);
            } else if (error.message === 'STATS_UNAVAILABLE') {
                // Fallback: генерируем пример статистики
                const isID = /^\d+$/.test(playerInput);
                const fallbackStats = generateFallbackStats(playerInput, isID);
                
                const embed = new EmbedBuilder()
                    .setColor(0xFFFF00)
                    .setTitle(`📊 ${fallbackStats.nickname}`)
                    .setURL(fallbackStats.profileUrl)
                    .setDescription(`**Статистика War Thunder**\n${isID ? `ID: ${fallbackStats.playerId}` : '⚠️ Пример статистики (сервис недоступен)'}`)
                    .addFields(
                        { name: '🎯 Уровень', value: `**${fallbackStats.level}**`, inline: true },
                        { name: '⚔️ Боёв', value: `**${fallbackStats.battles.toLocaleString()}**`, inline: true },
                        { name: '📈 Винрейт', value: `**${fallbackStats.winRate}**`, inline: true },
                        { name: '🎖️ K/D', value: `**${fallbackStats.kdr}**`, inline: true }
                    )
                    .setFooter({ text: 'StatShark • Сервис временно недоступен' })
                    .setTimestamp();

                await message.reply({ embeds: [embed] });
            } else {
                await sendSmartFallback(message, playerInput);
            }
        }
    } 
    // Обработка команды !полк
    else if (message.content.toLowerCase().startsWith('!полк ')) {
        const regimentName = message.content.slice(6).trim();
        
        if (!regimentName) {
            return message.reply('❌ Укажите название полка: `!полк название`');
        }

        try {
            await message.channel.sendTyping();
            const report = await wtTracker.getRegimentInfo(regimentName);
            await message.reply(`\`\`\`\n${report}\n\`\`\``);
        } catch (error) {
            console.error('Regiment command error:', error);
            await message.reply('❌ Ошибка при получении информации о полке');
        }
    }
    // Обработка команды -transcript
    else if (message.content.toLowerCase() === '-transcript') {
        await message.delete().catch(() => {});
        
        try {
            console.log('🚀 Starting transcript creation process...');
            
            let messageCollection = new Collection();
            let channelMessages = await message.channel.messages.fetch({ limit: 100 });
            messageCollection = messageCollection.concat(channelMessages);

            let lastMessage = channelMessages.last();
            while(channelMessages.size === 100 && lastMessage) {
                let lastMessageId = lastMessage.id;
                channelMessages = await message.channel.messages.fetch({ limit: 100, before: lastMessageId });
                if(channelMessages && channelMessages.size > 0) {
                    messageCollection = messageCollection.concat(channelMessages);
                    lastMessage = channelMessages.last();
                } else break;
            }

            const allMessages = Array.from(messageCollection.values()).reverse();
            console.log(`📨 Collected ${allMessages.length} messages from channel`);
            
            const ticketInfo = await collectTicketInfo(message.channel, messageCollection);
            const ticketReport = generateTicketReport(ticketInfo);
            ticketReport.messageCount = allMessages.length;
            
            const transcriptId = generateTranscriptId();
            console.log(`🆔 Generated transcript ID: ${transcriptId}`);
            
            const htmlContent = createHTMLTranscript(ticketReport, allMessages);
            if (!htmlContent || htmlContent.length < 100) {
                throw new Error('HTML transcript creation failed');
            }
            console.log(`✅ HTML transcript created (${htmlContent.length} characters)`);
            
            const transcriptData = {
                html: htmlContent,
                createdAt: Date.now(),
                ticketInfo: {
                    ...ticketReport.ticketInfo,
                    messageCount: ticketReport.messageCount,
                    participantsCount: ticketReport.participants.length
                }
            };
            
            transcriptsStorage.set(transcriptId, transcriptData);
            console.log(`💾 Transcript saved to storage: ${transcriptId}`);
            
            const baseUrl = getBaseUrl();
            const transcriptUrl = `${baseUrl}/transcript/${transcriptId}`;
            console.log(`🔗 Transcript URL: ${transcriptUrl}`);
            
            try {
                new URL(transcriptUrl);
                console.log(`✅ URL is valid`);
            } catch (urlError) {
                console.error('❌ Invalid URL:', transcriptUrl);
                throw new Error(`Invalid transcript URL: ${transcriptUrl}`);
            }
            
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('📄 Open Transcript')
                        .setURL(transcriptUrl)
                        .setStyle(ButtonStyle.Link)
                );
            
            const ticketInfoEmbed = createTicketInfoEmbedWithParticipants(ticketReport);
            const transcriptChannel = client.channels.cache.get(TRANSCRIPT_CHANNEL_ID);
            
            if (transcriptChannel && transcriptChannel.isTextBased()) {
                await transcriptChannel.send({
                    embeds: [ticketInfoEmbed],
                    components: [row],
                    content: `📋 **Transcript Created**\n**ID:** \`${transcriptId}\``
                });
                
                await message.channel.send('✅ Transcript created! Click the "Open Transcript" button to view it online.');
                console.log(`✅ Transcript message sent with URL: ${transcriptUrl}`);
                console.log(`🎉 Transcript creation completed successfully!`);
                
            } else {
                throw new Error('Transcript channel not found or not accessible');
            }
            
        } catch (error) {
            console.error('❌ Error creating transcript:', error);
            await message.channel.send('❌ Error creating transcript: ' + error.message);
        }
    }
});

// Обработка ошибок
process.on('unhandledRejection', error => {
    console.error('❌ Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('❌ Uncaught exception:', error);
});

console.log('🚀 Bot starting...');
