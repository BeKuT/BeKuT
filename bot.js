import {
  Client,
  GatewayIntentBits,
  Collection,
  ActivityType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Partials,
  PermissionsBitField,
  ChannelType,
  Events,
} from 'discord.js';

import fs from 'fs/promises';
import axios from 'axios';
import express from 'express';
import path from 'path';
import session from 'express-session';

// ⬇️⬇️⬇️ ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ ⬇️⬇️⬇️
const token = process.env.DISCORD_TOKEN;
const TRANSCRIPT_CHANNEL_ID = process.env.TRANSCRIPT_CHANNEL_ID || '1430613860473114805';
const PORT = process.env.PORT || 3000;
const RAILWAY_STATIC_URL = process.env.RAILWAY_STATIC_URL;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;

// ДОБАВЬТЕ эти переменные для тикетов
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID;
const MODERATOR_ROLE_IDS = process.env.MODERATOR_ROLE_IDS?.split(',').map(id => id.trim()) || [];
const TICKET_CHANNEL_NAME_TEMPLATE = process.env.TICKET_CHANNEL_NAME_TEMPLATE || "ticket-{username}";

// Проверка наличия токена
if (!token) {
    console.error('❌ CRITICAL ERROR: DISCORD_TOKEN not found!');
    console.log('💡 Set DISCORD_TOKEN in Railway Variables');
    process.exit(1);
}

console.log('✅ Token loaded successfully');

// ==================== ДИСКОРД БОТ ====================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, // ОБЯЗАТЕЛЬНО для работы с серверами
        GatewayIntentBits.GuildMessages, // ОБЯЗАТЕЛЬНО для чтения сообщений
        GatewayIntentBits.MessageContent, // Для чтения содержимого сообщений
        GatewayIntentBits.GuildMessageReactions, // Для реакций
        GatewayIntentBits.GuildMembers, // Для работы с участниками
        GatewayIntentBits.GuildVoiceStates // Для голосовых каналов
    ],
    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.Reaction // Добавьте это для реакций
    ]
});
// Хранилища
const transcriptsStorage = new Map();
const translationMessages = new Map();
const translationCooldown = new Set();
const TRANSLATION_COOLDOWN_TIME = 30000;

// ==================== EXPRESS СЕРВЕР ====================

const app = express();

// Trust proxy for Railway
app.set('trust proxy', 1);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Сессии для авторизации
app.use(session({
    secret: process.env.SESSION_SECRET || 'haki-bot-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// ==================== ФУНКЦИИ ====================

// Функция для получения базового URL
function getBaseUrl() {
    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
        return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
    }
    if (process.env.RAILWAY_STATIC_URL) {
        let url = process.env.RAILWAY_STATIC_URL;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }
        return url;
    }
    return 'https://panel-haki.up.railway.app';
}

// ==================== АВТОРИЗАЦИЯ DISCORD ====================

// Реддирект на Discord OAuth
app.get('/auth/discord', (req, res) => {
    const redirectUri = `${getBaseUrl()}/auth/discord/callback`;
    const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20guilds`;
    res.redirect(authUrl);
});

// Callback от Discord
app.get('/auth/discord/callback', async (req, res) => {
    try {
        const { code, error, error_description } = req.query;
        
        console.log('🔄 Discord callback received');
        
        if (error) {
            console.error('❌ Discord OAuth error:', error, error_description);
            return res.redirect('/?error=discord_oauth_failed');
        }

        if (!code) {
            console.error('❌ No code provided in callback');
            return res.redirect('/?error=no_code');
        }

        const redirectUri = `${getBaseUrl()}/auth/discord/callback`;
        console.log('🔗 Using redirect URI:', redirectUri);

        if (!CLIENT_ID || !CLIENT_SECRET) {
            console.error('❌ Missing OAuth credentials');
            return res.redirect('/?error=missing_credentials');
        }

        // Получаем access token
        console.log('🔄 Exchanging code for access token...');
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', 
            new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirectUri
            }), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 10000
            }
        );

        console.log('✅ Access token received');
        const { access_token } = tokenResponse.data;

        // Получаем данные пользователя
        console.log('🔄 Fetching user data...');
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: {
                Authorization: `Bearer ${access_token}`
            },
            timeout: 10000
        });

        // Получаем сервера пользователя
        console.log('🔄 Fetching user guilds...');
        const guildsResponse = await axios.get('https://discord.com/api/users/@me/guilds', {
            headers: {
                Authorization: `Bearer ${access_token}`
            },
            timeout: 10000
        });

        req.session.user = userResponse.data;
        req.session.guilds = guildsResponse.data;
        req.session.accessToken = access_token;
        req.session.isAuthenticated = true;

        console.log('✅ Authentication successful for user:', userResponse.data.username);
        res.redirect('/');
        
    } catch (error) {
        console.error('❌ Auth callback error:');
        console.error('Error message:', error.message);
        console.error('Response data:', error.response?.data);
        console.error('Response status:', error.response?.status);
        
        res.redirect('/?error=auth_failed&details=' + encodeURIComponent(error.message));
    }
});

// Выход
app.get('/auth/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Middleware проверки авторизации
function requireAuth(req, res, next) {
    if (!req.session.isAuthenticated) {
        return res.redirect('/auth/discord');
    }
    next();
}

// ==================== СТРАНИЦЫ ====================

app.get('/', (req, res) => {
    const baseUrl = getBaseUrl();
    
    if (!req.session.isAuthenticated) {
        return res.send(createUnauthorizedPage(baseUrl));
    }

    const user = req.session.user;
    const guilds = req.session.guilds || [];
    
    const mutualGuilds = guilds.filter(guild => {
        const botGuild = client.guilds.cache.get(guild.id);
        return botGuild && (guild.permissions & 0x20) === 0x20;
    });

    res.send(createDashboardPage(user, mutualGuilds, baseUrl));
});

app.get('/server/:id', requireAuth, (req, res) => {
    const guildId = req.params.id;
    const guild = client.guilds.cache.get(guildId);
    
    if (!guild) {
        return res.status(404).send('Сервер не найден или бот не на этом сервере');
    }

    const baseUrl = getBaseUrl();
    const user = req.session.user;
    
    res.send(createServerPage(guild, user, baseUrl));
});

app.get('/commands', requireAuth, (req, res) => {
    const baseUrl = getBaseUrl();
    const user = req.session.user;
    res.send(createCommandsPage(user, baseUrl));
});

app.get('/about', requireAuth, (req, res) => {
    const baseUrl = getBaseUrl();
    const user = req.session.user;
    res.send(createAboutPage(user, baseUrl));
});

app.get('/transcripts', requireAuth, (req, res) => {
    const baseUrl = getBaseUrl();
    const user = req.session.user;
    
    // Проверяем, есть ли у пользователя права администратора хотя бы на одном сервере ГДЕ ЕСТЬ БОТ
    const userGuilds = req.session.guilds || [];
    const adminGuilds = userGuilds.filter(guild => {
        const botGuild = client.guilds.cache.get(guild.id);
        return botGuild && (guild.permissions & 0x8) === 0x8; // ADMINISTRATOR permission + бот на сервере
    });
    
    if (adminGuilds.length === 0) {
        return res.status(403).send(`
            <!DOCTYPE html>
            <html lang="ru">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Доступ запрещен - Haki Bot</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { 
                        font-family: 'Whitney', 'Helvetica Neue', Helvetica, Arial, sans-serif; 
                        background: #1a1a1a; 
                        color: #ffffff; 
                        line-height: 1.6;
                        display: flex;
                        min-height: 100vh;
                        align-items: center;
                        justify-content: center;
                    }
                    .error-container {
                        background: #2b2b2b;
                        padding: 40px;
                        border-radius: 15px;
                        text-align: center;
                        max-width: 500px;
                        border: 1px solid #ed4245;
                    }
                    .error-icon {
                        font-size: 4rem;
                        margin-bottom: 20px;
                    }
                    .back-btn {
                        background: #5865F2;
                        color: white;
                        padding: 10px 20px;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                        text-decoration: none;
                        display: inline-block;
                        margin-top: 20px;
                    }
                </style>
            </head>
            <body>
                <div class="error-container">
                    <div class="error-icon">🚫</div>
                    <h1>Доступ запрещен</h1>
                    <p style="color: #b9bbbe; margin: 15px 0;">
                        Для доступа к разделу "Транскрипты" необходимы права администратора 
                        хотя бы на одном сервере где есть бот.
                    </p>
                    <a href="/" class="back-btn">Вернуться на главную</a>
                </div>
            </body>
            </html>
        `);
    }
    
    res.send(createTranscriptsPage(user, baseUrl, adminGuilds));
});

app.get('/transcript/:id', (req, res) => {
    const transcriptId = req.params.id;
    const transcript = transcriptsStorage.get(transcriptId);
    
    if (!transcript) {
        return res.status(404).send(`
            <html>
                <body style="background: #1a1a1a; color: white; font-family: Arial; text-align: center; padding: 50px;">
                    <h1>📄 Transcript Not Found</h1>
                    <p>This transcript doesn't exist or was manually deleted.</p>
                </body>
            </html>
        `);
    }
    
    res.send(transcript.html);
});

// ==================== API МАРШРУТЫ ====================

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

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        transcripts: transcriptsStorage.size,
        permanentStorage: true,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Отладочные маршруты
app.get('/debug/env', (req, res) => {
    res.json({
        clientId: CLIENT_ID ? '✅ Установлен' : '❌ Отсутствует',
        clientSecret: CLIENT_SECRET ? '✅ Установлен' : '❌ Отсутствует',
        token: token ? '✅ Установлен' : '❌ Отсутствует',
        baseUrl: getBaseUrl(),
        redirectUri: `${getBaseUrl()}/auth/discord/callback`,
        nodeEnv: process.env.NODE_ENV || 'not set'
    });
});

app.get('/debug/session', (req, res) => {
    req.session.test = 'session_works';
    res.json({
        session: req.session,
        sessionId: req.sessionID
    });
});

// ==================== HTML ШАБЛОНЫ ====================

function createUnauthorizedPage(baseUrl) {
    return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Haki Bot - Панель управления</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Whitney', 'Helvetica Neue', Helvetica, Arial, sans-serif; 
            background: #1a1a1a; 
            color: #ffffff; 
            line-height: 1.6;
        }
        .container { 
            max-width: 1200px; 
            margin: 0 auto; 
            padding: 20px; 
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .header { 
            background: #2b2b2b; 
            padding: 30px; 
            border-radius: 15px; 
            margin-bottom: 30px; 
            border-left: 5px solid #5865F2;
            text-align: center;
        }
        .header h1 { 
            font-size: 2.5rem; 
            margin-bottom: 10px; 
            background: linear-gradient(135deg, #5865F2, #57F287);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .login-box {
            background: #2b2b2b;
            padding: 40px;
            border-radius: 15px;
            text-align: center;
            max-width: 500px;
            margin: 50px auto;
            border: 1px solid #40444b;
        }
        .login-btn {
            background: #5865F2;
            color: white;
            padding: 15px 30px;
            border: none;
            border-radius: 8px;
            font-size: 1.1rem;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            margin-top: 20px;
            transition: background 0.3s ease;
        }
        .login-btn:hover {
            background: #4752C4;
        }
        .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-top: 40px;
        }
        .feature-card {
            background: #2b2b2b;
            padding: 25px;
            border-radius: 10px;
            text-align: center;
            border: 1px solid #40444b;
        }
        .feature-icon {
            font-size: 2.5rem;
            margin-bottom: 15px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 Haki Bot</h1>
            <p>Мощная панель управления для вашего Discord сервера</p>
        </div>
        
        <div class="login-box">
            <h2>🔐 Требуется авторизация</h2>
            <p>Для доступа к панели управления необходимо войти через Discord</p>
            <a href="/auth/discord" class="login-btn">Войти через Discord</a>
        </div>

        <div class="features">
            <div class="feature-card">
                <div class="feature-icon">📊</div>
                <h3>Статистика серверов</h3>
                <p>Просматривайте информацию о всех серверах где есть бот</p>
            </div>
            <div class="feature-card">
                <div class="feature-icon">📄</div>
                <h3>Управление транскриптами</h3>
                <p>Создавайте и просматривайте транскрипты бесед</p>
            </div>
            <div class="feature-card">
                <div class="feature-icon">⚙️</div>
                <h3>Настройка бота</h3>
                <p>Управляйте настройками бота для каждого сервера</p>
            </div>
        </div>
    </div>
</body>
</html>`;
}

function createDashboardPage(user, mutualGuilds, baseUrl) {
    return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Haki Bot - Панель управления</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Whitney', 'Helvetica Neue', Helvetica, Arial, sans-serif; 
            background: #1a1a1a; 
            color: #ffffff; 
            line-height: 1.6;
            display: flex;
            min-height: 100vh;
        }
        .sidebar {
            width: 280px;
            background: #2b2b2b;
            padding: 20px;
            border-right: 1px solid #40444b;
        }
        .main-content {
            flex: 1;
            padding: 30px;
            overflow-y: auto;
        }
        .user-info {
            display: flex;
            align-items: center;
            padding: 15px;
            background: #36393f;
            border-radius: 10px;
            margin-bottom: 30px;
        }
        .user-avatar {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            margin-right: 15px;
        }
        .nav-item {
            display: flex;
            align-items: center;
            padding: 15px;
            margin: 5px 0;
            background: #36393f;
            border-radius: 8px;
            text-decoration: none;
            color: #ffffff;
            transition: background 0.3s ease;
        }
        .nav-item:hover {
            background: #40444b;
        }
        .nav-item.active {
            background: #5865F2;
        }
        .nav-icon {
            font-size: 1.2rem;
            margin-right: 10px;
            width: 20px;
            text-align: center;
        }
        .server-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }
        .server-card {
            background: #2b2b2b;
            padding: 20px;
            border-radius: 10px;
            border: 1px solid #40444b;
            transition: transform 0.3s ease;
            cursor: pointer;
        }
        .server-card:hover {
            transform: translateY(-5px);
            border-color: #5865F2;
        }
        .server-icon {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            margin-right: 15px;
        }
        .server-header {
            display: flex;
            align-items: center;
            margin-bottom: 15px;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: #2b2b2b;
            padding: 25px;
            border-radius: 10px;
            text-align: center;
            border-left: 4px solid #5865F2;
        }
        .stat-value {
            font-size: 2rem;
            font-weight: bold;
            margin-bottom: 5px;
        }
        .logout-btn {
            background: #ed4245;
            color: white;
            padding: 10px 20px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            margin-top: 20px;
            width: 100%;
        }
    </style>
</head>
<body>
    <div class="sidebar">
        <div class="user-info">
            <img src="${user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" 
                 alt="${user.username}" class="user-avatar">
            <div>
                <div style="font-weight: bold;">${user.global_name || user.username}</div>
                <div style="color: #b9bbbe; font-size: 0.9rem;">${user.username}#${user.discriminator}</div>
            </div>
        </div>

        <a href="/" class="nav-item active">
            <span class="nav-icon">🏠</span>
            Главная
        </a>
        <a href="/about" class="nav-item">
            <span class="nav-icon">📋</span>
            Общие сведения
        </a>
        <a href="/transcripts" class="nav-item">
            <span class="nav-icon">📄</span>
            Транскрипты
        </a>
        <a href="/commands" class="nav-item">
            <span class="nav-icon">⚡</span>
            Команды
        </a>

        <div style="margin: 30px 0 10px 0; color: #b9bbbe; font-size: 0.9rem; padding: 0 15px;">СЕРВЕРА</div>
        
        ${mutualGuilds.map(guild => `
            <a href="/server/${guild.id}" class="nav-item">
                <span class="nav-icon">🏰</span>
                ${guild.name}
            </a>
        `).join('')}

        <a href="/auth/logout" class="logout-btn">Выйти</a>
    </div>

    <div class="main-content">
        <div style="margin-bottom: 30px;">
            <h1>🏠 Главная панель</h1>
            <p style="color: #b9bbbe;">Добро пожаловать в панель управления Haki Bot</p>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value">${mutualGuilds.length}</div>
                <div style="color: #b9bbbe;">Серверов с ботом</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${transcriptsStorage.size}</div>
                <div style="color: #b9bbbe;">Транскриптов</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">24/7</div>
                <div style="color: #b9bbbe;">Аптайм</div>
            </div>
        </div>

        <h2 style="margin-bottom: 20px;">🏰 Ваши сервера</h2>
        <div class="server-grid">
            ${mutualGuilds.map(guild => `
                <div class="server-card" onclick="window.location.href='/server/${guild.id}'">
                    <div class="server-header">
                        ${guild.icon ? 
                            `<img src="https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png" alt="${guild.name}" class="server-icon">` :
                            `<div style="width: 50px; height: 50px; background: #5865F2; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; margin-right: 15px;">🏰</div>`
                        }
                        <div>
                            <div style="font-weight: bold; font-size: 1.1rem;">${guild.name}</div>
                            <div style="color: #b9bbbe; font-size: 0.9rem;">Участников: ${guild.approximate_member_count || 'N/A'}</div>
                        </div>
                    </div>
                    <div style="color: #57F287; font-size: 0.9rem;">✓ Бот активен</div>
                </div>
            `).join('')}
        </div>
    </div>
</body>
</html>`;
}

function createAboutPage(user, baseUrl) {
    return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Общие сведения - Haki Bot</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Whitney', 'Helvetica Neue', Helvetica, Arial, sans-serif; 
            background: #1a1a1a; 
            color: #ffffff; 
            line-height: 1.6;
            display: flex;
            min-height: 100vh;
        }
        .sidebar {
            width: 280px;
            background: #2b2b2b;
            padding: 20px;
            border-right: 1px solid #40444b;
        }
        .main-content {
            flex: 1;
            padding: 30px;
            overflow-y: auto;
        }
        .content-box {
            background: #2b2b2b;
            padding: 30px;
            border-radius: 10px;
            border: 1px solid #40444b;
            margin-bottom: 20px;
        }
        .nav-item {
            display: flex;
            align-items: center;
            padding: 15px;
            margin: 5px 0;
            background: #36393f;
            border-radius: 8px;
            text-decoration: none;
            color: #ffffff;
            transition: background 0.3s ease;
        }
        .nav-item:hover {
            background: #40444b;
        }
        .nav-item.active {
            background: #5865F2;
        }
        .nav-icon {
            font-size: 1.2rem;
            margin-right: 10px;
            width: 20px;
            text-align: center;
        }
        .logout-btn {
            background: #ed4245;
            color: white;
            padding: 10px 20px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            margin-top: 20px;
            width: 100%;
        }
    </style>
</head>
<body>
    <div class="sidebar">
        <div class="user-info">
            <img src="${user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" 
                 alt="${user.username}" class="user-avatar">
            <div>
                <div style="font-weight: bold;">${user.global_name || user.username}</div>
                <div style="color: #b9bbbe; font-size: 0.9rem;">${user.username}#${user.discriminator}</div>
            </div>
        </div>

        <a href="/" class="nav-item">
            <span class="nav-icon">🏠</span>
            Главная
        </a>
        <a href="/about" class="nav-item active">
            <span class="nav-icon">📋</span>
            Общие сведения
        </a>
        <a href="/transcripts" class="nav-item">
            <span class="nav-icon">📄</span>
            Транскрипты
        </a>
        <a href="/commands" class="nav-item">
            <span class="nav-icon">⚡</span>
            Команды
        </a>

        <a href="/auth/logout" class="logout-btn">Выйти</a>
    </div>

    <div class="main-content">
        <div style="margin-bottom: 30px;">
            <h1>📋 Общие сведения</h1>
            <p style="color: #b9bbbe;">Информация о боте Haki и его возможностях</p>
        </div>

        <div class="content-box">
            <h2 style="margin-bottom: 20px; color: #5865F2;">О боте Haki</h2>
            <div style="line-height: 1.8;">
                <p>Haki Bot - это многофункциональный Discord бот, созданный для улучшения управления серверами и взаимодействия с участниками.</p>
                
                <h3 style="margin: 25px 0 15px 0; color: #57F287;">Основные возможности:</h3>
                <ul style="margin-left: 20px; margin-bottom: 20px;">
                    <li>Создание транскриптов бесед</li>
                    <li>Система тикетов</li>
                    <li>Модерационные команды</li>
                    <li>Интеграция с War Thunder</li>
                    <li>Автоматический перевод сообщений</li>
                    <li>Панель управления через веб-интерфейс</li>
                </ul>

                <h3 style="margin: 25px 0 15px 0; color: #57F287;">Техническая информация:</h3>
                <ul style="margin-left: 20px;">
                    <li><strong>Версия:</strong> 2.0.0</li>
                    <li><strong>База данных:</strong> In-memory хранилище</li>
                    <li><strong>Аптайм:</strong> 99.9%</li>
                    <li><strong>Поддержка:</strong> 24/7</li>
                </ul>
            </div>
        </div>
    </div>
</body>
</html>`;
}

