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
  REST, 
  Routes
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
const commandPermissions = new Map();


// ==================== НАСТРОЙКИ СЛЕШ-КОМАНД ====================

// После создания клиента добавьте (после строки с const client = new Client({...})):
client.commands = new Collection();

// Определяем все слеш-команды (добавьте после импортов и переменных окружения)
const slashCommands = [
    {
        name: 'ping',
        description: 'Проверка работоспособности бота'
    },
    {
        name: 'transcript',
        description: 'Создать транскрипт текущего канала'
    },
    {
        name: 'settranscript',
        description: 'Настроить канал для транскриптов',
        options: [
            {
                name: 'channel_id',
                description: 'ID канала или "reset" для сброса',
                type: 3, // STRING
                required: true
            }
        ]
    },
    {
        name: 'transcriptsettings',
        description: 'Показать текущие настройки транскриптов'
    },
    {
        name: 'translation',
        description: 'Управление автоматическим переводом',
        options: [
            {
                name: 'action',
                description: 'Действие',
                type: 3, // STRING
                required: true,
                choices: [
                    { name: 'Включить', value: 'on' },
                    { name: 'Выключить', value: 'off' },
                    { name: 'Статус', value: 'status' },
                    { name: 'Отключить канал', value: 'disablechannel' },
                    { name: 'Включить канал', value: 'enablechannel' },
                    { name: 'Очистить каналы', value: 'clearchannels' },
                    { name: 'Добавить роль', value: 'addrole' },
                    { name: 'Удалить роль', value: 'removerole' }
                ]
            },
            {
                name: 'target',
                description: 'Цель (канал или роль)',
                type: 3, // STRING
                required: false
            }
        ]
    },
    {
        name: 'autodelete',
        description: 'Управление автоудалением сообщений',
        options: [
            {
                name: 'action',
                description: 'Действие',
                type: 3, // STRING
                required: true,
                choices: [
                    { name: 'Включить', value: 'on' },
                    { name: 'Выключить', value: 'off' },
                    { name: 'Статус', value: 'status' },
                    { name: 'Установить задержку', value: 'delay' },
                    { name: 'Добавить канал', value: 'addchannel' },
                    { name: 'Удалить канал', value: 'removechannel' },
                    { name: 'Список каналов', value: 'listchannels' },
                    { name: 'Очистить каналы', value: 'clearallchannels' },
                    { name: 'Добавить роль', value: 'addrole' },
                    { name: 'Удалить роль', value: 'removerole' },
                    { name: 'Список ролей', value: 'listroles' },
                    { name: 'Очистить роли', value: 'clearroles' },
                    { name: 'Тест', value: 'test' }
                ]
            },
            {
                name: 'value',
                description: 'Значение (задержка, ID канала/роли)',
                type: 3, // STRING
                required: false
            }
        ]
    },
    {
        name: 'play',
        description: 'Включить радиостанцию',
        options: [
            {
                name: 'station',
                description: 'Название радиостанции',
                type: 3, // STRING
                required: false,
                choices: [
                    { name: 'НВС', value: 'нвс' },
                    { name: 'Шансон', value: 'шансон' },
                    { name: 'Ретро', value: 'ретро' },
                    { name: 'Рок', value: 'рок' }
                ]
            }
        ]
    },
    {
        name: 'stop',
        description: 'Выключить радио'
    },
    {
        name: 'stations',
        description: 'Показать список радиостанций'
    },
    {
        name: 'testvoice',
        description: 'Тест подключения к голосовому каналу'
    },
    {
        name: 'сервер',
        description: 'Управление отображением сервера в голосовом канале',
        options: [
            {
                name: 'action',
                description: 'Действие',
                type: 3, // STRING
                required: true,
                choices: [
                    { name: 'Настроить сервер', value: 'setup' },
                    { name: 'Статус', value: 'статус' },
                    { name: 'Сброс', value: 'сброс' }
                ]
            },
            {
                name: 'channel_id',
                description: 'ID голосового канала',
                type: 3, // STRING
                required: false
            },
            {
                name: 'server_name',
                description: 'Название сервера',
                type: 3, // STRING
                required: false
            }
        ]
    },
    {
        name: 'ticket',
        description: 'Настройка системы тикетов (только для администраторов)',
        options: [
            {
                name: 'channel_id',
                description: 'ID канала для кнопки заявок',
                type: 3, // STRING
                required: true
            },
            {
                name: 'category_id',
                description: 'ID категории для тикетов',
                type: 3, // STRING
                required: true
            },
            {
                name: 'role_ids',
                description: 'ID ролей через запятую',
                type: 3, // STRING
                required: true
            }
        ]
    },
    {
        name: 'стат',
        description: 'Статистика игрока War Thunder через StatShark',
        options: [
            {
                name: 'никнейм',
                description: 'Никнейм или ID игрока',
                type: 3, // STRING
                required: true
            }
        ]
    },
    {
        name: 'полк',
        description: 'Информация о полке War Thunder',
        options: [
            {
                name: 'название',
                description: 'Название полка',
                type: 3, // STRING
                required: true
            }
        ]
    },
    {
        name: 'регион',
        description: 'Управление регионами голосовых серверов Discord',
        options: [
            {
                name: 'действие',
                description: 'Выберите действие',
                type: 3, // STRING
                required: true,
                choices: [
                    { name: 'Изменить регион', value: 'set' },
                    { name: 'Статус', value: 'статус' },
                    { name: 'Сброс', value: 'сброс' },
                    { name: 'Список регионов', value: 'список' },
                    { name: 'Проверка доступа', value: 'доступ' }
                ]
            },
            {
                name: 'channel_id',
                description: 'ID голосового канала (только для изменения)',
                type: 3, // STRING
                required: false
            },
            {
                name: 'регион',
                description: 'Код региона (только для изменения)',
                type: 3, // STRING
                required: false
            }
        ]
    }
];

// Функция регистрации слеш-команд
async function registerSlashCommands() {
    try {
        const rest = new REST({ version: '10' }).setToken(token);
        
        console.log('🔄 Регистрация слеш-команд...');
        
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: slashCommands }
        );
        
        console.log('✅ Слеш-команды успешно зарегистрированы!');
    } catch (error) {
        console.error('❌ Ошибка регистрации слеш-команд:', error);
    }
}

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
    secret: process.env.SESSION_SECRET || 'haki-bot-secret-key-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    },
    store: new session.MemoryStore() // В продакшене используйте Redis
}));

// ==================== ФУНКЦИИ ====================

function getBaseUrl() {
    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
        return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
    }
    if (process.env.RAILWAY_STATIC_URL) {
        let url = process.env.RAILWAY_STATIC_URL;
        // Убедитесь, что URL начинается с https://
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }
        return url;
    }
    return `http://localhost:${PORT}`;
}
// Получение разрешений для сервера
function getGuildPermissions(guildId) {
    if (!commandPermissions.has(guildId)) {
        commandPermissions.set(guildId, {
            'region': [], // Разрешенные роли для команды /регион
            'transcript': [], // Разрешенные роли для команды /transcript
            'ticket': [] // Разрешенные роли для команды /ticket
        });
    }
    return commandPermissions.get(guildId);
}

// Сохранение разрешений
function savePermissions() {
    const permissionsObj = {};
    for (const [guildId, permissions] of commandPermissions.entries()) {
        permissionsObj[guildId] = permissions;
    }
    // В реальном проекте сохраняйте в базу данных
    console.log('💾 Permissions saved to memory');
    return permissionsObj;
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
        
        if (error) {
            console.error('❌ Discord OAuth error:', error, error_description);
            return res.redirect('/?error=discord_oauth_failed');
        }

        if (!code) {
            console.error('❌ No code provided in callback');
            return res.redirect('/?error=no_code');
        }

        const redirectUri = `${getBaseUrl()}/auth/discord/callback`;

        // Получаем access token
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

        const { access_token } = tokenResponse.data;

        // Получаем данные пользователя
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: {
                Authorization: `Bearer ${access_token}`
            },
            timeout: 10000
        });

        // Получаем сервера пользователя
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
        console.error('❌ Auth callback error:', error.message);
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

// Middleware проверки прав администратора
function requireAdmin(req, res, next) {
    if (!req.session.isAuthenticated) {
        return res.redirect('/auth/discord');
    }
    
    const userGuilds = req.session.guilds || [];
    const adminGuilds = userGuilds.filter(guild => 
        (guild.permissions & 0x8) === 0x8 // ADMINISTRATOR permission
    );
    
    if (adminGuilds.length === 0) {
        return res.status(403).send(createErrorPage('Доступ запрещен', 'Требуются права администратора Discord сервера'));
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
    
    // Фильтруем только те сервера, где пользователь администратор И есть бот
    const adminGuilds = guilds.filter(guild => 
        (guild.permissions & 0x8) === 0x8 // ADMINISTRATOR permission
    );

    res.send(createDashboardPage(user, adminGuilds, baseUrl));
});

app.get('/permissions', requireAdmin, (req, res) => {
    const baseUrl = getBaseUrl();
    const user = req.session.user;
    const userGuilds = req.session.guilds || [];
    
    const adminGuilds = userGuilds.filter(guild => 
        (guild.permissions & 0x8) === 0x8
    );

    res.send(createPermissionsPage(user, adminGuilds, baseUrl));
});

app.get('/permissions/:guildId', requireAdmin, async (req, res) => {
    const guildId = req.params.guildId;
    const baseUrl = getBaseUrl();
    const user = req.session.user;
    
    try {
        // Получаем информацию о сервере через Discord API
        const guildResponse = await axios.get(`https://discord.com/api/v10/guilds/${guildId}`, {
            headers: {
                'Authorization': `Bearer ${req.session.accessToken}`
            }
        });
        
        // Получаем роли сервера
        const rolesResponse = await axios.get(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
            headers: {
                'Authorization': `Bearer ${req.session.accessToken}`
            }
        });
        
        const guild = guildResponse.data;
        const roles = rolesResponse.data;
        
        // Получаем текущие разрешения
        const permissions = getGuildPermissions(guildId);
        
        res.send(createGuildPermissionsPage(user, guild, roles, permissions, baseUrl));
        
    } catch (error) {
        console.error('Error fetching guild data:', error);
        res.status(404).send(createErrorPage('Сервер не найден', 'Не удалось получить информацию о сервере'));
    }
});

// API для сохранения разрешений
app.post('/api/permissions/:guildId', requireAdmin, express.json(), (req, res) => {
    const guildId = req.params.guildId;
    const { commandName, roleIds } = req.body;
    
    if (!commandName || !Array.isArray(roleIds)) {
        return res.status(400).json({ error: 'Неверные данные' });
    }
    
    const permissions = getGuildPermissions(guildId);
    permissions[commandName] = roleIds;
    
    // Сохраняем в памяти
    commandPermissions.set(guildId, permissions);
    
    // Можно сохранить в переменную окружения или БД
    const savedPerms = savePermissions();
    
    res.json({ 
        success: true, 
        message: 'Разрешения сохранены',
        permissions: permissions[commandName]
    });
});

// API для получения текущих разрешений
app.get('/api/permissions/:guildId', requireAdmin, (req, res) => {
    const guildId = req.params.guildId;
    const permissions = getGuildPermissions(guildId);
    res.json({ permissions });
});

// ==================== API МАРШРУТЫ ====================

// Просмотр транскрипта по ID
app.get('/transcript/:id', (req, res) => {
    const transcriptId = req.params.id;
    const transcriptData = transcriptsStorage.get(transcriptId);
    
    if (!transcriptData) {
        return res.status(404).send(createErrorPage(
            'Транскрипт не найден',
            `Транскрипт с ID "${transcriptId}" не существует или был удален.`
        ));
    }
    
    // Отправляем HTML транскрипта
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(transcriptData.html);
});

// API для получения данных транскрипта
app.get('/api/transcript/:id', (req, res) => {
    const transcriptId = req.params.id;
    const transcriptData = transcriptsStorage.get(transcriptId);
    
    if (!transcriptData) {
        return res.status(404).json({ 
            error: 'Transcript not found',
            message: `Transcript with ID "${transcriptId}" does not exist`
        });
    }
    
    res.json({
        id: transcriptId,
        data: transcriptData,
        permanentStorage: true,
        accessedAt: new Date().toISOString()
    });
});

