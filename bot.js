const { Client, GatewayIntentBits, Collection, ActivityType, EmbedBuilder } = require('discord.js');
const fs = require('fs').promises;
const axios = require('axios');

// ⬇️⬇️⬇️ ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ ⬇️⬇️⬇️
const token = process.env.DISCORD_TOKEN;
const TRANSCRIPT_CHANNEL_ID = process.env.TRANSCRIPT_CHANNEL_ID || '1433893954759295157';

// Проверка наличия токена
if (!token) {
    console.error('❌ CRITICAL ERROR: DISCORD_TOKEN not found!');
    console.log('💡 Set DISCORD_TOKEN in Railway Variables');
    process.exit(1);
}

console.log('✅ Token loaded successfully');
console.log(`📝 Channel ID: ${TRANSCRIPT_CHANNEL_ID}`);

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
    const participants = new Set();
    let ticketCreator = null;
    let firstMessage = null;

    // Собираем участников и находим первое сообщение
    messages.forEach(msg => {
        // Добавляем участника
        participants.add({
            id: msg.author.id,
            username: msg.author.tag,
            displayName: msg.author.displayName || msg.author.username,
            bot: msg.author.bot,
            avatar: msg.author.displayAvatarURL({ format: 'png', size: 64 })
        });

        // Ищем первое сообщение для определения создателя
        if (!firstMessage || msg.createdTimestamp < firstMessage.createdTimestamp) {
            firstMessage = msg;
        }
    });

    // Создатель тикета - автор первого сообщения
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
        participants: Array.from(participants).map(p => ({
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
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Whitney', 'Helvetica Neue', Helvetica, Arial, sans-serif;
            background: #36393f;
            color: #dcddde;
            line-height: 1.4;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }

        .header {
            background: #2f3136;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            border-left: 4px solid #7289da;
        }

        .server-info {
            display: flex;
            align-items: center;
            margin-bottom: 15px;
        }

        .server-icon {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            margin-right: 15px;
        }

        .server-details h1 {
            color: #fff;
            font-size: 24px;
            margin-bottom: 5px;
        }

        .server-details .channel-name {
            color: #8e9297;
            font-size: 16px;
        }

        .ticket-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }

        .stat {
            background: #40444b;
            padding: 12px;
            border-radius: 4px;
        }

        .stat-label {
            color: #8e9297;
            font-size: 12px;
            text-transform: uppercase;
            margin-bottom: 5px;
        }

        .stat-value {
            color: #fff;
            font-size: 18px;
            font-weight: bold;
        }

        .participants-section {
            background: #2f3136;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
        }

        .section-title {
            color: #fff;
            font-size: 18px;
            margin-bottom: 15px;
            font-weight: 600;
        }

        .participants-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 10px;
        }

        .participant {
            display: flex;
            align-items: center;
            padding: 10px;
            background: #40444b;
            border-radius: 4px;
        }

        .participant .avatar {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            margin-right: 10px;
        }

        .participant-info {
            flex: 1;
        }

        .participant .username {
            color: #fff;
            font-weight: 500;
        }

        .participant .discriminator {
            color: #8e9297;
            font-size: 12px;
        }

        .participant .role {
            background: #7289da;
            color: #fff;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 500;
        }

        .messages-section {
            background: #2f3136;
            border-radius: 8px;
            overflow: hidden;
        }

        .messages-header {
            background: #36393f;
            padding: 15px 20px;
            border-bottom: 1px solid #40444b;
        }

        .messages-container {
            padding: 20px;
            max-height: 600px;
            overflow-y: auto;
        }

        .message {
            display: flex;
            margin-bottom: 20px;
            padding: 5px;
            border-radius: 4px;
            transition: background-color 0.2s;
        }

        .message:hover {
            background: #32353b;
        }

        .message-avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            margin-right: 15px;
            flex-shrink: 0;
        }

        .message-content {
            flex: 1;
            min-width: 0;
        }

        .message-header {
            display: flex;
            align-items: center;
            margin-bottom: 5px;
        }

        .author-name {
            color: #fff;
            font-weight: 500;
            margin-right: 8px;
        }

        .message-time {
            color: #72767d;
            font-size: 12px;
        }

        .message-text {
            color: #dcddde;
            word-wrap: break-word;
            white-space: pre-wrap;
        }

        .attachments {
            margin-top: 10px;
        }

        .attachment {
            margin-top: 5px;
        }

        .attachment-image {
            max-width: 400px;
            max-height: 300px;
            border-radius: 4px;
            cursor: pointer;
        }

        .attachment-link {
            color: #00aff4;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            padding: 5px 10px;
            background: #2f3136;
            border-radius: 4px;
            border: 1px solid #40444b;
        }

        .attachment-link:hover {
            text-decoration: underline;
        }

        .embeds {
            margin-top: 10px;
        }

        .embed {
            background: #2f3136;
            border-left: 4px solid #40444b;
            border-radius: 4px;
            padding: 12px;
            margin-top: 8px;
            max-width: 400px;
        }

        .embed-title {
            color: #00aff4;
            font-weight: 600;
            margin-bottom: 8px;
            text-decoration: none;
        }

        .embed-title:hover {
            text-decoration: underline;
        }

        .embed-description {
            color: #dcddde;
            font-size: 14px;
            line-height: 1.4;
        }

        .embed-footer {
            margin-top: 8px;
            color: #72767d;
            font-size: 12px;
        }

        .mention {
            background: #3a3c42;
            color: #dee0fc;
            padding: 1px 4px;
            border-radius: 3px;
            font-weight: 500;
        }

        .code-block {
            background: #2f3136;
            border: 1px solid #40444b;
            border-radius: 4px;
            padding: 10px;
            margin: 5px 0;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 14px;
            overflow-x: auto;
        }

        .inline-code {
            background: #2f3136;
            border: 1px solid #40444b;
            border-radius: 3px;
            padding: 2px 4px;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 14px;
        }

        .footer {
            text-align: center;
            margin-top: 30px;
            color: #72767d;
            font-size: 12px;
            padding: 20px;
            border-top: 1px solid #40444b;
        }

        /* Scrollbar styling */
        .messages-container::-webkit-scrollbar {
            width: 8px;
        }

        .messages-container::-webkit-scrollbar-track {
            background: #2f3136;
        }

        .messages-container::-webkit-scrollbar-thumb {
            background: #202225;
            border-radius: 4px;
        }

        .messages-container::-webkit-scrollbar-thumb:hover {
            background: #1a1c20;
        }
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
            Транскрипт создан автоматически • ${new Date().toLocaleString('ru-RU')}
        </div>
    </div>

    <script>
        // Добавляем функциональность для изображений
        document.addEventListener('DOMContentLoaded', function() {
            // Открытие изображений в полном размере при клике
            const images = document.querySelectorAll('.attachment-image');
            images.forEach(img => {
                img.addEventListener('click', function() {
                    const overlay = document.createElement('div');
                    overlay.style.cssText = \`
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background: rgba(0,0,0,0.8);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        z-index: 1000;
                        cursor: pointer;
                    \`;
                    
                    const fullImage = document.createElement('img');
                    fullImage.src = this.src;
                    fullImage.style.cssText = \`
                        max-width: 90%;
                        max-height: 90%;
                        border-radius: 8px;
                    \`;
                    
                    overlay.appendChild(fullImage);
                    overlay.addEventListener('click', function() {
                        document.body.removeChild(overlay);
                    });
                    
                    document.body.appendChild(overlay);
                });
            });

            // Плавная прокрутка к сообщению при клике на ссылку
            const messageLinks = document.querySelectorAll('a[href^="#message-"]');
            messageLinks.forEach(link => {
                link.addEventListener('click', function(e) {
                    e.preventDefault();
                    const targetId = this.getAttribute('href').substring(1);
                    const targetElement = document.getElementById(targetId);
                    if (targetElement) {
                        targetElement.scrollIntoView({ behavior: 'smooth' });
                        targetElement.style.backgroundColor = '#3a3c42';
                        setTimeout(() => {
                            targetElement.style.backgroundColor = '';
                        }, 2000);
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
    
    // Форматирование упоминаний
    content = content.replace(/<@!?(\d+)>/g, '<span class="mention">@user</span>');
    
    // Форматирование каналов
    content = content.replace(/<#(\d+)>/g, '<span class="mention">#channel</span>');
    
    // Форматирование код-блоков
    content = content.replace(/```([\s\S]*?)```/g, '<div class="code-block">$1</div>');
    
    // Форматирование инлайн-кода
    content = content.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    
    // Форматирование ссылок
    content = content.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color: #00aff4;">$1</a>');
    
    // Сохранение переносов строк
    content = content.replace(/\n/g, '<br>');
    
    return content;
}

function createEmbedHTML(embed) {
    if (!embed) return '';
    
    return `
    <div class="embed">
        ${embed.title ? `<a href="${embed.url || '#'}" class="embed-title" target="_blank">${embed.title}</a>` : ''}
        ${embed.description ? `<div class="embed-description">${formatMessageContent(embed.description)}</div>` : ''}
        ${embed.footer ? `<div class="embed-footer">${embed.footer.text}</div>` : ''}
    </div>
    `;
}

// Функция для создания отдельного сообщения с информацией о тикете
function createTicketInfoMessage(ticketReport) {
    const createdBy = ticketReport.ticketInfo.createdBy;
    
    let infoMessage = `📋 TICKET INFORMATION:\n`;
    infoMessage += `• ID: #${ticketReport.ticketInfo.id}\n`;
    infoMessage += `• Server: ${ticketReport.ticketInfo.server}\n`;
    infoMessage += `• Created: ${ticketReport.ticketInfo.createdAt.toLocaleString('ru-RU')}\n`;
    if (createdBy) {
        infoMessage += `• Created by: ${createdBy.displayName} (${createdBy.id})\n`;
    }
    infoMessage += `• Channel: ${ticketReport.ticketInfo.channelName}\n`;
    infoMessage += `• Messages: ${ticketReport.messageCount}\n`;
    infoMessage += `• Participants: ${ticketReport.participants.length}`;
    
    return infoMessage;
}

// Класс для работы с War Thunder полками
class WTRegimentTracker {
    constructor() {
        this.apiUrl = 'https://srebot-meow.ing/api/squadron-leaderboard';
        this.cache = {
            topRegiments: null,
            lastUpdate: null,
            cacheTime: 10 * 60 * 1000
        };
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
            const realData = await this.getRealTopRegiments(limit);
            return realData;
        } catch (error) {
            console.error('Error getting top regiments:', error);
            return this.getFallbackTopRegiments(limit);
        }
    }

    async searchRegiments(query, page = 1) {
        try {
            const allRegiments = await this.getRealTopRegiments(200);
            return allRegiments.filter(regiment => 
                regiment.name.toLowerCase().includes(query.toLowerCase())
            ).slice(0, 10);
        } catch (error) {
            console.error('Error searching regiments:', error);
            return [];
        }
    }

    async getRealTopRegiments(limit = 50) {
        if (this.cache.topRegiments && this.cache.lastUpdate && 
            Date.now() - this.cache.lastUpdate < this.cache.cacheTime) {
            return this.cache.topRegiments.slice(0, limit);
        }

        try {
            console.log('🔍 Получение реальных данных с srebot-meow API...');
            
            const response = await axios.get(this.apiUrl, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                    'Accept': 'application/json',
                    'Referer': 'https://srebot-meow.ing/leaderboard/squadrons'
                }
            });

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
                
                console.log(`✅ Успешно получено ${regiments.length} полков через API`);
                return regiments.slice(0, limit);
            }

            throw new Error('No squadron data in API response');

        } catch (apiError) {
            console.log('❌ API не доступен, используем локальные данные...');
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
        const vehicles = [
            "T-80BVM", "Leopard 2A6", "M1A2 Abrams", "Challenger 2", "Type 10",
            "Leclerc", "Ariete", "ZTZ99", "MiG-29", "F-16A", "F-14 Tomcat"
        ];
        
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

${data.players.map(player => 
    `${player.name.padEnd(15)} : ${player.vehicle}`
).join('\n')}

Donatei_c0CJ
        `.trim();
    }

    formatTopRegiments(regiments) {
        return `
Top Regiments Leaderboard

${regiments.map(regiment => 
    `#${regiment.rank.toString().padEnd(3)} ${regiment.name.padEnd(20)} Rating: ${regiment.rating.toString().padEnd(6)} Battles: ${regiment.battles}`
).join('\n')}

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
            const reverseDict = Object.fromEntries(
                Object.entries(translationDict).map(([key, value]) => [value, key])
            );
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
    
    // Устанавливаем первый статус сразу
    setCustomStatus();
    
    // Обновление статуса каждую минуту
    setInterval(setCustomStatus, 5 * 1000);
    
    // Проверка канала
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
        { name: 'Тех.Админ BeKuT', type: ActivityType.Playing, status: 'online' },
        { name: 'Тех.Админ BeKuT', type: ActivityType.Playing, status: 'online' },
        { name: 'Тех.Админ BeKuT', type: ActivityType.Playing, status: 'online' },
        { name: 'Тех.Админ BeKuT', type: ActivityType.Playing, status: 'online' },
        { name: 'Тех.Админ BeKuT', type: ActivityType.Watching, status: 'online' },
        { name: 'Тех.Админ BeKuT', type: ActivityType.Watching, status: 'online' },
        { name: 'Тех.Админ BeKuT', type: ActivityType.Watching, status: 'online' },
        { name: 'Тех.Админ BeKuT', type: ActivityType.Listening, status: 'online' },
        { name: `Тех.Админ BeKuT`, type: ActivityType.Watching, status: 'online' },
        { name: `Тех.Админ BeKuT`, type: ActivityType.Listening, status: 'online' },
        { name: 'Тех.Админ BeKuT', type: ActivityType.Playing, status: 'online' },
        { name: 'Тех.Админ BeKuT', type: ActivityType.Playing, status: 'online' },
        { name: 'Тех.Админ BeKuT', type: ActivityType.Watching, status: 'online' }
    ];
    
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
    
    try {
        client.user.setPresence({
            activities: [{
                name: randomStatus.name,
                type: randomStatus.type
            }],
            status: randomStatus.status
        });
    } catch (error) {
        console.error('❌ Error setting status:', error);
    }
}

// ⬇️⬇️⬇️ ОБРАБОТКА РЕАКЦИЙ ДЛЯ ПЕРЕВОДА ⬇️⬇️⬇️

client.on('messageReactionAdd', async (reaction, user) => {
    if ((reaction.emoji.name === '🇷🇺' || reaction.emoji.name === '🇬🇧') && !user.bot) {
        
        // Проверка кд
        const cooldownKey = `${user.id}-${reaction.message.id}`;
        if (translationCooldown.has(cooldownKey)) {
            return;
        }
        translationCooldown.add(cooldownKey);
        setTimeout(() => translationCooldown.delete(cooldownKey), TRANSLATION_COOLDOWN_TIME);
        
        try {
            // Получаем полное сообщение
            if (reaction.partial) {
                await reaction.fetch();
            }
            
            const message = reaction.message;
            
            // Проверяем, что сообщение не от бота и не пустое
            if (message.author.bot || !message.content || message.content.trim() === '') {
                return;
            }
            
            const originalText = message.content;
            const detectedLang = detectLanguage(originalText);
            
            let targetLang, flagEmoji, languageName;
            
            // Определяем направление перевода на основе реакции
            if (reaction.emoji.name === '🇷🇺') {
                targetLang = 'ru';
                flagEmoji = '🇷🇺';
                languageName = 'Русский';
            } else {
                targetLang = 'en';
                flagEmoji = '🇬🇧';
                languageName = 'Английский';
            }
            
            // Проверяем, нужен ли перевод
            const sourceLang = detectedLang === 'ru' ? 'ru' : 'en';
            if (sourceLang === targetLang) {
                // Если язык уже соответствует, просто удаляем реакцию
                setTimeout(async () => {
                    try {
                        await reaction.users.remove(user.id);
                        console.log(`🗑️ Reaction removed (message already in ${languageName})`);
                    } catch (error) {
                        console.error('❌ Error removing reaction:', error);
                    }
                }, 3000);
                return;
            }
            
            // Выполняем перевод
            const translatedText = await translateWithAPI(originalText, targetLang);
            
            // Отправляем перевод как ответ на сообщение
            const translationMessage = await message.reply({
                content: `**${flagEmoji} Перевод на ${languageName}:**\n${translatedText}`,
                allowedMentions: { repliedUser: false }
            });
            
            // Сохраняем связь между оригинальным сообщением и переводом
            translationMessages.set(message.id, translationMessage.id);
            console.log(`✅ Translation ${sourceLang}→${targetLang} sent: "${originalText.substring(0, 50)}..."`);
            
            // УДАЛЕНИЕ ЧЕРЕЗ 10 СЕКУНД
            const deleteTimeout = setTimeout(async () => {
                try {
                    // Удаляем сообщение с переводом
                    await translationMessage.delete();
                    console.log(`🗑️ Translation message deleted (timeout)`);
                    
                    // Удаляем реакцию флага
                    await reaction.users.remove(user.id);
                    console.log(`🗑️ ${reaction.emoji.name} reaction removed from user ${user.tag}`);
                    
                    // Удаляем из хранилища
                    translationMessages.delete(message.id);
                    
                } catch (deleteError) {
                    console.error('❌ Error deleting translation/reaction:', deleteError);
                }
            }, 10000);
            
            // Сохраняем timeout для возможной отмены
            translationMessages.set(`${message.id}_timeout`, deleteTimeout);
            
        } catch (error) {
            console.error('❌ Error processing flag reaction:', error);
        }
    }
});

// ⬇️⬇️⬇️ ОБРАБОТКА УДАЛЕНИЯ РЕАКЦИЙ ⬇️⬇️⬇️

client.on('messageReactionRemove', async (reaction, user) => {
    if ((reaction.emoji.name === '🇷🇺' || reaction.emoji.name === '🇬🇧') && !user.bot) {
        try {
            // Получаем полное сообщение
            if (reaction.partial) {
                await reaction.fetch();
            }
            
            const originalMessageId = reaction.message.id;
            
            // Проверяем, есть ли связанное сообщение с переводом
            if (translationMessages.has(originalMessageId)) {
                const translationMessageId = translationMessages.get(originalMessageId);
                
                try {
                    // Получаем канал
                    const channel = reaction.message.channel;
                    
                    // Пробуем найти и удалить сообщение с переводом
                    const translationMessage = await channel.messages.fetch(translationMessageId);
                    if (translationMessage) {
                        await translationMessage.delete();
                        console.log(`🗑️ Translation message deleted (reaction removed by user)`);
                    }
                    
                    // Отменяем автоматическое удаление если оно еще не сработало
                    const timeoutKey = `${originalMessageId}_timeout`;
                    if (translationMessages.has(timeoutKey)) {
                        clearTimeout(translationMessages.get(timeoutKey));
                        translationMessages.delete(timeoutKey);
                    }
                    
                } catch (fetchError) {
                    console.log('❌ Translation message already deleted or not found');
                }
                
                // Удаляем из хранилища
                translationMessages.delete(originalMessageId);
                console.log(`🗑️ User ${user.tag} removed reaction, translation deleted`);
            }
            
        } catch (error) {
            console.error('❌ Error processing reaction removal:', error);
        }
    }
});

// ⬇️⬇️⬇️ ОБРАБОТКА УДАЛЕНИЯ СООБЩЕНИЙ ⬇️⬇️⬇️

client.on('messageDelete', async (message) => {
    // Если удалено оригинальное сообщение, удаляем и перевод
    if (translationMessages.has(message.id)) {
        const translationMessageId = translationMessages.get(message.id);
        
        try {
            const channel = message.channel;
            const translationMessage = await channel.messages.fetch(translationMessageId);
            if (translationMessage) {
                await translationMessage.delete();
                console.log(`🗑️ Translation message deleted (original message deleted)`);
            }
            
            // Отменяем автоматическое удаление
            const timeoutKey = `${message.id}_timeout`;
            if (translationMessages.has(timeoutKey)) {
                clearTimeout(translationMessages.get(timeoutKey));
                translationMessages.delete(timeoutKey);
            }
            
        } catch (fetchError) {
            console.log('❌ Translation message already deleted');
        }
        
        // Удаляем из хранилища
        translationMessages.delete(message.id);
    }
    
    // Если удалено сообщение с переводом, очищаем хранилище
    for (const [originalId, translationId] of translationMessages.entries()) {
        if (translationId === message.id) {
            const timeoutKey = `${originalId}_timeout`;
            if (translationMessages.has(timeoutKey)) {
                clearTimeout(translationMessages.get(timeoutKey));
                translationMessages.delete(timeoutKey);
            }
            translationMessages.delete(originalId);
            console.log(`🗑️ Translation mapping cleaned (translation message deleted)`);
            break;
        }
    }
});

// ⬇️⬇️⬇️ ОБРАБОТКА СООБЩЕНИЙ ⬇️⬇️⬇️

client.on('messageCreate', async message => {
    // Пропускаем только сообщения от других ботов, но разрешаем команду -transcript для всех
    if(message.author.bot && !message.content.toLowerCase().includes('-transcript')) return;

    // КОМАНДЫ WAR THUNDER
    if(message.content.toLowerCase().startsWith('!полк ')) {
        // ... существующий код для War Thunder команд ...
    }

    // ОБНОВЛЕННАЯ КОМАНДА ТРАНСКРИПТА - ДОСТУПНА ДЛЯ ЛЮДЕЙ И БОТОВ
    else if(message.content.toLowerCase() === '-transcript') {
    await message.delete().catch(() => {});
    
    try {
        // Собираем все сообщения из канала
        let messageCollection = new Collection();
        let channelMessages = await message.channel.messages.fetch({ limit: 100 });
        messageCollection = messageCollection.concat(channelMessages);

        let lastMessage = channelMessages.last();
        while(channelMessages.size === 100 && lastMessage) {
            let lastMessageId = lastMessage.id;
            channelMessages = await message.channel.messages.fetch({ 
                limit: 100, 
                before: lastMessageId 
            });
            
            if(channelMessages && channelMessages.size > 0) {
                messageCollection = messageCollection.concat(channelMessages);
                lastMessage = channelMessages.last();
            } else {
                break;
            }
        }

        const allMessages = Array.from(messageCollection.values()).reverse();
        
        // Собираем информацию о тикете
        const ticketInfo = await collectTicketInfo(message.channel, messageCollection);
        const ticketReport = generateTicketReport(ticketInfo);
        ticketReport.messageCount = allMessages.length;
        
        // Создаем HTML транскрипт
        const htmlContent = createHTMLTranscript(ticketReport, allMessages);
        
        // Сохраняем в файл
        const fileName = `transcript-${ticketReport.ticketInfo.channelName}.html`;
        await fs.writeFile(fileName, htmlContent, 'utf8');
        
        // Отправляем в канал для транскриптов
        const transcriptChannel = client.channels.cache.get(TRANSCRIPT_CHANNEL_ID);
        
        if (transcriptChannel && transcriptChannel.isTextBased()) {
            // Отправляем HTML файл
            await transcriptChannel.send({
                content: `📄 HTML Transcript for #${ticketReport.ticketInfo.channelName} in ${ticketReport.ticketInfo.server}`,
                files: [fileName]
            });
            
            // Отправляем отдельное сообщение с информацией о тикете
            const ticketInfoMessage = createTicketInfoMessage(ticketReport);
            await transcriptChannel.send(`\`\`\`${ticketInfoMessage}\`\`\``);
            
            await message.channel.send('✅ HTML transcript sent to transcripts channel!');
            console.log(`✅ HTML transcript created for ticket #${ticketReport.ticketInfo.id} with ${ticketReport.messageCount} messages`);
            
            // Удаляем временный файл
            await fs.unlink(fileName).catch(() => {});
        } else {
            await message.channel.send('❌ Transcript channel not found!');
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