function createCommandsPage(user, baseUrl) {
    return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Команды - Haki Bot</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Whitney', 'Helvetica Neue', Helvetica, Arial, sans-serif; 
            background: #1a1a1a; 
            color: #ffffff; 
            line-height: 1.6;
            display: flex;
            min-height: 100vh;
        }
        .sidebar {
            width: 280px;
            background: #2b2b2b;
            padding: 20px;
            border-right: 1px solid #40444b;
        }
        .main-content {
            flex: 1;
            padding: 30px;
            overflow-y: auto;
        }
        .command-category {
            background: #2b2b2b;
            padding: 25px;
            border-radius: 10px;
            border: 1px solid #40444b;
            margin-bottom: 20px;
        }
        .command-item {
            background: #36393f;
            padding: 15px;
            border-radius: 8px;
            margin: 10px 0;
            border-left: 4px solid #5865F2;
        }
        .command-name {
            font-weight: bold;
            color: #57F287;
        }
        .command-desc {
            color: #b9bbbe;
            margin-top: 5px;
        }
        .command-usage {
            background: #2f3136;
            padding: 8px 12px;
            border-radius: 4px;
            margin: 8px 0;
            font-family: 'Consolas', monospace;
            font-size: 0.9rem;
            border-left: 3px solid #57F287;
        }
        .permission-badge {
            background: #ed4245;
            color: white;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 0.8rem;
            margin-left: 10px;
        }
        .nav-item {
            display: flex;
            align-items: center;
            padding: 15px;
            margin: 5px 0;
            background: #36393f;
            border-radius: 8px;
            text-decoration: none;
            color: #ffffff;
            transition: background 0.3s ease;
        }
        .nav-item:hover {
            background: #40444b;
        }
        .nav-item.active {
            background: #5865F2;
        }
        .nav-icon {
            font-size: 1.2rem;
            margin-right: 10px;
            width: 20px;
            text-align: center;
        }
        .logout-btn {
            background: #ed4245;
            color: white;
            padding: 10px 20px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            margin-top: 20px;
            width: 100%;
        }
        .user-info {
            display: flex;
            align-items: center;
            padding: 15px;
            background: #36393f;
            border-radius: 10px;
            margin-bottom: 30px;
        }
        .user-avatar {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            margin-right: 15px;
        }
    </style>