// Список всех транскриптов (админ)
app.get('/admin/transcripts', requireAuth, (req, res) => {
    const user = req.session.user;
    
    const transcriptsList = Array.from(transcriptsStorage.entries()).map(([id, data]) => ({
        id,
        server: data.ticketInfo?.server || 'Unknown',
        channel: data.ticketInfo?.channelName || 'Unknown',
        created: new Date(data.createdAt).toLocaleString('ru-RU'),
        messages: data.ticketInfo?.messageCount || 0,
        participants: data.ticketInfo?.participantsCount || 0,
        url: `${getBaseUrl()}/transcript/${id}`
    }));

    const html = `
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Транскрипты - Панель управления</title>
        <style>
            body { 
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                background: linear-gradient(135deg, #1a1a1a 0%, #2b2b2b 100%); 
                color: #ffffff; 
                padding: 20px;
                min-height: 100vh;
            }
            .container { max-width: 1200px; margin: 0 auto; }
            .header { text-align: center; margin-bottom: 40px; padding: 30px; }
            .header h1 { 
                font-size: 2.5rem; 
                margin-bottom: 10px; 
                background: linear-gradient(135deg, #5865F2, #57F287);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
            }
            .transcripts-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                gap: 20px;
                margin-top: 30px;
            }
            .transcript-card {
                background: rgba(43, 43, 43, 0.9);
                padding: 20px;
                border-radius: 12px;
                border: 1px solid #40444b;
                transition: all 0.3s ease;
            }
            .transcript-card:hover {
                transform: translateY(-5px);
                border-color: #5865F2;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            }
            .btn {
                padding: 8px 15px;
                border-radius: 6px;
                text-decoration: none;
                font-weight: 600;
                font-size: 0.9rem;
                transition: all 0.3s ease;
                display: inline-block;
                margin: 5px;
            }
            .btn-view {
                background: #5865F2;
                color: white;
            }
            .btn-view:hover {
                background: #4752C4;
                transform: translateY(-2px);
            }
            .back-link {
                display: inline-block;
                color: #5865F2;
                text-decoration: none;
                margin-bottom: 20px;
                padding: 10px 15px;
                background: rgba(88, 101, 242, 0.1);
                border-radius: 6px;
            }
            .back-link:hover {
                background: rgba(88, 101, 242, 0.2);
            }
        </style>
    </head>
    <body>
        <div class="container">
            <a href="/" class="back-link">← Назад к панели управления</a>
            
            <div class="header">
                <h1>📄 Управление транскриптами</h1>
                <p>Все созданные транскрипты доступны для просмотра</p>
            </div>
            
            <div class="transcripts-grid">
                ${transcriptsList.length > 0 ? 
                    transcriptsList.map(transcript => `
                        <div class="transcript-card">
                            <h3>${transcript.channel}</h3>
                            <p>🏠 Сервер: ${transcript.server}</p>
                            <p>📅 Создан: ${transcript.created}</p>
                            <p>💬 Сообщений: ${transcript.messages}</p>
                            <p>👥 Участников: ${transcript.participants}</p>
                            <a href="${transcript.url}" target="_blank" class="btn btn-view">📄 Просмотреть транскрипт</a>
                        </div>
                    `).join('') : 
                    '<div style="text-align: center; color: #b9bbbe; padding: 40px; grid-column: 1 / -1;">Нет созданных транскриптов</div>'
                }
            </div>
        </div>
    </body>
    </html>
    `;
    
    res.send(html);
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
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            background: linear-gradient(135deg, #1a1a1a 0%, #2b2b2b 100%); 
            color: #ffffff; 
            line-height: 1.6;
            min-height: 100vh;
        }
        .container { 
            max-width: 1200px; 
            margin: 0 auto; 
            padding: 20px; 
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        }
        .header { 
            text-align: center;
            margin-bottom: 40px;
        }
        .header h1 { 
            font-size: 3.5rem; 
            margin-bottom: 10px; 
            background: linear-gradient(135deg, #5865F2, #57F287);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            font-weight: 800;
        }
        .header p {
            font-size: 1.2rem;
            color: #b9bbbe;
            max-width: 600px;
            margin: 0 auto;
        }
        .login-card {
            background: rgba(43, 43, 43, 0.9);
            padding: 50px;
            border-radius: 20px;
            text-align: center;
            max-width: 500px;
            width: 100%;
            border: 1px solid rgba(64, 68, 75, 0.3);
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
            backdrop-filter: blur(10px);
        }
        .login-card h2 {
            font-size: 2rem;
            margin-bottom: 20px;
            color: #fff;
        }
        .login-card p {
            color: #b9bbbe;
            margin-bottom: 30px;
            font-size: 1.1rem;
        }
        .login-btn {
            background: linear-gradient(135deg, #5865F2 0%, #4752C4 100%);
            color: white;
            padding: 18px 40px;
            border: none;
            border-radius: 12px;
            font-size: 1.2rem;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            transition: all 0.3s ease;
            width: 100%;
            margin-top: 20px;
        }
        .login-btn:hover {
            transform: translateY(-3px);
            box-shadow: 0 10px 25px rgba(88, 101, 242, 0.4);
        }
        .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 25px;
            margin-top: 60px;
            width: 100%;
        }
        .feature-card {
            background: rgba(43, 43, 43, 0.7);
            padding: 30px;
            border-radius: 15px;
            text-align: center;
            border: 1px solid rgba(64, 68, 75, 0.2);
            transition: all 0.3s ease;
        }
        .feature-card:hover {
            transform: translateY(-5px);
            border-color: #5865F2;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        }
        .feature-icon {
            font-size: 3.5rem;
            margin-bottom: 20px;
            background: linear-gradient(135deg, #5865F2, #57F287);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .feature-card h3 {
            font-size: 1.5rem;
            margin-bottom: 15px;
            color: #fff;
        }
        .feature-card p {
            color: #b9bbbe;
            font-size: 1rem;
            line-height: 1.6;
        }
        @media (max-width: 768px) {
            .container { padding: 15px; }
            .header h1 { font-size: 2.5rem; }
            .login-card { padding: 30px 20px; }
            .features { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 Haki Bot</h1>
            <p>Мощная панель управления для вашего Discord сервера с адаптивным дизайном и управлением правами</p>
        </div>
        
        <div class="login-card">
            <h2>🔐 Требуется авторизация</h2>
            <p>Для доступа к панели управления необходимо войти через Discord</p>
            <a href="/auth/discord" class="login-btn">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515a.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0a12.64 12.64 0 00-.617-1.25a.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057a19.9 19.9 0 005.993 3.03a.078.078 0 00.084-.028a14.09 14.09 0 001.226-1.994a.076.076 0 00-.041-.106a13.107 13.107 0 01-1.872-.892a.077.077 0 01-.008-.128a10.2 10.2 0 00.372-.292a.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127a12.3 12.3 0 01-1.873.892a.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028a19.839 19.839 0 006.002-3.03a.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
                Войти через Discord
            </a>
        </div>

        <div class="features">
            <div class="feature-card">
                <div class="feature-icon">🔧</div>
                <h3>Управление правами</h3>
                <p>Настраивайте доступ к командам для разных ролей на вашем сервере</p>
            </div>
            <div class="feature-card">
                <div class="feature-icon">📱</div>
                <h3>Адаптивный дизайн</h3>
                <p>Полностью адаптирован для мобильных устройств и компьютеров</p>
            </div>
            <div class="feature-card">
                <div class="feature-icon">🛡️</div>
                <h3>Безопасность</h3>
                <p>Только администраторы серверов имеют доступ к настройкам</p>
            </div>
        </div>
    </div>
</body>
</html>`;
}

function createDashboardPage(user, adminGuilds, baseUrl) {
    return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Haki Bot - Панель управления</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
            --primary: #5865F2;
            --primary-dark: #4752C4;
            --success: #57F287;
            --danger: #ED4245;
            --warning: #FEE75C;
            --background: #1a1a1a;
            --surface: #2b2b2b;
            --surface-light: #36393f;
            --surface-dark: #202225;
            --text: #ffffff;
            --text-secondary: #b9bbbe;
            --border: #40444b;
        }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            background: var(--background); 
            color: var(--text); 
            line-height: 1.6;
            min-height: 100vh;
        }
        .mobile-menu-btn {
            display: none;
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1001;
            background: var(--primary);
            color: white;
            border: none;
            border-radius: 8px;
            padding: 12px;
            cursor: pointer;
            font-size: 1.2rem;
        }
        .sidebar {
            width: 280px;
            background: var(--surface);
            padding: 20px;
            border-right: 1px solid var(--border);
            position: fixed;
            height: 100vh;
            overflow-y: auto;
            transition: transform 0.3s ease;
            z-index: 1000;
        }
        .main-content {
            margin-left: 280px;
            padding: 30px;
            min-height: 100vh;
        }
        .user-info {
            display: flex;
            align-items: center;
            padding: 20px;
            background: var(--surface-light);
            border-radius: 12px;
            margin-bottom: 30px;
            border-left: 4px solid var(--primary);
        }
        .user-avatar {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            margin-right: 20px;
            border: 3px solid var(--primary);
        }
        .user-details {
            flex: 1;
        }
        .user-name {
            font-weight: 700;
            font-size: 1.3rem;
            color: var(--text);
        }
        .user-discriminator {
            color: var(--text-secondary);
            font-size: 0.9rem;
            margin-top: 5px;
        }
        .user-status {
            background: var(--success);
            color: white;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 600;
            display: inline-block;
            margin-top: 8px;
        }
        .nav-section {
            margin: 25px 0;
        }
        .nav-title {
            color: var(--text-secondary);
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 15px;
            padding: 0 10px;
        }
        .nav-item {
            display: flex;
            align-items: center;
            padding: 15px;
            margin: 5px 0;
            background: var(--surface-light);
            border-radius: 10px;
            text-decoration: none;
            color: var(--text);
            transition: all 0.3s ease;
            border: 1px solid transparent;
        }
        .nav-item:hover {
            background: var(--surface-dark);
            border-color: var(--primary);
            transform: translateX(5px);
        }
        .nav-item.active {
            background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
            color: white;
            box-shadow: 0 5px 20px rgba(88, 101, 242, 0.3);
        }
        .nav-icon {
            font-size: 1.3rem;
            margin-right: 15px;
            width: 24px;
            text-align: center;
        }
        .server-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
            gap: 25px;
            margin-top: 30px;
        }
        .server-card {
            background: var(--surface);
            padding: 25px;
            border-radius: 15px;
            border: 1px solid var(--border);
            transition: all 0.3s ease;
            cursor: pointer;
            position: relative;
            overflow: hidden;
        }
        .server-card:hover {
            transform: translateY(-8px);
            border-color: var(--primary);
            box-shadow: 0 15px 40px rgba(0, 0, 0, 0.2);
        }
        .server-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 4px;
            background: linear-gradient(90deg, var(--primary), var(--success));
        }
        .server-header {
            display: flex;
            align-items: center;
            margin-bottom: 20px;
        }
        .server-icon {
            width: 70px;
            height: 70px;
            border-radius: 50%;
            margin-right: 20px;
            object-fit: cover;
            border: 3px solid var(--surface-light);
        }
        .server-icon-placeholder {
            width: 70px;
            height: 70px;
            background: linear-gradient(135deg, var(--primary), var(--primary-dark));
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.8rem;
            margin-right: 20px;
            color: white;
            border: 3px solid var(--surface-light);
        }
        .server-info {
            flex: 1;
        }
        .server-name {
            font-weight: 700;
            font-size: 1.4rem;
            color: var(--text);
            margin-bottom: 5px;
        }
        .server-members {
            color: var(--text-secondary);
            font-size: 0.95rem;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .server-badge {
            background: var(--primary);
            color: white;
            padding: 6px 15px;
            border-radius: 20px;
            font-size: 0.85rem;
            font-weight: 600;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            margin-top: 10px;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }
        .stat-card {
            background: linear-gradient(135deg, var(--surface) 0%, var(--surface-dark) 100%);
            padding: 30px;
            border-radius: 15px;
            text-align: center;
            border: 1px solid var(--border);
            transition: all 0.3s ease;
        }
        .stat-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        }
        .stat-value {
            font-size: 3rem;
            font-weight: 800;
            margin-bottom: 10px;
            background: linear-gradient(135deg, var(--primary), var(--success));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .stat-label {
            color: var(--text-secondary);
            font-size: 1rem;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .logout-btn {
            background: linear-gradient(135deg, var(--danger) 0%, #c93c3e 100%);
            color: white;
            padding: 15px;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            font-weight: 600;
            font-size: 1rem;
            width: 100%;
            margin-top: 20px;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }
        .logout-btn:hover {
            transform: translateY(-3px);
            box-shadow: 0 10px 25px rgba(237, 66, 69, 0.3);
        }
        .section-header {
            margin-bottom: 30px;
        }
        .section-header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            background: linear-gradient(135deg, var(--primary), var(--success));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            font-weight: 800;
        }
        .section-header p {
            color: var(--text-secondary);
            font-size: 1.1rem;
            max-width: 600px;
        }
        .empty-state {
            text-align: center;
            padding: 80px 20px;
            color: var(--text-secondary);
        }
        .empty-icon {
            font-size: 5rem;
            margin-bottom: 30px;
            opacity: 0.5;
        }
        .empty-state h3 {
            font-size: 1.8rem;
            margin-bottom: 15px;
            color: var(--text);
        }
        .empty-state p {
            font-size: 1.1rem;
            max-width: 500px;
            margin: 0 auto 25px;
        }
        .btn-primary {
            background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
            color: white;
            padding: 12px 25px;
            border: none;
            border-radius: 10px;
            text-decoration: none;
            font-weight: 600;
            display: inline-flex;
            align-items: center;
            gap: 10px;
            transition: all 0.3s ease;
        }
        .btn-primary:hover {
            transform: translateY(-3px);
            box-shadow: 0 10px 25px rgba(88, 101, 242, 0.3);
        }
        @media (max-width: 1024px) {
            .server-grid {
                grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            }
            .stats-grid {
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            }
        }
        @media (max-width: 768px) {
            .mobile-menu-btn {
                display: block;
            }
            .sidebar {
                transform: translateX(-100%);
            }
            .sidebar.active {
                transform: translateX(0);
            }
            .main-content {
                margin-left: 0;
                padding: 80px 20px 30px;
            }
            .server-grid {
                grid-template-columns: 1fr;
            }
            .stats-grid {
                grid-template-columns: 1fr;
            }
            .section-header h1 {
                font-size: 2rem;
            }
        }
        @media (max-width: 480px) {
            .user-info {
                flex-direction: column;
                text-align: center;
            }
            .user-avatar {
                margin-right: 0;
                margin-bottom: 15px;
            }
            .server-header {
                flex-direction: column;
                text-align: center;
            }
            .server-icon, .server-icon-placeholder {
                margin-right: 0;
                margin-bottom: 15px;
            }
        }
    </style>
</head>
<body>
    <button class="mobile-menu-btn" onclick="toggleSidebar()">☰</button>
    
    <div class="sidebar" id="sidebar">
        <div class="user-info">
            <img src="${user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" 
                 alt="${user.username}" class="user-avatar">
            <div class="user-details">
                <div class="user-name">${user.global_name || user.username}</div>
                <div class="user-discriminator">${user.username}</div>
                <span class="user-status">✅ Администратор</span>
            </div>
        </div>

        <div class="nav-section">
            <div class="nav-title">Навигация</div>
            <a href="/" class="nav-item active">
                <span class="nav-icon">🏠</span>
                Главная
            </a>
            <a href="/permissions" class="nav-item">
                <span class="nav-icon">🔐</span>
                Управление правами
            </a>
        </div>

        <div class="nav-section">
            <div class="nav-title">Ваши сервера</div>
            ${adminGuilds.length > 0 ? adminGuilds.map(guild => `
                <a href="/permissions/${guild.id}" class="nav-item">
                    <span class="nav-icon">🏰</span>
                    ${guild.name}
                    <span style="margin-left: auto; font-size: 0.8rem; color: var(--text-secondary);">⚙️</span>
                </a>
            `).join('') : `
                <div style="color: var(--text-secondary); padding: 15px; text-align: center;">
                    Нет серверов с правами администратора
                </div>
            `}
        </div>

        <a href="/auth/logout" class="logout-btn">
            <span class="nav-icon">🚪</span>
            Выйти
        </a>
    </div>

    <div class="main-content">
        <div class="section-header">
            <h1>🏠 Главная панель</h1>
            <p>Добро пожаловать в панель управления Haki Bot. Управляйте настройками ваших серверов Discord.</p>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value">${adminGuilds.length}</div>
                <div class="stat-label">Серверов</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">3</div>
                <div class="stat-label">Команд</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">24/7</div>
                <div class="stat-label">Аптайм</div>
            </div>
        </div>

        <div class="section-header">
            <h2>🏰 Ваши сервера</h2>
            <p>Выберите сервер для управления правами доступа к командам</p>
        </div>

        ${adminGuilds.length === 0 ? `
            <div class="empty-state">
                <div class="empty-icon">🏰</div>
                <h3>Серверы не найдены</h3>
                <p>Вы не являетесь администратором ни на одном сервере Discord, или у вас нет доступа к управлению ботом на этих серверах.</p>
                <a href="https://discord.com/developers/applications" target="_blank" class="btn-primary">
                    <span class="nav-icon">➕</span>
                    Добавить бота на сервер
                </a>
            </div>
        ` : `
            <div class="server-grid">
                ${adminGuilds.map(guild => `
                    <div class="server-card" onclick="window.location.href='/permissions/${guild.id}'">
                        <div class="server-header">
                            ${guild.icon ? 
                                `<img src="https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=256" alt="${guild.name}" class="server-icon">` :
                                `<div class="server-icon-placeholder">🏰</div>`
                            }
                            <div class="server-info">
                                <div class="server-name">${guild.name}</div>
                                <div class="server-members">
                                    <span>👥</span>
                                    <span>${guild.approximate_member_count || 'N/A'} участников</span>
                                </div>
                                <div class="server-badge">
                                    <span>🛡️</span>
                                    Администратор
                                </div>
                            </div>
                        </div>
                        <div style="color: var(--success); font-size: 0.9rem; margin-top: 15px; display: flex; align-items: center; gap: 8px;">
                            <span>⚡</span>
                            Нажмите для управления правами
                        </div>
                    </div>
                `).join('')}
            </div>
        `}
    </div>

    <script>
        function toggleSidebar() {
            const sidebar = document.getElementById('sidebar');
            sidebar.classList.toggle('active');
        }

        // Закрываем sidebar при клике на основной контент на мобильных
        document.addEventListener('click', (e) => {
            const sidebar = document.getElementById('sidebar');
            const menuBtn = document.querySelector('.mobile-menu-btn');
            
            if (window.innerWidth <= 768 && 
                !sidebar.contains(e.target) && 
                !menuBtn.contains(e.target) && 
                sidebar.classList.contains('active')) {
                sidebar.classList.remove('active');
            }
        });

        // Анимация загрузки карточек
        document.addEventListener('DOMContentLoaded', () => {
            const cards = document.querySelectorAll('.server-card, .stat-card');
            cards.forEach((card, index) => {
                card.style.opacity = '0';
                card.style.transform = 'translateY(20px)';
                
                setTimeout(() => {
                    card.style.transition = 'all 0.5s ease';
                    card.style.opacity = '1';
                    card.style.transform = 'translateY(0)';
                }, index * 100);
            });
        });
    </script>
</body>
</html>`;
}

function createPermissionsPage(user, adminGuilds, baseUrl) {
    return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Управление правами - Haki Bot</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
            --primary: #5865F2;
            --primary-dark: #4752C4;
            --success: #57F287;
            --danger: #ED4245;
            --warning: #FEE75C;
            --background: #1a1a1a;
            --surface: #2b2b2b;
            --surface-light: #36393f;
            --surface-dark: #202225;
            --text: #ffffff;
            --text-secondary: #b9bbbe;
            --border: #40444b;
        }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            background: var(--background); 
            color: var(--text); 
            line-height: 1.6;
            min-height: 100vh;
        }
        .mobile-menu-btn {
            display: none;
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1001;
            background: var(--primary);
            color: white;
            border: none;
            border-radius: 8px;
            padding: 12px;
            cursor: pointer;
            font-size: 1.2rem;
        }
        .sidebar {
            width: 280px;
            background: var(--surface);
            padding: 20px;
            border-right: 1px solid var(--border);
            position: fixed;
            height: 100vh;
            overflow-y: auto;
            transition: transform 0.3s ease;
            z-index: 1000;
        }
        .main-content {
            margin-left: 280px;
            padding: 30px;
            min-height: 100vh;
        }
        .user-info {
            display: flex;
            align-items: center;
            padding: 20px;
            background: var(--surface-light);
            border-radius: 12px;
            margin-bottom: 30px;
            border-left: 4px solid var(--primary);
        }
        .user-avatar {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            margin-right: 20px;
            border: 3px solid var(--primary);
        }
        .nav-item {
            display: flex;
            align-items: center;
            padding: 15px;
            margin: 5px 0;
            background: var(--surface-light);
            border-radius: 10px;
            text-decoration: none;
            color: var(--text);
            transition: all 0.3s ease;
            border: 1px solid transparent;
        }
        .nav-item:hover {
            background: var(--surface-dark);
            border-color: var(--primary);
            transform: translateX(5px);
        }
        .nav-item.active {
            background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
            color: white;
            box-shadow: 0 5px 20px rgba(88, 101, 242, 0.3);
        }
        .nav-icon {
            font-size: 1.3rem;
            margin-right: 15px;
            width: 24px;
            text-align: center;
        }
        .logout-btn {
            background: linear-gradient(135deg, var(--danger) 0%, #c93c3e 100%);
            color: white;
            padding: 15px;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            font-weight: 600;
            font-size: 1rem;
            width: 100%;
            margin-top: 20px;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }
        .section-header {
            margin-bottom: 40px;
        }
        .section-header h1 {
            font-size: 2.5rem;
            margin-bottom: 15px;
            background: linear-gradient(135deg, var(--primary), var(--success));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            font-weight: 800;
        }
        .section-header p {
            color: var(--text-secondary);
            font-size: 1.1rem;
            max-width: 700px;
        }
        .permissions-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: 25px;
        }
        .permission-card {
            background: var(--surface);
            padding: 30px;
            border-radius: 15px;
            border: 1px solid var(--border);
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
        }
        .permission-card:hover {
            transform: translateY(-5px);
            border-color: var(--primary);
            box-shadow: 0 15px 40px rgba(0, 0, 0, 0.2);
        }
        .permission-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 4px;
            background: linear-gradient(90deg, var(--primary), var(--success));
        }
        .permission-header {
            display: flex;
            align-items: center;
            margin-bottom: 25px;
            padding-bottom: 20px;
            border-bottom: 1px solid var(--border);
        }
        .permission-icon {
            font-size: 2.5rem;
            margin-right: 20px;
            background: linear-gradient(135deg, var(--primary), var(--success));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .permission-title {
            font-size: 1.5rem;
            font-weight: 700;
            color: var(--text);
            margin-bottom: 5px;
        }
        .permission-desc {
            color: var(--text-secondary);
            font-size: 0.95rem;
            line-height: 1.5;
        }
        .permission-info {
            margin-top: 20px;
        }
        .info-item {
            display: flex;
            justify-content: space-between;
            margin-bottom: 12px;
            padding: 10px;
            background: var(--surface-light);
            border-radius: 8px;
        }
        .info-label {
            color: var(--text-secondary);
            font-weight: 600;
        }
        .info-value {
            color: var(--text);
            font-weight: 700;
        }
        .btn-manage {
            background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
            color: white;
            padding: 12px 25px;
            border: none;
            border-radius: 10px;
            text-decoration: none;
            font-weight: 600;
            display: inline-flex;
            align-items: center;
            gap: 10px;
            transition: all 0.3s ease;
            width: 100%;
            justify-content: center;
            margin-top: 20px;
        }
        .btn-manage:hover {
            transform: translateY(-3px);
            box-shadow: 0 10px 25px rgba(88, 101, 242, 0.3);
        }
        .empty-state {
            text-align: center;
            padding: 80px 20px;
            color: var(--text-secondary);
            grid-column: 1 / -1;
        }
        .empty-icon {
            font-size: 5rem;
            margin-bottom: 30px;
            opacity: 0.5;
        }
        .empty-state h3 {
            font-size: 1.8rem;
            margin-bottom: 15px;
            color: var(--text);
        }
        .empty-state p {
            font-size: 1.1rem;
            max-width: 500px;
            margin: 0 auto 25px;
        }
        @media (max-width: 1024px) {
            .permissions-grid {
                grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            }
        }
        @media (max-width: 768px) {
            .mobile-menu-btn {
                display: block;
            }
            .sidebar {
                transform: translateX(-100%);
            }
            .sidebar.active {
                transform: translateX(0);
            }
            .main-content {
                margin-left: 0;
                padding: 80px 20px 30px;
            }
            .permissions-grid {
                grid-template-columns: 1fr;
            }
            .section-header h1 {
                font-size: 2rem;
            }
        }
        @media (max-width: 480px) {
            .permission-card {
                padding: 20px;
            }
            .permission-header {
                flex-direction: column;
                text-align: center;
            }
            .permission-icon {
                margin-right: 0;
                margin-bottom: 15px;
            }
        }
    </style>
</head>
<body>
    <button class="mobile-menu-btn" onclick="toggleSidebar()">☰</button>
    
    <div class="sidebar" id="sidebar">
        <div class="user-info">
            <img src="${user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" 
                 alt="${user.username}" class="user-avatar">
            <div>
                <div style="font-weight: bold; font-size: 1.1rem;">${user.global_name || user.username}</div>
                <div style="color: var(--text-secondary); font-size: 0.9rem;">${user.username}</div>
                <div style="color: var(--success); font-size: 0.8rem; margin-top: 5px; font-weight: 600;">✅ Администратор</div>
            </div>
        </div>

        <div style="margin: 25px 0 10px 0; color: var(--text-secondary); font-size: 0.9rem; padding: 0 10px; text-transform: uppercase; letter-spacing: 1px;">Навигация</div>
        
        <a href="/" class="nav-item">
            <span class="nav-icon">🏠</span>
            Главная
        </a>
        <a href="/permissions" class="nav-item active">
            <span class="nav-icon">🔐</span>
            Управление правами
        </a>

        <div style="margin: 25px 0 10px 0; color: var(--text-secondary); font-size: 0.9rem; padding: 0 10px; text-transform: uppercase; letter-spacing: 1px;">Ваши сервера</div>
        
        ${adminGuilds.map(guild => `
            <a href="/permissions/${guild.id}" class="nav-item">
                <span class="nav-icon">🏰</span>
                ${guild.name}
                <span style="margin-left: auto; font-size: 0.8rem; color: var(--text-secondary);">⚙️</span>
            </a>
        `).join('')}

        <a href="/auth/logout" class="logout-btn">
            <span class="nav-icon">🚪</span>
            Выйти
        </a>
    </div>

    <div class="main-content">
        <div class="section-header">
            <h1>🔐 Управление правами команд</h1>
            <p>Настройте доступ к командам бота для различных ролей на ваших серверах. Только администраторы серверов могут изменять эти настройки.</p>
        </div>

        <div class="permissions-grid">
            <div class="permission-card">
                <div class="permission-header">
                    <div class="permission-icon">🌍</div>
                    <div>
                        <div class="permission-title">Команда /регион</div>
                        <div class="permission-desc">Управление регионами голосовых серверов Discord</div>
                    </div>
                </div>
                <div class="permission-info">
                    <div class="info-item">
                        <span class="info-label">По умолчанию:</span>
                        <span class="info-value">Только администраторы</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Функции:</span>
                        <span class="info-value">Изменение региона, статус, сброс</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Доступно на:</span>
                        <span class="info-value">${adminGuilds.length} серверах</span>
                    </div>
                </div>
                <div style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 15px; padding: 10px; background: var(--surface-light); border-radius: 8px;">
                    💡 Вы можете разрешить использование этой команды определенным ролям на каждом сервере отдельно
                </div>
            </div>

            <div class="permission-card">
                <div class="permission-header">
                    <div class="permission-icon">📄</div>
                    <div>
                        <div class="permission-title">Команда /transcript</div>
                        <div class="permission-desc">Создание транскриптов бесед и тикетов</div>
                    </div>
                </div>
                <div class="permission-info">
                    <div class="info-item">
                        <span class="info-label">По умолчанию:</span>
                        <span class="info-value">Управление сообщениями</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Функции:</span>
                        <span class="info-value">Транскрипты, архивация</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Доступно на:</span>
                        <span class="info-value">${adminGuilds.length} серверах</span>
                    </div>
                </div>
                <div style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 15px; padding: 10px; background: var(--surface-light); border-radius: 8px;">
                    💡 Настраивайте какие роли могут создавать и просматривать транскрипты
                </div>
            </div>

            <div class="permission-card">
                <div class="permission-header">
                    <div class="permission-icon">🎫</div>
                    <div>
                        <div class="permission-title">Команда /ticket</div>
                        <div class="permission-desc">Настройка системы тикетов и заявок</div>
                    </div>
                </div>
                <div class="permission-info">
                    <div class="info-item">
                        <span class="info-label">По умолчанию:</span>
                        <span class="info-value">Только администраторы</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Функции:</span>
                        <span class="info-value">Создание тикетов, управление</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Доступно на:</span>
                        <span class="info-value">${adminGuilds.length} серверах</span>
                    </div>
                </div>
                <div style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 15px; padding: 10px; background: var(--surface-light); border-radius: 8px;">
                    💡 Определите кто может настраивать и управлять системой тикетов
                </div>
            </div>

            ${adminGuilds.length === 0 ? `
                <div class="empty-state">
                    <div class="empty-icon">🔒</div>
                    <h3>Нет доступных серверов</h3>
                    <p>Для управления правами вам необходимо быть администратором хотя бы на одном сервере Discord.</p>
                </div>
            ` : `
                <div class="permission-card" style="grid-column: 1 / -1; background: linear-gradient(135deg, var(--surface-dark) 0%, #2a2d31 100%);">
                    <div class="permission-header">
                        <div class="permission-icon">⚡</div>
                        <div>
                            <div class="permission-title">Начать настройку</div>
                            <div class="permission-desc">Выберите сервер для управления правами доступа к командам</div>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px; margin-top: 20px;">
                        ${adminGuilds.slice(0, 3).map(guild => `
                            <a href="/permissions/${guild.id}" class="btn-manage" style="margin-top: 0;">
                                <span class="nav-icon">🏰</span>
                                ${guild.name.length > 15 ? guild.name.substring(0, 15) + '...' : guild.name}
                            </a>
                        `).join('')}
                        ${adminGuilds.length > 3 ? `
                            <a href="/" class="btn-manage" style="margin-top: 0; background: linear-gradient(135deg, var(--surface-light) 0%, var(--surface) 100%); color: var(--text);">
                                <span class="nav-icon">📋</span>
                                Все серверы (${adminGuilds.length})
                            </a>
                        ` : ''}
                    </div>
                </div>
            `}
        </div>
    </div>

    <script>
        function toggleSidebar() {
            const sidebar = document.getElementById('sidebar');
            sidebar.classList.toggle('active');
        }

        // Анимация загрузки карточек
        document.addEventListener('DOMContentLoaded', () => {
            const cards = document.querySelectorAll('.permission-card');
            cards.forEach((card, index) => {
                card.style.opacity = '0';
                card.style.transform = 'translateY(20px)';
                
                setTimeout(() => {
                    card.style.transition = 'all 0.5s ease';
                    card.style.opacity = '1';
                    card.style.transform = 'translateY(0)';
                }, index * 100);
            });
        });
    </script>
</body>
</html>`;
}

function createGuildPermissionsPage(user, guild, roles, permissions, baseUrl) {
    const availableCommands = [
        { id: 'region', name: '/регион', icon: '🌍', description: 'Управление регионами голосовых серверов' },
        { id: 'transcript', name: '/transcript', icon: '📄', description: 'Создание транскриптов бесед' },
        { id: 'ticket', name: '/ticket', icon: '🎫', description: 'Настройка системы тикетов' }
    ];

    return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${guild.name} - Управление правами</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
            --primary: #5865F2;
            --primary-dark: #4752C4;
            --success: #57F287;
            --danger: #ED4245;
            --warning: #FEE75C;
            --background: #1a1a1a;
            --surface: #2b2b2b;
            --surface-light: #36393f;
            --surface-dark: #202225;
            --text: #ffffff;
            --text-secondary: #b9bbbe;
            --border: #40444b;
        }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            background: var(--background); 
            color: var(--text); 
            line-height: 1.6;
            min-height: 100vh;
        }
        .mobile-menu-btn {
            display: none;
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1001;
            background: var(--primary);
            color: white;
            border: none;
            border-radius: 8px;
            padding: 12px;
            cursor: pointer;
            font-size: 1.2rem;
        }
        .sidebar {
            width: 280px;
            background: var(--surface);
            padding: 20px;
            border-right: 1px solid var(--border);
            position: fixed;
            height: 100vh;
            overflow-y: auto;
            transition: transform 0.3s ease;
            z-index: 1000;
        }
        .main-content {
            margin-left: 280px;
            padding: 30px;
            min-height: 100vh;
        }
        .user-info {
            display: flex;
            align-items: center;
            padding: 20px;
            background: var(--surface-light);
            border-radius: 12px;
            margin-bottom: 30px;
            border-left: 4px solid var(--primary);
        }
        .user-avatar {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            margin-right: 20px;
            border: 3px solid var(--primary);
        }
        .nav-item {
            display: flex;
            align-items: center;
            padding: 15px;
            margin: 5px 0;
            background: var(--surface-light);
            border-radius: 10px;
            text-decoration: none;
            color: var(--text);
            transition: all 0.3s ease;
            border: 1px solid transparent;
        }
        .nav-item:hover {
            background: var(--surface-dark);
            border-color: var(--primary);
            transform: translateX(5px);
        }
        .nav-item.active {
            background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
            color: white;
            box-shadow: 0 5px 20px rgba(88, 101, 242, 0.3);
        }
        .nav-icon {
            font-size: 1.3rem;
            margin-right: 15px;
            width: 24px;
            text-align: center;
        }
        .logout-btn {
            background: linear-gradient(135deg, var(--danger) 0%, #c93c3e 100%);
            color: white;
            padding: 15px;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            font-weight: 600;
            font-size: 1rem;
            width: 100%;
            margin-top: 20px;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }
        .guild-header {
            display: flex;
            align-items: center;
            margin-bottom: 40px;
            padding-bottom: 30px;
            border-bottom: 1px solid var(--border);
        }
        .guild-icon {
            width: 100px;
            height: 100px;
            border-radius: 50%;
            margin-right: 30px;
            border: 4px solid var(--surface-light);
            object-fit: cover;
        }
        .guild-icon-placeholder {
            width: 100px;
            height: 100px;
            background: linear-gradient(135deg, var(--primary), var(--primary-dark));
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 2.5rem;
            margin-right: 30px;
            color: white;
            border: 4px solid var(--surface-light);
        }
        .guild-info {
            flex: 1;
        }
        .guild-name {
            font-size: 2.5rem;
            font-weight: 800;
            margin-bottom: 10px;
            background: linear-gradient(135deg, var(--primary), var(--success));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .guild-stats {
            display: flex;
            gap: 30px;
            margin-top: 20px;
        }
        .guild-stat {
            text-align: center;
        }
        .stat-value {
            font-size: 1.8rem;
            font-weight: 700;
            color: var(--text);
            display: block;
        }
        .stat-label {
            color: var(--text-secondary);
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .permissions-container {
            background: var(--surface);
            border-radius: 15px;
            border: 1px solid var(--border);
            overflow: hidden;
        }
        .permission-tabs {
            display: flex;
            background: var(--surface-dark);
            border-bottom: 1px solid var(--border);
            overflow-x: auto;
        }
        .permission-tab {
            padding: 20px 30px;
            background: none;
            border: none;
            color: var(--text-secondary);
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            white-space: nowrap;
            border-bottom: 3px solid transparent;
        }
        .permission-tab:hover {
            color: var(--text);
            background: var(--surface-light);
        }
        .permission-tab.active {
            color: var(--primary);
            border-bottom-color: var(--primary);
            background: var(--surface);
        }
        .permission-content {
            padding: 30px;
        }
        .command-header {
            display: flex;
            align-items: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 1px solid var(--border);
        }
        .command-icon {
            font-size: 3rem;
            margin-right: 25px;
            background: linear-gradient(135deg, var(--primary), var(--success));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .command-title {
            font-size: 1.8rem;
            font-weight: 700;
            color: var(--text);
            margin-bottom: 5px;
        }
        .command-desc {
            color: var(--text-secondary);
            font-size: 1rem;
            max-width: 600px;
        }
        .roles-list {
            max-height: 400px;
            overflow-y: auto;
            margin-bottom: 30px;
            padding-right: 10px;
        }
        .role-item {
            display: flex;
            align-items: center;
            padding: 15px;
            margin-bottom: 10px;
            background: var(--surface-light);
            border-radius: 10px;
            border: 1px solid var(--border);
            transition: all 0.3s ease;
        }
        .role-item:hover {
            border-color: var(--primary);
            transform: translateX(5px);
        }
        .role-color {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            margin-right: 15px;
            flex-shrink: 0;
        }
        .role-name {
            flex: 1;
            font-weight: 600;
            color: var(--text);
        }
        .role-members {
            color: var(--text-secondary);
            font-size: 0.9rem;
            margin-right: 20px;
        }
        .role-checkbox {
            width: 24px;
            height: 24px;
            border-radius: 6px;
            border: 2px solid var(--border);
            background: var(--surface-dark);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
        }
        .role-checkbox.checked {
            background: var(--primary);
            border-color: var(--primary);
        }
        .role-checkbox.checked::after {
            content: '✓';
            color: white;
            font-weight: bold;
        }
        .save-section {
            background: var(--surface-dark);
            padding: 25px;
            border-radius: 12px;
            margin-top: 30px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .save-info {
            color: var(--text-secondary);
            font-size: 0.95rem;
        }
        .save-info strong {
            color: var(--text);
        }
        .btn-save {
            background: linear-gradient(135deg, var(--success) 0%, #4ad175 100%);
            color: white;
            padding: 15px 35px;
            border: none;
            border-radius: 10px;
            font-weight: 600;
            font-size: 1rem;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .btn-save:hover {
            transform: translateY(-3px);
            box-shadow: 0 10px 25px rgba(87, 242, 135, 0.3);
        }
        .btn-save:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none !important;
            box-shadow: none !important;
        }
        .loading-spinner {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid rgba(255,255,255,.3);
            border-radius: 50%;
            border-top-color: white;
            animation: spin 1s ease-in-out infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        .success-message {
            background: linear-gradient(135deg, var(--success) 0%, rgba(87, 242, 135, 0.1) 100%);
            border: 1px solid var(--success);
            color: white;
            padding: 15px;
            border-radius: 10px;
            margin-top: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
            animation: slideIn 0.3s ease;
        }
        @keyframes slideIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .back-btn {
            background: linear-gradient(135deg, var(--surface-light) 0%, var(--surface) 100%);
            color: var(--text);
            padding: 12px 25px;
            border-radius: 10px;
            text-decoration: none;
            font-weight: 600;
            display: inline-flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 30px;
            transition: all 0.3s ease;
            border: 1px solid var(--border);
        }
        .back-btn:hover {
            border-color: var(--primary);
            transform: translateX(-5px);
        }
        @media (max-width: 1024px) {
            .guild-header {
                flex-direction: column;
                text-align: center;
            }
            .guild-icon, .guild-icon-placeholder {
                margin-right: 0;
                margin-bottom: 20px;
            }
            .guild-stats {
                justify-content: center;
            }
        }
        @media (max-width: 768px) {
            .mobile-menu-btn {
                display: block;
            }
            .sidebar {
                transform: translateX(-100%);
            }
            .sidebar.active {
                transform: translateX(0);
            }
            .main-content {
                margin-left: 0;
                padding: 80px 20px 30px;
            }
            .permission-tabs {
                flex-wrap: wrap;
            }
            .permission-tab {
                flex: 1;
                min-width: 150px;
                text-align: center;
            }
            .guild-name {
                font-size: 2rem;
            }
        }
        @media (max-width: 480px) {
            .guild-stats {
                flex-direction: column;
                gap: 15px;
            }
            .save-section {
                flex-direction: column;
                gap: 20px;
                text-align: center;
            }
            .permission-content {
                padding: 20px;
            }
            .command-header {
                flex-direction: column;
                text-align: center;
            }
            .command-icon {
                margin-right: 0;
                margin-bottom: 15px;
            }
        }
    </style>
</head>
<body>
    <button class="mobile-menu-btn" onclick="toggleSidebar()">☰</button>
    
    <div class="sidebar" id="sidebar">
        <div class="user-info">
            <img src="${user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" 
                 alt="${user.username}" class="user-avatar">
            <div>
                <div style="font-weight: bold; font-size: 1.1rem;">${user.global_name || user.username}</div>
                <div style="color: var(--text-secondary); font-size: 0.9rem;">${user.username}</div>
                <div style="color: var(--success); font-size: 0.8rem; margin-top: 5px; font-weight: 600;">✅ Администратор</div>
            </div>
        </div>

        <div style="margin: 25px 0 10px 0; color: var(--text-secondary); font-size: 0.9rem; padding: 0 10px; text-transform: uppercase; letter-spacing: 1px;">Навигация</div>
        
        <a href="/" class="nav-item">
            <span class="nav-icon">🏠</span>
            Главная
        </a>
        <a href="/permissions" class="nav-item">
            <span class="nav-icon">🔐</span>
            Управление правами
        </a>

        <div style="margin: 25px 0 10px 0; color: var(--text-secondary); font-size: 0.9rem; padding: 0 10px; text-transform: uppercase; letter-spacing: 1px;">Быстрые ссылки</div>
        
        <a href="/permissions" class="nav-item active">
            <span class="nav-icon">🏰</span>
            Все серверы
        </a>

        <a href="/auth/logout" class="logout-btn">
            <span class="nav-icon">🚪</span>
            Выйти
        </a>
    </div>

    <div class="main-content">
        <a href="/permissions" class="back-btn">
            <span class="nav-icon">⬅️</span>
            Назад к списку серверов
        </a>
        
        <div class="guild-header">
            ${guild.icon ? 
                `<img src="https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=256" alt="${guild.name}" class="guild-icon">` :
                `<div class="guild-icon-placeholder">🏰</div>`
            }
            <div class="guild-info">
                <h1 class="guild-name">${guild.name}</h1>
                <p style="color: var(--text-secondary); font-size: 1.1rem;">Управление правами доступа к командам</p>
                
                <div class="guild-stats">
                    <div class="guild-stat">
                        <span class="stat-value">${roles.length}</span>
                        <span class="stat-label">Ролей</span>
                    </div>
                    <div class="guild-stat">
                        <span class="stat-value">${availableCommands.length}</span>
                        <span class="stat-label">Команд</span>
                    </div>
                    <div class="guild-stat">
                        <span class="stat-value">${guild.approximate_member_count || 'N/A'}</span>
                        <span class="stat-label">Участников</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="permissions-container">
            <div class="permission-tabs" id="permissionTabs">
                ${availableCommands.map((cmd, index) => `
                    <button class="permission-tab ${index === 0 ? 'active' : ''}" data-command="${cmd.id}">
                        ${cmd.icon} ${cmd.name}
                    </button>
                `).join('')}
            </div>

            <div class="permission-content">
                ${availableCommands.map((cmd, index) => `
                    <div class="command-content" id="content-${cmd.id}" style="display: ${index === 0 ? 'block' : 'none'};">
                        <div class="command-header">
                            <div class="command-icon">${cmd.icon}</div>
                            <div>
                                <div class="command-title">${cmd.name}</div>
                                <div class="command-desc">${cmd.description}</div>
                            </div>
                        </div>

                        <div style="color: var(--text-secondary); margin-bottom: 25px; padding: 15px; background: var(--surface-dark); border-radius: 10px;">
                            💡 Выберите роли, которым будет разрешено использовать команду <strong>${cmd.name}</strong>. Если ни одна роль не выбрана, команду смогут использовать только администраторы сервера.
                        </div>

                        <div class="roles-list">
                            ${roles.filter(role => role.name !== '@everyone').map(role => {
                                const isChecked = permissions[cmd.id] && permissions[cmd.id].includes(role.id);
                                return `
                                    <div class="role-item" data-role-id="${role.id}">
                                        <div class="role-color" style="background-color: #${role.color.toString(16).padStart(6, '0') || '5865F2'};"></div>
                                        <div class="role-name">${role.name}</div>
                                        <div class="role-members">${role.members || '?'} участников</div>
                                        <div class="role-checkbox ${isChecked ? 'checked' : ''}" onclick="toggleRole('${cmd.id}', '${role.id}')"></div>
                                    </div>
                                `;
                            }).join('')}
                        </div>

                        <div class="save-section">
                            <div class="save-info">
                                Выбрано: <strong id="selected-count-${cmd.id}">${permissions[cmd.id] ? permissions[cmd.id].length : 0}</strong> из ${roles.filter(role => role.name !== '@everyone').length} ролей
                            </div>
                            <button class="btn-save" onclick="savePermissions('${cmd.id}')" id="save-btn-${cmd.id}">
                                <span class="nav-icon">💾</span>
                                Сохранить изменения
                            </button>
                        </div>

                        <div id="message-${cmd.id}" style="display: none;"></div>
                    </div>
                `).join('')}
            </div>
        </div>
    </div>

    <script>
        function toggleSidebar() {
            const sidebar = document.getElementById('sidebar');
            sidebar.classList.toggle('active');
        }

        // Переключение между командами
        document.querySelectorAll('.permission-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                // Обновляем активную вкладку
                document.querySelectorAll('.permission-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // Показываем соответствующий контент
                const commandId = tab.dataset.command;
                document.querySelectorAll('.command-content').forEach(content => {
                    content.style.display = 'none';
                });
                document.getElementById('content-' + commandId).style.display = 'block';
            });
        });

        // Хранилище выбранных ролей
        const selectedRoles = {
            ${availableCommands.map(cmd => `'${cmd.id}': ${JSON.stringify(permissions[cmd.id] || [])}`).join(',\n            ')}
        };

        function toggleRole(commandId, roleId) {
            const checkbox = document.querySelector(\`.role-item[data-role-id="\${roleId}"] .role-checkbox\`);
            const roleIndex = selectedRoles[commandId].indexOf(roleId);
            
            if (roleIndex === -1) {
                selectedRoles[commandId].push(roleId);
                checkbox.classList.add('checked');
            } else {
                selectedRoles[commandId].splice(roleIndex, 1);
                checkbox.classList.remove('checked');
            }
            
            // Обновляем счетчик
            updateSelectedCount(commandId);
        }

        function updateSelectedCount(commandId) {
            const countElement = document.getElementById('selected-count-' + commandId);
            countElement.textContent = selectedRoles[commandId].length;
        }

        async function savePermissions(commandId) {
            const saveBtn = document.getElementById('save-btn-' + commandId);
            const messageDiv = document.getElementById('message-' + commandId);
            
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<div class="loading-spinner"></div> Сохранение...';
            
            try {
                const response = await fetch('/api/permissions/${guild.id}', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        commandName: commandId,
                        roleIds: selectedRoles[commandId]
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    messageDiv.style.display = 'block';
                    messageDiv.className = 'success-message';
                    messageDiv.innerHTML = \`
                        <span class="nav-icon">✅</span>
                        <div>
                            <strong>Настройки сохранены!</strong><br>
                            Команда \${getCommandName(commandId)} теперь доступна для \${data.permissions.length} ролей.
                        </div>
                    \`;
                    
                    // Автоматически скрываем сообщение через 5 секунд
                    setTimeout(() => {
                        messageDiv.style.display = 'none';
                    }, 5000);
                } else {
                    throw new Error(data.error || 'Ошибка сохранения');
                }
            } catch (error) {
                messageDiv.style.display = 'block';
                messageDiv.className = 'success-message';
                messageDiv.style.background = 'linear-gradient(135deg, var(--danger) 0%, rgba(237, 66, 69, 0.1) 100%)';
                messageDiv.style.borderColor = 'var(--danger)';
                messageDiv.innerHTML = \`
                    <span class="nav-icon">❌</span>
                    <div>
                        <strong>Ошибка сохранения:</strong><br>
                        \${error.message}
                    </div>
                \`;
                
                setTimeout(() => {
                    messageDiv.style.display = 'none';
                }, 5000);
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<span class="nav-icon">💾</span> Сохранить изменения';
            }
        }

        function getCommandName(commandId) {
            const commands = {
                'region': '/регион',
                'transcript': '/transcript',
                'ticket': '/ticket'
            };
            return commands[commandId] || commandId;
        }

        // Инициализация счетчиков
        ${availableCommands.map(cmd => `updateSelectedCount('${cmd.id}');`).join('\n        ')}
    </script>
</body>
</html>`;
}

function createErrorPage(title, message) {
    return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ошибка - Haki Bot</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            background: linear-gradient(135deg, #1a1a1a 0%, #2b2b2b 100%); 
            color: #ffffff; 
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 20px;
        }
        .error-container {
            background: rgba(43, 43, 43, 0.9);
            padding: 50px;
            border-radius: 20px;
            text-align: center;
            max-width: 500px;
            width: 100%;
            border: 1px solid rgba(237, 66, 69, 0.3);
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
            backdrop-filter: blur(10px);
        }
        .error-icon {
            font-size: 5rem;
            margin-bottom: 30px;
            color: #ED4245;
        }
        .error-title {
            font-size: 2.5rem;
            margin-bottom: 20px;
            color: #fff;
        }
        .error-message {
            color: #b9bbbe;
            font-size: 1.2rem;
            margin-bottom: 40px;
            line-height: 1.6;
        }
        .back-btn {
            background: linear-gradient(135deg, #5865F2 0%, #4752C4 100%);
            color: white;
            padding: 15px 30px;
            border: none;
            border-radius: 12px;
            font-size: 1.1rem;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            transition: all 0.3s ease;
        }
        .back-btn:hover {
            transform: translateY(-3px);
            box-shadow: 0 10px 25px rgba(88, 101, 242, 0.4);
        }
        @media (max-width: 768px) {
            .error-container {
                padding: 30px 20px;
            }
            .error-icon {
                font-size: 4rem;
            }
            .error-title {
                font-size: 2rem;
            }
        }
    </style>
</head>
<body>
    <div class="error-container">
        <div class="error-icon">🚫</div>
        <h1 class="error-title">${title}</h1>
        <p class="error-message">${message}</p>
        <a href="/" class="back-btn">
            <span>🏠</span>
            Вернуться на главную
        </a>
    </div>
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

// ==================== НАСТРОЙКА ДОСТУПА К КОМАНДЕ РЕГИОНА ====================

// Добавьте эту переменную для хранения разрешенных ролей
const ALLOWED_REGION_ROLES = process.env.ALLOWED_REGION_ROLES?.split(',').map(id => id.trim()) || [];

// Функция проверки доступа к команде региона
function checkRegionAccess(member) {
    // Если список ролей пустой - доступ у всех
    if (ALLOWED_REGION_ROLES.length === 0) {
        return true;
    }
    
    // Проверяем, есть ли у пользователя хотя бы одна из разрешенных ролей
    return member.roles.cache.some(role => 
        ALLOWED_REGION_ROLES.includes(role.id)
    );
}

// ==================== СИСТЕМА УПРАВЛЕНИЯ РЕГИОНАМИ ДИСКОРДА ====================

// Хранилище настроек регионов для голосовых каналов
const voiceRegionSettings = new Map();

// Доступные регионы Discord - ПЕРЕМЕСТИТЕ ЭТО В НАЧАЛО КОДА, ПЕРЕД ИСПОЛЬЗОВАНИЕМ
const availableRegions = [
    'brazil',       // Бразилия
    'hongkong',     // Гонконг
    'india',        // Индия
    'japan',        // Япония
    'rotterdam',    // Роттердам
    'singapore',    // Сингапур
    'southafrica',  // Южная Африка
    'sydney',       // Сидней
    'us-central',   // США (Центр)
    'us-east',      // США (Восток)
    'us-south',     // США (Юг)
    'us-west',      // США (Запад)
    'automatic'     // Автоматический выбор
];

// Функция для получения читаемого названия региона
function getRegionName(regionCode) {
    const regionNames = {
        'brazil': 'Бразилия',
        'hongkong': 'Гонконг', 
        'india': 'Индия',
        'japan': 'Япония',
        'rotterdam': 'Роттердам (Европа)',
        'russia': 'Россия',
        'singapore': 'Сингапур',
        'southafrica': 'Южная Африка',
        'sydney': 'Сидней (Австралия)',
        'us-central': 'США (Центр)',
        'us-east': 'США (Восток)',
        'us-south': 'США (Юг)',
        'us-west': 'США (Запад)',
        'europe': 'Европа',
        'automatic': 'Автоматический выбор'
    };
    
    return regionNames[regionCode] || regionCode;
}

// ==================== НАСТРОЙКА ДОСТУПА К КОМАНДЕ РЕГИОНА ====================

// Переименуем переменную чтобы избежать конфликта
const REGION_COMMAND_ALLOWED_ROLES = process.env.ALLOWED_REGION_ROLES?.split(',').map(id => id.trim()) || [];

// Переименуем функцию чтобы избежать конфликта
function checkRegionAccess(member) {
    // Если список ролей пустой - доступ у всех
    if (REGION_COMMAND_ALLOWED_ROLES.length === 0) {
        return true;
    }
    
    // Проверяем, есть ли у пользователя хотя бы одна из разрешенных ролей
    return member.roles.cache.some(role => 
        REGION_COMMAND_ALLOWED_ROLES.includes(role.id)
    );
}

// ==================== ОБНОВЛЕННАЯ КОМАНДА РЕГИОНА (СЛЕШ-КОМАНДА) ====================

// Обработчик слеш-команды /регион
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand() && interaction.commandName === 'регион') {
        const action = interaction.options.getString('действие');
        
        // Проверяем доступ
        if (!checkRegionAccess(interaction.member)) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ED4245')
                .setTitle('❌ Доступ запрещен')
                .setDescription('У вас нет прав для использования этой команды.')
                .addFields(
                    { 
                        name: 'Требуемые роли', 
                        value: REGION_COMMAND_ALLOWED_ROLES.length > 0 ? 
                            REGION_COMMAND_ALLOWED_ROLES.map(id => {
                                const role = interaction.guild.roles.cache.get(id);
                                return role ? `• ${role.name}` : `• ${id}`;
                            }).join('\n') : 'Не настроены', 
                        inline: false 
                    }
                );
            
            await interaction.reply({ embeds: [errorEmbed], flags: 64 });
            return;
        }
        
        await interaction.deferReply({ flags: 64 });
        
        switch(action) {
            case 'set':
                const voiceChannelId = interaction.options.getString('channel_id');
                const regionCode = interaction.options.getString('регион');
                
                if (!voiceChannelId || !regionCode) {
                    const helpEmbed = new EmbedBuilder()
                        .setColor('#5865F2')
                        .setTitle('🌍 Управление регионами Discord')
                        .setDescription(`
**Использование:**
\`/регион set channel_id: <ID_голосового_канала> регион: <код_региона>\`

**Примеры:**
\`/регион set channel_id: 123456789012345678 регион: russia\`
\`/регион set channel_id: 123456789012345678 регион: europe\`
\`/регион set channel_id: 123456789012345678 региon: us-central\`

**Доступные регионы:**
${availableRegions.map(region => `• \`${region}\` - ${getRegionName(region)}`).join('\n')}

**Как получить ID голосового канала:**
1. Включите режим разработчика в Discord
2. ПКМ по голосовому каналу → "Копировать ID"
                        `);
                    
                    return interaction.editReply({ embeds: [helpEmbed] });
                }

                const regionCodeLower = regionCode.toLowerCase();

                if (!availableRegions.includes(regionCodeLower)) {
                    const errorEmbed = new EmbedBuilder()
                        .setColor('#ED4245')
                        .setTitle('❌ Неверный регион')
                        .setDescription(`Регион \`${regionCode}\` не найден.`)
                        .addFields(
                            { name: 'Доступные регионы', value: availableRegions.map(r => `\`${r}\``).join(', '), inline: false }
                        );
                    
                    return interaction.editReply({ embeds: [errorEmbed] });
                }

                try {
                    const guild = interaction.guild;
                    const voiceChannel = await guild.channels.fetch(voiceChannelId);
                    
                    if (!voiceChannel) {
                        return interaction.editReply('❌ Голосовой канал не найден! Проверьте ID.');
                    }

                    if (voiceChannel.type !== ChannelType.GuildVoice) {
                        return interaction.editReply('❌ Указанный канал не является голосовым!');
                    }

                    // Для automatic используем null
                    const regionToSet = regionCodeLower === 'automatic' ? null : regionCodeLower;

                    // Меняем регион голосового сервера
                    await voiceChannel.setRTCRegion(regionToSet);

                    // Сохраняем настройки
                    voiceRegionSettings.set(guild.id, {
                        voiceChannelId: voiceChannelId,
                        regionCode: regionCodeLower,
                        guildId: guild.id,
                        lastUpdated: new Date()
                    });

                    const successEmbed = new EmbedBuilder()
                        .setColor('#57F287')
                        .setTitle('✅ Регион изменен')
                        .setDescription(`Регион голосового сервера изменен на: **${getRegionName(regionCodeLower)}**`)
                        .addFields(
                            { name: 'Канал', value: `<#${voiceChannelId}>`, inline: true },
                            { name: 'Регион', value: getRegionName(regionCodeLower), inline: true },
                            { name: 'Статус', value: '✅ Успешно применен', inline: false }
                        )
                        .setFooter({ text: 'Изменения вступят в силу немедленно' })
                        .setTimestamp();

                    await interaction.editReply({ embeds: [successEmbed] });
                    console.log(`✅ Voice region changed to: ${regionCodeLower} in ${guild.name}`);

                } catch (error) {
                    console.error('Voice region change error:', error);
                    
                    const errorEmbed = new EmbedBuilder()
                        .setColor('#ED4245')
                        .setTitle('❌ Ошибка изменения региона')
                        .setDescription(`Не удалось изменить регион: ${error.message}`)
                        .addFields(
                            { name: 'Возможные причины', value: '• Недостаточно прав\n• Регион недоступен\n• Ошибка Discord API', inline: false }
                        );
                    
                    await interaction.editReply({ embeds: [errorEmbed] });
                }
                break;
                
            case 'статус':
                const settings = voiceRegionSettings.get(interaction.guild.id);
                
                if (!settings) {
                    const noSettingsEmbed = new EmbedBuilder()
                        .setColor('#FEE75C')
                        .setTitle('ℹ️ Настройки региона')
                        .setDescription('Регион голосового сервера еще не настроен.')
                        .addFields(
                            { name: 'Использование', value: '`/регион set channel_id: <ID_канала> регион: <регион>`', inline: false }
                        );
                    
                    return interaction.editReply({ embeds: [noSettingsEmbed] });
                }

                try {
                    const voiceChannel = await interaction.guild.channels.fetch(settings.voiceChannelId);
                    const currentRegion = voiceChannel.rtcRegion;
                    
                    const statusEmbed = new EmbedBuilder()
                        .setColor('#5865F2')
                        .setTitle('🌍 Текущие настройки региона')
                        .addFields(
                            { name: 'Голосовой канал', value: `<#${settings.voiceChannelId}>`, inline: true },
                            { name: 'Установленный регион', value: getRegionName(settings.regionCode), inline: true },
                            { name: 'Текущий регион', value: currentRegion ? getRegionName(currentRegion) : 'авто', inline: true },
                            { name: 'Статус', value: voiceChannel ? '✅ Активен' : '❌ Канал не найден', inline: true },
                            { name: 'Последнее обновление', value: `<t:${Math.floor(settings.lastUpdated.getTime() / 1000)}:R>`, inline: false }
                        )
                        .setFooter({ text: 'Используйте /регион set для изменения настроек' })
                        .setTimestamp();

                    return interaction.editReply({ embeds: [statusEmbed] });

                } catch (error) {
                    const errorEmbed = new EmbedBuilder()
                        .setColor('#ED4245')
                        .setTitle('❌ Ошибка проверки')
                        .setDescription('Не удалось проверить настройки региона.');
                    
                    return interaction.editReply({ embeds: [errorEmbed] });
                }
                
            case 'сброс':
                const resetSettings = voiceRegionSettings.get(interaction.guild.id);
                
                if (!resetSettings) {
                    return interaction.editReply('❌ Настройки региона не найдены для сброса.');
                }

                try {
                    const voiceChannel = await interaction.guild.channels.fetch(resetSettings.voiceChannelId);
                    
                    // Сбрасываем регион (null = автоматический выбор)
                    await voiceChannel.setRTCRegion(null);

                    // Удаляем настройки
                    voiceRegionSettings.delete(interaction.guild.id);

                    const resetEmbed = new EmbedBuilder()
                        .setColor('#57F287')
                        .setTitle('✅ Регион сброшен')
                        .setDescription('Регион голосового сервера сброшен на автоматический выбор.')
                        .addFields(
                            { name: 'Канал', value: `<#${resetSettings.voiceChannelId}>`, inline: true },
                            { name: 'Статус', value: 'Автоматический выбор региона', inline: true }
                        )
                        .setTimestamp();

                    await interaction.editReply({ embeds: [resetEmbed] });
                    console.log(`✅ Voice region reset to auto for guild: ${interaction.guild.name}`);

                } catch (error) {
                    console.error('Voice region reset error:', error);
                    await interaction.editReply('❌ Ошибка при сбросе региона.');
                }
                break;
                
            case 'список':
                const regionsList = availableRegions.map(region => 
                    `• \`${region}\` - ${getRegionName(region)}`
                ).join('\n');

                const listEmbed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setTitle('🌍 Доступные регионы Discord')
                    .setDescription(regionsList)
                    .setFooter({ text: 'Используйте: /регион set channel_id: <ID_канала> регион: <код_региона>' })
                    .setTimestamp();

                await interaction.editReply({ embeds: [listEmbed] });
                break;
                
            case 'доступ':
                const hasAccess = checkRegionAccess(interaction.member);
                const userRoles = interaction.member.roles.cache.map(role => role.name).join(', ');
                
                const accessEmbed = new EmbedBuilder()
                    .setColor(hasAccess ? '#57F287' : '#ED4245')
                    .setTitle('🔐 Проверка доступа к командам региона')
                    .addFields(
                        { name: 'Статус доступа', value: hasAccess ? '✅ Разрешено' : '❌ Запрещено', inline: true },
                        { name: 'Ваши роли', value: userRoles.length > 100 ? userRoles.substring(0, 100) + '...' : userRoles || 'Нет ролей', inline: false }
                    );
                
                if (REGION_COMMAND_ALLOWED_ROLES.length > 0) {
                    const allowedRolesInfo = REGION_COMMAND_ALLOWED_ROLES.map(id => {
                        const role = interaction.guild.roles.cache.get(id);
                        return role ? `• ${role.name}` : `• ${id}`;
                    }).join('\n');
                    
                    accessEmbed.addFields({ name: 'Требуемые роли', value: allowedRolesInfo, inline: false });
                }
                
                await interaction.editReply({ embeds: [accessEmbed] });
                break;
                
            default:
                const defaultHelpEmbed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setTitle('🌍 Команда /регион')
                    .setDescription(`
**Доступные действия:**

\`/регион set\` - Изменить регион голосового канала
\`/регион статус\` - Показать текущие настройки региона
\`/регион сброс\` - Сбросить регион на автоматический выбор
\`/регион список\` - Показать список доступных регионов
\`/регион доступ\` - Проверить права доступа

**Пример использования:**
\`/регион set channel_id: 123456789012345678 регион: russia\`
                    `);
                
                await interaction.editReply({ embeds: [defaultHelpEmbed] });
        }
    }
});