</head>
<body>
    <div class="sidebar">
        <div class="user-info">
            <img src="${user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" 
                 alt="${user.username}" class="user-avatar">
            <div>
                <div style="font-weight: bold;">${user.global_name || user.username}</div>
                <div style="color: #b9bbbe; font-size: 0.9rem;">${user.username}#${user.discriminator}</div>
            </div>
        </div>

        <a href="/" class="nav-item">
            <span class="nav-icon">🏠</span>
            Главная
        </a>
        <a href="/about" class="nav-item">
            <span class="nav-icon">📋</span>
            Общие сведения
        </a>
        <a href="/transcripts" class="nav-item">
            <span class="nav-icon">📄</span>
            Транскрипты
        </a>
        <a href="/commands" class="nav-item active">
            <span class="nav-icon">⚡</span>
            Команды
        </a>

        <a href="/auth/logout" class="logout-btn">Выйти</a>
    </div>

    <div class="main-content">
        <div style="margin-bottom: 30px;">
            <h1>⚡ Команды бота</h1>
            <p style="color: #b9bbbe;">Все доступные команды Haki Bot</p>
        </div>

        <div class="command-category">
            <h2 style="color: #5865F2; margin-bottom: 20px;">📄 Команды транскриптов</h2>
            
            <div class="command-item">
                <div class="command-name">-transcript <span class="permission-badge">MANAGE_MESSAGES</span></div>
                <div class="command-desc">Создает транскрипт текущего канала и отправляет его в настроенный канал</div>
                <div class="command-usage">Использование: -transcript</div>
            </div>
            
            <div class="command-item">
                <div class="command-name">-settranscript <span class="permission-badge">ADMINISTRATOR</span></div>
                <div class="command-desc">Настраивает канал для отправки транскриптов</div>
                <div class="command-usage">Использование: -settranscript &lt;ID_канала&gt;<br>Пример: -settranscript 123456789012345678<br>Сброс: -settranscript reset</div>
            </div>
            
            <div class="command-item">
                <div class="command-name">-transcriptsettings</div>
                <div class="command-desc">Показывает текущие настройки транскриптов для этого сервера</div>
                <div class="command-usage">Использование: -transcriptsettings</div>
            </div>
        </div>

        <div class="command-category">
            <h2 style="color: #5865F2; margin-bottom: 20px;">🌐 Команды перевода</h2>
            <div class="command-item">
                <div class="command-name">-translation on/off <span class="permission-badge">ADMINISTRATOR</span></div>
                <div class="command-desc">Включает/выключает автоматический перевод по реакциям</div>
                <div class="command-usage">Пример: -translation on</div>
            </div>
            <div class="command-item">
                <div class="command-name">-translation disablechannel #канал</div>
                <div class="command-desc">Отключает авто-перевод в указанном канале</div>
                <div class="command-usage">Пример: -translation disablechannel #важный</div>
            </div>
            <div class="command-item">
                <div class="command-name">-translation enablechannel #канал</div>
                <div class="command-desc">Включает авто-перевод в указанном канале</div>
                <div class="command-usage">Пример: -translation enablechannel #общение</div>
            </div>
            <div class="command-item">
                <div class="command-name">-translation clearchannels</div>
                <div class="command-desc">Включает перевод во всех каналах (очищает исключения)</div>
                <div class="command-usage">Использование: -translation clearchannels</div>
            </div>
            <div class="command-item">
                <div class="command-name">-translation addrole @роль</div>
                <div class="command-desc">Добавляет защищенную роль (сообщения не переводятся)</div>
                <div class="command-usage">Пример: -translation addrole @Модератор</div>
            </div>
            <div class="command-item">
                <div class="command-name">-translation status</div>
                <div class="command-desc">Показывает текущие настройки перевода</div>
                <div class="command-usage">Использование: -translation status</div>
            </div>
            <div class="command-item">
                <div class="command-name">Реакции 🇷🇺/🇬🇧</div>
                <div class="command-desc">Автоматический перевод при добавлении флаговых реакций</div>
                <div class="command-usage">🇷🇺 - перевод на русский<br>🇬🇧 - перевод на английский</div>
            </div>
        </div>

        <div class="command-category">
            <h2 style="color: #5865F2; margin-bottom: 20px;">📊 Команды статистики</h2>
            <div class="command-item">
                <div class="command-name">!stat [никнейм/ID]</div>
                <div class="command-desc">Показывает статистику игрока War Thunder через StatShark</div>
                <div class="command-usage">Пример: !stat PlayerName</div>
            </div>
            <div class="command-item">
                <div class="command-name">!полк [название]</div>
                <div class="command-desc">Информация о полке War Thunder</div>
                <div class="command-usage">Пример: !полк НазваниеПолка</div>
            </div>
        </div>

        <div class="command-category">
            <h2 style="color: #5865F2; margin-bottom: 20px;">🎵 Команды радио</h2>
            <div class="command-item">
                <div class="command-name">-play [станция]</div>
                <div class="command-desc">Включает радиостанцию в голосовом канале</div>
                <div class="command-usage">Пример: -play нвс<br>Доступные станции: нвс, шансон, ретро, рок</div>
            </div>
            <div class="command-item">
                <div class="command-name">-stop</div>
                <div class="command-desc">Выключает радио</div>
                <div class="command-usage">Использование: -stop</div>
            </div>
            <div class="command-item">
                <div class="command-name">-stations</div>
                <div class="command-desc">Показывает список доступных радиостанций</div>
                <div class="command-usage">Использование: -stations</div>
            </div>
        </div>

        <div class="command-category">
            <h2 style="color: #5865F2; margin-bottom: 20px;">🗑️ Команды автоудаления</h2>
            <div class="command-item">
                <div class="command-name">-autodelete on/off <span class="permission-badge">MANAGE_MESSAGES</span></div>
                <div class="command-desc">Включает/выключает автоматическое удаление сообщений</div>
                <div class="command-usage">Пример: -autodelete on</div>
            </div>
            <div class="command-item">
                <div class="command-name">-autodelete delay [мс]</div>
                <div class="command-desc">Устанавливает задержку перед удалением сообщений</div>
                <div class="command-usage">Пример: -autodelete delay 5000</div>
            </div>
            <div class="command-item">
                <div class="command-name">-autodelete addchannel #канал</div>
                <div class="command-desc">Добавляет канал в список автоудаления</div>
                <div class="command-usage">Пример: -autodelete addchannel #флуд</div>
            </div>
            <div class="command-item">
                <div class="command-name">-autodelete addrole @роль</div>
                <div class="command-desc">Добавляет исключенную роль (сообщения не удаляются)</div>
                <div class="command-usage">Пример: -autodelete addrole @Модератор</div>
            </div>
            <div class="command-item">
                <div class="command-name">-autodelete status</div>
                <div class="command-desc">Показывает текущие настройки автоудаления</div>
                <div class="command-usage">Использование: -autodelete status</div>
            </div>
        </div>

        <div class="command-category">
            <h2 style="color: #5865F2; margin-bottom: 20px;">🎫 Команды тикетов</h2>
            <div class="command-item">
                <div class="command-name">!ticket <span class="permission-badge">ADMINISTRATOR</span></div>
                <div class="command-desc">Настройка системы тикетов для заявок в полк</div>
                <div class="command-usage">Использование: !ticket &lt;ID_канала&gt; &lt;ID_категории&gt; &lt;ID_ролей&gt;<br>Пример: !ticket 123456789 987654321 111111111,222222222</div>
            </div>
            <div class="command-item">
                <div class="command-name">Кнопка "Создать заявку в полк"</div>
                <div class="command-desc">Создает тикет для подачи заявки в полк</div>
                <div class="command-usage">Нажмите на кнопку в настроенном канале тикетов</div>
            </div>
            <div class="command-item">
                <div class="command-name">Кнопка "Закрыть" в тикете</div>
                <div class="command-desc">Закрывает тикет и создает транскрипт</div>
                <div class="command-usage">Нажмите на кнопку в канале тикета</div>
            </div>
        </div>

        <div class="command-category">
            <h2 style="color: #5865F2; margin-bottom: 20px;">🔧 Сервисные команды</h2>
            <div class="command-item">
                <div class="command-name">-ping</div>
                <div class="command-desc">Проверяет работоспособность бота</div>
                <div class="command-usage">Использование: -ping</div>
            </div>
            <div class="command-item">
                <div class="command-name">-testvoice</div>
                <div class="command-desc">Тестирует подключение к голосовому каналу</div>
                <div class="command-usage">Использование: -testvoice</div>
            </div>
        </div>

        <div style="background: #2b2b2b; padding: 20px; border-radius: 10px; border-left: 4px solid #5865F2; margin-top: 30px;">
            <h3 style="color: #57F287; margin-bottom: 10px;">💡 Примечания по использованию</h3>
            <ul style="color: #b9bbbe; margin-left: 20px;">
                <li>Команды с бейджем <span class="permission-badge">ADMINISTRATOR</span> требуют прав администратора</li>
                <li>Команды с бейджем <span class="permission-badge">MANAGE_MESSAGES</span> требуют прав управления сообщениями</li>
                <li>Для работы радио необходимо находиться в голосовом канале</li>
                <li>Транскрипты сохраняются в постоянное хранилище и доступны по ссылке</li>
                <li>Авто-перевод работает во всех каналах, кроме указанных в исключениях</li>
            </ul>
        </div>
    </div>
</body>
</html>`;
}

function createServerPage(guild, user, baseUrl) {
    const memberCount = guild.memberCount;
    const createdAt = guild.createdAt.toLocaleDateString('ru-RU');
    
    return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${guild.name} - Haki Bot</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Whitney', 'Helvetica Neue', Helvetica, Arial, sans-serif; 
            background: #1a1a1a; 
            color: #ffffff; 
            line-height: 1.6;
            display: flex;
            min-height: 100vh;
        }
        .sidebar {
            width: 280px;
            background: #2b2b2b;
            padding: 20px;
            border-right: 1px solid #40444b;
        }
        .main-content {
            flex: 1;
            padding: 30px;
            overflow-y: auto;
        }
        .server-header {
            display: flex;
            align-items: center;
            margin-bottom: 30px;
            padding: 20px;
            background: #2b2b2b;
            border-radius: 10px;
            border: 1px solid #40444b;
        }
        .server-icon {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            margin-right: 20px;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: #2b2b2b;
            padding: 25px;
            border-radius: 10px;
            text-align: center;
            border-left: 4px solid #5865F2;
        }
        .stat-value {
            font-size: 2rem;
            font-weight: bold;
            margin-bottom: 5px;
        }
        .nav-item {
            display: flex;
            align-items: center;
            padding: 15px;
            margin: 5px 0;
            background: #36393f;
            border-radius: 8px;
            text-decoration: none;
            color: #ffffff;
            transition: background 0.3s ease;
        }
        .nav-item:hover {
            background: #40444b;
        }
        .nav-item.active {
            background: #5865F2;
        }
        .nav-icon {
            font-size: 1.2rem;
            margin-right: 10px;
            width: 20px;
            text-align: center;
        }
        .logout-btn {
            background: #ed4245;
            color: white;
            padding: 10px 20px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            margin-top: 20px;
            width: 100%;
        }
        .feature-card {
            background: #2b2b2b;
            padding: 20px;
            border-radius: 10px;
            border: 1px solid #40444b;
            margin-bottom: 15px;
            cursor: pointer;
            transition: border-color 0.3s ease;
        }
        .feature-card:hover {
            border-color: #5865F2;
        }
    </style>
</head>
<body>
    <div class="sidebar">
        <div class="user-info">
            <img src="${user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" 
                 alt="${user.username}" class="user-avatar">
            <div>
                <div style="font-weight: bold;">${user.global_name || user.username}</div>
                <div style="color: #b9bbbe; font-size: 0.9rem;">${user.username}#${user.discriminator}</div>
            </div>
        </div>

        <a href="/" class="nav-item">
            <span class="nav-icon">🏠</span>
            Главная
        </a>
        <a href="/about" class="nav-item">
            <span class="nav-icon">📋</span>
            Общие сведения
        </a>
        <a href="/transcripts" class="nav-item">
            <span class="nav-icon">📄</span>
            Транскрипты
        </a>
        <a href="/commands" class="nav-item">
            <span class="nav-icon">⚡</span>
            Команды
        </a>

        <a href="/auth/logout" class="logout-btn">Выйти</a>
    </div>

    <div class="main-content">
        <div class="server-header">
            ${guild.icon ? 
                `<img src="https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png" alt="${guild.name}" class="server-icon">` :
                `<div style="width: 80px; height: 80px; background: #5865F2; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2rem; margin-right: 20px;">🏰</div>`
            }
            <div>
                <h1>${guild.name}</h1>
                <p style="color: #b9bbbe;">Управление сервером через Haki Bot</p>
            </div>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value">${memberCount}</div>
                <div style="color: #b9bbbe;">Участников</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${guild.channels.cache.size}</div>
                <div style="color: #b9bbbe;">Каналов</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${guild.roles.cache.size}</div>
                <div style="color: #b9bbbe;">Ролей</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${createdAt}</div>
                <div style="color: #b9bbbe;">Создан</div>
            </div>
        </div>

        <h2 style="margin-bottom: 20px;">⚙️ Управление сервером</h2>
        
        <div class="feature-card" onclick="window.location.href='/transcripts'">
            <h3 style="color: #57F287; margin-bottom: 10px;">📄 Транскрипты</h3>
            <p style="color: #b9bbbe;">Создание и просмотр транскриптов бесед. Управление архивами сообщений.</p>
        </div>
    </div>
</body>
</html>`;
}

function createTranscriptsPage(user, baseUrl, adminGuilds) {
    // Фильтруем транскрипты только для серверов, где пользователь администратор
    const adminGuildIds = adminGuilds.map(guild => guild.id);
    const transcripts = Array.from(transcriptsStorage.entries())
        .map(([id, data]) => ({
            id,
            channelName: data.ticketInfo?.channelName,
            server: data.ticketInfo?.server,
            serverId: data.ticketInfo?.serverId,
            messageCount: data.ticketInfo?.messageCount,
            createdAt: new Date(data.createdAt).toLocaleDateString('ru-RU')
        }))
        .filter(transcript => {
            // Если нет serverId, показываем всем администраторам
            if (!transcript.serverId) return true;
            // Показываем только транскрипты с серверов, где пользователь администратор
            return adminGuildIds.includes(transcript.serverId);
        });

    return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Транскрипты - Haki Bot</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Whitney', 'Helvetica Neue', Helvetica, Arial, sans-serif; 
            background: #1a1a1a; 
            color: #ffffff; 
            line-height: 1.6;
            display: flex;
            min-height: 100vh;
        }
        .sidebar {
            width: 280px;
            background: #2b2b2b;
            padding: 20px;
            border-right: 1px solid #40444b;
        }
        .main-content {
            flex: 1;
            padding: 30px;
            overflow-y: auto;
        }
        .transcript-item {
            background: #2b2b2b;
            padding: 20px;
            border-radius: 10px;
            border: 1px solid #40444b;
            margin-bottom: 15px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .transcript-info {
            flex: 1;
        }
        .transcript-actions {
            display: flex;
            gap: 10px;
        }
        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            text-decoration: none;
            color: white;
            font-size: 0.9rem;
        }
        .btn-primary {
            background: #5865F2;
        }
        .btn-outline {
            background: transparent;
            border: 1px solid #40444b;
            color: #b9bbbe;
        }
        .nav-item {
            display: flex;
            align-items: center;
            padding: 15px;
            margin: 5px 0;
            background: #36393f;
            border-radius: 8px;
            text-decoration: none;
            color: #ffffff;
            transition: background 0.3s ease;
        }
        .nav-item:hover {
            background: #40444b;
        }
        .nav-item.active {
            background: #5865F2;
        }
        .nav-icon {
            font-size: 1.2rem;
            margin-right: 10px;
            width: 20px;
            text-align: center;
        }
        .logout-btn {
            background: #ed4245;
            color: white;
            padding: 10px 20px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            margin-top: 20px;
            width: 100%;
        }
        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: #b9bbbe;
        }
        .admin-badge {
            background: #ed4245;
            color: white;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 0.8rem;
            margin-left: 10px;
        }
        .access-info {
            background: #2b2b2b;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #5865F2;
            margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <!-- Боковая панель -->
    <div class="sidebar">
        <div class="user-info">
            <img src="${user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" 
                 alt="${user.username}" class="user-avatar">
            <div>
                <div style="font-weight: bold;">${user.global_name || user.username}</div>
                <div style="color: #b9bbbe; font-size: 0.9rem;">${user.username}#${user.discriminator}</div>
                <div style="color: #57F287; font-size: 0.8rem; margin-top: 5px;">
                    ✅ Администратор
                </div>
            </div>
        </div>

        <a href="/" class="nav-item">
            <span class="nav-icon">🏠</span>
            Главная
        </a>
        <a href="/about" class="nav-item">
            <span class="nav-icon">📋</span>
            Общие сведения
        </a>
        <a href="/transcripts" class="nav-item active">
            <span class="nav-icon">📄</span>
            Транскрипты
        </a>
        <a href="/commands" class="nav-item">
            <span class="nav-icon">⚡</span>
            Команды
        </a>

        <div style="margin: 30px 0 10px 0; color: #b9bbbe; font-size: 0.9rem; padding: 0 15px;">ВАШИ СЕРВЕРА</div>
        
        ${adminGuilds.map(guild => `
            <a href="/server/${guild.id}" class="nav-item">
                <span class="nav-icon">🏰</span>
                ${guild.name}
                <span class="admin-badge">ADMIN</span>
            </a>
        `).join('')}

        <a href="/auth/logout" class="logout-btn">Выйти</a>
    </div>

    <!-- Основной контент -->
    <div class="main-content">
        <div style="margin-bottom: 30px;">
            <h1>📄 Транскрипты <span class="admin-badge">ТОЛЬКО ДЛЯ АДМИНИСТРАТОРОВ</span></h1>
            <p style="color: #b9bbbe;">Управление архивами бесед - доступно только администраторам серверов</p>
        </div>

        <div class="access-info">
            <strong>🔐 Уровень доступа:</strong> Администратор сервера
            <br>
            <strong>🏠 Доступные сервера:</strong> ${adminGuilds.map(g => g.name).join(', ')}
        </div>

        ${transcripts.length === 0 ? `
            <div class="empty-state">
                <div style="font-size: 4rem; margin-bottom: 20px;">📝</div>
                <h3>Транскрипты не найдены</h3>
                <p>На ваших серверах пока нет созданных транскриптов</p>
                <p style="font-size: 0.9rem; margin-top: 10px; color: #8e9297;">
                    Используйте команду <code>-transcript</code> в канале на сервере где вы администратор
                </p>
            </div>
        ` : `
            <div style="margin-bottom: 20px; color: #b9bbbe;">
                Всего транскриптов на ваших серверах: <strong>${transcripts.length}</strong>
            </div>
            
            ${transcripts.map(transcript => `
                <div class="transcript-item">
                    <div class="transcript-info">
                        <div style="font-weight: bold; margin-bottom: 5px;">
                            📄 Транскрипт #${transcript.channelName || 'unknown'}
                        </div>
                        <div style="color: #b9bbbe; font-size: 0.9rem;">
                            🏠 ${transcript.server || 'Unknown Server'} • 
                            💬 ${transcript.messageCount || 0} сообщений • 
                            📅 ${transcript.createdAt}
                        </div>
                    </div>
                    <div class="transcript-actions">
                        <a href="/transcript/${transcript.id}" class="btn btn-primary" target="_blank">
                            👁️ Просмотр
                        </a>
                        <button class="btn btn-outline" onclick="copyTranscriptUrl('${transcript.id}')">
                            📋 Ссылка
                        </button>
                    </div>
                </div>
            `).join('')}
        `}
    </div>

    <script>
        function copyTranscriptUrl(id) {
            const url = window.location.origin + '/transcript/' + id;
            navigator.clipboard.writeText(url).then(() => {
                alert('Ссылка скопирована в буфер обмена');
            });
        }
    </script>
</body>
</html>`;
}

// ==================== СИСТЕМА НАСТРОЕК ТРАНСКРИПТОВ ====================

// Хранилище настроек для каждого сервера
const serverSettings = new Map();

// Функция для получения настроек сервера
function getServerSettings(guildId) {
    if (!serverSettings.has(guildId)) {
        serverSettings.set(guildId, {
            transcriptChannelId: TRANSCRIPT_CHANNEL_ID, // значение по умолчанию
            translationEnabled: true, // авто-перевод включен по умолчанию
            disabledTranslationChannels: [], // каналы где перевод ОТКЛЮЧЕН
            protectedRoles: [] // роли, чьи сообщения не переводятся
        });
    }
    return serverSettings.get(guildId);
}

// Функция для сохранения настроек
function saveServerSettings(guildId, settings) {
    serverSettings.set(guildId, settings);
    console.log(`💾 Settings saved for guild ${guildId}:`, settings);
}

// ==================== ФУНКЦИИ ДЛЯ ТРАНСКРИПТОВ ====================

async function collectTicketInfo(channel, messages) {
    const participants = new Map();
    let ticketCreator = null;
    let firstMessage = null;

    messages.forEach(msg => {
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

        return `
        <div class="message" id="message-${msg.id}">
            <img src="${author.displayAvatarURL({ format: 'png', size: 64 })}" alt="${author.tag}" class="message-avatar">
            <div class="message-content">
                <div class="message-header">
                    <span class="author-name">${author.displayName || author.username}</span>
                    <span class="message-time">${timestamp}</span>
                </div>
                <div class="message-text">${content}</div>
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
        .server-details h1 { color: #fff; font-size: 24px; margin-bottom: 5px; }
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
        .footer { text-align: center; margin-top: 30px; color: #72767d; font-size: 12px; padding: 20px; border-top: 1px solid #40444b; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="server-info">
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
</body>
</html>
    `;
}

function createTicketInfoEmbedWithParticipants(ticketReport) {
    const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('📋 TICKET INFORMATION')
        .addFields(
            { name: '🆔 ID', value: `#${ticketReport.ticketInfo.id}`, inline: true },
            { name: '🏠 Server', value: ticketReport.ticketInfo.server, inline: true },
            { name: '📅 Created', value: ticketReport.ticketInfo.createdAt.toLocaleString('ru-RU'), inline: true },
            { name: '💬 Channel', value: `#${ticketReport.ticketInfo.channelName}`, inline: true },
            { name: '💭 Messages', value: `${ticketReport.messageCount}`, inline: true },
            { name: '👥 Participants', value: `${ticketReport.participants.length}`, inline: true }
        )
        .setFooter({ text: 'Click the button below to view full transcript • PERMANENT STORAGE' })
        .setTimestamp();

    return embed;
}

function generateTranscriptId() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// ==================== КОМАНДЫ НАСТРОЙКИ ТРАНСКРИПТОВ ====================

client.on('messageCreate', async message => {
    if (message.system) return;
    if (!message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) return;

    // Команда для настройки канала транскриптов
    if (message.content.startsWith('-settranscript')) {
        const args = message.content.split(' ');
        
        if (args.length < 2) {
            const helpEmbed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('⚙️ Настройка канала для транскриптов')
                .setDescription(`
**Использование:**
\`-settranscript <ID_канала>\`

**Примеры:**
\`-settranscript 123456789012345678\` - установить канал по ID
\`-settranscript reset\` - сбросить к значению по умолчанию

**Как получить ID канала:**
1. Включите режим разработчика в Discord
2. ПКМ по каналу → "Копировать ID"
                `);
            
            await message.reply({ embeds: [helpEmbed] });
            return;
        }

        const channelId = args[1];
        
        if (channelId === 'reset') {
            const settings = getServerSettings(message.guild.id);
            settings.transcriptChannelId = TRANSCRIPT_CHANNEL_ID;
            saveServerSettings(message.guild.id, settings);
            
            const resetEmbed = new EmbedBuilder()
                .setColor('#57F287')
                .setTitle('✅ Настройки сброшены')
                .setDescription(`Канал для транскриптов сброшен к значению по умолчанию: \`${TRANSCRIPT_CHANNEL_ID}\``);
            
            await message.reply({ embeds: [resetEmbed] });
            return;
        }

        // Проверяем валидность ID канала
        if (!/^\d{17,20}$/.test(channelId)) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ED4245')
                .setTitle('❌ Ошибка')
                .setDescription('Укажите корректный ID канала (должен содержать 17-20 цифр)');
            
            await message.reply({ embeds: [errorEmbed] });
            return;
        }

        try {
            // Проверяем существование канала
            const channel = await message.guild.channels.fetch(channelId);
            if (!channel) {
                throw new Error('Канал не найден');
            }

            // Проверяем права бота в канале
            const botMember = message.guild.members.me;
            if (!channel.permissionsFor(botMember).has([PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.EmbedLinks])) {
                throw new Error('У бота нет прав для отправки сообщений в этот канал');
            }

            // Сохраняем настройки
            const settings = getServerSettings(message.guild.id);
            settings.transcriptChannelId = channelId;
            saveServerSettings(message.guild.id, settings);

            const successEmbed = new EmbedBuilder()
                .setColor('#57F287')
                .setTitle('✅ Настройки сохранены')
                .setDescription(`Канал для транскриптов установлен: <#${channelId}>`)
                .addFields(
                    { name: 'ID канала', value: `\`${channelId}\``, inline: true },
                    { name: 'Название', value: `\`${channel.name}\``, inline: true }
                )
                .setFooter({ text: 'Теперь все транскрипты будут отправляться в этот канал' });

            await message.reply({ embeds: [successEmbed] });
            
        } catch (error) {
            console.error('Error setting transcript channel:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#ED4245')
                .setTitle('❌ Ошибка')
                .setDescription(`Не удалось установить канал: ${error.message}`);
            
            await message.reply({ embeds: [errorEmbed] });
        }
    }

    // Команда для проверки текущих настроек
    if (message.content === '-transcriptsettings') {
        const settings = getServerSettings(message.guild.id);
        
        const statusEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('⚙️ Текущие настройки транскриптов')
            .addFields(
                { 
                    name: '📁 Канал для транскриптов', 
                    value: settings.transcriptChannelId === TRANSCRIPT_CHANNEL_ID ? 
                        `По умолчанию: \`${TRANSCRIPT_CHANNEL_ID}\`` : 
                        `<#${settings.transcriptChannelId}> (\`${settings.transcriptChannelId}\`)`, 
                    inline: false 
                }
            )
            .setFooter({ text: 'Используйте -settranscript для изменения настроек' });

        await message.reply({ embeds: [statusEmbed] });
    }
 // Команды для настройки авто-перевода
if (message.content.startsWith('-translation')) {
    const args = message.content.split(' ');
    const subcommand = args[1];
    const settings = getServerSettings(message.guild.id);
    
    try {
        switch(subcommand) {
            case 'on':
                settings.translationEnabled = true;
                saveServerSettings(message.guild.id, settings);
                await message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('✅ АВТО-ПЕРЕВОД ВКЛЮЧЕН')
                            .setColor(0x57F287)
                            .setDescription('Система автоматического перевода по реакциям теперь активна во всех каналах, кроме исключенных.')
                            .addFields(
                                { name: '🇷🇺 Русский', value: 'Добавьте реакцию 🇷🇺 для перевода на русский', inline: true },
                                { name: '🇬🇧 Английский', value: 'Добавьте реакцию 🇬🇧 для перевода на английский', inline: true }
                            )
                    ]
                });
                break;
                
            case 'off':
                settings.translationEnabled = false;
                saveServerSettings(message.guild.id, settings);
                await message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('❌ АВТО-ПЕРЕВОД ВЫКЛЮЧЕН')
                            .setColor(0xED4245)
                            .setDescription('Система автоматического перевода по реакциям отключена во всех каналах.')
                    ]
                });
                break;
                
            case 'disablechannel':
                const channelToDisable = args.slice(2).join(' ');
                if (channelToDisable) {
                    let targetChannel = message.mentions.channels.first();
                    if (!targetChannel) {
                        targetChannel = message.guild.channels.cache.get(channelToDisable);
                    }
                    if (!targetChannel) {
                        targetChannel = message.guild.channels.cache.find(ch => 
                            ch.name.toLowerCase().includes(channelToDisable.toLowerCase())
                        );
                    }
                    
                    if (targetChannel && targetChannel.isTextBased()) {
                        if (!settings.disabledTranslationChannels.includes(targetChannel.id)) {
                            settings.disabledTranslationChannels.push(targetChannel.id);
                            saveServerSettings(message.guild.id, settings);
                            
                            // ДОБАВЬТЕ ОТЛАДОЧНОЕ СООБЩЕНИЕ
                            console.log(`🚫 Translation disabled for channel: ${targetChannel.name} (${targetChannel.id}) in guild: ${message.guild.name}`);
                            
                            await message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setTitle('🚫 ПЕРЕВОД ОТКЛЮЧЕН')
                                        .setColor(0xFEE75C)
                                        .setDescription(`Авто-перевод отключен для канала: **#${targetChannel.name}**`)
                                        .setFooter({ text: 'В остальных каналах перевод продолжит работать' })
                                ]
                            });
                        } else {
                            await message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setTitle('ℹ️ КАНАЛ УЖЕ В СПИСКЕ')
                                        .setColor(0xFEE75C)
                                        .setDescription(`Канал **#${targetChannel.name}** уже в списке отключенных.`)
                                ]
                            });
                        }
                    } else {
                        await message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle('❌ КАНАЛ НЕ НАЙДЕН')
                                    .setColor(0xED4245)
                                    .setDescription('Укажите текстовый канал.')
                            ]
                        });
                    }
                }
                break;
                
            case 'enablechannel':
                const channelToEnable = args.slice(2).join(' ');
                if (channelToEnable) {
                    let targetChannel = message.mentions.channels.first();
                    if (!targetChannel) {
                        targetChannel = message.guild.channels.cache.get(channelToEnable);
                    }
                    if (!targetChannel) {
                        targetChannel = message.guild.channels.cache.find(ch => 
                            ch.name.toLowerCase().includes(channelToEnable.toLowerCase())
                        );
                    }
                    
                    if (targetChannel) {
                        const index = settings.disabledTranslationChannels.indexOf(targetChannel.id);
                        if (index > -1) {
                            settings.disabledTranslationChannels.splice(index, 1);
                            saveServerSettings(message.guild.id, settings);
                            await message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setTitle('✅ ПЕРЕВОД ВКЛЮЧЕН')
                                        .setColor(0x57F287)
                                        .setDescription(`Авто-перевод включен для канала: **#${targetChannel.name}**`)
                                ]
                            });
                        } else {
                            await message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setTitle('ℹ️ КАНАЛ НЕ НАЙДЕН')
                                        .setColor(0xFEE75C)
                                        .setDescription(`Канал **#${targetChannel.name}** не найден в списке отключенных.`)
                                ]
                            });
                        }
                    }
                }
                break;
                
            case 'addrole':
                const roleToAdd = args.slice(2).join(' ');
                if (roleToAdd) {
                    let targetRole = message.mentions.roles.first();
                    if (!targetRole) {
                        targetRole = message.guild.roles.cache.get(roleToAdd);
                    }
                    if (!targetRole) {
                        targetRole = message.guild.roles.cache.find(role => 
                            role.name.toLowerCase().includes(roleToAdd.toLowerCase())
                        );
                    }
                    
                    if (targetRole) {
                        if (!settings.protectedRoles.includes(targetRole.id)) {
                            settings.protectedRoles.push(targetRole.id);
                            saveServerSettings(message.guild.id, settings);
                            await message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setTitle('🛡️ РОЛЬ ДОБАВЛЕНА')
                                        .setColor(0x57F287)
                                        .setDescription(`Роль **${targetRole.name}** добавлена в защищенные.\n\n💡 Сообщения от этой роли **НЕ будут переводиться**.`)
                                ]
                            });
                        } else {
                            await message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setTitle('ℹ️ РОЛЬ УЖЕ В СПИСКЕ')
                                        .setColor(0xFEE75C)
                                        .setDescription(`Роль **${targetRole.name}** уже в списке защищенных.`)
                                ]
                            });
                        }
                    }
                }
                break;
                
            case 'removerole':
                const roleToRemove = args.slice(2).join(' ');
                if (roleToRemove) {
                    let targetRole = message.mentions.roles.first();
                    if (!targetRole) {
                        targetRole = message.guild.roles.cache.get(roleToRemove);
                    }
                    if (!targetRole) {
                        targetRole = message.guild.roles.cache.find(role => 
                            role.name.toLowerCase().includes(roleToRemove.toLowerCase())
                        );
                    }
                    
                    if (targetRole) {
                        const index = settings.protectedRoles.indexOf(targetRole.id);
                        if (index > -1) {
                            settings.protectedRoles.splice(index, 1);
                            saveServerSettings(message.guild.id, settings);
                            await message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setTitle('✅ РОЛЬ УДАЛЕНА')
                                        .setColor(0x57F287)
                                        .setDescription(`Роль **${targetRole.name}** удалена из защищенных.\n\n💡 Сообщения от этой роли теперь **будут переводиться**.`)
                                ]
                            });
                        } else {
                            await message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setTitle('ℹ️ РОЛЬ НЕ НАЙДЕНА')
                                        .setColor(0xFEE75C)
                                        .setDescription(`Роль **${targetRole.name}** не найдена в списке защищенных.`)
                                ]
                            });
                        }
                    }
                }
                break;
                
            case 'status':
                const status = settings.translationEnabled ? '✅ ВКЛЮЧЕН' : '❌ ВЫКЛЮЧЕН';
                const disabledChannelsInfo = settings.disabledTranslationChannels.length === 0 ? 
                    'Нет' : 
                    settings.disabledTranslationChannels.map(id => {
                        const ch = message.guild.channels.cache.get(id);
                        return ch ? `#${ch.name}` : id;
                    }).join(', ');
                
                const rolesInfo = settings.protectedRoles.length === 0 ? 
                    'Нет' : 
                    settings.protectedRoles.map(id => {
                        const role = message.guild.roles.cache.get(id);
                        return role ? role.name : id;
                    }).join(', ');
                
                await message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('🌐 СТАТУС АВТО-ПЕРЕВОДА')
                            .setColor(settings.translationEnabled ? 0x57F287 : 0xED4245)
                            .setDescription(`
**Общий статус:** ${status}
🚫 **Отключен в каналах:** ${disabledChannelsInfo}
🛡️ **Защищенные роли:** ${rolesInfo}

**🇷🇺 Реакции:**
• 🇷🇺 - перевод на русский
• 🇬🇧 - перевод на английский

**💡 Логика работы:**
Перевод работает во всех каналах, кроме указанных в списке отключенных.
                            `)
                    ]
                });
                break;
                
            case 'clearchannels':
                settings.disabledTranslationChannels = [];
                saveServerSettings(message.guild.id, settings);
                await message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('🗑️ СПИСОК ОЧИЩЕН')
                            .setColor(0x57F287)
                            .setDescription('Очищен список каналов с отключенным переводом.\n\n💡 Перевод теперь работает во **всех каналах**.')
                    ]
                });
                break;
                
            default:
                await message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('🌐 НАСТРОЙКА АВТО-ПЕРЕВОДА')
                            .setColor(0x5865F2)
                            .setDescription(`
**Основные команды:**
\`-translation on\` - Включить авто-перевод
\`-translation off\` - Выключить авто-перевод
\`-translation status\` - Статус настроек

**Управление каналами:**
\`-translation disablechannel #канал\` - Отключить перевод в канале
\`-translation enablechannel #канал\` - Включить перевод в канале
\`-translation clearchannels\` - Включить перевод во всех каналах

**Защищенные роли:**
\`-translation addrole @роль\` - Добавить защищенную роль
\`-translation removerole @роль\` - Удалить защищенную роль

**💡 Логика работы:**
• По умолчанию перевод работает во всех каналах
• Добавляйте каналы в исключения где перевод не нужен
• Сообщения от защищенных ролей не переводятся
                            `)
                    ]
                });
        }
        
        await message.delete().catch(() => {});
        
    } catch (error) {
        console.error('Translation command error:', error);
        await message.reply('❌ Ошибка при выполнении команды.');
    }
}
});