// ==================== ОБНОВЛЕННЫЕ КОМАНДЫ СТАТУСА И СБРОСА ====================

/* client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Команда для проверки текущих настроек региона
    if (message.content === '!регион статус') {
        if (!checkRegionAccess(message.member)) {
            await message.reply('❌ У вас нет прав для использования этой команды.');
            return;
        }

        const settings = voiceRegionSettings.get(message.guild.id);
        
        if (!settings) {
            const noSettingsEmbed = new EmbedBuilder()
                .setColor('#FEE75C')
                .setTitle('ℹ️ Настройки региона')
                .setDescription('Регион голосового сервера еще не настроен.')
                .addFields(
                    { name: 'Использование', value: '`!регион <ID_канала> <регион>`', inline: false }
                );
            
            await message.reply({ embeds: [noSettingsEmbed] });
            return;
        }

        try {
            const voiceChannel = await message.guild.channels.fetch(settings.voiceChannelId);
            const currentRegion = voiceChannel.rtcRegion;
            
            const statusEmbed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('🌍 Текущие настройки региона')
                .addFields(
                    { name: 'Голосовой канал', value: `<#${settings.voiceChannelId}>`, inline: true },
                    { name: 'Установленный регион', value: getRegionName(settings.regionCode), inline: true },
                    { name: 'Текущий регион', value: currentRegion ? getRegionName(currentRegion) : 'авто', inline: true },
                    { name: 'Статус', value: voiceChannel ? '✅ Активен' : '❌ Канал не найден', inline: true },
                    { name: 'Последнее обновление', value: `<t:${Math.floor(settings.lastUpdated.getTime() / 1000)}:R>`, inline: false }
                )
                .setFooter({ text: 'Используйте !регион для изменения настроек' })
                .setTimestamp();

            await message.reply({ embeds: [statusEmbed] });

        } catch (error) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ED4245')
                .setTitle('❌ Ошибка проверки')
                .setDescription('Не удалось проверить настройки региона.');
            
            await message.reply({ embeds: [errorEmbed] });
        }
    }

    // Команда для сброса региона (автоматический выбор)
    if (message.content === '!регион сброс') {
        if (!checkRegionAccess(message.member)) {
            await message.reply('❌ У вас нет прав для использования этой команды.');
            return;
        }

        const settings = voiceRegionSettings.get(message.guild.id);
        
        if (!settings) {
            await message.reply('❌ Настройки региона не найдены для сброса.');
            return;
        }

        try {
            const voiceChannel = await message.guild.channels.fetch(settings.voiceChannelId);
            
            // Сбрасываем регион (null = автоматический выбор)
            await voiceChannel.setRTCRegion(null);

            // Удаляем настройки
            voiceRegionSettings.delete(message.guild.id);

            const resetEmbed = new EmbedBuilder()
                .setColor('#57F287')
                .setTitle('✅ Регион сброшен')
                .setDescription('Регион голосового сервера сброшен на автоматический выбор.')
                .addFields(
                    { name: 'Канал', value: `<#${settings.voiceChannelId}>`, inline: true },
                    { name: 'Статус', value: 'Автоматический выбор региона', inline: true }
                )
                .setTimestamp();

            await message.reply({ embeds: [resetEmbed] });
            console.log(`✅ Voice region reset to auto for guild: ${message.guild.name}`);

        } catch (error) {
            console.error('Voice region reset error:', error);
            await message.reply('❌ Ошибка при сбросе региона.');
        }
    }

    // Команда для списка доступных регионов
    if (message.content === '!регион список') {
        const regionsList = availableRegions.map(region => 
            `• \`${region}\` - ${getRegionName(region)}`
        ).join('\n');

        const listEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('🌍 Доступные регионы Discord')
            .setDescription(regionsList)
            .setFooter({ text: 'Используйте: !регион <ID_канала> <код_региона>' })
            .setTimestamp();

        await message.reply({ embeds: [listEmbed] });
    }
});
*/
// ==================== КОМАНДА ДЛЯ ПРОВЕРКИ ДОСТУПА ====================

 /*client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Команда для проверки своих прав
    if (message.content === '!регион доступ') {
        const hasAccess = checkRegionAccess(message.member);
        const userRoles = message.member.roles.cache.map(role => role.name).join(', ');
        
        const accessEmbed = new EmbedBuilder()
            .setColor(hasAccess ? '#57F287' : '#ED4245')
            .setTitle('🔐 Проверка доступа к командам региона')
            .addFields(
                { name: 'Статус доступа', value: hasAccess ? '✅ Разрешено' : '❌ Запрещено', inline: true },
                { name: 'Ваши роли', value: userRoles.length > 100 ? userRoles.substring(0, 100) + '...' : userRoles || 'Нет ролей', inline: false }
            );
        
        if (REGION_COMMAND_ALLOWED_ROLES.length > 0) {
            const allowedRolesInfo = REGION_COMMAND_ALLOWED_ROLES.map(id => {
                const role = message.guild.roles.cache.get(id);
                return role ? `• ${role.name}` : `• ${id}`;
            }).join('\n');
            
            accessEmbed.addFields({ name: 'Требуемые роли', value: allowedRolesInfo, inline: false });
        }
        
        await message.reply({ embeds: [accessEmbed] });
    }
});
*/
// ==================== КОМАНДЫ НАСТРОЙКИ ТРАНСКРИПТОВ ====================