// ==================== ПРОСТОЙ РАБОЧИЙ КОД РАДИО ====================

// Проверенные рабочие радиостанции
const radioStations = {
    'нвс': 'http://icecast.nvc.ru:8000/nvc.mp3',
    'шансон': 'http://radio.host1.best:8000/russkoe', 
    'ретро': 'http://retro.streamr.ru:8043/retro-256.mp3',
    'рок': 'http://rock-radio.streamr.ru:8060/rock-256.mp3'
};

const players = new Map();

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    const args = message.content.split(' ');
    
    // Команда пинг
    if (message.content === '-ping') {
        await message.reply('🏓 Понг! Бот работает.');
        return;
    }

    // Включить радио
    if (message.content.startsWith('-play')) {
        const station = args[1] || 'нвс';
        
        if (!message.member?.voice?.channel) {
            return message.reply('❌ Залетай в войс канал!');
        }

        const voiceChannel = message.member.voice.channel;
        
        try {
            // Останавливаем предыдущее воспроизведение
            if (players.has(message.guild.id)) {
                players.get(message.guild.id).stop();
                players.delete(message.guild.id);
            }

            // Подключаемся к каналу
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator,
            });

            // Создаем плеер и ресурс
            const player = createAudioPlayer();
            const resource = createAudioResource(radioStations[station], {
                inlineVolume: true
            });

            // Настраиваем громкость
            resource.volume.setVolume(0.5);

            // Запускаем воспроизведение
            player.play(resource);
            connection.subscribe(player);

            // Сохраняем плеер
            players.set(message.guild.id, player);

            await message.reply(`🔊 Врубил **${station}** в канале ${voiceChannel.name}`);

            // Логируем статус
            player.on('stateChange', (oldState, newState) => {
                console.log(`Радио: ${oldState.status} -> ${newState.status}`);
            });

        } catch (error) {
            console.error('Ошибка:', error);
            await message.reply('❌ Чет не пашет радио...');
        }
        return;
    }

    // Выключить радио
    if (message.content === '-stop') {
        if (players.has(message.guild.id)) {
            players.get(message.guild.id).stop();
            players.delete(message.guild.id);
            await message.reply('⏹️ Вырубил радио');
        } else {
            await message.reply('❌ Радио и так не играет');
        }
        return;
    }

    // Список станций
    if (message.content === '-stations') {
        await message.reply(`📻 **Станции:** ${Object.keys(radioStations).join(', ')}`);
        return;
    }

    // Тест подключения
    if (message.content === '-testvoice') {
        if (!message.member?.voice?.channel) {
            return message.reply('❌ Зайди в войс!');
        }

        try {
            const connection = joinVoiceChannel({
                channelId: message.member.voice.channel.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator,
            });

            await message.reply('✅ Подключился к каналу!');
            
            // Отключаемся через 3 секунды
            setTimeout(() => {
                connection.destroy();
            }, 3000);

        } catch (error) {
            await message.reply(`❌ Ошибка: ${error.message}`);
        }
    }
});

// Автоотключение при пустом канале
client.on('voiceStateUpdate', (oldState, newState) => {
    if (oldState.channel && !newState.channel) {
        const userCount = oldState.channel.members.filter(m => !m.user.bot).size;
        if (userCount === 0 && players.has(oldState.guild.id)) {
            setTimeout(() => {
                players.get(oldState.guild.id).stop();
                players.delete(oldState.guild.id);
            }, 10000);
        }
    }
});
// ==================== СИСТЕМА ПЕРЕВОДА ====================

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
        const response = await axios.get(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`);
        const data = response.data;
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

// ==================== СИСТЕМА ТИКЕТОВ ====================

// Хранилище настроек тикетов
const ticketSettings = new Map();

// Команда настройки тикетов
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

    if (message.content.startsWith('!ticket')) {
        const args = message.content.split(' ');
        
        if (args.length < 4) {
            const helpEmbed = new EmbedBuilder()
                .setColor('#727070')
                .setTitle(':gear: Настройка системы заявок в полк')
                .setDescription(`
**Использование:**
\`!ticket <ID_канала> <ID_категории> <ID_ролей через запятую>\`

**Пример:**
\`!ticket 123456789 987654321 111111111,222222222\`

**Как получить ID:**
• Включите режим разработчика в Discord
• ПКМ по каналу/роли → "Копировать ID"
                `);
            
            await message.reply({ embeds: [helpEmbed] });
            return;
        }

        const channelId = args[1];
        const categoryId = args[2];
        const roleIds = args[3].split(',').map(id => id.trim());

        try {
            const guild = message.guild;
            const targetChannel = await guild.channels.fetch(channelId);
            const category = await guild.channels.fetch(categoryId);
            
            if (!targetChannel || !category) {
                await message.reply('❌ Канал или категория не найдены! Проверьте ID.');
                return;
            }

            // Проверяем роли
            const validRoles = [];
            for (const roleId of roleIds) {
                try {
                    const role = await guild.roles.fetch(roleId);
                    if (role) validRoles.push(roleId);
                } catch (error) {
                    console.log(`Роль ${roleId} не найдена`);
                }
            }

            if (validRoles.length === 0) {
                await message.reply('❌ Не найдено ни одной валидной роли!');
                return;
            }

            // Сохраняем настройки
            ticketSettings.set(guild.id, {
                channelId,
                categoryId,
                roleIds: validRoles,
                guildId: guild.id
            });

            // Создаем сообщение с кнопкой (в вашем стиле)
            const button = new ButtonBuilder()
                .setCustomId("create_regiment_request")
                .setLabel("Создать заявку в полк")
                .setStyle(ButtonStyle.Primary);

            const row = new ActionRowBuilder().addComponents(button);

            const embed = new EmbedBuilder()
                .setTitle("Заявка в полк | Application to the regiment")
                .setDescription("Чтобы создать заявку нажмите ниже на кнопку \"Создать заявку в полк\"\n\nTo create a request, click the button below.")
                .setColor(3447003)
                .setTimestamp();

            await targetChannel.send({ embeds: [embed], components: [row] });

            // Сообщение об успешной настройке
            const successEmbed = new EmbedBuilder()
                .setColor('#727070')
                .setTitle(':white_check_mark: Система заявок настроена')
                .setDescription(`
**Канал с кнопкой:** <#${channelId}>
**Категория заявок:** <#${categoryId}>
**Роли офицеров:** ${validRoles.length} ролей

Теперь пользователи могут создавать заявки в полк!
                `);

            await message.reply({ embeds: [successEmbed] });
            console.log(`✅ Ticket system configured for guild: ${guild.name}`);

        } catch (error) {
            console.error('Ticket setup error:', error);
            await message.reply('❌ Ошибка при настройке! Проверьте ID и права бота.');
        }
    }
});

// Функция инициализации тикет системы (аналогично вашей)
async function initializeTicketSystem() {
    // Используем настройки из команды !ticket
    for (const [guildId, settings] of ticketSettings) {
        try {
            const guild = client.guilds.cache.get(guildId);
            if (!guild) continue;

            const category = await guild.channels.fetch(settings.categoryId);
            if (!category) {
                console.log(`❌ Ticket category not found for guild: ${guild.name}`);
                continue;
            }

            // Найти канал для отправки сообщения с кнопкой
            let targetChannel = guild.channels.cache.find(ch => 
                ch.parentId === settings.categoryId && 
                ch.type === ChannelType.GuildText
            );
            
            if (!targetChannel) {
                targetChannel = await guild.channels.create({
                    name: 'create-ticket-here',
                    type: ChannelType.GuildText,
                    parent: settings.categoryId
                });
            }

            // Создаем кнопку для тикетов (в вашем стиле)
            const button = new ButtonBuilder()
                .setCustomId("create_regiment_request")
                .setLabel("Создать заявку в полк")
                .setStyle(ButtonStyle.Primary);

            const row = new ActionRowBuilder().addComponents(button);

            const embed = new EmbedBuilder()
                .setTitle("Заявка в полк | Application to the regiment")
                .setDescription("Чтобы создать заявку нажмите ниже на кнопку \"Создать заявку в полк\"\nTo create a request, click the button below.")
                .setColor('#414141')
                .setTimestamp();

            await targetChannel.send({ embeds: [embed], components: [row] });
            console.log(`✅ Ticket system initialized in #${targetChannel.name} for guild: ${guild.name}`);
            
        } catch (error) {
            console.error(`❌ Ticket system initialization failed for guild ${guildId}:`, error);
        }
    }
}

// Обработчик кнопки тикета - ИСПРАВЛЕННАЯ ВЕРСИЯ
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton() || interaction.customId !== "create_regiment_request") return;

    const guildId = interaction.guild.id;
    const settings = ticketSettings.get(guildId);

    if (!settings) {
        await interaction.reply({ 
            content: '❌ Система заявок не настроена на этом сервере! Обратитесь к администратору.', 
            ephemeral: true 
        });
        return;
    }

    const user = interaction.user;
    const ticketChannelName = `ticket│${user.username.toLowerCase()}`;

    // Проверка на существующий тикет
    const existing = interaction.guild.channels.cache.find(
        c => c.name === ticketChannelName && c.parentId === settings.categoryId
    );
    
    if (existing) {
        await interaction.reply({ content: "У вас уже есть открытая заявка!", ephemeral: true });
        return;
    }

    // Создаем канал тикета
    const channel = await interaction.guild.channels.create({
        name: ticketChannelName,
        type: ChannelType.GuildText,
        parent: settings.categoryId,
        permissionOverwrites: [
            {
                id: interaction.guild.roles.everyone,
                deny: [PermissionsBitField.Flags.ViewChannel],
            },
            {
                id: user.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
            },
            ...settings.roleIds.map(roleId => ({
                id: roleId,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
            })),
        ]
    });

    // Создаем кнопку закрытия
    const closeButton = new ButtonBuilder()
        .setCustomId("close_ticket")
        .setLabel("Закрыть")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🔒");

    const closeRow = new ActionRowBuilder().addComponents(closeButton);

    // ОБЪЕДИНЕННАЯ АНКЕТА В ОДНОМ СООБЩЕНИИ
    const combinedEmbed = new EmbedBuilder()
        .setColor('#727070')
        .setTitle('📝 Анкета для заявки в полк | Regiment Application Form')
        .setDescription(`
**🇷🇺 Русская версия:**

Заполните бланк вопросов, и ждите ответа офицеров.

1. Ваш никнейм? - 
2. Ваше имя? - 
3. Ваш прайм-тайм? (От МСК) -
4. Сколько вам лет? - 
5. Ваш макс БР наземной техники? - 
6. Ваш макс БР летной техники? -
7. Ваша квалификация? (Танкист, Летчик, Вертолетчик, Зенитчик)? - 
8. Какой у вас К/Д за последний месяц? -

**🇬🇧 English version:**

Fill out the question form and wait for the officers to respond.

1. Your IGN(In Game Name)? - 
2. Your real name(or how we should call you)? - 
3. Your time zone? - 
4. How old are you? - 
5. Your max. tier of ground vehicles? - 
6. Your max. tier of flight vehicles? -
7. your qualification(what type of vehicle you play most)(Tank, Fighter, Heli, Anti-Air)? - 
8. What is your schedule for the last month? -

**📝 Примечание | Note:**
*P.s. we have a lot of russian players, who doesn't speak english. Please be patient and nice with everyone!*
        `)
        .setFooter({ text: 'Пожалуйста, заполните все поля | Please fill in all fields' })
        .setTimestamp();

    // ДИНАМИЧЕСКОЕ УПОМИНАНИЕ РОЛЕЙ ИЗ НАСТРОЕК
    const roleMentions = settings.roleIds && settings.roleIds.length > 0 
        ? settings.roleIds.map(roleId => `<@&${roleId}>`).join(' ') 
        : '';

    // ОДНО сообщение с упоминаниями, приветствием и анкетой
    const messageContent = roleMentions 
        ? `${roleMentions}`

    await channel.send({ 
        content: messageContent,
        embeds: [combinedEmbed],
        components: [closeRow] 
    });

    await interaction.reply({ 
        content: `✅ Заявка создана: <#${channel.id}>`, 
        ephemeral: true 
    });
});

// Обработчик кнопки закрытия тикета (с созданием транскрипта и удалением канала)
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton() || interaction.customId !== "close_ticket") return;

    const channel = interaction.channel;
    
    // Проверяем, что это тикет-канал
    if (!channel.name.startsWith('ticket│')) {
        await interaction.reply({ content: '❌ Эта кнопка работает только в тикет-каналах!', ephemeral: true });
        return;
    }

    const user = interaction.user;

    // Проверяем права (создатель тикета или модератор)
    const isOwner = channel.name === `ticket│${user.username.toLowerCase()}`;
    const isModerator = interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages);

    if (!isOwner && !isModerator) {
        await interaction.reply({ 
            content: '❌ Только создатель заявки или модератор может закрыть тикет!', 
            ephemeral: true 
        });
        return;
    }

    try {
        // Сразу удаляем кнопку чтобы предотвратить повторное нажатие
        await interaction.message.edit({ components: [] });
        await interaction.reply({ content: '🔒 Создаю транскрипт и удаляю заявку...' });

        // Создаем транскрипт
        await channel.send('-transcript');

        // Ждем 2 секунды чтобы команда транскрипта обработалась
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Создаем embed сообщение о удалении
        const deleteEmbed = new EmbedBuilder()
            .setColor('#ED4245')
            .setTitle('🗑️ Заявка удалена')
            .setDescription(`Заявка удалена пользователем ${user.tag}`)
            .addFields(
                { name: '👤 Удалил', value: `${user.tag}`, inline: true },
                { name: '⏰ Время удаления', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
                { name: '📄 Транскрипт', value: 'Транскрипт заявки был создан и сохранен', inline: false }
            )
            .setTimestamp();

        // Отправляем сообщение о удалении
        await channel.send({ embeds: [deleteEmbed] });

        // Ждем 3 секунды чтобы пользователь увидел сообщение
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Удаляем канал
        await channel.delete();

        console.log(`✅ Ticket deleted by ${user.tag} in guild ${interaction.guild.name}, transcript created`);

    } catch (error) {
        console.error('Ticket delete error:', error);
        
        if (interaction.replied) {
            await interaction.editReply({ content: '❌ Ошибка при удалении заявки!' });
        } else {
            await interaction.reply({ content: '❌ Ошибка при удалении заявки!', ephemeral: true });
        }
    }
});