/*client.on('messageCreate', async message => {
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
if (message.content.startsWith('-translation')) {
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
*/
// ==================== ОБРАБОТКА СЛЕШ-КОМАНД ====================

client.on('interactionCreate', async (interaction) => {
    // Обработка слеш-команд
    if (interaction.isChatInputCommand()) {
        const { commandName, options, user, member, guild } = interaction;

        console.log(`⚡ Слеш-команда: /${commandName} от ${user.tag}`);

        // Проверяем, что команда выполнена на сервере
        if (!guild) {
            return interaction.reply({ 
                content: '❌ Эта команда работает только на серверах Discord!', 
                flags: 64 
            });
        }

        try {
            switch(commandName) {
                case 'ping':
                    await interaction.reply('🏓 Понг! Бот работает.');
                    break;

                case 'transcript':
                    // Проверяем права на управление сообщениями
                    if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                        return interaction.reply({ 
                            content: '❌ У вас нет прав для создания транскриптов!', 
                            flags: 64 
                        });
                    }
                    
                    // Вызываем функцию создания транскрипта
                    await interaction.deferReply({ flags: 64 });
                    
                    const settings = getServerSettings(guild.id);
                    const transcriptChannelId = settings.transcriptChannelId;
                    
                    // Собираем сообщения
                    let messageCollection = new Collection();
                    let channelMessages = await interaction.channel.messages.fetch({ limit: 100 });
                    messageCollection = messageCollection.concat(channelMessages);

                    let lastMessage = channelMessages.last();
                    while(channelMessages.size === 100 && lastMessage) {
                        let lastMessageId = lastMessage.id;
                        channelMessages = await interaction.channel.messages.fetch({ limit: 100, before: lastMessageId });
                        if(channelMessages && channelMessages.size > 0) {
                            messageCollection = messageCollection.concat(channelMessages);
                            lastMessage = channelMessages.last();
                        } else break;
                    }

                    const allMessages = Array.from(messageCollection.values()).reverse();
                    
                    const ticketInfo = await collectTicketInfo(interaction.channel, messageCollection);
                    const ticketReport = generateTicketReport(ticketInfo);
                    ticketReport.messageCount = allMessages.length;
                    
                    const transcriptId = generateTranscriptId();
                    
                    const htmlContent = createHTMLTranscript(ticketReport, allMessages);
                    
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
                    
                    const baseUrl = getBaseUrl();
                    const transcriptUrl = `${baseUrl}/transcript/${transcriptId}`;
                    
                    const row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setLabel('📄 Open Transcript')
                                .setURL(transcriptUrl)
                                .setStyle(ButtonStyle.Link)
                        );
                    
                    const ticketInfoEmbed = createTicketInfoEmbedWithParticipants(ticketReport);
                    
                    const transcriptChannel = client.channels.cache.get(transcriptChannelId);
                    
                    if (transcriptChannel && transcriptChannel.isTextBased()) {
                        await transcriptChannel.send({
                            embeds: [ticketInfoEmbed],
                            components: [row],
                            content: `📋 **Transcript Created**\n**ID:** \`${transcriptId}\``
                        });
                        
                        await interaction.editReply('✅ Transcript created! Check the transcript channel.');
                    } else {
                        await interaction.editReply('❌ Transcript channel not found!');
                    }
                    break;

                case 'settranscript':
                    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                        return interaction.reply({ 
                            content: '❌ Только администраторы могут настраивать каналы транскриптов!', 
                            flags: 64 
                        });
                    }
                    
                    const channelId = options.getString('channel_id');
                    
                    await interaction.deferReply({ flags: 64 });
                    
                    if (channelId === 'reset') {
                        const settings = getServerSettings(guild.id);
                        settings.transcriptChannelId = TRANSCRIPT_CHANNEL_ID;
                        saveServerSettings(guild.id, settings);
                        
                        await interaction.editReply({
                            content: `✅ Настройки сброшены к значению по умолчанию: \`${TRANSCRIPT_CHANNEL_ID}\``
                        });
                        return;
                    }

                    if (!/^\d{17,20}$/.test(channelId)) {
                        return interaction.editReply('❌ Укажите корректный ID канала (17-20 цифр)');
                    }

                    try {
                        const channel = await guild.channels.fetch(channelId);
                        if (!channel) {
                            throw new Error('Канал не найден');
                        }

                        const botMember = guild.members.me;
                        if (!channel.permissionsFor(botMember).has([PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.EmbedLinks])) {
                            throw new Error('У бота нет прав для отправки сообщений в этот канал');
                        }

                        const settings = getServerSettings(guild.id);
                        settings.transcriptChannelId = channelId;
                        saveServerSettings(guild.id, settings);

                        await interaction.editReply({
                            content: `✅ Канал для транскриптов установлен: <#${channelId}>`
                        });
                        
                    } catch (error) {
                        await interaction.editReply(`❌ Ошибка: ${error.message}`);
                    }
                    break;

                case 'transcriptsettings':
                    const serverSettings = getServerSettings(guild.id);
                    
                    const embed = new EmbedBuilder()
                        .setColor('#5865F2')
                        .setTitle('⚙️ Текущие настройки транскриптов')
                        .addFields(
                            { 
                                name: '📁 Канал для транскриптов', 
                                value: serverSettings.transcriptChannelId === TRANSCRIPT_CHANNEL_ID ? 
                                    `По умолчанию: \`${TRANSCRIPT_CHANNEL_ID}\`` : 
                                    `<#${serverSettings.transcriptChannelId}> (\`${serverSettings.transcriptChannelId}\`)`, 
                                inline: false 
                            }
                        )
                        .setFooter({ text: 'Используйте /settranscript для изменения настроек' });

                    await interaction.reply({ embeds: [embed], flags: 64 });
                    break;

                case 'translation':
                    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                        return interaction.reply({ 
                            content: '❌ Только администраторы могут управлять переводом!', 
                            flags: 64 
                        });
                    }
                    
                    const action = options.getString('action');
                    const target = options.getString('target');
                    const translationSettings = getServerSettings(guild.id);
                    
                    await interaction.deferReply({ flags: 64 });
                    
                    switch(action) {
                        case 'on':
                            translationSettings.translationEnabled = true;
                            saveServerSettings(guild.id, translationSettings);
                            await interaction.editReply('✅ Авто-перевод включен');
                            break;
                            
                        case 'off':
                            translationSettings.translationEnabled = false;
                            saveServerSettings(guild.id, translationSettings);
                            await interaction.editReply('❌ Авто-перевод выключен');
                            break;
                            
                        case 'status':
                            const status = translationSettings.translationEnabled ? '✅ ВКЛЮЧЕН' : '❌ ВЫКЛЮЧЕН';
                            const disabledChannelsInfo = translationSettings.disabledTranslationChannels.length === 0 ? 
                                'Нет' : 
                                translationSettings.disabledTranslationChannels.map(id => {
                                    const ch = guild.channels.cache.get(id);
                                    return ch ? `#${ch.name}` : id;
                                }).join(', ');
                            
                            const rolesInfo = translationSettings.protectedRoles.length === 0 ? 
                                'Нет' : 
                                translationSettings.protectedRoles.map(id => {
                                    const role = guild.roles.cache.get(id);
                                    return role ? role.name : id;
                                }).join(', ');
                            
                            const statusEmbed = new EmbedBuilder()
                                .setColor(translationSettings.translationEnabled ? 0x57F287 : 0xED4245)
                                .setTitle('🌐 Статус авто-перевода')
                                .setDescription(`
**Общий статус:** ${status}
🚫 **Отключен в каналах:** ${disabledChannelsInfo}
🛡️ **Защищенные роли:** ${rolesInfo}
                                `);
                            
                            await interaction.editReply({ embeds: [statusEmbed] });
                            break;
                            
                        case 'disablechannel':
                            if (!target) {
                                return interaction.editReply('❌ Укажите канал!');
                            }
                            
                            let channelToDisable = guild.channels.cache.get(target.replace(/[<#>]/g, ''));
                            if (!channelToDisable) {
                                channelToDisable = guild.channels.cache.find(ch => 
                                    ch.name.toLowerCase().includes(target.toLowerCase())
                                );
                            }
                            
                            if (channelToDisable && channelToDisable.isTextBased()) {
                                if (!translationSettings.disabledTranslationChannels.includes(channelToDisable.id)) {
                                    translationSettings.disabledTranslationChannels.push(channelToDisable.id);
                                    saveServerSettings(guild.id, translationSettings);
                                    await interaction.editReply(`🚫 Перевод отключен для канала: **#${channelToDisable.name}**`);
                                } else {
                                    await interaction.editReply(`ℹ️ Канал **#${channelToDisable.name}** уже в списке отключенных`);
                                }
                            } else {
                                await interaction.editReply('❌ Канал не найден');
                            }
                            break;
                            
                        case 'enablechannel':
                            if (!target) {
                                return interaction.editReply('❌ Укажите канал!');
                            }
                            
                            let channelToEnable = guild.channels.cache.get(target.replace(/[<#>]/g, ''));
                            if (!channelToEnable) {
                                channelToEnable = guild.channels.cache.find(ch => 
                                    ch.name.toLowerCase().includes(target.toLowerCase())
                                );
                            }
                            
                            if (channelToEnable) {
                                const index = translationSettings.disabledTranslationChannels.indexOf(channelToEnable.id);
                                if (index > -1) {
                                    translationSettings.disabledTranslationChannels.splice(index, 1);
                                    saveServerSettings(guild.id, translationSettings);
                                    await interaction.editReply(`✅ Перевод включен для канала: **#${channelToEnable.name}**`);
                                } else {
                                    await interaction.editReply(`ℹ️ Канал **#${channelToEnable.name}** не найден в списке отключенных`);
                                }
                            } else {
                                await interaction.editReply('❌ Канал не найден');
                            }
                            break;
                            
                        case 'clearchannels':
                            translationSettings.disabledTranslationChannels = [];
                            saveServerSettings(guild.id, translationSettings);
                            await interaction.editReply('🗑️ Список отключенных каналов очищен');
                            break;
                            
                        case 'addrole':
                            if (!target) {
                                return interaction.editReply('❌ Укажите роль!');
                            }
                            
                            let roleToAdd = guild.roles.cache.get(target.replace(/[<@&>]/g, ''));
                            if (!roleToAdd) {
                                roleToAdd = guild.roles.cache.find(role => 
                                    role.name.toLowerCase().includes(target.toLowerCase())
                                );
                            }
                            
                            if (roleToAdd) {
                                if (!translationSettings.protectedRoles.includes(roleToAdd.id)) {
                                    translationSettings.protectedRoles.push(roleToAdd.id);
                                    saveServerSettings(guild.id, translationSettings);
                                    await interaction.editReply(`🛡️ Роль **${roleToAdd.name}** добавлена в защищенные`);
                                } else {
                                    await interaction.editReply(`ℹ️ Роль **${roleToAdd.name}** уже в списке защищенных`);
                                }
                            } else {
                                await interaction.editReply('❌ Роль не найдена');
                            }
                            break;
                            
                        case 'removerole':
                            if (!target) {
                                return interaction.editReply('❌ Укажите роль!');
                            }
                            
                            let roleToRemove = guild.roles.cache.get(target.replace(/[<@&>]/g, ''));
                            if (!roleToRemove) {
                                roleToRemove = guild.roles.cache.find(role => 
                                    role.name.toLowerCase().includes(target.toLowerCase())
                                );
                            }
                            
                            if (roleToRemove) {
                                const index = translationSettings.protectedRoles.indexOf(roleToRemove.id);
                                if (index > -1) {
                                    translationSettings.protectedRoles.splice(index, 1);
                                    saveServerSettings(guild.id, translationSettings);
                                    await interaction.editReply(`✅ Роль **${roleToRemove.name}** удалена из защищенных`);
                                } else {
                                    await interaction.editReply(`ℹ️ Роль **${roleToRemove.name}** не найдена в списке защищенных`);
                                }
                            } else {
                                await interaction.editReply('❌ Роль не найдена');
                            }
                            break;
                    }
                    break;

                case 'autodelete':
                    if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                        return interaction.reply({ 
                            content: '❌ У вас нет прав для управления автоудалением!', 
                            flags: 64 
                        });
                    }
                    
                    const autodeleteAction = options.getString('action');
                    const autodeleteValue = options.getString('value');
                    const autodeleteSettings = getSettings(guild.id);
                    
                    await interaction.deferReply({ flags: 64 });
                    
                    switch(autodeleteAction) {
                        case 'on':
                            autodeleteSettings.enabled = true;
                            await interaction.editReply('✅ Автоудаление включено');
                            break;
                            
                        case 'off':
                            autodeleteSettings.enabled = false;
                            await interaction.editReply('❌ Автоудаление выключено');
                            break;
                            
                        case 'status':
                            const statusText = autodeleteSettings.enabled ? '✅ ВКЛЮЧЕНО' : '❌ ВЫКЛЮЧЕНО';
                            const channelsInfo = autodeleteSettings.targetChannels.length === 0 ? 
                                'Все каналы' : 
                                autodeleteSettings.targetChannels.map(id => {
                                    const ch = guild.channels.cache.get(id);
                                    return ch ? `#${ch.name}` : id;
                                }).join(', ');
                            
                            const exemptRolesInfo = autodeleteSettings.exemptRoles.length === 0 ? 
                                'Нет' : 
                                autodeleteSettings.exemptRoles.map(id => {
                                    const role = guild.roles.cache.get(id);
                                    return role ? role.name : id;
                                }).join(', ');
                            
                            const statusEmbed = new EmbedBuilder()
                                .setColor(autodeleteSettings.enabled ? 0x57F287 : 0xED4245)
                                .setTitle('⚡ Статус автоудаления')
                                .setDescription(`
**${statusText}**
⏰ **Задержка:** ${autodeleteSettings.delay}мс
🎯 **Каналы:** ${channelsInfo}
🛡️ **Исключенные роли:** ${exemptRolesInfo}
                                `);
                            
                            await interaction.editReply({ embeds: [statusEmbed] });
                            break;
                            
                        case 'delay':
                            const delay = parseInt(autodeleteValue);
                            if (delay && delay >= 1000 && delay <= 30000) {
                                autodeleteSettings.delay = delay;
                                await interaction.editReply(`⏰ Задержка установлена: **${delay}мс**`);
                            } else {
                                await interaction.editReply('❌ Укажите задержку от 1000 до 30000 мс');
                            }
                            break;
                            
                        case 'addchannel':
                            if (!autodeleteValue) {
                                return interaction.editReply('❌ Укажите канал!');
                            }
                            
                            let channelToAdd = guild.channels.cache.get(autodeleteValue.replace(/[<#>]/g, ''));
                            if (!channelToAdd) {
                                channelToAdd = guild.channels.cache.find(ch => 
                                    ch.name.toLowerCase().includes(autodeleteValue.toLowerCase())
                                );
                            }
                            
                            if (channelToAdd) {
                                if (!autodeleteSettings.targetChannels.includes(channelToAdd.id)) {
                                    autodeleteSettings.targetChannels.push(channelToAdd.id);
                                    await interaction.editReply(`✅ Канал **#${channelToAdd.name}** добавлен в автоудаление`);
                                } else {
                                    await interaction.editReply(`ℹ️ Канал **#${channelToAdd.name}** уже в списке`);
                                }
                            } else {
                                await interaction.editReply('❌ Канал не найден');
                            }
                            break;
                            
                        case 'removechannel':
                            if (!autodeleteValue) {
                                return interaction.editReply('❌ Укажите канал!');
                            }
                            
                            let channelToRemove = guild.channels.cache.get(autodeleteValue.replace(/[<#>]/g, ''));
                            if (!channelToRemove) {
                                channelToRemove = guild.channels.cache.find(ch => 
                                    ch.name.toLowerCase().includes(autodeleteValue.toLowerCase())
                                );
                            }
                            
                            if (channelToRemove) {
                                const index = autodeleteSettings.targetChannels.indexOf(channelToRemove.id);
                                if (index > -1) {
                                    autodeleteSettings.targetChannels.splice(index, 1);
                                    await interaction.editReply(`✅ Канал **#${channelToRemove.name}** удален из автоудаления`);
                                } else {
                                    await interaction.editReply(`ℹ️ Канал **#${channelToRemove.name}** не найден в списке`);
                                }
                            } else {
                                await interaction.editReply('❌ Канал не найден');
                            }
                            break;
                            
                        case 'addrole':
                            if (!autodeleteValue) {
                                return interaction.editReply('❌ Укажите роль!');
                            }
                            
                            let roleToAdd = guild.roles.cache.get(autodeleteValue.replace(/[<@&>]/g, ''));
                            if (!roleToAdd) {
                                roleToAdd = guild.roles.cache.find(role => 
                                    role.name.toLowerCase().includes(autodeleteValue.toLowerCase())
                                );
                            }
                            
                            if (roleToAdd) {
                                if (!autodeleteSettings.exemptRoles.includes(roleToAdd.id)) {
                                    autodeleteSettings.exemptRoles.push(roleToAdd.id);
                                    await interaction.editReply(`🛡️ Роль **${roleToAdd.name}** добавлена в исключения`);
                                } else {
                                    await interaction.editReply(`ℹ️ Роль **${roleToAdd.name}** уже в списке исключений`);
                                }
                            } else {
                                await interaction.editReply('❌ Роль не найдена');
                            }
                            break;
                            
                        case 'removerole':
                            if (!autodeleteValue) {
                                return interaction.editReply('❌ Укажите роль!');
                            }
                            
                            let roleToRemove = guild.roles.cache.get(autodeleteValue.replace(/[<@&>]/g, ''));
                            if (!roleToRemove) {
                                roleToRemove = guild.roles.cache.find(role => 
                                    role.name.toLowerCase().includes(autodeleteValue.toLowerCase())
                                );
                            }
                            
                            if (roleToRemove) {
                                const index = autodeleteSettings.exemptRoles.indexOf(roleToRemove.id);
                                if (index > -1) {
                                    autodeleteSettings.exemptRoles.splice(index, 1);
                                    await interaction.editReply(`✅ Роль **${roleToRemove.name}** удалена из исключений`);
                                } else {
                                    await interaction.editReply(`ℹ️ Роль **${roleToRemove.name}** не найдена в списке исключений`);
                                }
                            } else {
                                await interaction.editReply('❌ Роль не найдена');
                            }
                            break;
                            
                        case 'test':
                            const testMessage = await interaction.channel.send('🧪 Тестовое сообщение для проверки автоудаления');
                            setTimeout(async () => {
                                if (testMessage.deletable) {
                                    await testMessage.delete();
                                }
                            }, 3000);
                            await interaction.editReply('🧪 Тестовое сообщение отправлено (удалится через 3 сек)');
                            break;
                    }
                    break;

                case 'play':
                    if (!member.voice?.channel) {
                        return interaction.reply({ 
                            content: '❌ Зайдите в голосовой канал!', 
                            flags: 64 
                        });
                    }
                    
                    const station = options.getString('station') || 'нвс';
                    
                    if (!radioStations[station]) {
                        return interaction.reply({ 
                            content: '❌ Неизвестная радиостанция! Используйте /stations для списка', 
                            flags: 64 
                        });
                    }
                    
                    await interaction.deferReply();
                    
                    const voiceChannel = member.voice.channel;
                    
                    try {
                        // Останавливаем предыдущее воспроизведение
                        if (players.has(guild.id)) {
                            players.get(guild.id).stop();
                            players.delete(guild.id);
                        }

                        // Подключаемся к каналу
                        const connection = joinVoiceChannel({
                            channelId: voiceChannel.id,
                            guildId: guild.id,
                            adapterCreator: guild.voiceAdapterCreator,
                        });

                        // Создаем плеер и ресурс
                        const player = createAudioPlayer();
                        const resource = createAudioResource(radioStations[station], {
                            inlineVolume: true
                        });

                        resource.volume.setVolume(0.5);
                        player.play(resource);
                        connection.subscribe(player);
                        players.set(guild.id, player);

                        await interaction.editReply(`🔊 Включена радиостанция **${station}** в канале ${voiceChannel.name}`);
                    } catch (error) {
                        console.error('Ошибка радио:', error);
                        await interaction.editReply('❌ Ошибка при включении радио');
                    }
                    break;

                case 'stop':
                    if (players.has(guild.id)) {
                        players.get(guild.id).stop();
                        players.delete(guild.id);
                        await interaction.reply('⏹️ Радио выключено');
                    } else {
                        await interaction.reply({ 
                            content: '❌ Радио и так не играет', 
                            flags: 64 
                        });
                    }
                    break;

                case 'stations':
                    await interaction.reply(`📻 **Доступные станции:** ${Object.keys(radioStations).join(', ')}`);
                    break;

                case 'testvoice':
                    if (!member.voice?.channel) {
                        return interaction.reply({ 
                            content: '❌ Зайдите в голосовой канал!', 
                            flags: 64 
                        });
                    }
                    
                    await interaction.deferReply();
                    
                    try {
                        const connection = joinVoiceChannel({
                            channelId: member.voice.channel.id,
                            guildId: guild.id,
                            adapterCreator: guild.voiceAdapterCreator,
                        });

                        await interaction.editReply('✅ Успешно подключился к голосовому каналу!');
                        
                        setTimeout(() => {
                            connection.destroy();
                        }, 3000);
                    } catch (error) {
                        await interaction.editReply(`❌ Ошибка: ${error.message}`);
                    }
                    break;

                case 'стат':
                    const nickname = options.getString('никнейм');
                    await interaction.deferReply();
                    
                    try {
                        // Ваш код для получения статистики War Thunder
                        // Например:
                        // const stats = await getWarThunderStats(nickname);
                        // await interaction.editReply(stats);
                        
                        await interaction.editReply(`📊 Статистика для ${nickname} - функция в разработке`);
                    } catch (error) {
                        await interaction.editReply(`❌ Ошибка получения статистики: ${error.message}`);
                    }
                    break;

                case 'полк':
                    const regimentName = options.getString('название');
                    await interaction.deferReply();
                    
                    try {
                        // Ваш код для получения информации о полке
                        await interaction.editReply(`🏰 Информация о полке "${regimentName}" - функция в разработке`);
                    } catch (error) {
                        await interaction.editReply(`❌ Ошибка: ${error.message}`);
                    }
                    break;

                case 'регион':
                    const regionAction = options.getString('действие');
                    
                    // Проверяем доступ к команде региона
                    if (!checkRegionAccess(interaction.member)) {
                        return interaction.reply({ 
                            content: '❌ У вас нет прав для использования этой команды!', 
                            flags: 64 
                        });
                    }
                    
                    await interaction.deferReply({ flags: 64 });
                    
                    switch(regionAction) {
                        case 'set':
                            const channelId = options.getString('channel_id');
                            const regionCode = options.getString('регион');
                            
                            if (!channelId || !regionCode) {
                                return interaction.editReply('❌ Укажите ID канала и код региона!');
                            }
                            
                            if (!availableRegions.includes(regionCode)) {
                                return interaction.editReply(`❌ Неверный регион. Используйте /регион список для просмотра доступных`);
                            }
                            
                            try {
                                const voiceChannel = await guild.channels.fetch(channelId);
                                
                                if (!voiceChannel) {
                                    return interaction.editReply('❌ Голосовой канал не найден!');
                                }
                                
                                if (voiceChannel.type !== ChannelType.GuildVoice) {
                                    return interaction.editReply('❌ Указанный канал не является голосовым!');
                                }
                                
                                const regionToSet = regionCode === 'automatic' ? null : regionCode;
                                await voiceChannel.setRTCRegion(regionToSet);
                                
                                voiceRegionSettings.set(guild.id, {
                                    voiceChannelId: channelId,
                                    regionCode: regionCode,
                                    guildId: guild.id,
                                    lastUpdated: new Date()
                                });
                                
                                await interaction.editReply(`✅ Регион изменен на: **${getRegionName(regionCode)}**`);
                            } catch (error) {
                                await interaction.editReply(`❌ Ошибка: ${error.message}`);
                            }
                            break;
                            
                        case 'статус':
                            const regionSettings = voiceRegionSettings.get(guild.id);
                            
                            if (!regionSettings) {
                                return interaction.editReply('ℹ️ Регион голосового сервера еще не настроен');
                            }
                            
                            try {
                                const voiceChannel = await guild.channels.fetch(regionSettings.voiceChannelId);
                                const currentRegion = voiceChannel.rtcRegion;
                                
                                const statusEmbed = new EmbedBuilder()
                                    .setColor('#5865F2')
                                    .setTitle('🌍 Текущие настройки региона')
                                    .addFields(
                                        { name: 'Голосовой канал', value: `<#${regionSettings.voiceChannelId}>`, inline: true },
                                        { name: 'Установленный регион', value: getRegionName(regionSettings.regionCode), inline: true },
                                        { name: 'Текущий регион', value: currentRegion ? getRegionName(currentRegion) : 'авто', inline: true }
                                    );
                                
                                await interaction.editReply({ embeds: [statusEmbed] });
                            } catch (error) {
                                await interaction.editReply('❌ Ошибка проверки настроек региона');
                            }
                            break;
                            
                        case 'сброс':
                            const resetSettings = voiceRegionSettings.get(guild.id);
                            
                            if (!resetSettings) {
                                return interaction.editReply('❌ Настройки региона не найдены для сброса');
                            }
                            
                            try {
                                const voiceChannel = await guild.channels.fetch(resetSettings.voiceChannelId);
                                await voiceChannel.setRTCRegion(null);
                                voiceRegionSettings.delete(guild.id);
                                
                                await interaction.editReply('✅ Регион сброшен на автоматический выбор');
                            } catch (error) {
                                await interaction.editReply('❌ Ошибка при сбросе региона');
                            }
                            break;
                            
                        case 'список':
                            const regionsList = availableRegions.map(region => 
                                `• \`${region}\` - ${getRegionName(region)}`
                            ).join('\n');
                            
                            await interaction.editReply(`🌍 **Доступные регионы:**\n${regionsList}`);
                            break;
                            
                        case 'доступ':
                            const hasAccess = checkRegionAccess(member);
                            const userRoles = member.roles.cache.map(role => role.name).join(', ');
                            
                            const accessEmbed = new EmbedBuilder()
                                .setColor(hasAccess ? '#57F287' : '#ED4245')
                                .setTitle('🔐 Проверка доступа к командам региона')
                                .addFields(
                                    { name: 'Статус доступа', value: hasAccess ? '✅ Разрешено' : '❌ Запрещено', inline: true },
                                    { name: 'Ваши роли', value: userRoles || 'Нет ролей', inline: false }
                                );
                            
                            await interaction.editReply({ embeds: [accessEmbed] });
                            break;
                    }
                    break;

                default:
                    await interaction.reply({ 
                        content: '❌ Неизвестная команда!', 
                        flags: 64 
                    });
            }
        } catch (error) {
            console.error('Ошибка обработки слеш-команды:', error);
            
            if (interaction.deferred) {
                await interaction.editReply('❌ Произошла ошибка при выполнении команды!');
            } else {
                await interaction.reply({ 
                    content: '❌ Произошла ошибка при выполнении команды!', 
                    flags: 64 
                });
            }
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

/* client.on('messageCreate', async (message) => {
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
*/
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

// ==================== СИСТЕМА ТИКЕТОВ СЛЕШ-КОМАНД ====================

// Хранилище настроек тикетов (оставить как есть)
const ticketSettings = new Map();

// Обработчик слеш-команды /ticket
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand() && interaction.commandName === 'ticket') {
        // Проверяем права администратора
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ 
                content: '❌ Только администраторы могут настраивать систему тикетов!', 
                flags: 64 
            });
        }

        const channelId = interaction.options.getString('channel_id');
        const categoryId = interaction.options.getString('category_id');
        const roleIds = interaction.options.getString('role_ids').split(',').map(id => id.trim());

        await interaction.deferReply({ flags: 64 });

        try {
            const guild = interaction.guild;
            const targetChannel = await guild.channels.fetch(channelId);
            const category = await guild.channels.fetch(categoryId);
            
            if (!targetChannel || !category) {
                return interaction.editReply('❌ Канал или категория не найдены! Проверьте ID.');
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
                return interaction.editReply('❌ Не найдено ни одной валидной роли!');
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
                .setDescription("Чтобы создать заявку нажмите ниже на кнопку \"Создать заявку в полк\"\nTo create a request, click the button below.")
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

            await interaction.editReply({ embeds: [successEmbed] });
            console.log(`✅ Ticket system configured for guild: ${guild.name}`);

        } catch (error) {
            console.error('Ticket setup error:', error);
            await interaction.editReply('❌ Ошибка при настройке! Проверьте ID и права бота.');
        }
    }
});

// Функция инициализации тикет системы (оставить как есть)
async function initializeTicketSystem() {
    // Используем настройки из команды /ticket
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

// Обработчик кнопки создания тикета (оставить как есть, но обновить ссылку на команду)
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton() || interaction.customId !== "create_regiment_request") return;

    const guildId = interaction.guild.id;
    const settings = ticketSettings.get(guildId);

    if (!settings) {
        await interaction.reply({ 
            content: '❌ Система заявок не настроена на этом сервере! Попросите администратора использовать команду `/ticket`.', 
            flags: 64 
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
        await interaction.reply({ content: "У вас уже есть открытая заявка!", flags: 64 });
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

    // РУССКАЯ АНКЕТА
    const embedRU = new EmbedBuilder()
        .setColor('#727070')
        .setTitle(':flag_ru: - RU Blank')
        .setDescription(`
Заполните бланк вопросов, и ждите ответа офицеров.

1. Ваш никнейм? - 
2. Ваше имя? - 
3. Ваш прайм-тайм? (От МСК) -
4. Сколько вам лет? - 
5. Ваш макс БР наземной техники? - 
6. Ваш макс БР летной техники? -
7. Ваша квалификация? (Танкист, Летчик, Вертолетчик, Зенитчик)? - 
8. Какой у вас К/Д за последний месяц? -
9. Играли ли вы полковые бои до этого? Если да, какие роли занимали в команде, в каких полках? -
    `);

    // АНГЛИЙСКАЯ АНКЕТА
    const embedEN = new EmbedBuilder()
        .setColor('#727070')
        .setTitle(':flag_gb: - EN Blank')
        .setDescription(`
Fill out the question form and wait for the officers to respond.

1. Your IGN(In Game Name)? - 
2. Your real name(or how we should call you)? - 
3. Your time zone? - 
4. How old are you? - 
5. Your max. tier of ground vehicles? - 
6. Your max. tier of flight vehicles? -
7. your qualification(what type of vehicle you play most)(Tank, Fighter, Heli, Anti-Air)? - 
8. What is your schedule for the last month? -
9. Did you play squadron battles before? If yes, which roles did you fulfill in the team, in what squadrons? - 

**P.s. we have a lot of russian players, who doesn't speak english. Please be patient and nice with everyone!**
    `)
        .setFooter({ text: 'Пожалуйста, заполните все поля | Please fill in all fields' })
        .setTimestamp();

    // ДИНАМИЧЕСКОЕ УПОМИНАНИЕ РОЛЕЙ ИЗ НАСТРОЕК
    const roleMentions = settings.roleIds && settings.roleIds.length > 0 
        ? settings.roleIds.map(roleId => `<@&${roleId}>`).join(' ') 
        : '';

    // ОДНО сообщение с ДВУМЯ embed'ами и упоминаниями
    await channel.send({ 
        content: roleMentions,
        embeds: [embedRU, embedEN],
        components: [closeRow] 
    });

    await interaction.reply({ 
        content: `✅ Заявка создана: <#${channel.id}>`, 
        flags: 64 
    });
});

// Обработчик кнопки закрытия тикета с обновленной командой транскрипта
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton() || interaction.customId !== "close_ticket") return;

    const channel = interaction.channel;
    
    // Проверяем, что это тикет-канал
    if (!channel.name.startsWith('ticket│')) {
        await interaction.reply({ content: '❌ Эта кнопка работает только в тикет-каналах!', flags: 64 });
        return;
    }

    const user = interaction.user;

    // Проверяем права (создатель тикета или модератор)
    const isOwner = channel.name === `ticket│${user.username.toLowerCase()}`;
    const isModerator = interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages);

    if (!isOwner && !isModerator) {
        await interaction.reply({ 
            content: '❌ Только создатель заявки или модератор может закрыть тикет!', 
            flags: 64 
        });
        return;
    }

    try {
        // Сразу удаляем кнопку чтобы предотвратить повторное нажатие
        await interaction.message.edit({ components: [] });
        await interaction.reply({ content: '🔒 Создаю транскрипт и удаляю заявку...' });

        // Создаем транскрипт с помощью слеш-команды (имитируем вызов)
        const transcriptInteraction = {
            user: user,
            member: interaction.member,
            guild: interaction.guild,
            channel: channel,
            deferred: false,
            replied: false,
            deferReply: async () => { this.deferred = true; },
            editReply: async (content) => { 
                await channel.send(typeof content === 'string' ? content : content.content || 'Транскрипт создан'); 
            },
            reply: async (content) => { 
                await channel.send(typeof content === 'string' ? content : content.content || 'Транскрипт создан'); 
            }
        };
        
        // Имитируем вызов слеш-команды /transcript
        await interaction.channel.send('📝 Создаю транскрипт...');
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Используем функцию создания транскрипта напрямую
        const settings = getServerSettings(interaction.guild.id);
        const transcriptChannelId = settings.transcriptChannelId;
        
        let messageCollection = new Collection();
        let channelMessages = await channel.messages.fetch({ limit: 100 });
        messageCollection = messageCollection.concat(channelMessages);

        let lastMessage = channelMessages.last();
        while(channelMessages.size === 100 && lastMessage) {
            let lastMessageId = lastMessage.id;
            channelMessages = await channel.messages.fetch({ limit: 100, before: lastMessageId });
            if(channelMessages && channelMessages.size > 0) {
                messageCollection = messageCollection.concat(channelMessages);
                lastMessage = channelMessages.last();
            } else break;
        }

        const allMessages = Array.from(messageCollection.values()).reverse();
        
        const ticketInfo = await collectTicketInfo(channel, messageCollection);
        const ticketReport = generateTicketReport(ticketInfo);
        ticketReport.messageCount = allMessages.length;
        
        const transcriptId = generateTranscriptId();
        
        const htmlContent = createHTMLTranscript(ticketReport, allMessages);
        
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
        
        const baseUrl = getBaseUrl();
        const transcriptUrl = `${baseUrl}/transcript/${transcriptId}`;
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('📄 Open Transcript')
                    .setURL(transcriptUrl)
                    .setStyle(ButtonStyle.Link)
            );
        
        const ticketInfoEmbed = createTicketInfoEmbedWithParticipants(ticketReport);
        
        const transcriptChannel = client.channels.cache.get(transcriptChannelId);
        
        if (transcriptChannel && transcriptChannel.isTextBased()) {
            await transcriptChannel.send({
                embeds: [ticketInfoEmbed],
                components: [row],
                content: `📋 **Transcript Created**\n**ID:** \`${transcriptId}\``
            });
            
            await channel.send('✅ Транскрипт создан!');
        }

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
                { name: '📄 Транскрипт', value: `[Открыть транскрипт](${transcriptUrl})`, inline: false }
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
            await interaction.reply({ content: '❌ Ошибка при удалении заявки!', flags: 64 });
        }
    }
});

// ==================== ОБРАБОТЧИКИ СОБЫТИЙ БОТА ====================

client.on('ready', async () => {
    console.log(`✅ Bot has logged in as ${client.user.tag}`);
    setCustomStatus();
    setInterval(setCustomStatus, 5 * 1000);
    
    // Регистрируем слеш-команды
    await registerSlashCommands();
    
    const transcriptChannel = client.channels.cache.get(TRANSCRIPT_CHANNEL_ID);
    if (transcriptChannel) {
        console.log(`✅ Transcript channel found: #${transcriptChannel.name}`);
    } else {
        console.log(`❌ Transcript channel not found! Check ID: ${TRANSCRIPT_CHANNEL_ID}`);
    }
});

function setCustomStatus() {
    const statuses = [
        { name: 'BeKuT Пидор', type: ActivityType.Playing, status: 'online' },
        { name: 'BeKuT Пидор', type: ActivityType.Watching, status: 'online' },
        { name: 'BeKuT Пидор', type: ActivityType.Listening, status: 'online' }
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
        // Проверка кулдауна
        const cooldownKey = `${user.id}-${reaction.message.id}`;
        if (translationCooldown.has(cooldownKey)) return;
        translationCooldown.add(cooldownKey);
        setTimeout(() => translationCooldown.delete(cooldownKey), TRANSLATION_COOLDOWN_TIME);
        
        try {
            if (reaction.partial) await reaction.fetch();
            const message = reaction.message;
            if (message.system) return;
            
            // ВАЖНО: Проверяем настройки сервера и канала
            if (!message.guild) return;
            
            // Получаем настройки сервера
            const settings = getServerSettings(message.guild.id);
            
            // Проверяем, включен ли авто-перевод глобально
            if (!settings.translationEnabled) {
                console.log(`🚫 Translation disabled globally in guild: ${message.guild.name}`);
                return;
            }
            
            // Проверяем, не отключен ли перевод в этом канале
            if (settings.disabledTranslationChannels.includes(message.channel.id)) {
                console.log(`🚫 Translation disabled in channel: ${message.channel.name} (${message.channel.id})`);
                // НЕ удаляем реакцию, просто выходим
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
                    // НЕ удаляем реакцию, просто выходим
                    return;
                }
            }
            
            console.log(`✅ Translation allowed for message in channel: ${message.channel.name}`);
            
            // Остальной код перевода...
            const originalText = message.content;
            if (!originalText || originalText.trim().length === 0) return;
            
            const detectedLang = detectLanguage(originalText);
            let targetLang, flagEmoji, languageName;
            
            if (reaction.emoji.name === '🇷🇺') {
                targetLang = 'ru'; 
                flagEmoji = '🇷🇺'; 
                languageName = 'Русский';
            } else {
                targetLang = 'en'; 
                flagEmoji = '🇬🇧'; 
                languageName = 'Английский';
            }
            
            const sourceLang = detectedLang === 'ru' ? 'ru' : 'en';
            if (sourceLang === targetLang) {
                // Только для одинаковых языков удаляем реакцию (бесполезная реакция)
                setTimeout(async () => {
                    try { 
                        await reaction.users.remove(user.id); 
                    } catch (error) {}
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
/* client.on('messageCreate', async (message) => {
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
/* client.on('messageCreate', async message => {
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
  */
// Обработка реакций для перевода
client.on('messageReactionAdd', async (reaction, user) => {
    if (reaction.emoji.name === '🇷🇺' || reaction.emoji.name === '🇬🇧') {
        // Проверка кулдауна
        const cooldownKey = `${user.id}-${reaction.message.id}`;
        if (translationCooldown.has(cooldownKey)) return;
        translationCooldown.add(cooldownKey);
        setTimeout(() => translationCooldown.delete(cooldownKey), TRANSLATION_COOLDOWN_TIME);
        
        try {
            if (reaction.partial) await reaction.fetch();
            const message = reaction.message;
            if (message.system) return;
            
            // ВАЖНО: Проверяем настройки сервера и канала
            if (!message.guild) return;
            
            // Получаем настройки сервера
            const settings = getServerSettings(message.guild.id);
            
            // Проверяем, включен ли авто-перевод глобально
            if (!settings.translationEnabled) {
                console.log(`🚫 Translation disabled globally in guild: ${message.guild.name}`);
                return;
            }
            
            // Проверяем, не отключен ли перевод в этом канале
            if (settings.disabledTranslationChannels.includes(message.channel.id)) {
                console.log(`🚫 Translation disabled in channel: ${message.channel.name} (${message.channel.id})`);
                // НЕ удаляем реакцию, просто выходим
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
                    // НЕ удаляем реакцию, просто выходим
                    return;
                }
            }
            
            console.log(`✅ Translation allowed for message in channel: ${message.channel.name}`);
            
            // Остальной код перевода...
            const originalText = message.content;
            if (!originalText || originalText.trim().length === 0) return;
            
            const detectedLang = detectLanguage(originalText);
            let targetLang, flagEmoji, languageName;
            
            if (reaction.emoji.name === '🇷🇺') {
                targetLang = 'ru'; 
                flagEmoji = '🇷🇺'; 
                languageName = 'Русский';
            } else {
                targetLang = 'en'; 
                flagEmoji = '🇬🇧'; 
                languageName = 'Английский';
            }
            
            const sourceLang = detectedLang === 'ru' ? 'ru' : 'en';
            if (sourceLang === targetLang) {
                // Только для одинаковых языков удаляем реакцию (бесполезная реакция)
                setTimeout(async () => {
                    try { 
                        await reaction.users.remove(user.id); 
                    } catch (error) {}
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
    console.log('✅ Permissions system initialized');
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