// ==================== ОБРАБОТЧИКИ СОБЫТИЙ БОТА ====================

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

// Обработка реакций для перевода
client.on('messageReactionAdd', async (reaction, user) => {
    if (reaction.emoji.name === '🇷🇺' || reaction.emoji.name === '🇬🇧') {
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
    if (reaction.emoji.name === '🇷🇺' || reaction.emoji.name === '🇬🇧') {
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

// ==================== СИСТЕМА АВТОМАТИЧЕСКОГО УДАЛЕНИЯ С ИСКЛЮЧЕНИЕМ РОЛИ ====================

const autoDeleteSettings = new Map();

// Стандартные настройки
const DEFAULT_SETTINGS = {
    enabled: false,
    delay: 5000, // 5 секунд
    targetChannels: [], // Каналы где включено автоудаление
    protectPings: true, // Сохраняем пинги
    exemptRoles: [], // Роли которые ИСКЛЮЧАЮТСЯ из автоудаления (их сообщения не удаляются)
    protectAttachments: false,
    protectEmbeds: false,
    protectBots: false,
    protectStickers: false,
    protectEmojis: false
};

// Функция получения настроек для сервера
function getSettings(guildId) {
    if (!autoDeleteSettings.has(guildId)) {
        autoDeleteSettings.set(guildId, { ...DEFAULT_SETTINGS });
    }
    return autoDeleteSettings.get(guildId);
}

// Функция проверки защиты сообщения
function isMessageProtected(message, settings) {
    const member = message.member;
    
    // 1. Проверяем пинги - сохраняем
    if (settings.protectPings) {
        if (message.mentions.roles.size > 0) return true;
        if (message.mentions.users.size > 0 && !message.mentions.users.has(message.author.id)) return true;
        if (message.mentions.everyone) return true;
    }
    
    // 2. Проверяем исключенные роли - сохраняем ВСЁ от этих ролей
    if (member && settings.exemptRoles.length > 0) {
        const hasExemptRole = member.roles.cache.some(role =>
            settings.exemptRoles.some(exemptRole =>
                role.name.toLowerCase().includes(exemptRole.toLowerCase()) ||
                role.id === exemptRole
            )
        );
        if (hasExemptRole) {
            console.log(`🛡️ [${message.guild.name}] Сообщение защищено (исключенная роль): ${message.author.tag}`);
            return true;
        }
    }
    
    // 3. ВСЁ остальное удаляем
    return false;
}

// Функция проверки, применяется ли автоудаление к этому каналу
function shouldAutoDeleteInChannel(channel, settings) {
    if (settings.targetChannels.length === 0) return true;
    return settings.targetChannels.some(targetChannel =>
        channel.name.toLowerCase().includes(targetChannel.toLowerCase()) ||
        channel.id === targetChannel
    );
}

// Обработчик сообщений для автоматического удаления
client.on('messageCreate', async (message) => {
    if (message.system) return;
    if (!message.guild) return;
    
    const settings = getSettings(message.guild.id);
    if (!settings.enabled) return;
    
    // Проверяем, применяется ли автоудаление к этому каналу
    if (!shouldAutoDeleteInChannel(message.channel, settings)) {
        return;
    }
    
    // Проверяем, защищено ли сообщение (пинги или исключенные роли)
    if (isMessageProtected(message, settings)) {
        return;
    }
    
    // Логируем что удаляем
    const contentPreview = message.content ? message.content.substring(0, 50) + '...' : 'пустое сообщение';
    const attachmentsInfo = message.attachments.size > 0 ? ` [${message.attachments.size} вложений]` : '';
    const stickersInfo = message.stickers.size > 0 ? ` [${message.stickers.size} стикеров]` : '';
    
    console.log(`🗑️ [${message.guild.name}] #${message.channel.name} Удаляем: ${message.author.tag} - ${contentPreview}${attachmentsInfo}${stickersInfo}`);
    
    // Удаляем сообщение через указанную задержку
    setTimeout(async () => {
        try {
            if (message.deletable) {
                await message.delete();
            }
        } catch (error) {
            console.error(`Ошибка удаления в ${message.guild.name}:`, error.message);
        }
    }, settings.delay);
});

// Команды управления автоматическим удалением
client.on('messageCreate', async (message) => {
    if (message.system) return;
    
    // ИСПРАВЛЕННАЯ СТРОКА: используем новые названия пермишенов
    if (!message.member.permissions.has('ManageMessages')) return;
    
    if (message.content.startsWith('-autodelete')) {
        const args = message.content.split(' ');
        const subcommand = args[1];
        const settings = getSettings(message.guild.id);
        
        try {
            switch(subcommand) {
                case 'on':
                    settings.enabled = true;
                    await message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('✅ АВТОМАТИЧЕСКОЕ УДАЛЕНИЕ ВКЛЮЧЕНО')
                                .setColor(0x57F287)
                                .setDescription(`
**🗑️ Теперь удаляются:**
• Все обычные сообщения
• Стикеры, эмодзи, картинки
• Гифки, файлы, эмбеды
• Сообщения ботов

**🔒 Сохраняются:**
• Сообщения с пингами (@упоминания)
• Сообщения от исключенных ролей

**💡 Используйте команды:**
\`-autodelete addchannel #канал\` - выбрать каналы
\`-autodelete addrole @роль\` - добавить исключения
\`-autodelete status\` - проверить настройки
                                `)
                                .setTimestamp()
                        ]
                    });
                    break;
                    
                case 'off':
                    settings.enabled = false;
                    await message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('❌ АВТОМАТИЧЕСКОЕ УДАЛЕНИЕ ВЫКЛЮЧЕНО')
                                .setColor(0xED4245)
                                .setDescription('Система автоматического удаления сообщений отключена.')
                                .setTimestamp()
                        ]
                    });
                    break;
                    
                case 'delay':
                    const delay = parseInt(args[2]);
                    if (delay && delay >= 1000 && delay <= 30000) {
                        settings.delay = delay;
                        await message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle('⏰ ЗАДЕРЖКА УСТАНОВЛЕНА')
                                    .setColor(0x5865F2)
                                    .setDescription(`Сообщения будут удаляться через **${delay}мс** после отправки.`)
                                    .setTimestamp()
                            ]
                        });
                    } else {
                        await message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle('❌ ОШИБКА')
                                    .setColor(0xED4245)
                                    .setDescription('Укажите задержку от **1000** до **30000** мс.')
                                    .setTimestamp()
                            ]
                        });
                    }
                    break;
                    
                case 'addchannel':
                    const channelToAdd = args.slice(2).join(' ');
                    if (channelToAdd) {
                        let targetChannel = message.mentions.channels.first();
                        
                        if (!targetChannel) {
                            targetChannel = message.guild.channels.cache.get(channelToAdd);
                        }
                        
                        if (!targetChannel) {
                            targetChannel = message.guild.channels.cache.find(ch => 
                                ch.name.toLowerCase().includes(channelToAdd.toLowerCase())
                            );
                        }
                        
                        if (targetChannel) {
                            if (!settings.targetChannels.includes(targetChannel.id)) {
                                settings.targetChannels.push(targetChannel.id);
                                await message.reply({
                                    embeds: [
                                        new EmbedBuilder()
                                            .setTitle('✅ КАНАЛ ДОБАВЛЕН')
                                            .setColor(0x57F287)
                                            .setDescription(`Автоудаление включено для канала: **#${targetChannel.name}**`)
                                            .setTimestamp()
                                    ]
                                });
                            } else {
                                await message.reply({
                                    embeds: [
                                        new EmbedBuilder()
                                            .setTitle('ℹ️ КАНАЛ УЖЕ В СПИСКЕ')
                                            .setColor(0xFEE75C)
                                            .setDescription(`Канал **#${targetChannel.name}** уже в списке автоудаления.`)
                                            .setTimestamp()
                                    ]
                                });
                            }
                        } else {
                            await message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setTitle('❌ КАНАЛ НЕ НАЙДЕН')
                                        .setColor(0xED4245)
                                        .setDescription('Укажите упоминание канала, его ID или имя.')
                                        .setTimestamp()
                                ]
                            });
                        }
                    }
                    break;
                    
                case 'removechannel':
                    const channelToRemove = args.slice(2).join(' ');
                    if (channelToRemove) {
                        let targetChannel = message.mentions.channels.first();
                        
                        if (!targetChannel) {
                            targetChannel = message.guild.channels.cache.get(channelToRemove);
                        }
                        
                        if (!targetChannel) {
                            targetChannel = message.guild.channels.cache.find(ch => 
                                ch.name.toLowerCase().includes(channelToRemove.toLowerCase())
                            );
                        }
                        
                        if (targetChannel) {
                            const index = settings.targetChannels.indexOf(targetChannel.id);
                            if (index > -1) {
                                settings.targetChannels.splice(index, 1);
                                await message.reply({
                                    embeds: [
                                        new EmbedBuilder()
                                            .setTitle('✅ КАНАЛ УДАЛЕН')
                                            .setColor(0x57F287)
                                            .setDescription(`Канал **#${targetChannel.name}** удален из списка автоудаления.`)
                                            .setTimestamp()
                                    ]
                                });
                            } else {
                                await message.reply({
                                    embeds: [
                                        new EmbedBuilder()
                                            .setTitle('ℹ️ КАНАЛ НЕ НАЙДЕН')
                                            .setColor(0xFEE75C)
                                            .setDescription(`Канал **#${targetChannel.name}** не найден в списке автоудаления.`)
                                            .setTimestamp()
                                    ]
                                });
                            }
                        } else {
                            await message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setTitle('❌ КАНАЛ НЕ НАЙДЕН')
                                        .setColor(0xED4245)
                                        .setDescription('Канал не найден.')
                                        .setTimestamp()
                                ]
                            });
                        }
                    }
                    break;
                    
                case 'listchannels':
                    if (settings.targetChannels.length === 0) {
                        await message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle('📋 СПИСОК КАНАЛОВ')
                                    .setColor(0x5865F2)
                                    .setDescription('Список каналов для автоудаления пуст.\nАвтоудаление применяется ко **всем каналам**.')
                                    .setTimestamp()
                            ]
                        });
                    } else {
                        const channelList = settings.targetChannels.map(channelId => {
                            const channel = message.guild.channels.cache.get(channelId);
                            return channel ? `• #${channel.name}` : `• Неизвестный канал (${channelId})`;
                        }).join('\n');
                        
                        await message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle('📋 КАНАЛЫ С АВТОУДАЛЕНИЕМ')
                                    .setColor(0x5865F2)
                                    .setDescription(channelList)
                                    .setTimestamp()
                            ]
                        });
                    }
                    break;
                    
                case 'clearallchannels':
                    settings.targetChannels = [];
                    await message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('🗑️ СПИСОК ОЧИЩЕН')
                                .setColor(0x57F287)
                                .setDescription('Очищен список каналов.\nАвтоудаление будет применяться ко **всем каналам**.')
                                .setTimestamp()
                        ]
                    });
                    break;
                    
                // КОМАНДЫ ДЛЯ УПРАВЛЕНИЯ РОЛЯМИ
                case 'addrole':
                    const roleToAdd = args.slice(2).join(' ');
                    if (roleToAdd) {
                        let targetRole = message.mentions.roles.first();
                        
                        if (!targetRole) {
                            targetRole = message.guild.roles.cache.get(roleToAdd);
                        }
                        
                        if (!targetRole) {
                            targetRole = message.guild.roles.cache.find(role => 
                                role.name.toLowerCase().includes(roleToAdd.toLowerCase())
                            );
                        }
                        
                        if (targetRole) {
                            if (!settings.exemptRoles.includes(targetRole.id)) {
                                settings.exemptRoles.push(targetRole.id);
                                await message.reply({
                                    embeds: [
                                        new EmbedBuilder()
                                            .setTitle('🛡️ РОЛЬ ДОБАВЛЕНА')
                                            .setColor(0x57F287)
                                            .setDescription(`Добавлена исключенная роль: **${targetRole.name}**\n\n💡 Сообщения от этой роли **НЕ будут удаляться**.`)
                                            .setTimestamp()
                                    ]
                                });
                            } else {
                                await message.reply({
                                    embeds: [
                                        new EmbedBuilder()
                                            .setTitle('ℹ️ РОЛЬ УЖЕ В СПИСКЕ')
                                            .setColor(0xFEE75C)
                                            .setDescription(`Роль **${targetRole.name}** уже в списке исключений.`)
                                            .setTimestamp()
                                    ]
                                });
                            }
                        } else {
                            await message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setTitle('❌ РОЛЬ НЕ НАЙДЕНА')
                                        .setColor(0xED4245)
                                        .setDescription('Укажите упоминание роли, её ID или имя.')
                                        .setTimestamp()
                                ]
                            });
                        }
                    }
                    break;
                    
                case 'removerole':
                    const roleToRemove = args.slice(2).join(' ');
                    if (roleToRemove) {
                        let targetRole = message.mentions.roles.first();
                        
                        if (!targetRole) {
                            targetRole = message.guild.roles.cache.get(roleToRemove);
                        }
                        
                        if (!targetRole) {
                            targetRole = message.guild.roles.cache.find(role => 
                                role.name.toLowerCase().includes(roleToRemove.toLowerCase())
                            );
                        }
                        
                        if (targetRole) {
                            const index = settings.exemptRoles.indexOf(targetRole.id);
                            if (index > -1) {
                                settings.exemptRoles.splice(index, 1);
                                await message.reply({
                                    embeds: [
                                        new EmbedBuilder()
                                            .setTitle('✅ РОЛЬ УДАЛЕНА')
                                            .setColor(0x57F287)
                                            .setDescription(`Удалена исключенная роль: **${targetRole.name}**\n\n💡 Сообщения от этой роли теперь **будут удаляться**.`)
                                            .setTimestamp()
                                    ]
                                });
                            } else {
                                await message.reply({
                                    embeds: [
                                        new EmbedBuilder()
                                            .setTitle('ℹ️ РОЛЬ НЕ НАЙДЕНА')
                                            .setColor(0xFEE75C)
                                            .setDescription(`Роль **${targetRole.name}** не найдена в списке исключений.`)
                                            .setTimestamp()
                                    ]
                                });
                            }
                        } else {
                            await message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setTitle('❌ РОЛЬ НЕ НАЙДЕНА')
                                        .setColor(0xED4245)
                                        .setDescription('Роль не найдена.')
                                        .setTimestamp()
                                ]
                            });
                        }
                    }
                    break;
                    
                case 'listroles':
                    if (settings.exemptRoles.length === 0) {
                        await message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle('🛡️ ИСКЛЮЧЕННЫЕ РОЛИ')
                                    .setColor(0x5865F2)
                                    .setDescription('Список исключенных ролей пуст.')
                                    .setTimestamp()
                            ]
                        });
                    } else {
                        const roleList = settings.exemptRoles.map(roleId => {
                            const role = message.guild.roles.cache.get(roleId);
                            return role ? `• ${role.name}` : `• Неизвестная роль (${roleId})`;
                        }).join('\n');
                        
                        await message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle('🛡️ ИСКЛЮЧЕННЫЕ РОЛИ')
                                    .setColor(0x5865F2)
                                    .setDescription(`Роли, чьи сообщения **НЕ удаляются**:\n\n${roleList}`)
                                    .setTimestamp()
                            ]
                        });
                    }
                    break;
                    
                case 'clearroles':
                    settings.exemptRoles = [];
                    await message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('🗑️ СПИСОК РОЛЕЙ ОЧИЩЕН')
                                .setColor(0x57F287)
                                .setDescription('Очищен список исключенных ролей.')
                                .setTimestamp()
                        ]
                    });
                    break;
                    
                case 'test':
                    const testMessage = await message.channel.send('🧪 Тестовое сообщение для проверки автоудаления');
                    setTimeout(async () => {
                        if (testMessage.deletable) {
                            await testMessage.delete();
                        }
                    }, 3000);
                    await message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('🧪 ТЕСТ ЗАПУЩЕН')
                                .setColor(0x5865F2)
                                .setDescription('Тестовое сообщение удалится через 3 секунды если автоудаление работает.')
                                .setTimestamp()
                        ]
                    });
                    break;
                    
                case 'status':
                    const status = settings.enabled ? '✅ ВКЛЮЧЕНО' : '❌ ВЫКЛЮЧЕНО';
                    const targetChannelsInfo = settings.targetChannels.length === 0 ? 
                        'Все каналы' : 
                        settings.targetChannels.map(id => {
                            const ch = message.guild.channels.cache.get(id);
                            return ch ? `#${ch.name}` : id;
                        }).join(', ');
                    
                    const exemptRolesInfo = settings.exemptRoles.length === 0 ? 
                        'Нет' : 
                        settings.exemptRoles.map(id => {
                            const role = message.guild.roles.cache.get(id);
                            return role ? role.name : id;
                        }).join(', ');
                    
                    await message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('⚡ СТАТУС АВТОМАТИЧЕСКОГО УДАЛЕНИЯ')
                                .setColor(settings.enabled ? 0x57F287 : 0xED4245)
                                .setDescription(`
**${status}**
⏰ **Задержка:** ${settings.delay}мс
🎯 **Каналы:** ${targetChannelsInfo}

**🗑️ УДАЛЯЕТСЯ ВСЁ КРОМЕ:**
• Сообщений с пингами (@упоминания)
• Сообщений от исключенных ролей

**🛡️ ИСКЛЮЧЕННЫЕ РОЛИ:**
${exemptRolesInfo}

**💡 Примечание:**
Пользователи с исключенными ролями могут свободно общаться - их сообщения не удаляются.
                                `)
                                .setFooter({ text: `Запрошено: ${message.author.tag}` })
                                .setTimestamp()
                        ]
                    });
                    break;
                    
                default:
                    await message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('⚡ АВТОМАТИЧЕСКОЕ УДАЛЕНИЕ СООБЩЕНИЙ')
                                .setColor(0x5865F2)
                                .setDescription(`
**🗑️ Удаляет ВСЁ кроме:**
• Пингов (@упоминания)
• Сообщений от исключенных ролей

**📋 ОСНОВНЫЕ КОМАНДЫ:**
\`-autodelete on\` - Включить
\`-autodelete off\` - Выключить  
\`-autodelete delay 5000\` - Задержка (мс)
\`-autodelete status\` - Настройки

**🎯 Управление каналами:**
\`-autodelete addchannel #канал\` - Добавить канал
\`-autodelete removechannel #канал\` - Удалить канал  
\`-autodelete listchannels\` - Список каналов

**🛡️ Управление ролями:**
\`-autodelete addrole @роль\` - Добавить исключенную роль
\`-autodelete removerole @роль\` - Удалить исключенную роль
\`-autodelete listroles\` - Список исключенных ролей
\`-autodelete clearroles\` - Очистить список ролей

**💡 Пример использования:**
1. \`-autodelete on\` - включить
2. \`-autodelete addchannel #флуд\` - выбрать канал
3. \`-autodelete addrole @Модератор\` - исключить роль
4. \`-autodelete status\` - проверить настройки
                                `)
                                .setFooter({ text: 'Система автоматической модерации чата' })
                                .setTimestamp()
                        ]
                    });
            }
            
            await message.delete().catch(() => {});
            
        } catch (error) {
            console.error('Auto-delete command error:', error);
            await message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('❌ ОШИБКА')
                        .setColor(0xED4245)
                        .setDescription('Произошла ошибка при выполнении команды.')
                        .setTimestamp()
                ]
            }).then(msg => setTimeout(() => msg.delete(), 5000));
        }
    }
});
// Обработка команды -transcript
client.on('messageCreate', async message => {
    if (message.system) return;

    if (message.content.toLowerCase() === '-transcript') {
        await message.delete().catch(() => {});
        
        try {
            console.log('🚀 Starting transcript creation process...');
            
            // Получаем настройки сервера
            const settings = getServerSettings(message.guild.id);
            const transcriptChannelId = settings.transcriptChannelId;
            
            console.log(`📝 Using transcript channel: ${transcriptChannelId}`);
            
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
            
            // ИСПОЛЬЗУЕМ НАСТРОЕННЫЙ КАНАЛ ИЗ serverSettings
            const transcriptChannel = client.channels.cache.get(transcriptChannelId);
            
            if (transcriptChannel && transcriptChannel.isTextBased()) {
                await transcriptChannel.send({
                    embeds: [ticketInfoEmbed],
                    components: [row],
                    content: `📋 **Transcript Created**\n**ID:** \`${transcriptId}\``
                });
                
                await message.channel.send('✅ Transcript created! Click the "Open Transcript" button to view it online.');
                console.log(`✅ Transcript message sent to channel ${transcriptChannelId}`);
                console.log(`🎉 Transcript creation completed successfully!`);
                
            } else {
                throw new Error(`Transcript channel not found or not accessible: ${transcriptChannelId}`);
            }
            
        } catch (error) {
            console.error('❌ Error creating transcript:', error);
            await message.channel.send('❌ Error creating transcript: ' + error.message);
        }
    }
  });
// Обработка реакций для перевода
client.on('messageReactionAdd', async (reaction, user) => {
    if (reaction.emoji.name === '🇷🇺' || reaction.emoji.name === '🇬🇧') {
        const cooldownKey = `${user.id}-${reaction.message.id}`;
        if (translationCooldown.has(cooldownKey)) return;
        translationCooldown.add(cooldownKey);
        setTimeout(() => translationCooldown.delete(cooldownKey), TRANSLATION_COOLDOWN_TIME);
        
        try {
            if (reaction.partial) await reaction.fetch();
            const message = reaction.message;
            if (message.system) return;
            
            // ДОБАВЬТЕ ЭТУ ПРОВЕРКУ НАСТРОЕК:
            if (!message.guild) return;
            
            // Получаем настройки сервера
            const settings = getServerSettings(message.guild.id);
            
            // Проверяем, включен ли авто-перевод
            if (!settings.translationEnabled) {
                console.log(`🚫 Translation disabled globally in guild: ${message.guild.name}`);
                return;
            }
            
            // Проверяем, не отключен ли перевод в этом канале
            if (settings.disabledTranslationChannels.includes(message.channel.id)) {
                console.log(`🚫 Translation disabled in channel: ${message.channel.name}`);
                return;
            }
            
            // Проверяем, защищена ли роль автора сообщения
            const authorMember = await message.guild.members.fetch(message.author.id).catch(() => null);
            if (authorMember) {
                const hasProtectedRole = authorMember.roles.cache.some(role => 
                    settings.protectedRoles.includes(role.id)
                );
                if (hasProtectedRole) {
                    console.log(`🛡️ Translation blocked for protected role user: ${authorMember.user.tag}`);
                    return;
                }
            }
            
            console.log(`✅ Translation allowed for message in channel: ${message.channel.name}`);
            // ... остальной код перевода ...
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
// ==================== ЗАПУСК СЕРВЕРА ====================

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('🌐 Haki Bot Panel running on port ' + PORT);
    console.log('🔗 Access at: ' + getBaseUrl());
});

// Обработка graceful shutdown
process.on('SIGTERM', () => {
    console.log('🔄 Received SIGTERM, shutting down gracefully...');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('🔄 Received SIGINT, shutting down gracefully...');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

// Обработка ошибок
process.on('unhandledRejection', error => {
    console.error('❌ Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('❌ Uncaught exception:', error);
});

// Запуск бота
client.login(token).catch(error => {
    console.error('❌ Login failed:', error);
    process.exit(1);
});

console.log('🚀 Bot starting with enhanced web dashboard...');
