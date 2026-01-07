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
import { setTimeout as setTimeoutAsync } from 'timers/promises';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// ⬇️⬇️⬇️ ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ ⬇️⬇️⬇️
const token = process.env.DISCORD_TOKEN;
const TRANSCRIPT_CHANNEL_ID = process.env.TRANSCRIPT_CHANNEL_ID || '1430613860473114805';
const PORT = process.env.PORT || 3000;
const RAILWAY_STATIC_URL = process.env.RAILWAY_STATIC_URL;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;

// ==================== ПУТИ ДЛЯ СОХРАНЕНИЯ ====================
const DATA_DIR = process.env.NODE_ENV === 'production' ? '/data' : './data';
const SETTINGS_FILE = join(DATA_DIR, 'settings.json');
const TRANSCRIPTS_DIR = join(DATA_DIR, 'transcripts');

// Создаем директории если не существуют
function ensureDirs() {
    if (!existsSync(DATA_DIR)) {
        mkdirSync(DATA_DIR, { recursive: true });
        console.log(`📁 Создана директория для данных: ${DATA_DIR}`);
    }
    if (!existsSync(TRANSCRIPTS_DIR)) {
        mkdirSync(TRANSCRIPTS_DIR, { recursive: true });
        console.log(`📁 Создана директория для транскриптов: ${TRANSCRIPTS_DIR}`);
    }
}
ensureDirs();

// Функция сохранения всех настроек
function saveAllSettings() {
    try {
        const settings = {
            commandSettings: Object.fromEntries(commandSettingsStorage),
            transcriptsStorage: Object.fromEntries(transcriptsStorage),
            commandPermissions: Object.fromEntries(commandPermissions),
            moderationSettings: Object.fromEntries(moderationSettings),
            serverSettings: Object.fromEntries(serverSettings),
            autoDeleteSettings: Object.fromEntries(autoDeleteSettings),
            voiceRegionSettings: Object.fromEntries(voiceRegionSettings),
            ticketSettings: Object.fromEntries(ticketSettings),
            voiceRegionSettings: Object.fromEntries(voiceRegionSettings),
            lastSave: new Date().toISOString()
        };
        
        writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
        console.log('💾 Все настройки сохранены');
    } catch (error) {
        console.error('❌ Ошибка сохранения настроек:', error);
    }
}

// Функция загрузки настроек
function loadAllSettings() {
    try {
        if (!existsSync(SETTINGS_FILE)) {
            console.log('📁 Файл настроек не найден, создаю новый');
            return;
        }
        
        const data = readFileSync(SETTINGS_FILE, 'utf8');
        const settings = JSON.parse(data);
        
        // Восстанавливаем Map из объектов
        if (settings.commandSettings) {
            commandSettingsStorage = new Map(Object.entries(settings.commandSettings));
        }
        if (settings.transcriptsStorage) {
            transcriptsStorage = new Map(Object.entries(settings.transcriptsStorage));
        }
        if (settings.commandPermissions) {
            commandPermissions = new Map(Object.entries(settings.commandPermissions));
        }
        if (settings.moderationSettings) {
            moderationSettings = new Map(Object.entries(settings.moderationSettings));
        }
        if (settings.serverSettings) {
            serverSettings = new Map(Object.entries(settings.serverSettings));
        }
        if (settings.autoDeleteSettings) {
            autoDeleteSettings = new Map(Object.entries(settings.autoDeleteSettings));
        }
        if (settings.voiceRegionSettings) {
            voiceRegionSettings = new Map(Object.entries(settings.voiceRegionSettings));
        }
        if (settings.ticketSettings) {
            ticketSettings = new Map(Object.entries(settings.ticketSettings));
        }
        
        console.log(`✅ Настройки загружены из ${SETTINGS_FILE}`);
    } catch (error) {
        console.error('❌ Ошибка загрузки настроек:', error);
    }
}

// ДОБАВЬТЕ эти переменные для тикетов
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID;
const MODERATOR_ROLE_IDS = process.env.MODERATOR_ROLE_IDS?.split(',').map(id => id.trim()) || [];
const TICKET_CHANNEL_NAME_TEMPLATE = process.env.TICKET_CHANNEL_NAME_TEMPLATE || "ticket-{username}";

// ДОБАВЬТЕ эти переменные для разрешений команд
const REGION_COMMAND_ALLOWED_ROLES = process.env.REGION_COMMAND_ALLOWED_ROLES?.split(',').map(id => id.trim()) || [];

// Проверка наличия токена
if (!token) {
    console.error('❌ CRITICAL ERROR: DISCORD_TOKEN not found!');
    console.log('💡 Set DISCORD_TOKEN in Railway Variables');
    process.exit(1);
}

console.log('✅ Token loaded successfully');

function loadAllTranscripts() {
    console.log('🔍 Ищу сохраненные транскрипты...');
    
    // Список возможных мест где могут быть транскрипты
    const possibleDirs = [
        TRANSCRIPTS_DIR,
        '/data/transcripts',
        '/tmp/data/transcripts',
        '/tmp/transcripts',
        './data/transcripts',
        join(process.cwd(), 'data', 'transcripts')
    ];
    
    let loadedCount = 0;
    
    for (const dir of possibleDirs) {
        try {
            if (existsSync(dir)) {
                const files = readdirSync(dir)
                    .filter(file => file.endsWith('.json'))
                    .map(file => join(dir, file));
                
                console.log(`📁 Найдено ${files.length} файлов в ${dir}`);
                
                for (const file of files) {
                    try {
                        const data = JSON.parse(readFileSync(file, 'utf8'));
                        transcriptsStorage.set(data.id, {
                            html: data.html,
                            createdAt: data.createdAt,
                            ticketInfo: data.ticketInfo
                        });
                        loadedCount++;
                        console.log(`✅ Загружен транскрипт: ${data.id}`);
                    } catch (error) {
                        console.error(`❌ Ошибка загрузки файла ${file}:`, error.message);
                    }
                }
            }
        } catch (error) {
            console.log(`❌ Не могу проверить ${dir}: ${error.message}`);
        }
    }
    
    console.log(`📊 Итого загружено ${loadedCount} транскриптов`);
    console.log(`📊 В памяти: ${transcriptsStorage.size} транскриптов`);
    
    return loadedCount;
}

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
    },
    // КОМАНДЫ МОДЕРАЦИИ:
    {
        name: 'ban',
        description: 'Забанить пользователя',
        options: [
            {
                name: 'пользователь',
                description: 'Пользователь для бана',
                type: 6, // USER
                required: true
            },
            {
                name: 'причина',
                description: 'Причина бана',
                type: 3, // STRING
                required: false
            },
            {
                name: 'дни',
                description: 'Удалить сообщения за последние дни',
                type: 4, // INTEGER
                required: false,
                min_value: 0,
                max_value: 7
            }
        ]
    },

{
    name: 'bans',
    description: 'Показать список забаненных пользователей',
    options: [
        {
            name: 'страница',
            description: 'Номер страницы',
            type: 4, // INTEGER
            required: false,
            min_value: 1
        }
    ]
},
    {
        name: 'kick',
        description: 'Кикнуть пользователя',
        options: [
            {
                name: 'пользователь',
                description: 'Пользователь для кика',
                type: 6, // USER
                required: true
            },
            {
                name: 'причина',
                description: 'Причина кика',
                type: 3, // STRING
                required: false
            }
        ]
    },
    {
        name: 'mute',
        description: 'Заглушить пользователя',
        options: [
            {
                name: 'пользователь',
                description: 'Пользователь для мута',
                type: 6, // USER
                required: true
            },
            {
                name: 'время',
                description: 'Время мута (1m, 1h, 1d)',
                type: 3, // STRING
                required: true
            },
            {
                name: 'причина',
                description: 'Причина мута',
                type: 3, // STRING
                required: false
            }
        ]
    },
    {
        name: 'unmute',
        description: 'Снять мут с пользователя',
        options: [
            {
                name: 'пользователь',
                description: 'Пользователь для размута',
                type: 6, // USER
                required: true
            },
            {
                name: 'причина',
                description: 'Причина размута',
                type: 3, // STRING
                required: false
            }
        ]
    },
    {
        name: 'warn',
        description: 'Выдать предупреждение',
        options: [
            {
                name: 'пользователь',
                description: 'Пользователь для предупреждения',
                type: 6, // USER
                required: true
            },
            {
                name: 'причина',
                description: 'Причина предупреждения',
                type: 3, // STRING
                required: true
            }
        ]
    },
    {
        name: 'warnings',
        description: 'Посмотреть предупреждения пользователя',
        options: [
            {
                name: 'пользователь',
                description: 'Пользователь',
                type: 6, // USER
                required: true
            }
        ]
    },
    {
        name: 'clearwarns',
        description: 'Очистить предупреждения',
        options: [
            {
                name: 'пользователь',
                description: 'Пользователь',
                type: 6, // USER
                required: true
            }
        ]
    },

{
    name: 'clear',
    description: 'Удалить сообщения в канале',
    options: [
        {
            name: 'количество',
            description: 'Количество сообщений для удаления (1-100)',
            type: 4, // INTEGER
            required: true,
            min_value: 1,
            max_value: 100
        },
        {
            name: 'пользователь',
            description: 'Удалить сообщения только от этого пользователя',
            type: 6, // USER
            required: false
        },
        {
            name: 'сообщения_старше',
            description: 'Удалить сообщения старше указанного времени (в днях)',
            type: 4, // INTEGER
            required: false,
            min_value: 1,
            max_value: 14
        }
    ]
},

  
    {
        name: 'modsetup',
        description: 'Настройка системы модерации',
        options: [
            {
                name: 'канал',
                description: 'Канал для логов модерации',
                type: 7, // CHANNEL
                required: false
            },
            {
                name: 'роль',
                description: 'Роль для мута',
                type: 8, // ROLE
                required: false
            },
            {
                name: 'статус',
                description: 'Включить/выключить авто-модерацию',
                type: 5, // BOOLEAN
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

// ==================== ФУНКЦИИ ====================

function getBaseUrl() {
    // Используем Railway URL если доступен, иначе localhost для разработки
    return process.env.RAILWAY_STATIC_URL || 
           process.env.NODE_ENV === 'production' ? 
           `https://panel-haki.up.railway.app` : 
           `http://localhost:${PORT}`;
}
// Функция для получения разрешений сервера
function getGuildPermissions(guildId) {
    const savedPerms = commandPermissions.get(guildId) || {};
    return savedPerms;
}

// Функция для сохранения разрешений (здесь можно добавить сохранение в файл/БД)
function savePermissions() {
    // Сохраняем в переменную окружения (упрощенный вариант)
    const perms = {};
    for (const [guildId, guildPerms] of commandPermissions) {
        perms[guildId] = guildPerms;
    }
    return perms;
}

// Проверка аутентификации
function requireAuth(req, res, next) {
    if (req.session.isAuthenticated) {
        return next();
    }
    res.redirect('/');
}

// Проверка прав администратора
function requireAdmin(req, res, next) {
    if (req.session.isAuthenticated) {
        // Проверяем, является ли пользователь администратором сервера
        const guildId = req.params.guildId || req.body.guildId;
        const userGuilds = req.session.guilds || [];
        
        // Если запрос связан с конкретным сервером, проверяем права администратора в нем
        if (guildId) {
            const userGuild = userGuilds.find(g => g.id === guildId);
            if (userGuild && (userGuild.permissions & 0x8) === 0x8) {
                return next();
            }
        } else {
            // Для общих страниц проверяем наличие хотя бы одного сервера с правами администратора
            const hasAdminGuild = userGuilds.some(g => (g.permissions & 0x8) === 0x8);
            if (hasAdminGuild) {
                return next();
            }
        }
    }
    
    // Если не прошли проверку - перенаправляем на главную
    res.redirect('/');
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
        sameSite: 'lax',
        httpOnly: true
    },
    store: new session.MemoryStore(),
    proxy: process.env.NODE_ENV === 'production' // Важно для Railway
}));

// ==================== МАРШРУТЫ АВТОРИЗАЦИИ ====================
// Маршрут для входа через Discord OAuth2
app.get('/auth/discord', (req, res) => {
    const state = Math.random().toString(36).substring(7);
    req.session.authState = state;
    
    const baseUrl = getBaseUrl();
    const redirectUri = `${baseUrl}/auth/callback`;
    
    console.log(`🔗 OAuth2 Redirect URI: ${redirectUri}`);
    console.log(`📱 Client ID: ${CLIENT_ID ? '✅ Set' : '❌ Missing'}`);
    console.log(`🔒 Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Проверка обязательных переменных
    if (!CLIENT_ID || !CLIENT_SECRET) {
        console.error('❌ Discord OAuth2 credentials missing!');
        return res.send(createErrorPage(
            'Ошибка конфигурации',
            'Discord OAuth2 не настроен. Проверьте переменные окружения.'
        ));
    }
    
    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'identify guilds',
        state: state,
        prompt: 'consent'
    });
    
    const oauthUrl = `https://discord.com/oauth2/authorize?${params}`;
    console.log(`🌐 Redirecting to OAuth2 URL`);
    
    res.redirect(oauthUrl);
});
// Callback от Discord
app.get('/auth/callback', async (req, res) => {
    const { code, state } = req.query;
    
    console.log('=== OAuth2 Callback Start ===');
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('Code:', code ? '✅ Received' : '❌ Missing');
    console.log('State:', state);
    console.log('Session state:', req.session.authState);
    
    if (!code || !state || state !== req.session.authState) {
        console.log('❌ Invalid OAuth2 callback parameters');
        return res.redirect('/');
    }
    
    try {
        const baseUrl = getBaseUrl();
        const redirectUri = `${baseUrl}/auth/callback`;
        
        console.log(`🔄 Processing OAuth2 token exchange`);
        console.log(`📤 Redirect URI: ${redirectUri}`);
        
        // Получаем токен
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
                timeout: 10000 // Добавляем timeout
            }
        );

      // Маршрут для выхода
app.get('/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Session destroy error:', err);
        }
        res.redirect('/');
    });
});

// Маршрут для ошибки авторизации
app.get('/auth/error', (req, res) => {
    res.send(createErrorPage(
        'Ошибка авторизации',
        'Не удалось выполнить вход через Discord. Проверьте настройки OAuth2.'
    ));
});
        
        console.log('✅ Token received successfully');
        
        const { access_token, token_type } = tokenResponse.data;
        
        // Получаем информацию о пользователе
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: {
                Authorization: `${token_type} ${access_token}`
            }
        });
        
        // Получаем сервера пользователя
        const guildsResponse = await axios.get('https://discord.com/api/users/@me/guilds', {
            headers: {
                Authorization: `${token_type} ${access_token}`
            }
        });
        
        // Сохраняем в сессии
        req.session.isAuthenticated = true;
        req.session.user = userResponse.data;
        req.session.guilds = guildsResponse.data;
        req.session.accessToken = access_token;
        req.session.tokenType = token_type;
        
        console.log(`✅ User authenticated: ${userResponse.data.username}`);
        console.log(`🏰 User has ${guildsResponse.data.length} guilds`);
        
        // Очищаем state из сессии
        delete req.session.authState;
        
        res.redirect('/');
        
    } catch (error) {
        console.error('❌ Auth error details:');
        console.error('Status:', error.response?.status);
        console.error('Data:', error.response?.data);
        console.error('Message:', error.message);
        
        // Отладочная информация
        console.log('=== Debug Info ===');
        console.log('CLIENT_ID:', CLIENT_ID ? 'Set' : 'Missing');
        console.log('CLIENT_SECRET:', CLIENT_SECRET ? 'Set' : 'Missing');
        console.log('Base URL:', getBaseUrl());
        
        // Перенаправляем на страницу с ошибкой
        res.redirect('/auth/error');
    }
});

// ==================== СТРАНИЦЫ ====================

app.get('/', (req, res) => {
    const baseUrl = getBaseUrl();
    
    if (!req.session.isAuthenticated) {
        return res.send(createUnauthorizedPage(baseUrl));
    }

    const user = req.session.user;
    const guilds = req.session.guilds || [];
    
    // Фильтруем только те сервера, где пользователь администратор
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
        // 1. Проверяем, что пользователь состоит в этом сервере и является админом
        const userGuilds = req.session.guilds || [];
        const userGuild = userGuilds.find(g => g.id === guildId);
        
        if (!userGuild) {
            return res.status(403).send(createErrorPage(
                'Доступ запрещен',
                'Вы не являетесь участником этого сервера.'
            ));
        }
        
        if ((userGuild.permissions & 0x8) !== 0x8) {
            return res.status(403).send(createErrorPage(
                'Доступ запрещен',
                'Требуются права администратора сервера.'
            ));
        }
        
        console.log(`🔍 Loading permissions page for guild: ${guildId}, user: ${user.username}`);
        
        // 2. Получаем информацию о сервере из данных сессии (уже получены при OAuth)
        const guild = {
            id: guildId,
            name: userGuild.name || `Сервер (${guildId})`,
            icon: userGuild.icon ? 
                `https://cdn.discordapp.com/icons/${guildId}/${userGuild.icon}.png?size=256` : 
                null,
            approximate_member_count: userGuild.approximate_member_count || 0
        };
        
        // 3. Получаем роли через Discord.js бота (если бот на сервере)
        let roles = [];
        let botInGuild = false;
        
        try {
            // Проверяем, есть ли бот на сервере через Discord.js
            const discordGuild = client.guilds.cache.get(guildId);
            
            if (discordGuild) {
                botInGuild = true;
                console.log(`✅ Бот найден на сервере: ${discordGuild.name}`);
                
                // Получаем роли с сервера
                const guildRoles = discordGuild.roles.cache
                    .filter(role => role.name !== '@everyone')
                    .map(role => ({
                        id: role.id,
                        name: role.name,
                        color: role.color,
                        members: role.members?.size || 0,
                        position: role.position
                    }))
                    .sort((a, b) => b.position - a.position);
                
                roles = guildRoles;
                console.log(`✅ Получено ${roles.length} ролей с сервера`);
                
                // Обновляем количество участников
                guild.approximate_member_count = discordGuild.memberCount;
            } else {
                console.log(`⚠️ Бот не найден на сервере ${guildId}`);
                
                // Если бота нет на сервере, показываем предупреждение и mock роли
                const mockRoles = [
                    { id: 'admin-role', name: 'Администраторы', color: 15158332, members: 0, position: 100 },
                    { id: 'mod-role', name: 'Модераторы', color: 3066993, members: 0, position: 90 },
                    { id: 'member-role', name: 'Участники', color: 3447003, members: 0, position: 1 }
                ];
                
                roles = mockRoles;
            }
        } catch (botError) {
            console.error('❌ Ошибка при получении данных через бота:', botError.message);
            
            // Fallback: mock роли
            const mockRoles = [
                { id: 'role1', name: 'Администраторы', color: 15158332, members: 0, position: 100 },
                { id: 'role2', name: 'Модераторы', color: 3066993, members: 0, position: 90 },
                { id: 'role3', name: 'Пользователи', color: 3447003, members: 0, position: 1 }
            ];
            
            roles = mockRoles;
        }
        
        // 4. Получаем текущие разрешения из памяти
        const permissions = getGuildPermissions(guildId);
        
        // 5. Добавляем информацию о боте в данные
        guild.botInGuild = botInGuild;
        
        // 6. Отправляем страницу
        res.send(createGuildPermissionsPage(user, guild, roles, permissions, baseUrl));
        
    } catch (error) {
        console.error('❌ Critical error in permissions route:', error);
        
        res.status(500).send(createErrorPage(
            'Внутренняя ошибка',
            'Произошла непредвиденная ошибка при загрузке страницы настроек.'
        ));
    }
});

app.get('/guild/:guildId/settings', requireAdmin, async (req, res) => {
    const guildId = req.params.guildId;
    const baseUrl = getBaseUrl();
    const user = req.session.user;
    
    try {
        // 1. Проверяем, что пользователь состоит в этом сервере и является админом
        const userGuilds = req.session.guilds || [];
        const userGuild = userGuilds.find(g => g.id === guildId);
        
        if (!userGuild) {
            return res.status(403).send(createErrorPage(
                'Доступ запрещен',
                'Вы не являетесь участником этого сервера.'
            ));
        }
        
        if ((userGuild.permissions & 0x8) !== 0x8) {
            return res.status(403).send(createErrorPage(
                'Доступ запрещен',
                'Требуются права администратора сервера.'
            ));
        }
        
        console.log(`🔍 Loading settings page for guild: ${guildId}, user: ${user.username}`);
        
        // 2. Получаем информацию о сервере
        const guild = {
            id: guildId,
            name: userGuild.name || `Сервер (${guildId})`,
            icon: userGuild.icon ? 
                `https://cdn.discordapp.com/icons/${guildId}/${userGuild.icon}.png?size=256` : 
                null,
            approximate_member_count: userGuild.approximate_member_count || 0
        };
        
        // 3. Проверяем, есть ли бот на сервере
        let botInGuild = false;
        let botMember = null;
        
        try {
            const discordGuild = client.guilds.cache.get(guildId);
            if (discordGuild) {
                botInGuild = true;
                botMember = discordGuild.members.me;
                guild.approximate_member_count = discordGuild.memberCount;
            }
        } catch (error) {
            console.error('Error checking bot presence:', error);
        }
        
        // 4. Получаем настройки сервера
        const serverSettings = getServerSettings(guildId);
        
        // 5. Отправляем страницу настроек
        res.send(createGuildSettingsPage(user, guild, serverSettings, botInGuild, baseUrl));
        
    } catch (error) {
        console.error('❌ Critical error in guild settings route:', error);
        
        res.status(500).send(createErrorPage(
            'Внутренняя ошибка',
            'Произошла непредвиденная ошибка при загрузке страницы настроек.'
        ));
    }
});

// Добавьте новый маршрут для управления ролями
app.get('/guild/:guildId/roles', requireAdmin, async (req, res) => {
    const guildId = req.params.guildId;
    const baseUrl = getBaseUrl();
    const user = req.session.user;
    
    try {
        // 1. Проверяем права администратора
        const userGuilds = req.session.guilds || [];
        const userGuild = userGuilds.find(g => g.id === guildId);
        
        if (!userGuild || (userGuild.permissions & 0x8) !== 0x8) {
            return res.status(403).send(createErrorPage(
                'Доступ запрещен',
                'Требуются права администратора сервера.'
            ));
        }
        
        // 2. Получаем информацию о сервере
        const guildInfo = {
            id: guildId,
            name: userGuild.name || `Сервер (${guildId})`,
            icon: userGuild.icon ? 
                `https://cdn.discordapp.com/icons/${guildId}/${userGuild.icon}.png?size=256` : 
                null,
            approximate_member_count: userGuild.approximate_member_count || 0
        };
        
        // 3. Проверяем наличие бота на сервере
        const discordGuild = client.guilds.cache.get(guildId);
        let botInGuild = false;
        let members = [];
        let roles = [];
        
        if (discordGuild) {
            botInGuild = true;
            guildInfo.approximate_member_count = discordGuild.memberCount;
            
            // Получаем участников (первые 50 для скорости)
            const guildMembers = await discordGuild.members.fetch({ limit: 50 });
            members = Array.from(guildMembers.values())
                .filter(member => !member.user.bot)
                .map(member => ({
                    id: member.id,
                    username: member.user.username,
                    discriminator: member.user.discriminator,
                    tag: member.user.tag,
                    avatar: member.user.displayAvatarURL({ format: 'png', size: 64 }),
                    roles: member.roles.cache
                        .filter(role => role.name !== '@everyone')
                        .map(role => role.id)
                }));
            
            // Получаем роли
            roles = discordGuild.roles.cache
                .filter(role => role.name !== '@everyone')
                .map(role => ({
                    id: role.id,
                    name: role.name,
                    color: role.color,
                    members: role.members?.size || 0,
                    position: role.position,
                    managed: role.managed,
                    hoist: role.hoist
                }))
                .sort((a, b) => b.position - a.position);
        }
        
        // 4. Получаем настройки модерации
        const modSettings = getModerationSettings(guildId);
        
        // 5. Отправляем страницу
        res.send(createRolesManagementPage(user, guildInfo, members, roles, modSettings, botInGuild, baseUrl));
        
    } catch (error) {
        console.error('❌ Error in roles route:', error);
        res.status(500).send(createErrorPage(
            'Внутренняя ошибка',
            'Произошла непредвиденная ошибка при загрузке страницы.'
        ));
    }
});

app.get('/guild/:guildId/moderation', requireAdmin, async (req, res) => {
    const guildId = req.params.guildId;
    const baseUrl = getBaseUrl();
    const user = req.session.user;
    
    try {
        // Проверка прав
        const userGuilds = req.session.guilds || [];
        const userGuild = userGuilds.find(g => g.id === guildId);
        
        if (!userGuild || (userGuild.permissions & 0x8) !== 0x8) {
            return res.status(403).send(createErrorPage(
                'Доступ запрещен',
                'Требуются права администратора сервера.'
            ));
        }
        
        // Получаем информацию о сервере
        const guildInfo = {
            id: guildId,
            name: userGuild.name || `Сервер (${guildId})`,
            icon: userGuild.icon ? 
                `https://cdn.discordapp.com/icons/${guildId}/${userGuild.icon}.png?size=256` : 
                null
        };
        
        // Проверяем наличие бота
        const discordGuild = client.guilds.cache.get(guildId);
        let botInGuild = false;
        let roles = [];
        let channels = [];
        
        if (discordGuild) {
            botInGuild = true;
            
            // Получаем роли
            roles = discordGuild.roles.cache
                .filter(role => role.name !== '@everyone')
                .map(role => ({
                    id: role.id,
                    name: role.name,
                    color: role.color,
                    members: role.members?.size || 0,
                    position: role.position
                }))
                .sort((a, b) => b.position - a.position);
            
            // Получаем текстовые каналы
            channels = discordGuild.channels.cache
                .filter(ch => ch.type === ChannelType.GuildText)
                .map(channel => ({
                    id: channel.id,
                    name: channel.name,
                    parent: channel.parent?.name || null
                }))
                .sort((a, b) => a.name.localeCompare(b.name));
        }
        
        // Получаем настройки модерации
        const modSettings = getModerationSettings(guildId);
        
        // Создаем HTML страницу настроек модерации
        const html = createModerationSettingsPage(
            user, 
            guildInfo, 
            modSettings, 
            roles, 
            channels, 
            botInGuild, 
            baseUrl
        );
        res.send(html);
        
    } catch (error) {
        console.error('Error in moderation route:', error);
        res.status(500).send(createErrorPage(
            'Внутренняя ошибка',
            'Произошла непредвиденная ошибка при загрузке страницы.'
        ));
    }
});

// Страница управления сервером
app.get('/server/:guildId/manage', requireAdmin, async (req, res) => {
    const guildId = req.params.guildId;
    const baseUrl = getBaseUrl();
    const user = req.session.user;
    
    try {
        // Проверка прав
        const userGuilds = req.session.guilds || [];
        const userGuild = userGuilds.find(g => g.id === guildId);
        
        if (!userGuild || (userGuild.permissions & 0x8) !== 0x8) {
            return res.status(403).send(createErrorPage(
                'Доступ запрещен',
                'Требуются права администратора сервера.'
            ));
        }
        
        // Получаем информацию о сервере
        const guild = {
            id: guildId,
            name: userGuild.name || `Сервер (${guildId})`,
            icon: userGuild.icon ? 
                `https://cdn.discordapp.com/icons/${guildId}/${userGuild.icon}.png?size=256` : 
                null,
            approximate_member_count: userGuild.approximate_member_count || 0
        };
        
        res.send(createServerManagementPage(user, guild, baseUrl));
        
    } catch (error) {
        console.error('Error in server management route:', error);
        res.status(500).send(createErrorPage(
            'Внутренняя ошибка',
            'Произошла непредвиденная ошибка.'
        ));
    }
});

// Страница управления правами
app.get('/server/:guildId/manage/permissions', requireAdmin, async (req, res) => {
    const guildId = req.params.guildId;
    const user = req.session.user;
    
    try {
        // Получаем роли сервера
        const discordGuild = client.guilds.cache.get(guildId);
        let roles = [];
        
        if (discordGuild) {
            roles = discordGuild.roles.cache
                .filter(role => role.name !== '@everyone')
                .map(role => ({
                    id: role.id,
                    name: role.name,
                    color: role.color,
                    members: role.members?.size || 0,
                    position: role.position
                }))
                .sort((a, b) => b.position - a.position);
        }
        
        // Получаем текущие разрешения
        const permissions = getGuildPermissions(guildId);
        
        // Доступные команды для настройки
        const availableCommands = [
            { id: 'region', name: '/регион', icon: '🌍', description: 'Управление регионами голосовых серверов' },
            { id: 'transcript', name: '/transcript', icon: '📄', description: 'Создание транскриптов каналов' },
            { id: 'ticket', name: '/ticket', icon: '🎫', description: 'Настройка системы тикетов' }
        ];
        
        // HTML для страницы прав
        const html = `
            <div style="background: var(--surface); border-radius: 15px; border: 1px solid var(--border); padding: 30px;">
                <div style="display: flex; align-items: center; gap: 20px; margin-bottom: 30px;">
                    <div style="font-size: 2.5rem;">🔐</div>
                    <div>
                        <h2 style="font-size: 1.8rem; color: var(--text); margin-bottom: 5px;">Управление правами</h2>
                        <p style="color: var(--text-secondary);">Настройте доступ к командам бота на этом сервере</p>
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
                                <div style="margin-bottom: 30px;">
                                    <h3 style="font-size: 1.5rem; color: var(--text); margin-bottom: 10px;">${cmd.icon} ${cmd.name}</h3>
                                    <p style="color: var(--text-secondary);">${cmd.description}</p>
                                </div>
                                
                                <div style="margin-bottom: 25px; padding: 15px; background: var(--surface-dark); border-radius: 10px; color: var(--text-secondary);">
                                    💡 Выберите роли, которым будет разрешено использовать команду <strong>${cmd.name}</strong>. Если ни одна роль не выбрана, команду смогут использовать только администраторы сервера.
                                </div>
                                
                                <div style="max-height: 400px; overflow-y: auto; margin-bottom: 30px; padding-right: 10px;">
                                    ${roles.length > 0 ? roles.map(role => {
                                        const isChecked = permissions[cmd.id] && permissions[cmd.id].includes(role.id);
                                        return `
                                            <div style="display: flex; align-items: center; padding: 15px; margin-bottom: 10px; background: var(--surface-light); border-radius: 10px; border: 1px solid var(--border);">
                                                <div style="width: 20px; height: 20px; border-radius: 50%; background-color: #${role.color.toString(16).padStart(6, '0') || '5865F2'}; margin-right: 15px;"></div>
                                                <div style="flex: 1; font-weight: 600; color: var(--text);">${role.name}</div>
                                                <div style="color: var(--text-secondary); margin-right: 20px; font-size: 0.9rem;">${role.members} участников</div>
                                                <div style="width: 24px; height: 24px; border-radius: 6px; border: 2px solid var(--border); background: ${isChecked ? 'var(--primary)' : 'var(--surface-dark)'}; cursor: pointer; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;" 
                                                    onclick="toggleRole('${cmd.id}', '${role.id}')">
                                                    ${isChecked ? '✓' : ''}
                                                </div>
                                            </div>
                                        `;
                                    }).join('') : '<p style="text-align: center; color: var(--text-secondary); padding: 30px;">Роли не найдены</p>'}
                                </div>
                                
                                <div style="background: var(--surface-dark); padding: 25px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center;">
                                    <div style="color: var(--text-secondary);">
                                        Выбрано: <strong id="selected-count-${cmd.id}">${permissions[cmd.id] ? permissions[cmd.id].length : 0}</strong> из ${roles.length} ролей
                                    </div>
                                    <button style="background: var(--success); color: white; padding: 12px 25px; border-radius: 10px; border: none; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 10px;" 
                                            onclick="savePermissions('${cmd.id}', '${guildId}')">
                                        💾 Сохранить
                                    </button>
                                </div>
                                
                                <div id="message-${cmd.id}" style="margin-top: 20px;"></div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            
            <script>
                // Хранилище выбранных ролей
                const selectedRoles = {
                    ${availableCommands.map(cmd => `'${cmd.id}': ${JSON.stringify(permissions[cmd.id] || [])}`).join(',\n                    ')}
                };
                
                function toggleRole(commandId, roleId) {
                    const index = selectedRoles[commandId].indexOf(roleId);
                    if (index === -1) {
                        selectedRoles[commandId].push(roleId);
                    } else {
                        selectedRoles[commandId].splice(index, 1);
                    }
                    updateSelectedCount(commandId);
                    location.reload();
                }
                
                function updateSelectedCount(commandId) {
                    const countElement = document.getElementById('selected-count-' + commandId);
                    countElement.textContent = selectedRoles[commandId].length;
                }
                
                async function savePermissions(commandId, guildId) {
                    try {
                        const response = await fetch('/api/permissions/' + guildId, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                commandName: commandId,
                                roleIds: selectedRoles[commandId]
                            })
                        });
                        
                        if (response.ok) {
                            alert('✅ Настройки сохранены!');
                        } else {
                            alert('❌ Ошибка сохранения');
                        }
                    } catch (error) {
                        alert('❌ Ошибка: ' + error.message);
                    }
                }
                
                // Инициализация
                ${availableCommands.map(cmd => `updateSelectedCount('${cmd.id}');`).join('\n                ')}
            </script>
        `;
        
        res.send(html);
        
    } catch (error) {
        console.error('Permissions page error:', error);
        res.status(500).send('<div style="color: var(--danger); text-align: center; padding: 40px;">Ошибка загрузки страницы</div>');
    }
});

// Страница модерации
app.get('/server/:guildId/manage/moderation', requireAdmin, async (req, res) => {
    const guildId = req.params.guildId;
    
    try {
        const discordGuild = client.guilds.cache.get(guildId);
        let roles = [];
        let channels = [];
        
        if (discordGuild) {
            roles = discordGuild.roles.cache
                .filter(role => role.name !== '@everyone')
                .map(role => ({
                    id: role.id,
                    name: role.name,
                    color: role.color,
                    members: role.members?.size || 0,
                    position: role.position
                }))
                .sort((a, b) => b.position - a.position);
            
            channels = discordGuild.channels.cache
                .filter(ch => ch.type === ChannelType.GuildText)
                .map(channel => ({
                    id: channel.id,
                    name: channel.name,
                    parent: channel.parent?.name || null
                }))
                .sort((a, b) => a.name.localeCompare(b.name));
        }
        
        const modSettings = getModerationSettings(guildId);
        
        const html = `
            <div style="background: var(--surface); border-radius: 15px; border: 1px solid var(--border); padding: 30px;">
                <div style="display: flex; align-items: center; gap: 20px; margin-bottom: 30px;">
                    <div style="font-size: 2.5rem;">🛡️</div>
                    <div>
                        <h2 style="font-size: 1.8rem; color: var(--text); margin-bottom: 5px;">Настройки модерации</h2>
                        <p style="color: var(--text-secondary);">Управление автоматической модерацией и настройками</p>
                    </div>
                </div>
                
                <form id="moderation-form">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 25px; margin-bottom: 30px;">
                        <!-- Основные настройки -->
                        <div style="background: var(--surface-light); padding: 25px; border-radius: 12px; border: 1px solid var(--border);">
                            <h3 style="color: var(--text); margin-bottom: 20px;">⚙️ Основные настройки</h3>
                            
                            <div style="margin-bottom: 20px;">
                                <label style="display: block; color: var(--text); margin-bottom: 8px; font-weight: 600;">Включить модерацию</label>
                                <label style="display: inline-flex; align-items: center; cursor: pointer;">
                                    <input type="checkbox" id="mod-enabled" ${modSettings.enabled ? 'checked' : ''} style="margin-right: 10px;">
                                    <span style="color: var(--text-secondary);">Активировать систему модерации</span>
                                </label>
                            </div>
                            
                            <div style="margin-bottom: 20px;">
                                <label style="display: block; color: var(--text); margin-bottom: 8px; font-weight: 600;">Канал для логов</label>
                                <select id="log-channel" style="width: 100%; padding: 10px; background: var(--surface-dark); border: 1px solid var(--border); border-radius: 8px; color: var(--text);">
                                    <option value="">Не выбран</option>
                                    ${channels.map(ch => `<option value="${ch.id}" ${ch.id === modSettings.logChannel ? 'selected' : ''}>#${ch.name}</option>`).join('')}
                                </select>
                            </div>
                            
                            <div>
                                <label style="display: block; color: var(--text); margin-bottom: 8px; font-weight: 600;">Роль для мута</label>
                                <select id="mute-role" style="width: 100%; padding: 10px; background: var(--surface-dark); border: 1px solid var(--border); border-radius: 8px; color: var(--text);">
                                    <option value="">Не выбрана</option>
                                    ${roles.map(role => `<option value="${role.id}" ${role.id === modSettings.muteRole ? 'selected' : ''}>${role.name}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        
                        <!-- Авто-модерация -->
                        <div style="background: var(--surface-light); padding: 25px; border-radius: 12px; border: 1px solid var(--border);">
                            <h3 style="color: var(--text); margin-bottom: 20px;">🤖 Авто-модерация</h3>
                            
                            ${Object.entries({
                                'auto-spam': 'Обнаружение спама',
                                'auto-caps': 'Обнаружение КАПСА',
                                'auto-invites': 'Блокировка приглашений',
                                'auto-bad-words': 'Фильтр плохих слов'
                            }).map(([id, label]) => `
                                <div style="margin-bottom: 15px;">
                                    <label style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                                        <span style="color: var(--text);">${label}</span>
                                        <input type="checkbox" id="${id}" ${modSettings.autoMod && modSettings.autoMod[id.replace('auto-', '')] ? 'checked' : ''} 
                                               style="transform: scale(1.2);">
                                    </label>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    
                    <div style="background: var(--surface-dark); padding: 25px; border-radius: 12px; text-align: center;">
                        <button type="button" onclick="saveModerationSettings('${guildId}')" 
                                style="background: var(--success); color: white; padding: 15px 35px; border-radius: 10px; border: none; font-size: 1rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 10px;">
                            💾 Сохранить настройки
                        </button>
                    </div>
                </form>
                
                <div id="mod-message" style="margin-top: 20px;"></div>
            </div>
            
            <script>
                async function saveModerationSettings(guildId) {
                    const settings = {
                        enabled: document.getElementById('mod-enabled').checked,
                        logChannel: document.getElementById('log-channel').value,
                        muteRole: document.getElementById('mute-role').value,
                        autoMod: {
                            enabled: true,
                            spam: document.getElementById('auto-spam').checked,
                            caps: document.getElementById('auto-caps').checked,
                            inviteLinks: document.getElementById('auto-invites').checked,
                            badWords: document.getElementById('auto-bad-words').checked
                        }
                    };
                    
                    try {
                        const response = await fetch('/api/guild/' + guildId + '/moderation', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(settings)
                        });
                        
                        const data = await response.json();
                        
                        if (data.success) {
                            alert('✅ Настройки модерации сохранены!');
                        } else {
                            alert('❌ Ошибка: ' + data.error);
                        }
                    } catch (error) {
                        alert('❌ Ошибка: ' + error.message);
                    }
                }
            </script>
        `;
        
        res.send(html);
        
    } catch (error) {
        console.error('Moderation page error:', error);
        res.status(500).send('<div style="color: var(--danger); text-align: center; padding: 40px;">Ошибка загрузки страницы</div>');
    }
});

// Страница настройки команд
// Страница настройки команд (ИСПРАВЛЕННАЯ ВЕРСИЯ)
app.get('/server/:guildId/manage/commands', requireAdmin, async (req, res) => {
    const guildId = req.params.guildId;
    const baseUrl = getBaseUrl();
    
    try {
        const discordGuild = client.guilds.cache.get(guildId);
        const botInGuild = discordGuild ? true : false;
        
        // Получаем все слеш-команды
        const allCommands = [
            // Команды модерации
            { 
                id: 'ban', 
                name: '/ban', 
                icon: '🔨', 
                category: 'Модерация',
                description: 'Бан пользователя',
                enabled: true,
                defaultRole: 'moderator'
            },
            { 
                id: 'kick', 
                name: '/kick', 
                icon: '👢', 
                category: 'Модерация',
                description: 'Кик пользователя',
                enabled: true,
                defaultRole: 'moderator'
            },
            { 
                id: 'mute', 
                name: '/mute', 
                icon: '🔇', 
                category: 'Модерация',
                description: 'Временный мут пользователя',
                enabled: true,
                defaultRole: 'moderator'
            },
            { 
                id: 'clear', 
                name: '/clear', 
                icon: '🗑️', 
                category: 'Модерация',
                description: 'Очистка сообщений',
                enabled: true,
                defaultRole: 'moderator'
            },
            { 
                id: 'warn', 
                name: '/warn', 
                icon: '⚠️', 
                category: 'Модерация',
                description: 'Выдать предупреждение',
                enabled: true,
                defaultRole: 'moderator'
            },
            
            // Команды управления
            { 
                id: 'transcript', 
                name: '/transcript', 
                icon: '📄', 
                category: 'Управление',
                description: 'Создание транскриптов',
                enabled: true,
                defaultRole: 'admin'
            },
            { 
                id: 'ticket', 
                name: '/ticket', 
                icon: '🎫', 
                category: 'Управление',
                description: 'Настройка системы тикетов',
                enabled: true,
                defaultRole: 'admin'
            },
            { 
                id: 'region', 
                name: '/регион', 
                icon: '🌍', 
                category: 'Управление',
                description: 'Управление голосовыми регионами',
                enabled: true,
                defaultRole: 'admin'
            },
            
            // Радио команды
            { 
                id: 'play', 
                name: '/play', 
                icon: '🎵', 
                category: 'Радио',
                description: 'Включить радиостанцию',
                enabled: true,
                defaultRole: 'everyone'
            },
            { 
                id: 'stop', 
                name: '/stop', 
                icon: '⏹️', 
                category: 'Радио',
                description: 'Выключить радио',
                enabled: true,
                defaultRole: 'everyone'
            },
            
            // Информационные команды
            { 
                id: 'stats', 
                name: '/стат', 
                icon: '📊', 
                category: 'Информация',
                description: 'Статистика War Thunder',
                enabled: true,
                defaultRole: 'everyone'
            },
            { 
                id: 'regiment', 
                name: '/полк', 
                icon: '🏰', 
                category: 'Информация',
                description: 'Информация о полке',
                enabled: true,
                defaultRole: 'everyone'
            },
            
            // Утилиты
            { 
                id: 'ping', 
                name: '/ping', 
                icon: '🏓', 
                category: 'Утилиты',
                description: 'Проверка работоспособности бота',
                enabled: true,
                defaultRole: 'everyone'
            }
        ];
        
        // Получаем настройки команд
        const commandSettings = getCommandSettings(guildId);
        
        // Группируем команды по категориям
        const commandsByCategory = {};
        allCommands.forEach(cmd => {
            if (!commandsByCategory[cmd.category]) {
                commandsByCategory[cmd.category] = [];
            }
            const settings = commandSettings[cmd.id] || {};
            commandsByCategory[cmd.category].push({
                ...cmd,
                enabled: settings.enabled !== undefined ? settings.enabled : cmd.enabled,
                roles: settings.roles || []
            });
        });
        
        // Получаем роли сервера
        let roles = [];
        if (discordGuild) {
            roles = discordGuild.roles.cache
                .filter(role => role.name !== '@everyone')
                .map(role => ({
                    id: role.id,
                    name: role.name,
                    color: role.color,
                    members: role.members?.size || 0
                }))
                .sort((a, b) => b.position - a.position);
        }
        
        const html = `
            <div style="background: var(--surface); border-radius: 15px; border: 1px solid var(--border); padding: 30px;">
                <div style="display: flex; align-items: center; gap: 20px; margin-bottom: 30px;">
                    <div style="font-size: 2.5rem;">⚙️</div>
                    <div>
                        <h2 style="font-size: 1.8rem; color: var(--text); margin-bottom: 5px;">Настройка команд</h2>
                        <p style="color: var(--text-secondary);">Включение/выключение и настройка прав доступа к командам</p>
                    </div>
                </div>
                
                ${!botInGuild ? `
                    <div style="background: linear-gradient(135deg, var(--warning) 0%, rgba(254, 231, 92, 0.1) 100%); border: 1px solid var(--warning); color: var(--text); padding: 15px; border-radius: 10px; margin-bottom: 30px; display: flex; align-items: center; gap: 15px;">
                        <div>⚠️</div>
                        <div>
                            <strong>Внимание:</strong> Бот не добавлен на этот сервер. 
                            Настройки команд будут применены после добавления бота.
                        </div>
                    </div>
                ` : ''}
                
                <div style="margin-bottom: 30px;">
                    <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px;">
                        <input type="text" id="command-search" placeholder="🔍 Поиск команды..." 
                               style="flex: 1; padding: 12px 20px; background: var(--surface-light); border: 1px solid var(--border); border-radius: 10px; color: var(--text); font-size: 1rem;">
                        <div style="color: var(--text-secondary); font-size: 0.9rem;">
                            Всего команд: ${allCommands.length}
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 15px; margin-bottom: 20px; flex-wrap: wrap;">
                        <button onclick="showAllCommands()" class="category-btn active" id="btn-all">Все команды</button>
                        ${Object.keys(commandsByCategory).map(category => `
                            <button onclick="filterByCategory('${category}')" class="category-btn" id="btn-${category}">
                                ${category} (${commandsByCategory[category].length})
                            </button>
                        `).join('')}
                    </div>
                </div>
                
                <div id="commands-container">
                    ${Object.entries(commandsByCategory).map(([category, commands]) => `
                        <div class="command-category" id="category-${category}" data-category="${category}">
                            <h3 style="color: var(--text); margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid var(--border);">
                                ${category}
                            </h3>
                            
                            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 20px; margin-bottom: 40px;">
                                ${commands.map(cmd => {
                                    const currentSettings = commandSettings[cmd.id] || {};
                                    const currentRoles = currentSettings.roles || [];
                                    
                                    return `
                                    <div class="command-card" id="cmd-${cmd.id}" data-command-id="${cmd.id}">
                                        <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px;">
                                            <div style="font-size: 1.8rem;">${cmd.icon}</div>
                                            <div style="flex: 1;">
                                                <div style="font-weight: 700; color: var(--text); font-size: 1.1rem;" class="command-name">${cmd.name}</div>
                                                <div style="color: var(--text-secondary); font-size: 0.9rem;" class="command-desc">${cmd.description}</div>
                                            </div>
                                            <label class="switch">
                                                <input type="checkbox" id="toggle-${cmd.id}" ${cmd.enabled ? 'checked' : ''} 
                                                       onchange="toggleCommand('${cmd.id}', '${guildId}')">
                                                <span class="slider"></span>
                                            </label>
                                        </div>
                                        
                                        <div id="details-${cmd.id}" class="command-details" style="display: none;">
                                            <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--border);">
                                                <div style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 10px;">
                                                    Права доступа:
                                                </div>
                                                
                                                ${roles.length > 0 ? `
                                                    <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 15px;">
                                                        ${roles.map(role => {
                                                            const isChecked = currentRoles.includes(role.id);
                                                            return `
                                                            <label class="role-tag" data-role-id="${role.id}" data-command-id="${cmd.id}" style="cursor: pointer;">
                                                                <input type="checkbox" 
                                                                       value="${role.id}" 
                                                                       ${isChecked ? 'checked' : ''}
                                                                       style="display: none;">
                                                                <span class="role-tag-label" style="padding: 5px 12px; background: ${isChecked ? 'var(--primary)' : 'var(--surface-light)'}; border: 1px solid ${isChecked ? 'var(--primary)' : 'var(--border)'}; border-radius: 15px; color: ${isChecked ? 'white' : 'var(--text)'}; font-size: 0.85rem; transition: all 0.2s;">
                                                                    ${role.name}
                                                                </span>
                                                            </label>
                                                            `;
                                                        }).join('')}
                                                    </div>
                                                ` : `
                                                    <div style="color: var(--text-secondary); padding: 10px; background: var(--surface-light); border-radius: 8px; text-align: center; font-size: 0.9rem;">
                                                        Роли не найдены
                                                    </div>
                                                `}
                                                
                                                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px;">
                                                    <button onclick="saveCommandRoles('${cmd.id}', '${guildId}')" 
                                                            style="padding: 8px 15px; background: var(--primary); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.9rem;">
                                                        💾 Сохранить роли
                                                    </button>
                                                    
                                                    <button onclick="resetCommandSettings('${cmd.id}', '${guildId}')" 
                                                            style="padding: 8px 15px; background: var(--surface-light); color: var(--text); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; font-size: 0.9rem;">
                                                        Сбросить
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div style="text-align: center; margin-top: 15px;">
                                            <button onclick="toggleCommandDetails('${cmd.id}')" 
                                                    class="details-btn" id="btn-details-${cmd.id}">
                                                <span>⚙️</span>
                                                Настройки
                                            </button>
                                        </div>
                                    </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
                
                <div style="background: var(--surface-dark); padding: 25px; border-radius: 12px; margin-top: 30px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="color: var(--text); font-weight: 600; margin-bottom: 5px;">💡 Управление всеми командами</div>
                            <div style="color: var(--text-secondary); font-size: 0.9rem;">
                                Быстрое включение/выключение всех команд
                            </div>
                        </div>
                        <div style="display: flex; gap: 10px;">
                            <button onclick="enableAllCommands('${guildId}')" 
                                    style="padding: 12px 25px; background: var(--success); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                                ✅ Включить все
                            </button>
                            <button onclick="disableAllCommands('${guildId}')" 
                                    style="padding: 12px 25px; background: var(--danger); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                                ❌ Выключить все
                            </button>
                        </div>
                    </div>
                </div>
                
                <div id="command-message" style="margin-top: 20px;"></div>
            </div>
            
            <style>
                .category-btn {
                    padding: 10px 20px;
                    background: var(--surface-light);
                    color: var(--text);
                    border: 1px solid var(--border);
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 600;
                    transition: all 0.3s ease;
                    border: none;
                }
                
                .category-btn:hover {
                    background: var(--surface-dark);
                    border-color: var(--primary);
                }
                
                .category-btn.active {
                    background: var(--primary);
                    color: white;
                    border-color: var(--primary);
                }
                
                .command-card {
                    background: var(--surface-light);
                    padding: 20px;
                    border-radius: 12px;
                    border: 1px solid var(--border);
                    transition: all 0.3s ease;
                }
                
                .command-card:hover {
                    border-color: var(--primary);
                    transform: translateY(-3px);
                    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
                }
                
                .switch {
                    position: relative;
                    display: inline-block;
                    width: 50px;
                    height: 26px;
                }
                
                .switch input {
                    opacity: 0;
                    width: 0;
                    height: 0;
                }
                
                .slider {
                    position: absolute;
                    cursor: pointer;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background-color: var(--surface-dark);
                    transition: .4s;
                    border-radius: 34px;
                    border: 1px solid var(--border);
                }
                
                .slider:before {
                    position: absolute;
                    content: "";
                    height: 18px;
                    width: 18px;
                    left: 4px;
                    bottom: 3px;
                    background-color: white;
                    transition: .4s;
                    border-radius: 50%;
                }
                
                input:checked + .slider {
                    background-color: var(--success);
                }
                
                input:checked + .slider:before {
                    transform: translateX(22px);
                }
                
                .details-btn {
                    padding: 8px 15px;
                    background: transparent;
                    color: var(--primary);
                    border: 1px solid var(--primary);
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 0.9rem;
                    display: inline-flex;
                    align-items: center;
                    gap: 5px;
                    transition: all 0.3s ease;
                }
                
                .details-btn:hover {
                    background: var(--primary);
                    color: white;
                }
            </style>
            
            <script>
                // Функции для управления командами
                async function toggleCommand(commandId, guildId) {
                    const checkbox = document.getElementById('toggle-' + commandId);
                    const enabled = checkbox.checked;
                    
                    try {
                        const response = await fetch('/api/commands/' + guildId + '/toggle', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ commandId, enabled })
                        });
                        
                        const data = await response.json();
                        showMessage(data.success ? '✅ Команда обновлена' : '❌ Ошибка', data.success);
                    } catch (error) {
                        showMessage('❌ Ошибка: ' + error.message, false);
                    }
                }
                
                function toggleCommandDetails(commandId) {
                    const details = document.getElementById('details-' + commandId);
                    const button = document.getElementById('btn-details-' + commandId);
                    
                    if (details.style.display === 'none') {
                        details.style.display = 'block';
                        button.innerHTML = '<span>🔧</span> Скрыть настройки';
                    } else {
                        details.style.display = 'none';
                        button.innerHTML = '<span>⚙️</span> Настройки';
                    }
                }
                
                async function saveCommandRoles(commandId, guildId) {
                    const checkboxes = document.querySelectorAll('[data-command-id="' + commandId + '"] input[type="checkbox"]:checked');
                    const roleIds = Array.from(checkboxes).map(cb => cb.value);
                    
                    try {
                        const response = await fetch('/api/commands/' + guildId + '/roles', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ commandId, roleIds })
                        });
                        
                        const data = await response.json();
                        showMessage(data.success ? '✅ Роли сохранены' : '❌ Ошибка', data.success);
                    } catch (error) {
                        showMessage('❌ Ошибка: ' + error.message, false);
                    }
                }
                
                async function resetCommandSettings(commandId, guildId) {
                    if (!confirm('Сбросить настройки этой команды к значениям по умолчанию?')) return;
                    
                    try {
                        const response = await fetch('/api/commands/' + guildId + '/reset', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ commandId })
                        });
                        
                        const data = await response.json();
                        
                        if (data.success) {
                            showMessage('✅ Настройки сброшены', true);
                            setTimeout(() => location.reload(), 1000);
                        } else {
                            showMessage('❌ Ошибка: ' + data.error, false);
                        }
                    } catch (error) {
                        showMessage('❌ Ошибка: ' + error.message, false);
                    }
                }
                
                async function enableAllCommands(guildId) {
                    if (!confirm('Включить все команды на этом сервере?')) return;
                    
                    try {
                        const response = await fetch('/api/commands/' + guildId + '/enable-all', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' }
                        });
                        
                        const data = await response.json();
                        
                        if (data.success) {
                            showMessage('✅ Все команды включены', true);
                            setTimeout(() => location.reload(), 1000);
                        }
                    } catch (error) {
                        showMessage('❌ Ошибка: ' + error.message, false);
                    }
                }
                
                async function disableAllCommands(guildId) {
                    if (!confirm('Выключить все команды на этом сервере?')) return;
                    
                    try {
                        const response = await fetch('/api/commands/' + guildId + '/disable-all', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' }
                        });
                        
                        const data = await response.json();
                        
                        if (data.success) {
                            showMessage('❌ Все команды выключены', true);
                            setTimeout(() => location.reload(), 1000);
                        }
                    } catch (error) {
                        showMessage('❌ Ошибка: ' + error.message, false);
                    }
                }
                
                // Поиск команд
                document.addEventListener('DOMContentLoaded', function() {
                    const searchInput = document.getElementById('command-search');
                    if (searchInput) {
                        searchInput.addEventListener('input', function(e) {
                            const searchTerm = e.target.value.toLowerCase().trim();
                            const commandCards = document.querySelectorAll('.command-card');
                            
                            if (searchTerm === '') {
                                // Показываем все карточки если поиск пустой
                                commandCards.forEach(card => {
                                    card.style.display = 'block';
                                });
                                return;
                            }
                            
                            commandCards.forEach(card => {
                                const commandName = card.querySelector('.command-name').textContent.toLowerCase();
                                const commandDesc = card.querySelector('.command-desc').textContent.toLowerCase();
                                
                                if (commandName.includes(searchTerm) || commandDesc.includes(searchTerm)) {
                                    card.style.display = 'block';
                                } else {
                                    card.style.display = 'none';
                                }
                            });
                        });
                    }
                    
                    // Обработчики для ролей
                    document.querySelectorAll('.role-tag').forEach(tag => {
                        tag.addEventListener('click', function(e) {
                            e.preventDefault();
                            const checkbox = this.querySelector('input[type="checkbox"]');
                            checkbox.checked = !checkbox.checked;
                            
                            const label = this.querySelector('.role-tag-label');
                            if (checkbox.checked) {
                                label.style.background = 'var(--primary)';
                                label.style.borderColor = 'var(--primary)';
                                label.style.color = 'white';
                            } else {
                                label.style.background = 'var(--surface-light)';
                                label.style.borderColor = 'var(--border)';
                                label.style.color = 'var(--text)';
                            }
                        });
                    });
                });
                
                // Фильтрация по категориям
                function showAllCommands() {
                    document.querySelectorAll('.command-category').forEach(cat => {
                        cat.style.display = 'block';
                    });
                    
                    document.querySelectorAll('.category-btn').forEach(btn => {
                        btn.classList.remove('active');
                    });
                    document.getElementById('btn-all').classList.add('active');
                }
                
                function filterByCategory(category) {
                    document.querySelectorAll('.command-category').forEach(cat => {
                        if (cat.dataset.category === category) {
                            cat.style.display = 'block';
                        } else {
                            cat.style.display = 'none';
                        }
                    });
                    
                    document.querySelectorAll('.category-btn').forEach(btn => {
                        btn.classList.remove('active');
                    });
                    document.getElementById('btn-' + category).classList.add('active');
                }
                
                // Показать сообщение
                function showMessage(text, isSuccess) {
                    const messageDiv = document.getElementById('command-message');
                    messageDiv.innerHTML = \`
                        <div style="padding: 15px; border-radius: 10px; background: \${isSuccess ? 'rgba(87, 242, 135, 0.2)' : 'rgba(237, 66, 69, 0.2)'}; border: 1px solid \${isSuccess ? 'var(--success)' : 'var(--danger)'}; color: \${isSuccess ? 'var(--success)' : 'var(--danger)'};">
                            \${text}
                        </div>
                    \`;
                    
                    setTimeout(() => {
                        messageDiv.innerHTML = '';
                    }, 3000);
                }
            </script>
        `;
        
        res.send(html);
        
    } catch (error) {
        console.error('Commands page error:', error);
        res.status(500).send(`
            <div style="color: var(--danger); text-align: center; padding: 40px;">
                ❌ Ошибка загрузки страницы: ${error.message}
            </div>
        `);
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
// API для выдачи роли
app.post('/api/guild/:guildId/roles/:userId', requireAdmin, express.json(), async (req, res) => {
    const { guildId, userId } = req.params;
    const { roleId, action } = req.body; // action: 'add' или 'remove'
    
    if (!roleId || !action) {
        return res.status(400).json({ error: 'Неверные данные' });
    }
    
    try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            return res.status(404).json({ error: 'Сервер не найден' });
        }
        
        const member = await guild.members.fetch(userId);
        const role = guild.roles.cache.get(roleId);
        
        if (!member || !role) {
            return res.status(404).json({ error: 'Участник или роль не найдены' });
        }
        
        if (action === 'add') {
            await member.roles.add(role);
        } else if (action === 'remove') {
            await member.roles.remove(role);
        } else {
            return res.status(400).json({ error: 'Неверное действие' });
        }
        
        res.json({ 
            success: true, 
            message: `Роль ${role.name} ${action === 'add' ? 'выдана' : 'снята'} у ${member.user.tag}` 
        });
        
    } catch (error) {
        console.error('Role management error:', error);
        res.status(500).json({ error: error.message });
    }
});

// API для обновления настроек модерации
app.post('/api/guild/:guildId/moderation', requireAdmin, express.json(), async (req, res) => {
    const { guildId } = req.params;
    const settings = req.body;
    
    try {
        const currentSettings = getModerationSettings(guildId);
        
        // Обновляем настройки с проверками
        const updatedSettings = {
            ...currentSettings,
            enabled: settings.enabled !== undefined ? settings.enabled : currentSettings.enabled,
            logChannel: settings.logChannel || currentSettings.logChannel,
            muteRole: settings.muteRole || currentSettings.muteRole,
            autoMod: {
                ...(currentSettings.autoMod || DEFAULT_MODERATION_SETTINGS.autoMod),
                ...(settings.autoMod || {})
            },
            autoModThresholds: {
                ...(currentSettings.autoModThresholds || DEFAULT_MODERATION_SETTINGS.autoModThresholds),
                ...(settings.autoModThresholds || {})
            }
        };
        
        saveModerationSettings(guildId, updatedSettings);
        
        res.json({ 
            success: true, 
            message: 'Настройки модерации сохранены',
            settings: updatedSettings 
        });
        
    } catch (error) {
        console.error('Moderation settings error:', error);
        res.status(500).json({ error: error.message });
    }
});


// ==================== API МАРШРУТЫ ====================

// API для управления командами
const commandSettingsStorage = new Map();

// Функция получения настроек команд с дефолтными значениями
function getCommandSettings(guildId) {
    if (!commandSettingsStorage.has(guildId)) {
        // Настройки по умолчанию
        const defaultSettings = {
            'ping': { enabled: true, roles: [] },
            'transcript': { enabled: true, roles: [] },
            'settranscript': { enabled: true, roles: [] },
            'transcriptsettings': { enabled: true, roles: [] },
            'translation': { enabled: true, roles: [] },
            'autodelete': { enabled: true, roles: [] },
            'play': { enabled: true, roles: [] },
            'stop': { enabled: true, roles: [] },
            'stations': { enabled: true, roles: [] },
            'testvoice': { enabled: true, roles: [] },
            'сервер': { enabled: true, roles: [] },
            'ticket': { enabled: true, roles: [] },
            'стат': { enabled: true, roles: [] },
            'полк': { enabled: true, roles: [] },
            'регион': { enabled: true, roles: [] },
            'ban': { enabled: true, roles: [] },
            'bans': { enabled: true, roles: [] },
            'kick': { enabled: true, roles: [] },
            'mute': { enabled: true, roles: [] },
            'unmute': { enabled: true, roles: [] },
            'warn': { enabled: true, roles: [] },
            'warnings': { enabled: true, roles: [] },
            'clearwarns': { enabled: true, roles: [] },
            'clear': { enabled: true, roles: [] },
            'modsetup': { enabled: true, roles: [] }
        };
        commandSettingsStorage.set(guildId, defaultSettings);
    }
    return commandSettingsStorage.get(guildId);
}

// Пример для commandSettings
function saveCommandSettings(guildId, settings) {
    commandSettingsStorage.set(guildId, settings);
    console.log(`💾 Command settings saved for guild: ${guildId}`);
    
    // Отложенное сохранение (чтобы не сохранять слишком часто)
    if (!global.saveTimeout) {
        global.saveTimeout = setTimeout(() => {
            saveAllSettings();
            global.saveTimeout = null;
        }, 5000); // Сохраняем через 5 секунд после последнего изменения
    }
}

// Аналогично для других функций:
function saveModerationSettings(guildId, settings) {
    moderationSettings.set(guildId, settings);
    console.log(`💾 Moderation settings saved for guild: ${guildId}`);
    if (!global.saveTimeout) {
        global.saveTimeout = setTimeout(() => {
            saveAllSettings();
            global.saveTimeout = null;
        }, 5000);
    }
    try {
        // Создаем копию настроек
        const settingsToSave = { ...settings };
        
        // Сохраняем warnings как Map
        settingsToSave.warnings = settings.warnings instanceof Map ? settings.warnings : new Map();
        
        // Сохраняем autoMod с проверками
        if (!settingsToSave.autoMod) {
            settingsToSave.autoMod = { ...DEFAULT_MODERATION_SETTINGS.autoMod };
        }
        
        // Сохраняем autoModThresholds с проверками
        if (!settingsToSave.autoModThresholds) {
            settingsToSave.autoModThresholds = { ...DEFAULT_MODERATION_SETTINGS.autoModThresholds };
        }
        
        moderationSettings.set(guildId, settingsToSave);
        console.log(`💾 Moderation settings saved for guild: ${guildId}`);
        console.log(`📊 AutoMod saved:`, settingsToSave.autoMod);
        
        return settingsToSave;
    } catch (error) {
        console.error('❌ Error saving moderation settings:', error);
        return settings;
    }
}

// Включение/выключение команды
app.post('/api/commands/:guildId/toggle', requireAdmin, express.json(), (req, res) => {
    const { guildId } = req.params;
    const { commandId, enabled } = req.body;
    
    try {
        const settings = getCommandSettings(guildId);
        if (!settings[commandId]) {
            settings[commandId] = {};
        }
        settings[commandId].enabled = enabled;
        
        // Логируем изменение
        console.log(`Command ${commandId} ${enabled ? 'enabled' : 'disabled'} for guild ${guildId}`);
        
        res.json({ success: true, message: `Команда ${commandId} ${enabled ? 'включена' : 'выключена'}` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Сохранение ролей для команды
app.post('/api/commands/:guildId/roles', requireAdmin, express.json(), (req, res) => {
    const { guildId } = req.params;
    const { commandId, roleIds } = req.body;
    
    try {
        const settings = getCommandSettings(guildId);
        if (!settings[commandId]) {
            settings[commandId] = {};
        }
        settings[commandId].roles = roleIds;
        
        res.json({ 
            success: true, 
            message: `Роли сохранены для команды ${commandId}`,
            roles: roleIds.length
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Сброс настроек команды
app.post('/api/commands/:guildId/reset', requireAdmin, express.json(), (req, res) => {
    const { guildId } = req.params;
    const { commandId } = req.body;
    
    try {
        const settings = getCommandSettings(guildId);
        delete settings[commandId];
        
        res.json({ 
            success: true, 
            message: `Настройки команды ${commandId} сброшены`
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Включение всех команд
app.post('/api/commands/:guildId/enable-all', requireAdmin, express.json(), (req, res) => {
    const { guildId } = req.params;
    
    try {
        const settings = getCommandSettings(guildId);
        const allCommands = [
            'ban', 'kick', 'mute', 'clear', 'warn',
            'transcript', 'ticket', 'region',
            'play', 'stop',
            'stats', 'regiment', 'ping'
        ];
        
        allCommands.forEach(cmdId => {
            if (!settings[cmdId]) settings[cmdId] = {};
            settings[cmdId].enabled = true;
        });
        
        res.json({ 
            success: true, 
            message: `Все команды включены`,
            count: allCommands.length
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Выключение всех команд
app.post('/api/commands/:guildId/disable-all', requireAdmin, express.json(), (req, res) => {
    const { guildId } = req.params;
    
    try {
        const settings = getCommandSettings(guildId);
        const allCommands = [
            'ban', 'kick', 'mute', 'clear', 'warn',
            'transcript', 'ticket', 'region',
            'play', 'stop',
            'stats', 'regiment', 'ping'
        ];
        
        allCommands.forEach(cmdId => {
            if (!settings[cmdId]) settings[cmdId] = {};
            settings[cmdId].enabled = false;
        });
        
        res.json({ 
            success: true, 
            message: `Все команды выключены`,
            count: allCommands.length
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Получение настроек всех команд
app.get('/api/commands/:guildId', requireAdmin, (req, res) => {
    const { guildId } = req.params;
    const settings = getCommandSettings(guildId);
    
    res.json({ 
        success: true, 
        settings,
        count: Object.keys(settings).length
    });
});

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

    const baseUrl = getBaseUrl();
    
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
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .login-container {
            background: rgba(43, 43, 43, 0.9);
            padding: 50px;
            border-radius: 20px;
            text-align: center;
            max-width: 500px;
            width: 100%;
            border: 1px solid #40444b;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        }
        .logo {
            font-size: 4rem;
            margin-bottom: 20px;
        }
        h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            color: #fff;
        }
        p {
            color: #b9bbbe;
            margin-bottom: 30px;
            font-size: 1.1rem;
            line-height: 1.5;
        }
        .login-btn {
            background: linear-gradient(135deg, #5865F2 0%, #4752C4 100%);
            color: white;
            padding: 20px 40px;
            border: none;
            border-radius: 12px;
            font-size: 1.2rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 15px;
        }
        .login-btn:hover {
            transform: translateY(-3px);
            box-shadow: 0 10px 25px rgba(88, 101, 242, 0.4);
        }
        .discord-icon {
            font-size: 1.5rem;
        }
        @media (max-width: 768px) {
            .login-container {
                padding: 30px 20px;
            }
            .logo {
                font-size: 3rem;
            }
            h1 {
                font-size: 2rem;
            }
        }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="logo">🤖</div>
        <h1>Haki Bot</h1>
        <p>Управляйте настройками бота через удобную веб-панель. Требуется авторизация через Discord.</p>
        
        <a href="/auth/discord" class="login-btn">
            <span class="discord-icon">📱</span>
            Войти через Discord
        </a>
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
        .header {
            background: var(--surface);
            padding: 25px;
            border-bottom: 1px solid var(--border);
            text-align: center;
            margin-bottom: 40px;
        }
        .header h1 {
            font-size: 2.5rem;
            background: linear-gradient(135deg, var(--primary), var(--success));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 10px;
        }
        .user-info {
            display: inline-flex;
            align-items: center;
            gap: 15px;
            background: var(--surface-light);
            padding: 10px 20px;
            border-radius: 12px;
            margin-top: 10px;
        }
        .user-avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            border: 2px solid var(--primary);
        }
        .logout-btn {
            background: var(--danger);
            color: white;
            padding: 8px 15px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: 600;
            font-size: 0.9rem;
            transition: all 0.3s ease;
            margin-left: 10px;
        }
        .logout-btn:hover {
            background: #c93c3e;
            transform: translateY(-2px);
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 20px;
        }
        .page-title {
            font-size: 2rem;
            color: var(--text);
            margin-bottom: 30px;
            text-align: center;
        }
        .servers-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: 25px;
            margin-bottom: 50px;
        }
        .server-card {
            background: var(--surface);
            border-radius: 15px;
            border: 1px solid var(--border);
            overflow: hidden;
            transition: all 0.3s ease;
        }
        .server-card:hover {
            transform: translateY(-5px);
            border-color: var(--primary);
            box-shadow: 0 15px 40px rgba(0, 0, 0, 0.3);
        }
        .server-header {
            padding: 25px;
            background: var(--surface-light);
            display: flex;
            align-items: center;
            gap: 20px;
        }
        .server-icon {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            border: 3px solid var(--surface);
            object-fit: cover;
            flex-shrink: 0;
        }
        .server-icon-placeholder {
            width: 80px;
            height: 80px;
            background: linear-gradient(135deg, var(--primary), var(--primary-dark));
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 2rem;
            color: white;
            border: 3px solid var(--surface);
            flex-shrink: 0;
        }
        .server-info {
            flex: 1;
        }
        .server-name {
            font-size: 1.5rem;
            font-weight: 700;
            color: var(--text);
            margin-bottom: 8px;
        }
        .server-members {
            color: var(--text-secondary);
            font-size: 0.9rem;
            margin-bottom: 10px;
        }
        .server-status {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 0.9rem;
        }
        .bot-status {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 3px 10px;
            border-radius: 15px;
            font-weight: 600;
            font-size: 0.8rem;
        }
        .bot-status.online {
            background: rgba(87, 242, 135, 0.2);
            color: var(--success);
            border: 1px solid var(--success);
        }
        .bot-status.offline {
            background: rgba(237, 66, 69, 0.2);
            color: var(--danger);
            border: 1px solid var(--danger);
        }
        .server-stats {
            display: flex;
            gap: 15px;
            margin-top: 10px;
        }
        .stat {
            text-align: center;
        }
        .stat-value {
            font-size: 1.2rem;
            font-weight: 700;
            color: var(--text);
            display: block;
        }
        .stat-label {
            color: var(--text-secondary);
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .server-actions {
            padding: 20px;
            text-align: center;
        }
        .manage-btn {
            background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
            color: white;
            padding: 15px 30px;
            border-radius: 10px;
            text-decoration: none;
            font-weight: 600;
            font-size: 1rem;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            width: 100%;
            transition: all 0.3s ease;
            border: none;
            cursor: pointer;
        }
        .manage-btn:hover {
            transform: translateY(-3px);
            box-shadow: 0 10px 25px rgba(88, 101, 242, 0.4);
        }
        .manage-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none !important;
        }
        .no-servers {
            grid-column: 1 / -1;
            text-align: center;
            padding: 60px;
            color: var(--text-secondary);
        }
        .no-servers-icon {
            font-size: 5rem;
            margin-bottom: 20px;
            opacity: 0.5;
        }
        .invite-bot {
            background: var(--surface);
            border-radius: 15px;
            padding: 30px;
            text-align: center;
            border: 1px solid var(--border);
            margin-top: 40px;
        }
        .invite-bot h3 {
            font-size: 1.5rem;
            color: var(--text);
            margin-bottom: 15px;
        }
        .invite-btn {
            background: var(--success);
            color: var(--background);
            padding: 12px 25px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 600;
            display: inline-flex;
            align-items: center;
            gap: 10px;
            margin-top: 15px;
            transition: all 0.3s ease;
        }
        .invite-btn:hover {
            background: #4ad175;
            transform: translateY(-2px);
        }
        @media (max-width: 768px) {
            .servers-grid {
                grid-template-columns: 1fr;
            }
            .server-header {
                flex-direction: column;
                text-align: center;
            }
            .server-icon, .server-icon-placeholder {
                margin: 0 auto;
            }
            .header h1 {
                font-size: 2rem;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🤖 Haki Bot Панель управления</h1>
        <div class="user-info">
            <img src="${user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" 
                 alt="${user.username}" class="user-avatar">
            <div>
                <div style="font-weight: bold;">${user.global_name || user.username}</div>
                <div style="color: var(--text-secondary); font-size: 0.9rem;">${user.username}</div>
            </div>
            <a href="/auth/logout" class="logout-btn">🚪 Выйти</a>
        </div>
    </div>

    <div class="container">
        <h2 class="page-title">Ваши серверы</h2>
        
        ${adminGuilds.length === 0 ? `
            <div class="no-servers">
                <div class="no-servers-icon">🏰</div>
                <h3>Нет доступных серверов</h3>
                <p>У вас нет прав администратора ни на одном сервере, где присутствует бот.</p>
            </div>
            
            <div class="invite-bot">
                <h3>📥 Пригласите бота на свой сервер</h3>
                <p style="color: var(--text-secondary); margin-bottom: 15px;">
                    Чтобы использовать панель управления, добавьте бота на ваш сервер с правами администратора.
                </p>
                <a href="https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&scope=bot&permissions=8" 
                   target="_blank" 
                   class="invite-btn">
                    <span>➕</span>
                    Пригласить бота
                </a>
            </div>
        ` : ''}

        <div class="servers-grid">
            ${adminGuilds.map(guild => {
                const botInGuild = client.guilds.cache.has(guild.id);
                const botMember = botInGuild ? client.guilds.cache.get(guild.id).members.me : null;
                const hasAdminPerms = botMember ? botMember.permissions.has('Administrator') : false;
                
                return `
                    <div class="server-card">
                        <div class="server-header">
                            ${guild.icon ? 
                                `<img src="https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=256" alt="${guild.name}" class="server-icon">` :
                                `<div class="server-icon-placeholder">🏰</div>`
                            }
                            <div class="server-info">
                                <div class="server-name">${guild.name}</div>
                                <div class="server-members">${guild.approximate_member_count || '?'} участников</div>
                                
                                <div class="server-status">
                                    <div class="bot-status ${botInGuild ? 'online' : 'offline'}">
                                        ${botInGuild ? '🤖' : '❌'} 
                                        ${botInGuild ? 'Бот на сервере' : 'Бот не добавлен'}
                                    </div>
                                    ${botInGuild && !hasAdminPerms ? 
                                        '<div class="bot-status offline" style="font-size: 0.7rem;">⚠️ Нет прав</div>' : 
                                        ''
                                    }
                                </div>
                                
                                <div class="server-stats">
                                    <div class="stat">
                                        <span class="stat-value">
                                            ${getGuildPermissions(guild.id) ? Object.keys(getGuildPermissions(guild.id)).length : 0}
                                        </span>
                                        <span class="stat-label">Команд</span>
                                    </div>
                                    <div class="stat">
                                        <span class="stat-value">
                                            ${getModerationSettings(guild.id)?.enabled ? '✅' : '❌'}
                                        </span>
                                        <span class="stat-label">Модерация</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="server-actions">
                            ${botInGuild && hasAdminPerms ? `
                                <a href="/server/${guild.id}/manage" class="manage-btn">
                                    <span>⚙️</span>
                                    Управление сервером
                                </a>
                            ` : `
                                <button class="manage-btn" onclick="showBotInvite('${guild.id}')" style="background: var(--danger);">
                                    <span>➕</span>
                                    Добавить бота
                                </button>
                            `}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    </div>

    <script>
        function showBotInvite(guildId) {
            const inviteLink = 'https://discord.com/oauth2/authorize?client_id=' + CLIENT_ID + '&scope=bot&permissions=8&guild_id=' + guildId;
            
            const modal = document.createElement('div');
            modal.style.position = 'fixed';
            modal.style.top = '0';
            modal.style.left = '0';
            modal.style.width = '100%';
            modal.style.height = '100%';
            modal.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            modal.style.display = 'flex';
            modal.style.alignItems = 'center';
            modal.style.justifyContent = 'center';
            modal.style.zIndex = '2000';
            
            modal.innerHTML = [
                '<div style="background: var(--surface); padding: 30px; border-radius: 15px; max-width: 500px; width: 90%; border: 1px solid var(--border);">',
                    '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">',
                        '<h3 style="margin: 0; color: var(--text); font-size: 1.3rem;">🤖 Добавить бота на сервер</h3>',
                        '<button onclick="this.parentElement.parentElement.parentElement.remove()" style="background: none; border: none; color: var(--text-secondary); font-size: 1.5rem; cursor: pointer;">×</button>',
                    '</div>',
                    
                    '<div style="color: var(--text-secondary); margin-bottom: 25px;">',
                        'Для управления сервером боту необходимы администраторские права.',
                    '</div>',
                    
                    '<div style="display: flex; gap: 10px; margin-bottom: 25px;">',
                        '<input type="text" value="' + inviteLink + '" readonly style="flex: 1; padding: 12px; background: var(--surface-light); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-family: monospace; font-size: 0.9rem;">',
                        '<button onclick="copyToClipboard(\'' + inviteLink.replace(/'/g, "\\\\'") + '\')" style="background: var(--primary); color: white; border: none; padding: 0 20px; border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">Копировать</button>',
                    '</div>',
                    
                    '<div style="display: flex; justify-content: flex-end; gap: 10px;">',
                        '<button onclick="this.parentElement.parentElement.parentElement.remove()" style="background: var(--surface-light); color: var(--text); border: 1px solid var(--border); padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">Закрыть</button>',
                        '<a href="' + inviteLink + '" target="_blank" style="background: var(--success); color: var(--background); text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; transition: all 0.3s ease;">Открыть ссылку</a>',
                    '</div>',
                '</div>'
            ].join('');
            
            document.body.appendChild(modal);
        }
        
        function copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(() => {
                const notification = document.createElement('div');
                notification.style.position = 'fixed';
                notification.style.top = '20px';
                notification.style.right = '20px';
                notification.style.background = 'var(--success)';
                notification.style.color = 'white';
                notification.style.padding = '10px 20px';
                notification.style.borderRadius = '8px';
                notification.style.zIndex = '3000';
                notification.textContent = '✅ Ссылка скопирована!';
                
                document.body.appendChild(notification);
                
                setTimeout(() => {
                    notification.remove();
                }, 3000);
            }).catch(err => {
                console.error('Ошибка копирования:', err);
                alert('Не удалось скопировать ссылку. Скопируйте вручную: ' + text);
            });
        }
    </script>
</body>
</html>`;
}

function createServerManagementPage(user, guild, baseUrl) {
    const botInGuild = client.guilds.cache.has(guild.id);
    
    return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${guild.name} - Управление</title>
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
        .layout {
            display: flex;
            min-height: 100vh;
        }
        .sidebar {
            width: 280px;
            background: var(--surface);
            border-right: 1px solid var(--border);
            padding: 20px;
            position: fixed;
            height: 100vh;
            overflow-y: auto;
        }
        .main-content {
            flex: 1;
            margin-left: 280px;
            padding: 30px;
            min-height: 100vh;
        }
        .sidebar-header {
            display: flex;
            align-items: center;
            gap: 15px;
            padding-bottom: 20px;
            border-bottom: 1px solid var(--border);
            margin-bottom: 20px;
        }
        .server-icon-sm {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            border: 2px solid var(--primary);
            flex-shrink: 0;
        }
        .server-icon-placeholder-sm {
            width: 50px;
            height: 50px;
            background: linear-gradient(135deg, var(--primary), var(--primary-dark));
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            border: 2px solid var(--primary);
            flex-shrink: 0;
        }
        .server-info-sm {
            flex: 1;
            min-width: 0;
        }
        .server-name-sm {
            font-weight: 700;
            color: var(--text);
            font-size: 1.1rem;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .server-members-sm {
            color: var(--text-secondary);
            font-size: 0.85rem;
        }
        .nav-section {
            margin-bottom: 30px;
        }
        .section-title {
            color: var(--text-secondary);
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 15px;
            padding-left: 10px;
        }
        .nav-item {
            display: flex;
            align-items: center;
            gap: 15px;
            padding: 15px;
            margin-bottom: 8px;
            background: var(--surface-light);
            border-radius: 10px;
            text-decoration: none;
            color: var(--text);
            border: 1px solid transparent;
            transition: all 0.3s ease;
            cursor: pointer;
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
        .nav-item.disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .nav-item.disabled:hover {
            transform: none;
            border-color: transparent;
            background: var(--surface-light);
        }
        .nav-icon {
            font-size: 1.2rem;
            width: 24px;
            text-align: center;
        }
        .nav-label {
            font-weight: 600;
            font-size: 0.95rem;
        }
        .back-btn {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            color: var(--text);
            text-decoration: none;
            padding: 12px 20px;
            background: var(--surface-light);
            border-radius: 10px;
            border: 1px solid var(--border);
            transition: all 0.3s ease;
            margin-bottom: 30px;
        }
        .back-btn:hover {
            border-color: var(--primary);
            transform: translateX(-5px);
        }
        .page-header {
            margin-bottom: 40px;
        }
        .page-title {
            font-size: 2.5rem;
            font-weight: 800;
            color: var(--text);
            margin-bottom: 10px;
            background: linear-gradient(135deg, var(--primary), var(--success));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .page-subtitle {
            color: var(--text-secondary);
            font-size: 1.1rem;
        }
        .bot-warning {
            background: linear-gradient(135deg, var(--warning) 0%, rgba(254, 231, 92, 0.1) 100%);
            border: 1px solid var(--warning);
            color: var(--text);
            padding: 15px;
            border-radius: 10px;
            margin-bottom: 30px;
            display: flex;
            align-items: center;
            gap: 15px;
        }
        .content-placeholder {
            background: var(--surface);
            border-radius: 15px;
            border: 1px solid var(--border);
            padding: 50px;
            text-align: center;
            color: var(--text-secondary);
        }
        .content-placeholder-icon {
            font-size: 4rem;
            margin-bottom: 20px;
            opacity: 0.5;
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
        @media (max-width: 768px) {
            .mobile-menu-btn {
                display: block;
            }
            .sidebar {
                transform: translateX(-100%);
                transition: transform 0.3s ease;
                z-index: 1000;
            }
            .sidebar.active {
                transform: translateX(0);
            }
            .main-content {
                margin-left: 0;
                padding: 80px 20px 30px;
            }
            .page-title {
                font-size: 2rem;
            }
        }
    </style>
</head>
<body>
    <button class="mobile-menu-btn" onclick="toggleSidebar()">☰</button>
    
    <div class="sidebar" id="sidebar">
        <div class="sidebar-header">
            ${guild.icon ? 
                `<img src="https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=256" alt="${guild.name}" class="server-icon-sm">` :
                `<div class="server-icon-placeholder-sm">🏰</div>`
            }
            <div class="server-info-sm">
                <div class="server-name-sm">${guild.name}</div>
                <div class="server-members-sm">${guild.approximate_member_count || '?'} участников</div>
            </div>
        </div>
        
        <div class="nav-section">
            <div class="section-title">Навигация</div>
            <a href="/" class="nav-item">
                <div class="nav-icon">⬅️</div>
                <div class="nav-label">Назад к серверам</div>
            </a>
        </div>
        
        <div class="nav-section">
            <div class="section-title">Управление сервером</div>
            <a href="/server/${guild.id}/manage/permissions" class="nav-item" id="nav-permissions">
                <div class="nav-icon">🔐</div>
                <div class="nav-label">Управление правами</div>
            </a>
            <a href="/server/${guild.id}/manage/moderation" class="nav-item" id="nav-moderation">
                <div class="nav-icon">🛡️</div>
                <div class="nav-label">Модерация</div>
            </a>
            <a href="/server/${guild.id}/manage/commands" class="nav-item ${!botInGuild ? 'disabled' : ''}" id="nav-commands">
                <div class="nav-icon">⚙️</div>
                <div class="nav-label">Настройка команд</div>
            </a>
        </div>
        
        <div class="nav-section">
            <div class="section-title">Быстрый доступ</div>
            <a href="/admin/transcripts" class="nav-item">
                <div class="nav-icon">📄</div>
                <div class="nav-label">Транскрипты</div>
            </a>
            <a href="/auth/logout" class="nav-item" style="background: rgba(237, 66, 69, 0.2); color: var(--danger); border-color: var(--danger);">
                <div class="nav-icon">🚪</div>
                <div class="nav-label">Выйти</div>
            </a>
        </div>
    </div>
    
    <div class="main-content">
        <div class="page-header">
            <h1 class="page-title" id="page-title">Выберите раздел</h1>
            <p class="page-subtitle" id="page-subtitle">Используйте меню слева для навигации</p>
        </div>
        
        ${!botInGuild ? `
            <div class="bot-warning">
                <div>⚠️</div>
                <div>
                    <strong>Внимание:</strong> Бот не добавлен на этот сервер. 
                    Некоторые функции управления будут недоступны до добавления бота.
                    <div style="margin-top: 10px;">
                        <a href="https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&scope=bot&permissions=8&guild_id=${guild.id}" 
                           target="_blank" 
                           style="color: var(--primary); text-decoration: underline;">
                            Добавить бота на сервер
                        </a>
                    </div>
                </div>
            </div>
        ` : ''}
        
        <div class="content-placeholder" id="content-placeholder">
            <div class="content-placeholder-icon">⚙️</div>
            <h3>Выберите раздел управления</h3>
            <p>Используйте меню слева для перехода к нужному разделу настроек</p>
        </div>
        
        <div id="content-area" style="display: none;">
            <!-- Динамический контент будет загружен здесь -->
        </div>
    </div>

    <script>
        function toggleSidebar() {
            const sidebar = document.getElementById('sidebar');
            sidebar.classList.toggle('active');
        }
        
        // Навигация по разделам
        const navItems = {
            'permissions': {
                title: 'Управление правами',
                subtitle: 'Настройка прав доступа к командам',
                url: '/server/${guild.id}/manage/permissions'
            },
            'moderation': {
                title: 'Настройки модерации',
                subtitle: 'Управление авто-модерацией и модерацией',
                url: '/server/${guild.id}/manage/moderation'
            },
            'commands': {
                title: 'Настройка команд',
                subtitle: 'Конфигурация команд бота',
                url: '/server/${guild.id}/manage/commands'
            }
        };
        
        // Устанавливаем активный пункт меню
        function setActiveNav(itemId) {
            document.querySelectorAll('.nav-item').forEach(item => {
                item.classList.remove('active');
            });
            
            const navItem = document.getElementById('nav-' + itemId);
            if (navItem) {
                navItem.classList.add('active');
            }
        }
        
        // Загрузка контента
        async function loadContent(section) {
            const sectionData = navItems[section];
            if (!sectionData) return;
            
            setActiveNav(section);
            
            document.getElementById('page-title').textContent = sectionData.title;
            document.getElementById('page-subtitle').textContent = sectionData.subtitle;
            document.getElementById('content-placeholder').style.display = 'none';
            document.getElementById('content-area').style.display = 'block';
            
            try {
                const response = await fetch(sectionData.url);
                const html = await response.text();
                document.getElementById('content-area').innerHTML = html;
            } catch (error) {
                document.getElementById('content-area').innerHTML = \`
                    <div class="content-placeholder">
                        <div class="content-placeholder-icon">❌</div>
                        <h3>Ошибка загрузки</h3>
                        <p>Не удалось загрузить содержимое раздела</p>
                    </div>
                \`;
            }
        }
        
        // Обработчики кликов на меню
        document.getElementById('nav-permissions').addEventListener('click', (e) => {
            e.preventDefault();
            loadContent('permissions');
        });
        
        document.getElementById('nav-moderation').addEventListener('click', (e) => {
            e.preventDefault();
            loadContent('moderation');
        });
        
        document.getElementById('nav-commands').addEventListener('click', (e) => {
            e.preventDefault();
            loadContent('commands');
        });
        
        // Закрываем sidebar при клике вне его области на мобильных устройствах
        document.addEventListener('click', (event) => {
            const sidebar = document.getElementById('sidebar');
            const mobileBtn = document.querySelector('.mobile-menu-btn');
            
            if (window.innerWidth <= 768 && sidebar.classList.contains('active')) {
                if (!sidebar.contains(event.target) && !mobileBtn.contains(event.target)) {
                    sidebar.classList.remove('active');
                }
            }
        });
        
        // Автоматически загружаем контент из URL
        const url = window.location.pathname;
        if (url.includes('/permissions')) {
            loadContent('permissions');
        } else if (url.includes('/moderation')) {
            loadContent('moderation');
        } else if (url.includes('/commands')) {
            loadContent('commands');
        }
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
        .logout-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(237, 66, 69, 0.3);
        }
        .header {
            margin-bottom: 40px;
        }
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            background: linear-gradient(135deg, var(--primary), var(--success));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .header p {
            color: var(--text-secondary);
            font-size: 1.1rem;
        }
        .guilds-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: 20px;
        }
        .guild-card {
            background: var(--surface);
            border-radius: 12px;
            border: 1px solid var(--border);
            overflow: hidden;
            transition: all 0.3s ease;
        }
        .guild-card:hover {
            transform: translateY(-5px);
            border-color: var(--primary);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        }
        .guild-header {
            padding: 25px;
            background: var(--surface-light);
            display: flex;
            align-items: center;
            border-bottom: 1px solid var(--border);
        }
        .guild-icon {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            margin-right: 20px;
            object-fit: cover;
        }
        .guild-icon-placeholder {
            width: 60px;
            height: 60px;
            background: linear-gradient(135deg, var(--primary), var(--primary-dark));
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 2rem;
            margin-right: 20px;
            color: white;
        }
        .guild-info {
            flex: 1;
        }
        .guild-name {
            font-weight: 700;
            color: var(--text);
            margin-bottom: 5px;
            font-size: 1.2rem;
        }
        .guild-members {
            color: var(--text-secondary);
            font-size: 0.9rem;
        }
        .guild-stats {
            display: flex;
            gap: 20px;
            margin-top: 10px;
        }
        .guild-stat {
            text-align: center;
        }
        .stat-value {
            font-size: 1.1rem;
            font-weight: 700;
            color: var(--text);
            display: block;
        }
        .stat-label {
            color: var(--text-secondary);
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .guild-actions {
            padding: 20px;
            display: flex;
            gap: 10px;
        }
        .btn {
            padding: 12px 20px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 600;
            font-size: 0.9rem;
            transition: all 0.3s ease;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            flex: 1;
            text-align: center;
        }
        .btn-primary {
            background: var(--primary);
            color: white;
        }
        .btn-primary:hover {
            background: var(--primary-dark);
            transform: translateY(-2px);
        }
        .btn-success {
            background: var(--success);
            color: var(--background);
        }
        .btn-success:hover {
            background: #4ad175;
            transform: translateY(-2px);
        }
        .back-btn {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            color: var(--text);
            text-decoration: none;
            margin-bottom: 30px;
            padding: 12px 20px;
            background: var(--surface-light);
            border-radius: 10px;
            border: 1px solid var(--border);
            transition: all 0.3s ease;
        }
        .back-btn:hover {
            border-color: var(--primary);
            transform: translateX(-5px);
        }
        .no-guilds {
            grid-column: 1 / -1;
            text-align: center;
            padding: 50px;
            color: var(--text-secondary);
            background: var(--surface);
            border-radius: 12px;
            border: 1px solid var(--border);
        }
        .no-guilds-icon {
            font-size: 4rem;
            margin-bottom: 20px;
            opacity: 0.5;
        }
        .bot-warning {
            background: linear-gradient(135deg, var(--warning) 0%, rgba(254, 231, 92, 0.1) 100%);
            border: 1px solid var(--warning);
            color: var(--text);
            padding: 15px;
            border-radius: 10px;
            margin-bottom: 30px;
            display: flex;
            align-items: center;
            gap: 15px;
        }
        .bot-warning-icon {
            font-size: 1.5rem;
        }
        @media (max-width: 1024px) {
            .guilds-grid {
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
            .guilds-grid {
                grid-template-columns: 1fr;
            }
            .header h1 {
                font-size: 2rem;
            }
            .guild-stats {
                flex-wrap: wrap;
                gap: 10px;
            }
        }
        @media (max-width: 480px) {
            .guild-actions {
                flex-direction: column;
            }
            .btn {
                width: 100%;
            }
            .guild-header {
                flex-direction: column;
                text-align: center;
            }
            .guild-icon, .guild-icon-placeholder {
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

        <div style="margin: 25px 0 10px 0; color: var(--text-secondary); font-size: 0.9rem; padding: 0 10px; text-transform: uppercase; letter-spacing: 1px;">Быстрые ссылки</div>
        
        <a href="/admin/transcripts" class="nav-item">
            <span class="nav-icon">📄</span>
            Просмотр транскриптов
        </a>

        <a href="/auth/logout" class="logout-btn">
            <span class="nav-icon">🚪</span>
            Выйти
        </a>
    </div>

    <div class="main-content">
        <a href="/" class="back-btn">
            <span class="nav-icon">⬅️</span>
            Назад к главной
        </a>
        
        <div class="header">
            <h1>🔐 Управление правами</h1>
            <p>Настройте права доступа к командам бота на ваших серверах</p>
        </div>

        ${adminGuilds.length === 0 ? `
            <div class="no-guilds">
                <div class="no-guilds-icon">🏰</div>
                <h3>Нет доступных серверов</h3>
                <p>У вас нет прав администратора ни на одном сервере, где присутствует бот.</p>
                <div style="margin-top: 20px; color: var(--text-secondary); font-size: 0.9rem;">
                    Требуются права администратора для управления правами бота.
                </div>
            </div>
        ` : ''}

        ${adminGuilds.some(guild => !client.guilds.cache.has(guild.id)) ? `
            <div class="bot-warning">
                <div class="bot-warning-icon">⚠️</div>
                <div>
                    <strong>Внимание:</strong> Бот не добавлен на некоторые из ваших серверов. 
                    Вы можете настраивать права, но изменения вступят в силу только после добавления бота.
                </div>
            </div>
        ` : ''}

        <div class="guilds-grid">
            ${adminGuilds.map(guild => {
                const botInGuild = client.guilds.cache.has(guild.id);
                const botMember = botInGuild ? client.guilds.cache.get(guild.id).members.me : null;
                const hasPermissions = botMember ? botMember.permissions.has('Administrator') : false;
                
                return `
                    <div class="guild-card">
                        <div class="guild-header">
                            ${guild.icon ? 
                                `<img src="https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=256" alt="${guild.name}" class="guild-icon">` :
                                `<div class="guild-icon-placeholder">🏰</div>`
                            }
                            <div class="guild-info">
                                <div class="guild-name">${guild.name}</div>
                                <div class="guild-members">${guild.approximate_member_count || 'Неизвестно'} участников</div>
                                
                                <div class="guild-stats">
                                    <div class="guild-stat">
                                        <span class="stat-value">
                                            ${botInGuild ? '🤖' : '❌'}
                                        </span>
                                        <span class="stat-label">Бот</span>
                                    </div>
                                    <div class="guild-stat">
                                        <span class="stat-value">
                                            ${hasPermissions ? '✅' : '⚠️'}
                                        </span>
                                        <span class="stat-label">Права</span>
                                    </div>
                                    <div class="guild-stat">
                                        <span class="stat-value">
                                            ${getGuildPermissions(guild.id) ? Object.keys(getGuildPermissions(guild.id)).length : 0}
                                        </span>
                                        <span class="stat-label">Настроек</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="guild-actions">
                            ${botInGuild ? `
                                <a href="/permissions/${guild.id}" class="btn btn-primary">
                                    <span class="nav-icon">⚙️</span>
                                    Настроить права
                                </a>
                            ` : `
                                <button class="btn" style="background: var(--danger); color: white; cursor: not-allowed;" disabled>
                                    <span class="nav-icon">❌</span>
                                    Бот не добавлен
                                </button>
                            `}
                            
                            ${botInGuild && !hasPermissions ? `
                                <button class="btn btn-success" onclick="showInviteLink('${guild.id}')">
                                    <span class="nav-icon">🔗</span>
                                    Выдать права
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    </div>

    <script>
        function toggleSidebar() {
            const sidebar = document.getElementById('sidebar');
            sidebar.classList.toggle('active');
        }
        
        // Закрываем sidebar при клике вне его области на мобильных устройствах
        document.addEventListener('click', (event) => {
            const sidebar = document.getElementById('sidebar');
            const mobileBtn = document.querySelector('.mobile-menu-btn');
            
            if (window.innerWidth <= 768 && sidebar.classList.contains('active')) {
                if (!sidebar.contains(event.target) && !mobileBtn.contains(event.target)) {
                    sidebar.classList.remove('active');
                }
            }
        });
        
       function showInviteLink(guildId) {
    const inviteLink = 'https://discord.com/oauth2/authorize?client_id=' + CLIENT_ID + '&scope=bot&permissions=8&guild_id=' + guildId;
    
    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '2000';
    
    modal.innerHTML = [
        '<div style="background: var(--surface); padding: 30px; border-radius: 15px; max-width: 500px; width: 90%; border: 1px solid var(--border);">',
            '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">',
                '<h3 style="margin: 0; color: var(--text); font-size: 1.3rem;">🔗 Пригласить бота на сервер</h3>',
                '<button onclick="this.parentElement.parentElement.parentElement.remove()" style="background: none; border: none; color: var(--text-secondary); font-size: 1.5rem; cursor: pointer;">×</button>',
            '</div>',
            
            '<div style="color: var(--text-secondary); margin-bottom: 25px;">',
                'Для управления правами боту необходимы администраторские права на сервере.',
            '</div>',
            
            '<div style="display: flex; gap: 10px; margin-bottom: 25px;">',
                '<input type="text" value="' + inviteLink + '" readonly style="flex: 1; padding: 12px; background: var(--surface-light); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-family: monospace; font-size: 0.9rem;">',
                '<button onclick="copyToClipboard(\'' + inviteLink.replace(/'/g, "\\'") + '\')" style="background: var(--primary); color: white; border: none; padding: 0 20px; border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">Копировать</button>',
            '</div>',
            
            '<div style="display: flex; justify-content: flex-end; gap: 10px;">',
                '<button onclick="this.parentElement.parentElement.parentElement.remove()" style="background: var(--surface-light); color: var(--text); border: 1px solid var(--border); padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">Закрыть</button>',
                '<a href="' + inviteLink + '" target="_blank" style="background: var(--success); color: var(--background); text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; transition: all 0.3s ease;">Открыть ссылку</a>',
            '</div>',
        '</div>'
    ].join('');
    
    document.body.appendChild(modal);
}
       function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        // Показываем уведомление о копировании
        const notification = document.createElement('div');
        notification.style.position = 'fixed';
        notification.style.top = '20px';
        notification.style.right = '20px';
        notification.style.background = 'var(--success)';
        notification.style.color = 'white';
        notification.style.padding = '10px 20px';
        notification.style.borderRadius = '8px';
        notification.style.zIndex = '3000';
        notification.textContent = '✅ Ссылка скопирована в буфер обмена!';
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }).catch(err => {
        console.error('Ошибка копирования:', err);
        alert('Не удалось скопировать ссылку. Скопируйте вручную: ' + text);
    });
}
    </script>
</body>
</html>`;
}

function createGuildPermissionsPage(user, guild, roles, permissions, baseUrl) {
    // Определяем доступные команды для настройки
    const availableCommands = [
        { id: 'region', name: '/регион', icon: '🌍', description: 'Управление регионами голосовых серверов' },
        { id: 'transcript', name: '/transcript', icon: '📄', description: 'Создание транскриптов каналов' },
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
        .logout-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(237, 66, 69, 0.3);
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
        .bot-warning {
            background: linear-gradient(135deg, var(--warning) 0%, rgba(254, 231, 92, 0.1) 100%);
            border: 1px solid var(--warning);
            color: var(--text);
            padding: 15px;
            border-radius: 10px;
            margin-bottom: 30px;
            display: flex;
            align-items: center;
            gap: 15px;
        }
        .bot-warning-icon {
            font-size: 1.5rem;
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
        <a href="/permissions" class="nav-item active">
            <span class="nav-icon">🔐</span>
            Управление правами
        </a>

        <div style="margin: 25px 0 10px 0; color: var(--text-secondary); font-size: 0.9rem; padding: 0 10px; text-transform: uppercase; letter-spacing: 1px;">Быстрые ссылки</div>

<a href="/permissions" class="nav-item">
    <span class="nav-icon">🏰</span>
    Все серверы
</a>
<a href="/guild/${guild.id}/moderation" class="nav-item">
    <span class="nav-icon">🛡️</span>
    Настройки модерации
</a>
<a href="/guild/${guild.id}/roles" class="nav-item">
    <span class="nav-icon">👥</span>
    Управление ролями
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
        
        ${!guild.botInGuild ? `
            <div class="bot-warning">
                <div class="bot-warning-icon">⚠️</div>
                <div>
                    <strong>Внимание:</strong> Бот не добавлен на этот сервер. 
                    Вы можете настроить права, но они вступят в силу только после добавления бота.
                    <div style="margin-top: 10px;">
                        <a href="https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&scope=bot&permissions=8&guild_id=${guild.id}" 
                           target="_blank" 
                           style="color: var(--primary); text-decoration: underline;">
                            Пригласить бота на сервер
                        </a>
                    </div>
                </div>
            </div>
        ` : ''}
        
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
        
        // Закрываем sidebar при клике вне его области на мобильных устройствах
        document.addEventListener('click', (event) => {
            const sidebar = document.getElementById('sidebar');
            const mobileBtn = document.querySelector('.mobile-menu-btn');
            
            if (window.innerWidth <= 768 && sidebar.classList.contains('active')) {
                if (!sidebar.contains(event.target) && !mobileBtn.contains(event.target)) {
                    sidebar.classList.remove('active');
                }
            }
        });

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

function createGuildSettingsPage(user, guild, settings, botInGuild, baseUrl) {
    // Убедимся, что settings существует
    if (!settings) {
        settings = getServerSettings(guild.id);
    }
    
    return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${guild.name} - Настройки</title>
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
        .logout-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(237, 66, 69, 0.3);
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
        .settings-container {
            background: var(--surface);
            border-radius: 15px;
            border: 1px solid var(--border);
            overflow: hidden;
            margin-bottom: 30px;
        }
        .settings-section {
            padding: 30px;
            border-bottom: 1px solid var(--border);
        }
        .settings-section:last-child {
            border-bottom: none;
        }
        .section-title {
            font-size: 1.5rem;
            font-weight: 700;
            color: var(--text);
            margin-bottom: 25px;
            display: flex;
            align-items: center;
            gap: 15px;
        }
        .section-icon {
            font-size: 1.8rem;
            background: linear-gradient(135deg, var(--primary), var(--success));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .setting-item {
            background: var(--surface-light);
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 15px;
            border: 1px solid var(--border);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .setting-info {
            flex: 1;
        }
        .setting-name {
            font-weight: 600;
            color: var(--text);
            margin-bottom: 5px;
            font-size: 1.1rem;
        }
        .setting-description {
            color: var(--text-secondary);
            font-size: 0.9rem;
        }
        .setting-value {
            color: var(--success);
            font-weight: 600;
            font-size: 1rem;
            padding: 8px 15px;
            background: rgba(87, 242, 135, 0.1);
            border-radius: 8px;
            border: 1px solid var(--success);
        }
        .bot-status {
            padding: 15px;
            border-radius: 10px;
            margin-bottom: 25px;
            display: flex;
            align-items: center;
            gap: 15px;
        }
        .bot-status.online {
            background: linear-gradient(135deg, var(--success) 0%, rgba(87, 242, 135, 0.1) 100%);
            border: 1px solid var(--success);
        }
        .bot-status.offline {
            background: linear-gradient(135deg, var(--danger) 0%, rgba(237, 66, 69, 0.1) 100%);
            border: 1px solid var(--danger);
        }
        .bot-status.warning {
            background: linear-gradient(135deg, var(--warning) 0%, rgba(254, 231, 92, 0.1) 100%);
            border: 1px solid var(--warning);
            color: var(--text);
        }
        .bot-icon {
            font-size: 2rem;
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
        .no-settings {
            text-align: center;
            padding: 40px;
            color: var(--text-secondary);
        }
        .no-settings-icon {
            font-size: 4rem;
            margin-bottom: 20px;
            opacity: 0.5;
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
            .guild-name {
                font-size: 2rem;
            }
            .settings-section {
                padding: 20px;
            }
        }
        @media (max-width: 480px) {
            .guild-stats {
                flex-direction: column;
                gap: 15px;
            }
            .setting-item {
                flex-direction: column;
                align-items: flex-start;
                gap: 15px;
            }
            .setting-value {
                align-self: flex-start;
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
        
        <div style="margin: 25px 0 10px 0; color: var(--text-secondary); font-size: 0.9rem; padding: 0 10px; text-transform: uppercase; letter-spacing: 1px;">Быстрые ссылки</div>

<a href="/permissions/${guild.id}" class="nav-item">
    <span class="nav-icon">🔐</span>
    Права доступа
</a>
<a href="/guild/${guild.id}/settings" class="nav-item active">
    <span class="nav-icon">⚙️</span>
    Настройки сервера
</a>
<a href="/guild/${guild.id}/moderation" class="nav-item">
    <span class="nav-icon">🛡️</span>
    Настройки модерации
</a>
<a href="/guild/${guild.id}/roles" class="nav-item">
    <span class="nav-icon">👥</span>
    Управление ролями
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
                <p style="color: var(--text-secondary); font-size: 1.1rem;">Настройки сервера</p>
                
                <div class="guild-stats">
                    <div class="guild-stat">
                        <span class="stat-value">${botInGuild ? '🤖' : '❌'}</span>
                        <span class="stat-label">Бот</span>
                    </div>
                    <div class="guild-stat">
                        <span class="stat-value">${guild.approximate_member_count || 'N/A'}</span>
                        <span class="stat-label">Участников</span>
                    </div>
                    <div class="guild-stat">
                        <span class="stat-value">${Object.keys(settings).filter(k => !k.startsWith('_')).length}</span>
                        <span class="stat-label">Настроек</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="bot-status ${botInGuild ? 'online' : 'offline'}">
            <div class="bot-icon">${botInGuild ? '🤖' : '❌'}</div>
            <div>
                <strong>Статус бота:</strong> ${botInGuild ? '✅ Бот находится на сервере' : '❌ Бот не добавлен на сервер'}
                ${!botInGuild ? `
                    <div style="margin-top: 10px; font-size: 0.9rem;">
                        <a href="https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&scope=bot&permissions=8&guild_id=${guild.id}" 
                           target="_blank" 
                           style="color: var(--primary); text-decoration: underline;">
                            Пригласить бота на сервер
                        </a>
                    </div>
                ` : ''}
            </div>
        </div>

        <div class="settings-container">
            <div class="settings-section">
                <div class="section-title">
                    <div class="section-icon">📄</div>
                    <div>Настройки транскриптов</div>
                </div>
                
                ${settings.transcriptChannelId ? `
                    <div class="setting-item">
                        <div class="setting-info">
                            <div class="setting-name">Канал для транскриптов</div>
                            <div class="setting-description">Канал, в который отправляются созданные транскрипты</div>
                        </div>
                        <div class="setting-value">
                            ${settings.transcriptChannelId === '1430613860473114805' ? 'По умолчанию' : `ID: ${settings.transcriptChannelId}`}
                        </div>
                    </div>
                ` : `
                    <div class="no-settings">
                        <div class="no-settings-icon">📄</div>
                        <h3>Настройки транскриптов не заданы</h3>
                        <p>Используйте команду <code>/settranscript</code> для настройки</p>
                    </div>
                `}
            </div>

            <div class="settings-section">
                <div class="section-title">
                    <div class="section-icon">🌐</div>
                    <div>Настройки перевода</div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-name">Автоматический перевод</div>
                        <div class="setting-description">Включен ли автоматический перевод сообщений по реакциям</div>
                    </div>
                    <div class="setting-value">
                        ${settings.translationEnabled ? '✅ Включен' : '❌ Выключен'}
                    </div>
                </div>

                ${settings.disabledTranslationChannels && settings.disabledTranslationChannels.length > 0 ? `
                    <div class="setting-item">
                        <div class="setting-info">
                            <div class="setting-name">Отключенные каналы</div>
                            <div class="setting-description">Каналы, где перевод отключен</div>
                        </div>
                        <div class="setting-value">
                            ${settings.disabledTranslationChannels.length} каналов
                        </div>
                    </div>
                ` : ''}

                ${settings.protectedRoles && settings.protectedRoles.length > 0 ? `
                    <div class="setting-item">
                        <div class="setting-info">
                            <div class="setting-name">Защищенные роли</div>
                            <div class="setting-description">Роли, чьи сообщения не переводятся</div>
                        </div>
                        <div class="setting-value">
                            ${settings.protectedRoles.length} ролей
                        </div>
                    </div>
                ` : ''}
            </div>

            <div class="settings-section">
                <div class="section-title">
                    <div class="section-icon">⚡</div>
                    <div>Настройки автоудаления</div>
                </div>
                
                ${settings.enabled !== undefined ? `
                    <div class="setting-item">
                        <div class="setting-info">
                            <div class="setting-name">Автоудаление сообщений</div>
                            <div class="setting-description">Включено ли автоматическое удаление сообщений</div>
                        </div>
                        <div class="setting-value">
                            ${settings.enabled ? '✅ Включено' : '❌ Выключено'}
                        </div>
                    </div>

                    ${settings.delay ? `
                        <div class="setting-item">
                            <div class="setting-info">
                                <div class="setting-name">Задержка удаления</div>
                                <div class="setting-description">Время через которое удаляются сообщения</div>
                            </div>
                            <div class="setting-value">
                                ${settings.delay} мс
                            </div>
                        </div>
                    ` : ''}

                    ${settings.exemptRoles && settings.exemptRoles.length > 0 ? `
                        <div class="setting-item">
                            <div class="setting-info">
                                <div class="setting-name">Исключенные роли</div>
                                <div class="setting-description">Роли, чьи сообщения не удаляются</div>
                            </div>
                            <div class="setting-value">
                                ${settings.exemptRoles.length} ролей
                            </div>
                        </div>
                    ` : ''}
                ` : `
                    <div class="no-settings">
                        <div class="no-settings-icon">⚡</div>
                        <h3>Настройки автоудаления не заданы</h3>
                        <p>Используйте команду <code>/autodelete</code> для настройки</p>
                    </div>
                `}
            </div>

            ${voiceRegionSettings.has(guild.id) ? `
                <div class="settings-section">
                    <div class="section-title">
                        <div class="section-icon">🌍</div>
                        <div>Настройки региона</div>
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-info">
                            <div class="setting-name">Голосовой регион</div>
                            <div class="setting-description">Настроенный регион голосового сервера</div>
                        </div>
                        <div class="setting-value">
                            ${getRegionName(voiceRegionSettings.get(guild.id).regionCode)}
                        </div>
                    </div>
                </div>
            ` : ''}
        </div>

        <div style="text-align: center; margin-top: 40px; color: var(--text-secondary); font-size: 0.9rem;">
            <p>💡 Для изменения настроек используйте соответствующие команды в Discord</p>
            <p><code>/settranscript</code> • <code>/translation</code> • <code>/autodelete</code> • <code>/регион</code></p>
        </div>
    </div>

    <script>
        function toggleSidebar() {
            const sidebar = document.getElementById('sidebar');
            sidebar.classList.toggle('active');
        }
        
        // Закрываем sidebar при клике вне его области на мобильных устройствах
        document.addEventListener('click', (event) => {
            const sidebar = document.getElementById('sidebar');
            const mobileBtn = document.querySelector('.mobile-menu-btn');
            
            if (window.innerWidth <= 768 && sidebar.classList.contains('active')) {
                if (!sidebar.contains(event.target) && !mobileBtn.contains(event.target)) {
                    sidebar.classList.remove('active');
                }
            }
        });
    </script>
</body>
</html>`;
}

function createModerationSettingsPage(user, guild, modSettings, roles, channels, botInGuild, baseUrl) {
    console.log('=== CREATING MODERATION PAGE HTML ===');
    console.log('Guild:', guild.name);
    console.log('Roles count:', roles.length);
    console.log('Channels count:', channels.length);
    console.log('ModSettings:', JSON.stringify(modSettings, null, 2));
    // Убедимся, что autoMod существует
    const autoMod = modSettings.autoMod || {
        enabled: false,
        spam: false,
        caps: false,
        links: false,
        inviteLinks: false,
        badWords: false
    };
    
    const thresholds = modSettings.autoModThresholds || {
        spam: 5,
        caps: 70,
        maxWarnings: 3,
        muteDuration: 60 * 60 * 1000
    };
    
    return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${guild.name} - Настройки модерации</title>
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
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 30px;
        }
        .header {
            margin-bottom: 40px;
            padding-bottom: 20px;
            border-bottom: 1px solid var(--border);
        }
        .guild-header {
            display: flex;
            align-items: center;
            margin-bottom: 20px;
        }
        .guild-icon {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            margin-right: 20px;
            border: 3px solid var(--surface-light);
            object-fit: cover;
        }
        .guild-icon-placeholder {
            width: 80px;
            height: 80px;
            background: linear-gradient(135deg, var(--primary), var(--primary-dark));
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 2rem;
            margin-right: 20px;
            color: white;
            border: 3px solid var(--surface-light);
        }
        .guild-info h1 {
            font-size: 2.5rem;
            font-weight: 800;
            margin-bottom: 10px;
            background: linear-gradient(135deg, var(--primary), var(--success));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .nav-breadcrumb {
            display: flex;
            gap: 10px;
            margin-bottom: 30px;
            flex-wrap: wrap;
        }
        .nav-btn {
            padding: 12px 20px;
            background: var(--surface-light);
            color: var(--text);
            text-decoration: none;
            border-radius: 10px;
            border: 1px solid var(--border);
            display: inline-flex;
            align-items: center;
            gap: 10px;
            transition: all 0.3s ease;
        }
        .nav-btn:hover {
            border-color: var(--primary);
            transform: translateY(-2px);
        }
        .nav-btn.active {
            background: var(--primary);
            color: white;
        }
        .settings-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 30px;
            margin-bottom: 40px;
        }
        .settings-card {
            background: var(--surface);
            border-radius: 15px;
            border: 1px solid var(--border);
            padding: 25px;
            transition: all 0.3s ease;
        }
        .settings-card:hover {
            border-color: var(--primary);
            transform: translateY(-5px);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        }
        .card-title {
            font-size: 1.5rem;
            font-weight: 700;
            margin-bottom: 25px;
            color: var(--text);
            display: flex;
            align-items: center;
            gap: 15px;
        }
        .card-title-icon {
            font-size: 1.8rem;
            background: linear-gradient(135deg, var(--primary), var(--success));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .setting-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 15px 0;
            border-bottom: 1px solid var(--border);
        }
        .setting-item:last-child {
            border-bottom: none;
        }
        .setting-info {
            flex: 1;
        }
        .setting-name {
            font-weight: 600;
            color: var(--text);
            margin-bottom: 5px;
            font-size: 1.1rem;
        }
        .setting-description {
            color: var(--text-secondary);
            font-size: 0.9rem;
        }
        .switch {
            position: relative;
            display: inline-block;
            width: 60px;
            height: 30px;
            margin-left: 20px;
        }
        .switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: var(--surface-dark);
            transition: .4s;
            border-radius: 34px;
            border: 1px solid var(--border);
        }
        .slider:before {
            position: absolute;
            content: "";
            height: 22px;
            width: 22px;
            left: 4px;
            bottom: 3px;
            background-color: white;
            transition: .4s;
            border-radius: 50%;
        }
        input:checked + .slider {
            background-color: var(--success);
        }
        input:checked + .slider:before {
            transform: translateX(28px);
        }
        .input-number {
            width: 100px;
            padding: 8px 12px;
            background: var(--surface-light);
            border: 1px solid var(--border);
            border-radius: 6px;
            color: var(--text);
            font-size: 1rem;
            text-align: center;
        }
        .select-input {
            min-width: 200px;
            padding: 8px 12px;
            background: var(--surface-light);
            border: 1px solid var(--border);
            border-radius: 6px;
            color: var(--text);
            font-size: 0.95rem;
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
        .save-btn {
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
        .save-btn:hover {
            transform: translateY(-3px);
            box-shadow: 0 10px 25px rgba(87, 242, 135, 0.3);
        }
        .save-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none !important;
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
        .message {
            padding: 15px;
            border-radius: 10px;
            margin-top: 20px;
            display: none;
        }
        .message.success {
            background: linear-gradient(135deg, var(--success) 0%, rgba(87, 242, 135, 0.1) 100%);
            border: 1px solid var(--success);
            color: white;
            display: block;
        }
        .message.error {
            background: linear-gradient(135deg, var(--danger) 0%, rgba(237, 66, 69, 0.1) 100%);
            border: 1px solid var(--danger);
            color: white;
            display: block;
        }
        .bot-warning {
            background: linear-gradient(135deg, var(--warning) 0%, rgba(254, 231, 92, 0.1) 100%);
            border: 1px solid var(--warning);
            color: var(--text);
            padding: 15px;
            border-radius: 10px;
            margin-bottom: 30px;
            display: flex;
            align-items: center;
            gap: 15px;
        }
        .section-description {
            color: var(--text-secondary);
            margin-bottom: 25px;
            font-size: 1rem;
            line-height: 1.5;
        }
        @media (max-width: 768px) {
            .container {
                padding: 20px;
            }
            .settings-grid {
                grid-template-columns: 1fr;
            }
            .setting-item {
                flex-direction: column;
                align-items: flex-start;
                gap: 10px;
            }
            .save-section {
                flex-direction: column;
                gap: 20px;
                text-align: center;
            }
            .select-input {
                width: 100%;
                min-width: unset;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="nav-breadcrumb">
            <a href="/" class="nav-btn">
                <span>🏠</span>
                Главная
            </a>
            <a href="/permissions" class="nav-btn">
                <span>🏰</span>
                Серверы
            </a>
            <a href="/guild/${guild.id}/settings" class="nav-btn">
                <span>⚙️</span>
                Настройки
            </a>
            <a href="#" class="nav-btn active">
                <span>🛡️</span>
                Модерация
            </a>
        </div>
        
        <div class="header">
            <div class="guild-header">
                ${guild.icon ? 
                    `<img src="${guild.icon}" alt="${guild.name}" class="guild-icon">` :
                    `<div class="guild-icon-placeholder">🏰</div>`
                }
                <div class="guild-info">
                    <h1>${guild.name}</h1>
                    <p style="color: var(--text-secondary);">Управление настройками модерации и авто-модерации</p>
                </div>
            </div>
        </div>
        
        ${!botInGuild ? `
            <div class="bot-warning">
                <div>⚠️</div>
                <div>
                    <strong>Внимание:</strong> Бот не добавлен на этот сервер. 
                    Настройки модерации вступят в силу только после добавления бота.
                </div>
            </div>
        ` : ''}
        
        <form id="moderation-settings-form">
            <div class="settings-grid">
                <!-- Основные настройки -->
                <div class="settings-card">
                    <div class="card-title">
                        <div class="card-title-icon">⚙️</div>
                        <div>Основные настройки</div>
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-info">
                            <div class="setting-name">Включить модерацию</div>
                            <div class="setting-description">Активировать систему модерации на сервере</div>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="moderation-enabled" ${modSettings.enabled ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-info">
                            <div class="setting-name">Канал для логов</div>
                            <div class="setting-description">Канал для записи действий модерации</div>
                        </div>
                        <select id="log-channel" class="select-input">
                            <option value="">Не выбран</option>
                            ${channels.map(channel => `
                                <option value="${channel.id}" ${channel.id === modSettings.logChannel ? 'selected' : ''}>
                                    #${channel.name}${channel.parent ? ` (${channel.parent})` : ''}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-info">
                            <div class="setting-name">Роль для мута</div>
                            <div class="setting-description">Роль, которая выдаётся при муте пользователя</div>
                        </div>
                        <select id="mute-role" class="select-input">
                            <option value="">Не выбрана</option>
                            ${roles.map(role => `
                                <option value="${role.id}" ${role.id === modSettings.muteRole ? 'selected' : ''}>
                                    ${role.name} (${role.members} участников)
                                </option>
                            `).join('')}
                        </select>
                    </div>
                </div>
                
                <!-- Авто-модерация -->
                <div class="settings-card">
                    <div class="card-title">
                        <div class="card-title-icon">🤖</div>
                        <div>Авто-модерация</div>
                    </div>
                    
                    <div class="section-description">
                        Настройки автоматической модерации сообщений
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-info">
                            <div class="setting-name">Включить авто-модерацию</div>
                            <div class="setting-description">Активировать автоматическую проверку сообщений</div>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="auto-mod-enabled" ${autoMod.enabled ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-info">
                            <div class="setting-name">Обнаружение спама</div>
                            <div class="setting-description">Удалять сообщения при слишком быстрой отправке</div>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="auto-spam" ${autoMod.spam ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-info">
                            <div class="setting-name">Обнаружение КАПСА</div>
                            <div class="setting-description">Удалять сообщения, написанные заглавными буквами</div>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="auto-caps" ${autoMod.caps ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-info">
                            <div class="setting-name">Блокировка приглашений</div>
                            <div class="setting-description">Удалять приглашения на другие серверы</div>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="auto-invites" ${autoMod.inviteLinks ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-info">
                            <div class="setting-name">Фильтр плохих слов</div>
                            <div class="setting-description">Удалять сообщения с запрещёнными словами</div>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="auto-bad-words" ${autoMod.badWords ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
                
                <!-- Пороговые значения -->
                <div class="settings-card">
                    <div class="card-title">
                        <div class="card-title-icon">📊</div>
                        <div>Пороговые значения</div>
                    </div>
                    
                    <div class="section-description">
                        Настройки чувствительности авто-модерации
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-info">
                            <div class="setting-name">Лимит спама</div>
                            <div class="setting-description">Максимум сообщений за 5 секунд</div>
                        </div>
                        <input type="number" id="spam-threshold" class="input-number" 
                               value="${thresholds.spam}" min="1" max="20">
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-info">
                            <div class="setting-name">Лимит КАПСА</div>
                            <div class="setting-description">Процент заглавных букв для триггера</div>
                        </div>
                        <input type="number" id="caps-threshold" class="input-number" 
                               value="${thresholds.caps}" min="1" max="100">
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-info">
                            <div class="setting-name">Предупреждения до мута</div>
                            <div class="setting-description">Количество предупреждений для автоматического мута</div>
                        </div>
                        <input type="number" id="warnings-threshold" class="input-number" 
                               value="${thresholds.maxWarnings}" min="1" max="10">
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-info">
                            <div class="setting-name">Длительность мута</div>
                            <div class="setting-description">Время мута в часах (при авто-муте)</div>
                        </div>
                        <input type="number" id="mute-duration" class="input-number" 
                               value="${thresholds.muteDuration / (60 * 60 * 1000)}" min="1" max="168" step="1">
                    </div>
                </div>
                
                <!-- Логирование -->
                <div class="settings-card">
                    <div class="card-title">
                        <div class="card-title-icon">📝</div>
                        <div>Логирование</div>
                    </div>
                    
                    <div class="section-description">
                        Какие действия записывать в канал логов
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-info">
                            <div class="setting-name">Логировать баны</div>
                            <div class="setting-description">Записывать информацию о банах</div>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="log-bans" ${modSettings.logBans ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-info">
                            <div class="setting-name">Логировать кики</div>
                            <div class="setting-description">Записывать информацию о киках</div>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="log-kicks" ${modSettings.logKicks ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-info">
                            <div class="setting-name">Логировать муты</div>
                            <div class="setting-description">Записывать информацию о мутах</div>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="log-mutes" ${modSettings.logMutes ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-info">
                            <div class="setting-name">Логировать предупреждения</div>
                            <div class="setting-description">Записывать информацию о предупреждениях</div>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="log-warns" ${modSettings.logWarns ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-info">
                            <div class="setting-name">Логировать очистки</div>
                            <div class="setting-description">Записывать информацию об очистке сообщений</div>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="log-clears" ${modSettings.logClears ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
            </div>
            
            <div class="save-section">
                <div>
                    <div style="color: var(--text); font-weight: 600; margin-bottom: 5px;">💾 Сохранить настройки</div>
                    <div style="color: var(--text-secondary); font-size: 0.9rem;">
                        Настройки применяются сразу после сохранения
                    </div>
                </div>
                <button type="button" class="save-btn" onclick="saveModerationSettings('${guild.id}')" id="save-btn">
                    <span>💾</span>
                    Сохранить изменения
                </button>
            </div>
            
            <div id="message" class="message"></div>
        </form>
    </div>

    <script>
        async function saveModerationSettings(guildId) {
            const saveBtn = document.getElementById('save-btn');
            const messageDiv = document.getElementById('message');
            
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<div class="loading-spinner"></div> Сохранение...';
            
            try {
                const settings = {
                    enabled: document.getElementById('moderation-enabled').checked,
                    logChannel: document.getElementById('log-channel').value,
                    muteRole: document.getElementById('mute-role').value,
                    autoMod: {
                        enabled: document.getElementById('auto-mod-enabled').checked,
                        spam: document.getElementById('auto-spam').checked,
                        caps: document.getElementById('auto-caps').checked,
                        inviteLinks: document.getElementById('auto-invites').checked,
                        badWords: document.getElementById('auto-bad-words').checked
                    },
                    autoModThresholds: {
                        spam: parseInt(document.getElementById('spam-threshold').value),
                        caps: parseInt(document.getElementById('caps-threshold').value),
                        maxWarnings: parseInt(document.getElementById('warnings-threshold').value),
                        muteDuration: parseInt(document.getElementById('mute-duration').value) * 60 * 60 * 1000
                    },
                    logBans: document.getElementById('log-bans').checked,
                    logKicks: document.getElementById('log-kicks').checked,
                    logMutes: document.getElementById('log-mutes').checked,
                    logWarns: document.getElementById('log-warns').checked,
                    logClears: document.getElementById('log-clears').checked
                };
                
                const response = await fetch('/api/guild/' + guildId + '/moderation', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(settings)
                });
                
                const data = await response.json();
                
                if (data.success) {
                    messageDiv.className = 'message success';
                    messageDiv.innerHTML = \`
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span>✅</span>
                            <div>
                                <strong>Настройки сохранены!</strong><br>
                                Изменения применены к серверу.
                            </div>
                        </div>
                    \`;
                    
                    setTimeout(() => {
                        messageDiv.style.display = 'none';
                    }, 5000);
                } else {
                    throw new Error(data.error || 'Ошибка сохранения');
                }
            } catch (error) {
                messageDiv.className = 'message error';
                messageDiv.innerHTML = \`
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span>❌</span>
                        <div>
                            <strong>Ошибка сохранения:</strong><br>
                            \${error.message}
                        </div>
                    </div>
                \`;
                
                setTimeout(() => {
                    messageDiv.style.display = 'none';
                }, 5000);
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<span>💾</span> Сохранить изменения';
            }
        }
    </script>
</body>
</html>`;
}

function createRolesManagementPage(user, guild, members, roles, modSettings, botInGuild, baseUrl) {
    return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${guild.name} - Управление ролями и модерацией</title>
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
        .tabs {
            display: flex;
            background: var(--surface-dark);
            border-radius: 12px;
            padding: 5px;
            margin-bottom: 30px;
            border: 1px solid var(--border);
        }
        .tab {
            flex: 1;
            padding: 15px;
            text-align: center;
            cursor: pointer;
            border-radius: 8px;
            transition: all 0.3s ease;
            font-weight: 600;
            color: var(--text-secondary);
        }
        .tab:hover {
            background: var(--surface-light);
            color: var(--text);
        }
        .tab.active {
            background: var(--primary);
            color: white;
            box-shadow: 0 4px 15px rgba(88, 101, 242, 0.3);
        }
        .tab-content {
            display: none;
        }
        .tab-content.active {
            display: block;
        }
        .members-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .member-card {
            background: var(--surface);
            border-radius: 12px;
            border: 1px solid var(--border);
            padding: 20px;
            transition: all 0.3s ease;
        }
        .member-card:hover {
            border-color: var(--primary);
            transform: translateY(-5px);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        }
        .member-header {
            display: flex;
            align-items: center;
            margin-bottom: 15px;
        }
        .member-avatar {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            margin-right: 15px;
        }
        .member-name {
            flex: 1;
        }
        .member-tag {
            font-weight: 600;
            color: var(--text);
            margin-bottom: 5px;
        }
        .member-id {
            color: var(--text-secondary);
            font-size: 0.85rem;
            font-family: monospace;
        }
        .member-roles {
            margin-top: 15px;
        }
        .role-tag {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 20px;
            font-size: 0.8rem;
            margin: 2px;
            background: var(--surface-light);
            color: var(--text);
            border: 1px solid var(--border);
        }
        .role-actions {
            display: flex;
            gap: 10px;
            margin-top: 15px;
        }
        .role-select {
            flex: 1;
            padding: 8px;
            background: var(--surface-light);
            border: 1px solid var(--border);
            border-radius: 6px;
            color: var(--text);
            font-family: inherit;
        }
        .btn {
            padding: 8px 15px;
            border-radius: 6px;
            border: none;
            cursor: pointer;
            font-weight: 600;
            font-size: 0.9rem;
            transition: all 0.3s ease;
        }
        .btn-add {
            background: var(--success);
            color: var(--background);
        }
        .btn-add:hover {
            background: #4ad175;
            transform: translateY(-2px);
        }
        .btn-remove {
            background: var(--danger);
            color: white;
        }
        .btn-remove:hover {
            background: #c93c3e;
            transform: translateY(-2px);
        }
        .moderation-settings {
            background: var(--surface);
            border-radius: 12px;
            border: 1px solid var(--border);
            padding: 30px;
            margin-bottom: 30px;
        }
        .setting-group {
            margin-bottom: 30px;
        }
        .setting-title {
            font-size: 1.3rem;
            font-weight: 700;
            color: var(--text);
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--border);
        }
        .setting-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 15px;
            background: var(--surface-light);
            border-radius: 8px;
            margin-bottom: 10px;
            border: 1px solid var(--border);
        }
        .setting-label {
            font-weight: 600;
            color: var(--text);
        }
        .setting-description {
            color: var(--text-secondary);
            font-size: 0.9rem;
            margin-top: 5px;
        }
        .switch {
            position: relative;
            display: inline-block;
            width: 60px;
            height: 30px;
        }
        .switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: var(--surface-dark);
            transition: .4s;
            border-radius: 34px;
            border: 1px solid var(--border);
        }
        .slider:before {
            position: absolute;
            content: "";
            height: 22px;
            width: 22px;
            left: 4px;
            bottom: 3px;
            background-color: white;
            transition: .4s;
            border-radius: 50%;
        }
        input:checked + .slider {
            background-color: var(--success);
        }
        input:checked + .slider:before {
            transform: translateX(28px);
        }
        .save-btn {
            background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
            color: white;
            padding: 15px 30px;
            border: none;
            border-radius: 10px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 10px;
            transition: all 0.3s ease;
            margin-top: 20px;
        }
        .save-btn:hover {
            transform: translateY(-3px);
            box-shadow: 0 10px 25px rgba(88, 101, 242, 0.4);
        }
        .save-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none !important;
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
        .message {
            padding: 15px;
            border-radius: 10px;
            margin-top: 20px;
            display: none;
        }
        .message.success {
            background: linear-gradient(135deg, var(--success) 0%, rgba(87, 242, 135, 0.1) 100%);
            border: 1px solid var(--success);
            color: white;
            display: block;
        }
        .message.error {
            background: linear-gradient(135deg, var(--danger) 0%, rgba(237, 66, 69, 0.1) 100%);
            border: 1px solid var(--danger);
            color: white;
            display: block;
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
        .bot-warning {
            background: linear-gradient(135deg, var(--warning) 0%, rgba(254, 231, 92, 0.1) 100%);
            border: 1px solid var(--warning);
            color: var(--text);
            padding: 15px;
            border-radius: 10px;
            margin-bottom: 30px;
            display: flex;
            align-items: center;
            gap: 15px;
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
            .members-grid {
                grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            }
        }
        @media (max-width: 768px) {
            .sidebar {
                transform: translateX(-100%);
            }
            .main-content {
                margin-left: 0;
                padding: 20px;
            }
            .members-grid {
                grid-template-columns: 1fr;
            }
            .setting-item {
                flex-direction: column;
                align-items: flex-start;
                gap: 10px;
            }
        }
    </style>
</head>
<body>
    <div class="sidebar">
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
        <a href="/permissions/${guild.id}" class="nav-item">
            <span class="nav-icon">🔐</span>
            Права команд
        </a>
        <a href="/guild/${guild.id}/settings" class="nav-item">
    <span class="nav-icon">⚙️</span>
    Настройки сервера
</a>
<a href="/guild/${guild.id}/roles" class="nav-item active">
    <span class="nav-icon">👥</span>
    Управление ролями
</a>
<a href="/guild/${guild.id}/moderation" class="nav-item">
    <span class="nav-icon">🛡️</span>
    Настройки модерации
</a>

       <div style="margin: 25px 0 10px 0; color: var(--text-secondary); font-size: 0.9rem; padding: 0 10px; text-transform: uppercase; letter-spacing: 1px;">Быстрые ссылки</div>

<a href="/permissions" class="nav-item">
    <span class="nav-icon">🏰</span>
    Все серверы
</a>
<a href="/guild/${guild.id}/moderation" class="nav-item">
    <span class="nav-icon">🛡️</span>
    Настройки модерации
</a>

        <a href="/auth/logout" style="display: flex; align-items: center; padding: 15px; margin: 5px 0; background: linear-gradient(135deg, var(--danger) 0%, #c93c3e 100%); color: white; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 1rem; transition: all 0.3s ease; border: 1px solid transparent; margin-top: 20px;">
            <span class="nav-icon">🚪</span>
            Выйти
        </a>
    </div>

    <div class="main-content">
        <a href="/permissions" class="back-btn">
            <span class="nav-icon">⬅️</span>
            Назад к списку серверов
        </a>
        
        ${!botInGuild ? `
            <div class="bot-warning">
                <div>⚠️</div>
                <div>
                    <strong>Внимание:</strong> Бот не добавлен на этот сервер. 
                    Для управления ролями добавьте бота на сервер.
                </div>
            </div>
        ` : ''}
        
        <div class="guild-header">
            ${guild.icon ? 
                `<img src="https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=256" alt="${guild.name}" class="guild-icon">` :
                `<div class="guild-icon-placeholder">🏰</div>`
            }
            <div class="guild-info">
                <h1 class="guild-name">${guild.name}</h1>
                <p style="color: var(--text-secondary); font-size: 1.1rem;">Управление ролями и настройками модерации</p>
            </div>
        </div>

        <div class="tabs">
            <div class="tab active" onclick="switchTab('roles')">👥 Управление ролями</div>
            <div class="tab" onclick="switchTab('moderation')">🛡️ Настройки модерации</div>
        </div>

        <div id="roles-tab" class="tab-content active">
            <h2 style="margin-bottom: 20px; color: var(--text);">Участники сервера</h2>
            
            ${members.length === 0 ? `
                <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    <div style="font-size: 3rem; margin-bottom: 20px;">👥</div>
                    <h3>Участники не загружены</h3>
                    <p>Бот не имеет доступа к участникам сервера или сервер пуст.</p>
                </div>
            ` : `
                <div class="members-grid">
                    ${members.map(member => `
                        <div class="member-card">
                            <div class="member-header">
                                <img src="${member.avatar}" alt="${member.tag}" class="member-avatar">
                                <div class="member-name">
                                    <div class="member-tag">${member.tag}</div>
                                    <div class="member-id">${member.id}</div>
                                </div>
                            </div>
                            
                            <div class="member-roles">
                                <div style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 10px;">Роли:</div>
                                ${member.roles.length > 0 ? 
                                    member.roles.map(roleId => {
                                        const role = roles.find(r => r.id === roleId);
                                        return role ? `<span class="role-tag" style="border-color: #${role.color.toString(16).padStart(6, '0') || '5865F2'}; background: #${role.color.toString(16).padStart(6, '0')}20;">${role.name}</span>` : '';
                                    }).join('') : 
                                    '<span style="color: var(--text-secondary); font-size: 0.9rem;">Нет ролей</span>'
                                }
                            </div>
                            
                            <div class="role-actions">
                                <select class="role-select" id="role-select-${member.id}">
                                    <option value="">Выберите роль</option>
                                    ${roles.map(role => `
                                        <option value="${role.id}">${role.name}</option>
                                    `).join('')}
                                </select>
                                <button class="btn btn-add" onclick="addRole('${guild.id}', '${member.id}', '${member.tag}')">
                                    +
                                </button>
                                <button class="btn btn-remove" onclick="removeRole('${guild.id}', '${member.id}', '${member.tag}')">
                                    -
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
                
                <div style="text-align: center; margin-top: 30px; color: var(--text-secondary);">
                    Показано ${members.length} участников
                </div>
            `}
        </div>

        <div id="moderation-tab" class="tab-content">
            <div class="moderation-settings">
                <div class="setting-group">
                    <div class="setting-title">Основные настройки</div>
                    
                    <div class="setting-item">
                        <div>
                            <div class="setting-label">Включить модерацию</div>
                            <div class="setting-description">Активировать систему автоматической модерации</div>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="moderation-enabled" ${modSettings.enabled ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    
                    <div class="setting-item">
                        <div>
                            <div class="setting-label">Канал для логов</div>
                            <div class="setting-description">Канал для записи действий модерации</div>
                        </div>
                        <select id="log-channel" style="padding: 8px; background: var(--surface-light); border: 1px solid var(--border); border-radius: 6px; color: var(--text); min-width: 200px;">
                            <option value="">Не выбран</option>
                            ${botInGuild ? roles.map(role => role.id).includes(modSettings.muteRole) ? 
                                `<option value="${modSettings.muteRole}" selected>Роль мута: ${roles.find(r => r.id === modSettings.muteRole)?.name || 'Неизвестная роль'}</option>` : '' : ''}
                        </select>
                    </div>
                    
                    <div class="setting-item">
                        <div>
                            <div class="setting-label">Роль для мута</div>
                            <div class="setting-description">Роль, которая выдаётся при муте</div>
                        </div>
                        <select id="mute-role" style="padding: 8px; background: var(--surface-light); border: 1px solid var(--border); border-radius: 6px; color: var(--text); min-width: 200px;">
                            <option value="">Не выбрана</option>
                            ${botInGuild ? roles.map(role => `
                                <option value="${role.id}" ${role.id === modSettings.muteRole ? 'selected' : ''}>${role.name}</option>
                            `).join('') : ''}
                        </select>
                    </div>
                </div>

                <div class="setting-group">
                    <div class="setting-title">Автоматическая модерация</div>
                    
                    <div class="setting-item">
                        <div>
                            <div class="setting-label">Обнаружение спама</div>
                            <div class="setting-description">Удалять сообщения при слишком быстрой отправке</div>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="auto-spam" ${modSettings.autoMod.spam ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    
                    <div class="setting-item">
                        <div>
                            <div class="setting-label">Обнаружение КАПСА</div>
                            <div class="setting-description">Удалять сообщения, написанные заглавными буквами</div>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="auto-caps" ${modSettings.autoMod.caps ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    
                    <div class="setting-item">
                        <div>
                            <div class="setting-label">Блокировка приглашений</div>
                            <div class="setting-description">Удалять приглашения на другие серверы</div>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="auto-invites" ${modSettings.autoMod.inviteLinks ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>

                <div class="setting-group">
                    <div class="setting-title">Пороговые значения</div>
                    
                    <div class="setting-item">
                        <div>
                            <div class="setting-label">Лимит спама (сообщений)</div>
                            <div class="setting-description">Максимум сообщений за 5 секунд</div>
                        </div>
                        <input type="number" id="spam-threshold" value="${modSettings.autoModThresholds.spam}" min="1" max="20" style="padding: 8px; background: var(--surface-light); border: 1px solid var(--border); border-radius: 6px; color: var(--text); width: 80px;">
                    </div>
                    
                    <div class="setting-item">
                        <div>
                            <div class="setting-label">Лимит КАПСА (%)</div>
                            <div class="setting-description">Процент заглавных букв для триггера</div>
                        </div>
                        <input type="number" id="caps-threshold" value="${modSettings.autoModThresholds.caps}" min="1" max="100" style="padding: 8px; background: var(--surface-light); border: 1px solid var(--border); border-radius: 6px; color: var(--text); width: 80px;">
                    </div>
                    
                    <div class="setting-item">
                        <div>
                            <div class="setting-label">Макс предупреждений до мута</div>
                            <div class="setting-description">Количество предупреждений для автоматического мута</div>
                        </div>
                        <input type="number" id="warnings-threshold" value="${modSettings.autoModThresholds.maxWarnings}" min="1" max="10" style="padding: 8px; background: var(--surface-light); border: 1px solid var(--border); border-radius: 6px; color: var(--text); width: 80px;">
                    </div>
                </div>

                <button class="save-btn" onclick="saveModerationSettings('${guild.id}')" id="save-mod-btn">
                    <span class="nav-icon">💾</span>
                    Сохранить настройки модерации
                </button>

                <div id="mod-message" class="message"></div>
            </div>
        </div>
    </div>

    <script>
        function switchTab(tabName) {
            // Обновляем активную вкладку
            document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            
            event.target.classList.add('active');
            document.getElementById(tabName + '-tab').classList.add('active');
        }

        async function addRole(guildId, userId, userTag) {
            const select = document.getElementById('role-select-' + userId);
            const roleId = select.value;
            
            if (!roleId) {
                alert('Выберите роль!');
                return;
            }
            
            try {
                const response = await fetch('/api/guild/' + guildId + '/roles/' + userId, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        roleId: roleId,
                        action: 'add'
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    alert('✅ Роль выдана пользователю ' + userTag);
                    location.reload(); // Перезагружаем для обновления ролей
                } else {
                    alert('❌ Ошибка: ' + data.error);
                }
            } catch (error) {
                alert('❌ Ошибка при выдаче роли');
            }
        }

        async function removeRole(guildId, userId, userTag) {
            const select = document.getElementById('role-select-' + userId);
            const roleId = select.value;
            
            if (!roleId) {
                alert('Выберите роль!');
                return;
            }
            
            try {
                const response = await fetch('/api/guild/' + guildId + '/roles/' + userId, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        roleId: roleId,
                        action: 'remove'
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    alert('✅ Роль снята у пользователя ' + userTag);
                    location.reload();
                } else {
                    alert('❌ Ошибка: ' + data.error);
                }
            } catch (error) {
                alert('❌ Ошибка при снятии роли');
            }
        }

        async function saveModerationSettings(guildId) {
            const saveBtn = document.getElementById('save-mod-btn');
            const messageDiv = document.getElementById('mod-message');
            
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<div class="loading-spinner"></div> Сохранение...';
            
            const settings = {
                enabled: document.getElementById('moderation-enabled').checked,
                logChannel: document.getElementById('log-channel').value,
                muteRole: document.getElementById('mute-role').value,
                autoMod: {
                    spam: document.getElementById('auto-spam').checked,
                    caps: document.getElementById('auto-caps').checked,
                    inviteLinks: document.getElementById('auto-invites').checked
                },
                autoModThresholds: {
                    spam: parseInt(document.getElementById('spam-threshold').value),
                    caps: parseInt(document.getElementById('caps-threshold').value),
                    maxWarnings: parseInt(document.getElementById('warnings-threshold').value)
                }
            };
            
            try {
                const response = await fetch('/api/guild/' + guildId + '/moderation', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(settings)
                });
                
                const data = await response.json();
                
                if (data.success) {
                    messageDiv.className = 'message success';
                    messageDiv.textContent = '✅ Настройки модерации сохранены!';
                    
                    setTimeout(() => {
                        messageDiv.style.display = 'none';
                    }, 5000);
                } else {
                    throw new Error(data.error);
                }
            } catch (error) {
                messageDiv.className = 'message error';
                messageDiv.textContent = '❌ Ошибка: ' + error.message;
                
                setTimeout(() => {
                    messageDiv.style.display = 'none';
                }, 5000);
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<span class="nav-icon">💾</span> Сохранить настройки модерации';
            }
        }
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
            transcriptChannelId: TRANSCRIPT_CHANNEL_ID,
            translationEnabled: true,
            disabledTranslationChannels: [],
            protectedRoles: [],
            autoDeleteSettings: {
                enabled: false,
                delay: 5000,
                targetChannels: [],
                exemptRoles: []
            },
            voiceRegion: null,
            ticketSettings: {
                enabled: false,
                categoryId: null,
                moderatorRoles: []
            }
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

// ==================== ОБНОВЛЕННАЯ КОМАНДА РЕГИОНА (СЛЕШ-КОМАНДА) ====================

// Обработчик слеш-команды /регион
client.on('interactionCreate', async interaction => {
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
            // Проверяем, включена ли команда в настройках
            const commandSettings = getCommandSettings(guild.id);
            
            // Проверяем, есть ли настройки для этой команды и если она отключена
            if (commandSettings[commandName] && commandSettings[commandName].enabled === false) {
                return interaction.reply({ 
                    content: '❌ Эта команда отключена на этом сервере.', 
                    flags: 64 
                });
            }
            
            // Проверяем права доступа (если настроены роли)
            if (commandSettings[commandName]?.roles && commandSettings[commandName].roles.length > 0) {
                // Исключение: команду ping могут использовать все, даже без прав
                if (commandName !== 'ping') {
                    const hasRequiredRole = member.roles.cache.some(role => 
                        commandSettings[commandName].roles.includes(role.id)
                    );
                    
                    // Разрешаем администраторам использовать любые команды
                    const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator);
                    
                    if (!hasRequiredRole && !isAdmin) {
                        return interaction.reply({ 
                            content: '❌ У вас нет прав для использования этой команды.', 
                            flags: 64 
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Error checking command settings:', error);
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
                    
                    const newChannelId = options.getString('channel_id');
                    await interaction.deferReply({ flags: 64 });
                    
                    if (newChannelId === 'reset') {
                        const settings = getServerSettings(guild.id);
                        settings.transcriptChannelId = TRANSCRIPT_CHANNEL_ID;
                        saveServerSettings(guild.id, settings);
                        
                        await interaction.editReply({
                            content: `✅ Настройки сброшены к значению по умолчанию: \`${TRANSCRIPT_CHANNEL_ID}\``
                        });
                        return;
                    }

                    if (!/^\d{17,20}$/.test(newChannelId)) {
                        return interaction.editReply('❌ Укажите корректный ID канала (17-20 цифр)');
                    }

                    try {
                        const channel = await guild.channels.fetch(newChannelId);
                        if (!channel) {
                            throw new Error('Канал не найден');
                        }

                        const botMember = guild.members.me;
                        if (!channel.permissionsFor(botMember).has([PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.EmbedLinks])) {
                            throw new Error('У бота нет прав для отправки сообщений в этот канал');
                        }

                        const settings = getServerSettings(guild.id);
                        settings.transcriptChannelId = newChannelId;
                        saveServerSettings(guild.id, settings);

                        await interaction.editReply({
                            content: `✅ Канал для транскриптов установлен: <#${newChannelId}>`
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

                case 'clear':
                    if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                        return interaction.reply({ 
                            content: '❌ У вас нет прав для удаления сообщений!', 
                            flags: 64 
                        });
                    }
                    
                    const amount = options.getInteger('количество');
                    const targetUser = options.getUser('пользователь');
                    const olderThan = options.getInteger('сообщения_старше');
                    
                    await interaction.deferReply({ flags: 64 });
                    
                    try {
                        let messagesDeleted = 0;
                        
                        if (olderThan) {
                            // Удаление сообщений старше указанного времени
                            const cutoffTime = Date.now() - (olderThan * 24 * 60 * 60 * 1000);
                            let lastMessageId = null;
                            
                            while (messagesDeleted < amount) {
                                const fetched = await interaction.channel.messages.fetch({
                                    limit: Math.min(100, amount - messagesDeleted),
                                    before: lastMessageId
                                });
                                
                                if (fetched.size === 0) break;
                                
                                const toDelete = fetched.filter(msg => {
                                    if (msg.createdTimestamp < cutoffTime) {
                                        if (targetUser) {
                                            return msg.author.id === targetUser.id;
                                        }
                                        return true;
                                    }
                                    return false;
                                });
                                
                                if (toDelete.size === 0) break;
                                
                                await interaction.channel.bulkDelete(toDelete, true);
                                messagesDeleted += toDelete.size;
                                lastMessageId = fetched.last().id;
                                
                                if (toDelete.size < 100) break;
                            }
                        } else {
                            // Обычное удаление
                            const fetched = await interaction.channel.messages.fetch({
                                limit: amount
                            });
                            
                            const toDelete = targetUser ? 
                                fetched.filter(msg => msg.author.id === targetUser.id) :
                                fetched;
                            
                            if (toDelete.size > 0) {
                                await interaction.channel.bulkDelete(toDelete, true);
                                messagesDeleted = toDelete.size;
                            }
                        }
                        
                        const embed = new EmbedBuilder()
                            .setColor('#57F287')
                            .setTitle('🗑️ Сообщения удалены')
                            .addFields(
                                { name: '👤 Модератор', value: `${user.tag}`, inline: true },
                                { name: '📊 Удалено', value: `${messagesDeleted} сообщений`, inline: true },
                                { name: '📅 Канал', value: `<#${interaction.channel.id}>`, inline: false }
                            )
                            .setTimestamp();
                        
                        await interaction.editReply({ embeds: [embed] });
                        
                        // Автоматическое удаление сообщения через 5 секунд
                        setTimeout(async () => {
                            try {
                                await interaction.deleteReply();
                            } catch (error) {}
                        }, 5000);
                        
                        // Логирование
                       const modSettings = getModerationSettings(guildId);
                        if (modSettings.logChannel) {
                            const logChannel = guild.channels.cache.get(modSettings.logChannel);
                            if (logChannel) {
                                const logEmbed = new EmbedBuilder()
                                    .setColor('#5865F2')
                                    .setTitle('🧹 Очистка сообщений')
                                    .addFields(
                                        { name: '👤 Модератор', value: `${user.tag}`, inline: true },
                                        { name: '📊 Удалено', value: `${messagesDeleted} сообщений`, inline: true },
                                        { name: '📅 Канал', value: `<#${interaction.channel.id}>`, inline: false },
                                        { name: '👤 Целевой пользователь', value: targetUser ? targetUser.tag : 'Все пользователи', inline: false }
                                    )
                                    .setTimestamp();
                                
                                await logChannel.send({ embeds: [logEmbed] });
                            }
                        }
                        
                    } catch (error) {
                        console.error('Clear error:', error);
                        await interaction.editReply('❌ Ошибка при удалении сообщений!');
                    }
                    break;

                case 'bans':
                    if (!member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
                        return interaction.reply({ 
                            content: '❌ У вас нет прав для просмотра банов!', 
                            flags: 64 
                        });
                    }
                    
                    const page = options.getInteger('страница') || 1;
                    const perPage = 10;
                    
                    await interaction.deferReply({ flags: 64 });
                    
                    try {
                        const bans = await guild.bans.fetch();
                        const totalBans = bans.size;
                        const totalPages = Math.ceil(totalBans / perPage);
                        
                        if (totalBans === 0) {
                            return interaction.editReply('✅ На этом сервере нет забаненных пользователей.');
                        }
                        
                        if (page > totalPages) {
                            return interaction.editReply(`❌ Страница ${page} не существует. Всего страниц: ${totalPages}`);
                        }
                        
                        const startIndex = (page - 1) * perPage;
                        const endIndex = startIndex + perPage;
                        const pageBans = Array.from(bans.values()).slice(startIndex, endIndex);
                        
                        const bansList = pageBans.map((ban, index) => {
                            const banNumber = startIndex + index + 1;
                            const reason = ban.reason || 'Причина не указана';
                            return `**${banNumber}.** ${ban.user.tag} (${ban.user.id})\n📝 **Причина:** ${reason.substring(0, 100)}${reason.length > 100 ? '...' : ''}`;
                        }).join('\n\n');
                        
                        const bansEmbed = new EmbedBuilder()
                            .setColor('#ED4245')
                            .setTitle(`🔨 Список банов - Страница ${page}/${totalPages}`)
                            .setDescription(bansList || 'Нет данных')
                            .addFields(
                                { name: '📊 Всего банов', value: `${totalBans}`, inline: true },
                                { name: '📅 Забанены', value: `${pageBans.length} на этой странице`, inline: true }
                            )
                            .setFooter({ text: `Используйте /bans страница: ${page + 1} для следующей страницы` })
                            .setTimestamp();
                        
                        await interaction.editReply({ embeds: [bansEmbed] });
                        
                    } catch (error) {
                        console.error('Bans list error:', error);
                        await interaction.editReply('❌ Ошибка при получении списка банов!');
                    }
                    break;

                case 'ban':
                    if (!member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
                        return interaction.reply({ 
                            content: '❌ У вас нет прав для бана!', 
                            flags: 64 
                        });
                    }
                    
                    const userToBan = options.getUser('пользователь');
                    const reason = options.getString('причина') || 'Причина не указана';
                    const days = options.getInteger('дни') || 0;
                    
                    await interaction.deferReply({ flags: 64 });
                    
                    try {
                        const memberToBan = await guild.members.fetch(userToBan.id);
                        
                        if (!memberToBan.bannable) {
                            return interaction.editReply('❌ Я не могу забанить этого пользователя!');
                        }
                        
                        if (memberToBan.roles.highest.position >= member.roles.highest.position) {
                            return interaction.editReply('❌ Вы не можете забанить пользователя с ролью выше или равной вашей!');
                        }
                        
                        await memberToBan.ban({ 
                            deleteMessageSeconds: days * 24 * 60 * 60,
                            reason: `${reason} (Забанено: ${user.tag})`
                        });
                        
                        // Логирование
                        const modSettings = getModerationSettings(guild.id);
                        if (modSettings.logChannel) {
                            const logChannel = guild.channels.cache.get(modSettings.logChannel);
                            if (logChannel) {
                                const banLogEmbed = new EmbedBuilder()
                                    .setColor('#ED4245')
                                    .setTitle('🔨 Пользователь забанен')
                                    .addFields(
                                        { name: '👤 Пользователь', value: `${userToBan.tag} (${userToBan.id})`, inline: true },
                                        { name: '👮 Модератор', value: `${user.tag}`, inline: true },
                                        { name: '📅 Дата', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
                                        { name: '📝 Причина', value: reason, inline: false }
                                    )
                                    .setFooter({ text: `Удалено сообщений: ${days} дней` })
                                    .setTimestamp();
                                
                                await logChannel.send({ embeds: [banLogEmbed] });
                            }
                        }
                        
                        await interaction.editReply(`✅ Пользователь ${userToBan.tag} забанен!`);
                        
                    } catch (error) {
                        console.error('Ban error:', error);
                        await interaction.editReply('❌ Ошибка при бане пользователя!');
                    }
                    break;

                case 'kick':
                    if (!member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
                        return interaction.reply({ 
                            content: '❌ У вас нет прав для кика!', 
                            flags: 64 
                        });
                    }
                    
                    const userToKick = options.getUser('пользователь');
                    const kickReason = options.getString('причина') || 'Причина не указана';
                    
                    await interaction.deferReply({ flags: 64 });
                    
                    try {
                        const memberToKick = await guild.members.fetch(userToKick.id);
                        
                        if (!memberToKick.kickable) {
                            return interaction.editReply('❌ Я не могу кикнуть этого пользователя!');
                        }
                        
                        if (memberToKick.roles.highest.position >= member.roles.highest.position) {
                            return interaction.editReply('❌ Вы не можете кикнуть пользователя с ролью выше или равной вашей!');
                        }
                        
                        await memberToKick.kick(`${kickReason} (Кикнуто: ${user.tag})`);
                        
                        // Логирование
                        const modSettings = getModerationSettings(guild.id);
                        if (modSettings.logChannel) {
                            const logChannel = guild.channels.cache.get(modSettings.logChannel);
                            if (logChannel) {
                                const kickLogEmbed = new EmbedBuilder()
                                    .setColor('#FEE75C')
                                    .setTitle('👢 Пользователь кикнут')
                                    .addFields(
                                        { name: '👤 Пользователь', value: `${userToKick.tag} (${userToKick.id})`, inline: true },
                                        { name: '👮 Модератор', value: `${user.tag}`, inline: true },
                                        { name: '📅 Дата', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
                                        { name: '📝 Причина', value: kickReason, inline: false }
                                    )
                                    .setTimestamp();
                                
                                await logChannel.send({ embeds: [kickLogEmbed] });
                            }
                        }
                        
                        await interaction.editReply(`✅ Пользователь ${userToKick.tag} кикнут!`);
                        
                    } catch (error) {
                        console.error('Kick error:', error);
                        await interaction.editReply('❌ Ошибка при кике пользователя!');
                    }
                    break;

                case 'mute':
                    if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
                        return interaction.reply({ 
                            content: '❌ У вас нет прав для мута!', 
                            flags: 64 
                        });
                    }
                    
                    const userToMute = options.getUser('пользователь');
                    const muteTime = options.getString('время');
                    const muteReason = options.getString('причина') || 'Причина не указана';
                    
                    await interaction.deferReply({ flags: 64 });
                    
                    try {
                        const memberToMute = await guild.members.fetch(userToMute.id);
                        const settings = getModerationSettings(guild.id);
                        
                        // Получаем роль мута
                        let muteRole = null;
                        if (settings.muteRole) {
                            muteRole = guild.roles.cache.get(settings.muteRole);
                        }
                        
                        if (!muteRole) {
                            // Создаем роль мута если нет
                            muteRole = await guild.roles.create({
                                name: 'Muted',
                                color: '#2F3136',
                                permissions: [],
                                reason: 'Автоматическое создание роли мута'
                            });
                            
                            // Настраиваем права для всех каналов
                            guild.channels.cache.forEach(async channel => {
                                if (channel.isTextBased() || channel.isVoiceBased()) {
                                    await channel.permissionOverwrites.edit(muteRole, {
                                        SendMessages: false,
                                        Speak: false,
                                        AddReactions: false
                                    });
                                }
                            });
                            
                            settings.muteRole = muteRole.id;
                            saveModerationSettings(guild.id, settings);
                        }
                        
                        // Парсим время мута
                        let timeMs = 0;
                        const timeMatch = muteTime.match(/^(\d+)([mhd])$/i);
                        
                        if (timeMatch) {
                            const amount = parseInt(timeMatch[1]);
                            const unit = timeMatch[2].toLowerCase();
                            
                            switch(unit) {
                                case 'm': timeMs = amount * 60 * 1000; break;
                                case 'h': timeMs = amount * 60 * 60 * 1000; break;
                                case 'd': timeMs = amount * 24 * 60 * 60 * 1000; break;
                            }
                        }
                        
                        if (timeMs === 0 || timeMs > 28 * 24 * 60 * 60 * 1000) {
                            return interaction.editReply('❌ Неверное время мута! Используйте формат: 1m, 1h, 1d (максимум 28 дней)');
                        }
                        
                        // Выдаем роль мута
                        await memberToMute.roles.add(muteRole, `${muteReason} (Замутил: ${user.tag})`);
                        
                        // Сохраняем время размута
                        const unmuteTime = Date.now() + timeMs;
                        mutedUsers.set(`${guild.id}-${userToMute.id}`, {
                            userId: userToMute.id,
                            guildId: guild.id,
                            unmuteTime: unmuteTime,
                            moderator: user.id
                        });
                        
                        // Устанавливаем таймер для автоматического размута
                        setTimeout(async () => {
                            try {
                                const member = await guild.members.fetch(userToMute.id);
                                if (member && member.roles.cache.has(muteRole.id)) {
                                    await member.roles.remove(muteRole, 'Автоматический размут');
                                    mutedUsers.delete(`${guild.id}-${userToMute.id}`);
                                }
                            } catch (error) {
                                console.error('Auto unmute error:', error);
                            }
                        }, timeMs);
                        
                        // Логирование
                        if (settings.logChannel) {
                            const logChannel = guild.channels.cache.get(settings.logChannel);
                            if (logChannel) {
                                const muteLogEmbed = new EmbedBuilder()
                                    .setColor('#FEE75C')
                                    .setTitle('🔇 Пользователь замучен')
                                    .addFields(
                                        { name: '👤 Пользователь', value: `${userToMute.tag} (${userToMute.id})`, inline: true },
                                        { name: '👮 Модератор', value: `${user.tag}`, inline: true },
                                        { name: '⏰ Время', value: muteTime, inline: true },
                                        { name: '📅 Размут', value: `<t:${Math.floor(unmuteTime / 1000)}:R>`, inline: false },
                                        { name: '📝 Причина', value: muteReason, inline: false }
                                    )
                                    .setTimestamp();
                                
                                await logChannel.send({ embeds: [muteLogEmbed] });
                            }
                        }
                        
                        await interaction.editReply(`✅ Пользователь ${userToMute.tag} замучен на ${muteTime}!`);
                        
                    } catch (error) {
                        console.error('Mute error:', error);
                        await interaction.editReply('❌ Ошибка при муте пользователя!');
                    }
                    break;

                case 'unmute':
                    if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
                        return interaction.reply({ 
                            content: '❌ У вас нет прав для снятия мута!', 
                            flags: 64 
                        });
                    }
                    
                    const userToUnmute = options.getUser('пользователь');
                    const unmuteReason = options.getString('причина') || 'Причина не указана';
                    
                    await interaction.deferReply({ flags: 64 });
                    
                    try {
                        const memberToUnmute = await guild.members.fetch(userToUnmute.id);
                        const settings = getModerationSettings(guild.id);
                        
                        if (!settings.muteRole) {
                            return interaction.editReply('❌ Роль мута не настроена на этом сервере!');
                        }
                        
                        const muteRole = guild.roles.cache.get(settings.muteRole);
                        if (!muteRole) {
                            return interaction.editReply('❌ Роль мута не найдена!');
                        }
                        
                        if (!memberToUnmute.roles.cache.has(muteRole.id)) {
                            return interaction.editReply('❌ Этот пользователь не замучен!');
                        }
                        
                        // Снимаем мут
                        await memberToUnmute.roles.remove(muteRole, `${unmuteReason} (Размутил: ${user.tag})`);
                        mutedUsers.delete(`${guild.id}-${userToUnmute.id}`);
                        
                        // Логирование
                        if (settings.logChannel) {
                            const logChannel = guild.channels.cache.get(settings.logChannel);
                            if (logChannel) {
                                const unmuteLogEmbed = new EmbedBuilder()
                                    .setColor('#57F287')
                                    .setTitle('🔊 Пользователь размучен')
                                    .addFields(
                                        { name: '👤 Пользователь', value: `${userToUnmute.tag} (${userToUnmute.id})`, inline: true },
                                        { name: '👮 Модератор', value: `${user.tag}`, inline: true },
                                        { name: '📝 Причина', value: unmuteReason, inline: false }
                                    )
                                    .setTimestamp();
                                
                                await logChannel.send({ embeds: [unmuteLogEmbed] });
                            }
                        }
                        
                        await interaction.editReply(`✅ Пользователь ${userToUnmute.tag} размучен!`);
                        
                    } catch (error) {
                        console.error('Unmute error:', error);
                        await interaction.editReply('❌ Ошибка при размуте пользователя!');
                    }
                    break;

                case 'warn':
                    if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
                        return interaction.reply({ 
                            content: '❌ У вас нет прав для выдачи предупреждений!', 
                            flags: 64 
                        });
                    }
                    
                    const userToWarn = options.getUser('пользователь');
                    const warnReason = options.getString('причина');
                    
                    if (!warnReason) {
                        return interaction.reply({ 
                            content: '❌ Укажите причину предупреждения!', 
                            flags: 64 
                        });
                    }
                    
                    await interaction.deferReply({ flags: 64 });
                    
                    try {
                        const memberToWarn = await guild.members.fetch(userToWarn.id);
                        const settings = getModerationSettings(guild.id);
                        
                        // Получаем текущие предупреждения
                        if (!settings.warnings.has(userToWarn.id)) {
                            settings.warnings.set(userToWarn.id, []);
                        }
                        
                        const userWarnings = settings.warnings.get(userToWarn.id);
                        
                        // Добавляем новое предупреждение
                        const warning = {
                            id: Date.now(),
                            userId: userToWarn.id,
                            moderatorId: user.id,
                            moderatorTag: user.tag,
                            reason: warnReason,
                            date: Date.now(),
                            active: true
                        };
                        
                        userWarnings.push(warning);
                        settings.warnings.set(userToWarn.id, userWarnings);
                        saveModerationSettings(guild.id, settings);
                        
                        // Проверяем, не превышен ли лимит предупреждений
                        const activeWarnings = userWarnings.filter(w => w.active);
                        
                        if (activeWarnings.length >= settings.autoModThresholds.maxWarnings) {
                            // Автоматический мут при превышении лимита
                            if (settings.muteRole) {
                                const muteRole = guild.roles.cache.get(settings.muteRole);
                                if (muteRole) {
                                    await memberToWarn.roles.add(muteRole, `Автоматический мут за ${activeWarnings.length} предупреждений`);
                                    
                                    // Устанавливаем таймер на 24 часа
                                    const unmuteTime = Date.now() + 24 * 60 * 60 * 1000;
                                    mutedUsers.set(`${guild.id}-${userToWarn.id}`, {
                                        userId: userToWarn.id,
                                        guildId: guild.id,
                                        unmuteTime: unmuteTime,
                                        moderator: 'system'
                                    });
                                    
                                    setTimeout(async () => {
                                        try {
                                            const member = await guild.members.fetch(userToWarn.id);
                                            if (member && member.roles.cache.has(muteRole.id)) {
                                                await member.roles.remove(muteRole, 'Автоматический размут');
                                                mutedUsers.delete(`${guild.id}-${userToWarn.id}`);
                                            }
                                        } catch (error) {
                                            console.error('Auto unmute error:', error);
                                        }
                                    }, 24 * 60 * 60 * 1000);
                                }
                            }
                        }
                        
                        // Логирование
                        if (settings.logChannel) {
                            const logChannel = guild.channels.cache.get(settings.logChannel);
                            if (logChannel) {
                                const warnLogEmbed = new EmbedBuilder()
                                    .setColor('#FEE75C')
                                    .setTitle('⚠️ Выдано предупреждение')
                                    .addFields(
                                        { name: '👤 Пользователь', value: `${userToWarn.tag} (${userToWarn.id})`, inline: true },
                                        { name: '👮 Модератор', value: `${user.tag}`, inline: true },
                                        { name: '📊 Всего предупреждений', value: `${activeWarnings.length}/${settings.autoModThresholds.maxWarnings}`, inline: true },
                                        { name: '📝 Причина', value: warnReason, inline: false },
                                        { name: 'ℹ️ ID предупреждения', value: `\`${warning.id}\``, inline: false }
                                    )
                                    .setTimestamp();
                                
                                await logChannel.send({ embeds: [warnLogEmbed] });
                            }
                        }
                        
                        await interaction.editReply(`✅ Пользователю ${userToWarn.tag} выдано предупреждение (${activeWarnings.length}/${settings.autoModThresholds.maxWarnings})!`);
                        
                    } catch (error) {
                        console.error('Warn error:', error);
                        await interaction.editReply('❌ Ошибка при выдаче предупреждения!');
                    }
                    break;

                case 'warnings':
                    const userToCheck = options.getUser('пользователь');
                    
                    await interaction.deferReply({ flags: 64 });
                    
                    try {
                        const settings = getModerationSettings(guild.id);
                        const userWarnings = settings.warnings.get(userToCheck.id) || [];
                        const activeWarnings = userWarnings.filter(w => w.active);
                        
                        if (activeWarnings.length === 0) {
                            return interaction.editReply(`✅ У пользователя ${userToCheck.tag} нет активных предупреждений.`);
                        }
                        
                        const warningsList = activeWarnings.map(w => 
                            `**#${w.id}** - <t:${Math.floor(w.date / 1000)}:R>\n👮 **Модератор:** ${w.moderatorTag}\n📝 **Причина:** ${w.reason}`
                        ).join('\n\n');
                        
                        const warningsEmbed = new EmbedBuilder()
                            .setColor('#FEE75C')
                            .setTitle(`⚠️ Предупреждения ${userToCheck.tag}`)
                            .setDescription(warningsList)
                            .addFields(
                                { name: '📊 Активных предупреждений', value: `${activeWarnings.length}/${settings.autoModThresholds.maxWarnings}`, inline: false }
                            )
                            .setFooter({ text: `Используйте /clearwarns для очистки предупреждений` })
                            .setTimestamp();
                        
                        await interaction.editReply({ embeds: [warningsEmbed] });
                        
                    } catch (error) {
                        console.error('Warnings check error:', error);
                        await interaction.editReply('❌ Ошибка при получении предупреждений!');
                    }
                    break;

                case 'clearwarns':
                    if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
                        return interaction.reply({ 
                            content: '❌ У вас нет прав для очистки предупреждений!', 
                            flags: 64 
                        });
                    }
                    
                    const userToClear = options.getUser('пользователь');
                    
                    await interaction.deferReply({ flags: 64 });
                    
                    try {
                        const settings = getModerationSettings(guild.id);
                        
                        if (!settings.warnings.has(userToClear.id)) {
                            return interaction.editReply(`✅ У пользователя ${userToClear.tag} нет предупреждений.`);
                        }
                        
                        const userWarnings = settings.warnings.get(userToClear.id);
                        const clearedCount = userWarnings.filter(w => w.active).length;
                        
                        // Деактивируем все предупреждения
                        userWarnings.forEach(w => w.active = false);
                        settings.warnings.set(userToClear.id, userWarnings);
                        saveModerationSettings(guild.id, settings);
                        
                        // Снимаем мут если был
                        if (settings.muteRole) {
                            const member = await guild.members.fetch(userToClear.id).catch(() => null);
                            if (member) {
                                const muteRole = guild.roles.cache.get(settings.muteRole);
                                if (muteRole && member.roles.cache.has(muteRole.id)) {
                                    await member.roles.remove(muteRole, 'Очистка предупреждений');
                                    mutedUsers.delete(`${guild.id}-${userToClear.id}`);
                                }
                            }
                        }
                        
                        await interaction.editReply(`✅ Очищено ${clearedCount} предупреждений у пользователя ${userToClear.tag}`);
                        
                    } catch (error) {
                        console.error('Clear warns error:', error);
                        await interaction.editReply('❌ Ошибка при очистке предупреждений!');
                    }
                    break;

                case 'modsetup':
                    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                        return interaction.reply({ 
                            content: '❌ Только администраторы могут настраивать модерацию!', 
                            flags: 64 
                        });
                    }
                    
                    const logChannelOption = options.getChannel('канал');
                    const muteRoleOption = options.getRole('роль');
                    const statusOption = options.getBoolean('статус');
                    
                    await interaction.deferReply({ flags: 64 });
                    
                    try {
                        const settings = getModerationSettings(guild.id);
                        
                        if (logChannelOption) {
                            settings.logChannel = logChannelOption.id;
                        }
                        
                        if (muteRoleOption) {
                            settings.muteRole = muteRoleOption.id;
                            
                            // Настраиваем права для роли мута
                            guild.channels.cache.forEach(async channel => {
                                if (channel.isTextBased() || channel.isVoiceBased()) {
                                    await channel.permissionOverwrites.edit(muteRoleOption, {
                                        SendMessages: false,
                                        Speak: false,
                                        AddReactions: false
                                    });
                                }
                            });
                        }
                        
                        if (statusOption !== null) {
                            settings.enabled = statusOption;
                        }
                        
                        saveModerationSettings(guild.id, settings);
                        
                        const modSetupEmbed = new EmbedBuilder()
                            .setColor('#57F287')
                            .setTitle('⚙️ Настройки модерации обновлены')
                            .addFields(
                                { name: '📝 Канал логов', value: logChannelOption ? `<#${logChannelOption.id}>` : 'Не изменен', inline: true },
                                { name: '🔇 Роль мута', value: muteRoleOption ? muteRoleOption.name : 'Не изменена', inline: true },
                                { name: '🔄 Статус', value: statusOption !== null ? (statusOption ? '✅ Включена' : '❌ Выключена') : 'Не изменен', inline: true }
                            )
                            .setFooter({ text: 'Используйте /modsetup для дальнейших настроек' })
                            .setTimestamp();
                        
                        await interaction.editReply({ embeds: [modSetupEmbed] });
                        
                    } catch (error) {
                        console.error('Mod setup error:', error);
                        await interaction.editReply('❌ Ошибка при настройке модерации!');
                    }
                    break;

                case 'ticket':
                    // Проверяем права администратора
                    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                        return interaction.reply({ 
                            content: '❌ Только администраторы могут настраивать систему тикетов!', 
                            flags: 64 
                        });
                    }

                    const ticketChannelId = options.getString('channel_id');
                    const categoryId = options.getString('category_id');
                    const roleIds = options.getString('role_ids').split(',').map(id => id.trim());

                    await interaction.deferReply({ flags: 64 });

                    try {
                        const guild = interaction.guild;
                        const targetChannel = await guild.channels.fetch(ticketChannelId);
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
                            channelId: ticketChannelId,
                            categoryId: categoryId,
                            roleIds: validRoles,
                            guildId: guild.id
                        });

                        // Создаем сообщение с кнопкой
                        const button = new ButtonBuilder()
                            .setCustomId("create_regiment_request")
                            .setLabel("Создать заявку в полк")
                            .setStyle(ButtonStyle.Primary);

                        const row = new ActionRowBuilder().addComponents(button);

                        const ticketEmbed = new EmbedBuilder()
                            .setTitle("Заявка в полк | Application to the regiment")
                            .setDescription("Чтобы создать заявку нажмите ниже на кнопку \"Создать заявку в полк\"\nTo create a request, click the button below.")
                            .setColor(3447003)
                            .setTimestamp();

                        await targetChannel.send({ embeds: [ticketEmbed], components: [row] });

                        // Сообщение об успешной настройке
                        const successEmbed = new EmbedBuilder()
                            .setColor('#727070')
                            .setTitle(':white_check_mark: Система заявок настроена')
                            .setDescription(`
**Канал с кнопкой:** <#${ticketChannelId}>
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
    let regionAction = options.getString('действие'); // Используем let вместо const
    
    // Проверка прав доступа к команде
    if (!checkRegionAccess(member)) {
        return interaction.reply({ 
            content: '❌ У вас нет прав для использования этой команды!', 
            flags: 64 
        });
    }
    
    await interaction.deferReply({ flags: 64 });
    
    try {
        switch(regionAction) {
            case 'set':
                const channelId = options.getString('channel_id');
                const region = options.getString('регион'); // Исправлено на region
                
                if (!channelId || !region) {
                    return interaction.editReply('❌ Укажите ID канала и код региона!');
                }
                
                // Проверка валидности кода региона
                if (!availableRegions.includes(region.toLowerCase())) {
                    return interaction.editReply('❌ Неверный код региона! Используйте `/регион список` для просмотра доступных регионов.');
                }
                
                // Получение голосового канала
                const voiceChannel = await guild.channels.fetch(channelId);
                if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
                    return interaction.editReply('❌ Укажите ID голосового канала!');
                }
                
                // Проверка прав бота
                if (!voiceChannel.permissionsFor(guild.members.me).has(PermissionsBitField.Flags.ManageChannels)) {
                    return interaction.editReply('❌ У бота нет прав для управления этим каналам!');
                }
                
                // Изменение региона
                await voiceChannel.setRTCRegion(region.toLowerCase());
                
                // Сохранение настроек
                const regionSettings = voiceRegionSettings.get(guild.id) || {};
                voiceRegionSettings.set(guild.id, {
                    ...regionSettings,
                    [voiceChannel.id]: region.toLowerCase()
                });
                
                await interaction.editReply(`✅ Регион голосового канала <#${voiceChannel.id}> изменен на **${getRegionName(region.toLowerCase())}**`);
                break;
                
            case 'статус':
                const currentRegionSettings = voiceRegionSettings.get(guild.id) || {};
                const channelsWithRegions = Object.entries(currentRegionSettings);
                
                if (channelsWithRegions.length === 0) {
                    await interaction.editReply('❌ На этом сервере нет настроенных регионов голосовых каналов.');
                } else {
                    const regionList = channelsWithRegions.map(([channelId, regionCode]) => {
                        const channel = guild.channels.cache.get(channelId);
                        return channel ? `• <#${channelId}>: **${getRegionName(regionCode)}**` : `• Канал ${channelId}: **${getRegionName(regionCode)}**`;
                    }).join('\n');
                    
                    const embed = new EmbedBuilder()
                        .setColor('#5865F2')
                        .setTitle('🌍 Настроенные голосовые регионы')
                        .setDescription(regionList)
                        .setFooter({ text: `Используйте /регион сброс для сброса настроек` })
                        .setTimestamp();
                    
                    await interaction.editReply({ embeds: [embed] });
                }
                break;
                
            case 'сброс':
                voiceRegionSettings.delete(guild.id);
                await interaction.editReply('✅ Настройки регионов сброшены для этого сервера.');
                break;
                
            case 'список':
                const regionsList = availableRegions.map(regionCode => 
                    `• **${regionCode}** - ${getRegionName(regionCode)}`
                ).join('\n');
                
                const embed = new EmbedBuilder()
                    .setColor('#57F287')
                    .setTitle('🌍 Доступные регионы Discord')
                    .setDescription(regionsList)
                    .setFooter({ text: 'Используйте /регион set для установки региона' })
                    .setTimestamp();
                
                await interaction.editReply({ embeds: [embed] });
                break;
                
            case 'доступ':
                const hasAccess = checkRegionAccess(member);
                const allowedRoles = ALLOWED_REGION_ROLES.map(roleId => {
                    const role = guild.roles.cache.get(roleId);
                    return role ? `• ${role.name}` : `• Роль ${roleId}`;
                }).join('\n');
                
                const accessEmbed = new EmbedBuilder()
                    .setColor(hasAccess ? '#57F287' : '#ED4245')
                    .setTitle('🔐 Доступ к команде /регион')
                    .addFields(
                        { name: '📊 Ваш доступ', value: hasAccess ? '✅ Разрешено' : '❌ Запрещено', inline: true },
                        { name: '👥 Разрешенные роли', value: ALLOWED_REGION_ROLES.length > 0 ? allowedRoles : 'Все пользователи', inline: false }
                    )
                    .setTimestamp();
                
                await interaction.editReply({ embeds: [accessEmbed] });
                break;
                
            default:
                await interaction.editReply('❌ Неизвестное действие! Используйте: set, статус, сброс, список, доступ');
        }
    } catch (error) {
        console.error('Ошибка команды регион:', error);
        await interaction.editReply(`❌ Ошибка: ${error.message}`);
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
// ==================== АВТОМАТИЧЕСКАЯ МОДЕРАЦИЯ ====================

const userMessageCache = new Map();

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.guild) return;
    
    const settings = getModerationSettings(message.guild.id);
    if (!settings.enabled || !settings.autoMod) return;
    
    const userId = message.author.id;
    const now = Date.now();
    
    // Проверка на спам
    if (settings.autoMod.spam) {
        if (!userMessageCache.has(userId)) {
            userMessageCache.set(userId, []);
        }
        
        const userMessages = userMessageCache.get(userId);
        userMessages.push(now);
        
        // Оставляем только сообщения за последние 5 секунд
        const recentMessages = userMessages.filter(time => now - time < 5000);
        userMessageCache.set(userId, recentMessages);
        
        if (recentMessages.length >= settings.autoModThresholds.spam) {
            await message.delete().catch(() => {});
            
            // Выдаем предупреждение
            if (!settings.warnings.has(userId)) {
                settings.warnings.set(userId, []);
            }
            
            const warnings = settings.warnings.get(userId);
            warnings.push({
                id: Date.now(),
                userId: userId,
                moderatorId: client.user.id,
                moderatorTag: client.user.tag,
                reason: 'Спам',
                date: now,
                active: true
            });
            
            // Уведомляем пользователя
            try {
                await message.author.send('⚠️ Пожалуйста, не спамьте! Вам выдано предупреждение за спам.');
            } catch {}
            
            return;
        }
    }
    
    // Проверка на КАПС
    if (settings.autoMod.caps && message.content.length > 10) {
        const capsCount = (message.content.match(/[A-ZА-ЯЁ]/g) || []).length;
        const capsPercentage = (capsCount / message.content.length) * 100;
        
        if (capsPercentage >= settings.autoModThresholds.caps) {
            await message.delete().catch(() => {});
            
            try {
                await message.author.send('⚠️ Пожалуйста, не пишите заглавными буквами!');
            } catch {}
            
            return;
        }
    }
    
    // Проверка на приглашения
    if (settings.autoMod.inviteLinks) {
        const inviteRegex = /(discord\.(gg|io|me|li)\/.+|discordapp\.com\/invite\/.+)/gi;
        if (inviteRegex.test(message.content)) {
            await message.delete().catch(() => {});
            
            try {
                await message.author.send('⚠️ Запрещено отправлять приглашения на другие серверы!');
            } catch {}
            
            return;
        }
    }
    
    // Проверка на плохие слова
    if (settings.autoMod.badWords) {
        const lowerMessage = message.content.toLowerCase();
        const hasBadWord = BAD_WORDS.some(word => lowerMessage.includes(word));
        
        if (hasBadWord) {
            await message.delete().catch(() => {});
            
            try {
                await message.author.send('⚠️ Пожалуйста, соблюдайте правила общения!');
            } catch {}
            
            return;
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
    
    // Запускаем проверку мутов
    startMuteChecker();
    
    const transcriptChannel = client.channels.cache.get(TRANSCRIPT_CHANNEL_ID);
    if (transcriptChannel) {
        console.log(`✅ Transcript channel found: #${transcriptChannel.name}`);
    } else {
        console.log(`❌ Transcript channel not found! Check ID: ${TRANSCRIPT_CHANNEL_ID}`);
    }
});

// Функция проверки и автоматического размута
async function startMuteChecker() {
    setInterval(async () => {
        const now = Date.now();
        for (const [key, muteData] of mutedUsers.entries()) {
            if (muteData.unmuteTime <= now) {
                try {
                    const guild = client.guilds.cache.get(muteData.guildId);
                    if (guild) {
                        const settings = getModerationSettings(guild.id);
                        if (settings.muteRole) {
                            const member = await guild.members.fetch(muteData.userId).catch(() => null);
                            const muteRole = guild.roles.cache.get(settings.muteRole);
                            
                            if (member && muteRole && member.roles.cache.has(muteRole.id)) {
                                await member.roles.remove(muteRole, 'Автоматический размут');
                                
                                // Логирование
                                if (settings.logChannel) {
                                    const logChannel = guild.channels.cache.get(settings.logChannel);
                                    if (logChannel) {
                                        const embed = new EmbedBuilder()
                                            .setColor('#57F287')
                                            .setTitle('🔊 Автоматический размут')
                                            .addFields(
                                                { name: '👤 Пользователь', value: `${member.user.tag} (${member.user.id})`, inline: true },
                                                { name: '⏰ Длительность', value: 'Истекло время мута', inline: true }
                                            )
                                            .setTimestamp();
                                        
                                        await logChannel.send({ embeds: [embed] });
                                    }
                                }
                            }
                        }
                    }
                    mutedUsers.delete(key);
                } catch (error) {
                    console.error('Auto-unmute error:', error);
                }
            }
        }
    }, 60000); // Проверяем каждую минуту
}

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

// ==================== СИСТЕМА МОДЕРАЦИИ ====================

const moderationSettings = new Map();
const mutedUsers = new Map();

// Настройки по умолчанию (полная структура с autoMod)
const DEFAULT_MODERATION_SETTINGS = {
    enabled: false, // По умолчанию выключено
    logChannel: null,
    muteRole: null,
    // ДОБАВЛЯЕМ autoMod
    autoMod: {
        enabled: false, // Авто-модерация выключена по умолчанию
        spam: false,
        caps: false,
        links: false,
        inviteLinks: false,
        badWords: false
    },
    autoModThresholds: {
        spam: 5,           // сообщений в 5 секунд
        caps: 70,          // процент заглавных букв
        maxWarnings: 3,    // предупреждений до мута
        muteDuration: 60 * 60 * 1000 // 1 час
    },
    warnings: new Map(),
    warnAutoDelete: true,
    logBans: true,
    logKicks: true,
    logMutes: true,
    logWarns: true,
    logClears: true
};

// Список плохих слов (можно расширить)
const BAD_WORDS = [
    // Русские плохие слова
    'редиска', 'дурак',
    
    // Английские плохие слова
    'fuck', 'shit', 'asshole'
];

// Функция получения настроек модерации
function getModerationSettings(guildId) {
    if (!moderationSettings.has(guildId)) {
        // Создаем глубокую копию настроек по умолчанию
        const defaultSettings = JSON.parse(JSON.stringify(DEFAULT_MODERATION_SETTINGS));
        
        // Восстанавливаем Map для warnings
        defaultSettings.warnings = new Map();
        
        // Сохраняем настройки
        moderationSettings.set(guildId, defaultSettings);
        console.log(`⚙️ Created default moderation settings for guild: ${guildId}`);
    }
    
    const settings = moderationSettings.get(guildId);
    
    // ГАРАНТИРУЕМ, что autoMod существует
    if (!settings.autoMod) {
        console.log(`⚠️ autoMod missing, creating default for guild: ${guildId}`);
        settings.autoMod = { ...DEFAULT_MODERATION_SETTINGS.autoMod };
    }
    
    // Проверяем все поля autoMod
    const requiredAutoModFields = ['enabled', 'spam', 'caps', 'links', 'inviteLinks', 'badWords'];
    requiredAutoModFields.forEach(field => {
        if (settings.autoMod[field] === undefined) {
            settings.autoMod[field] = DEFAULT_MODERATION_SETTINGS.autoMod[field];
        }
    });
    
    // ГАРАНТИРУЕМ, что autoModThresholds существует
    if (!settings.autoModThresholds) {
        console.log(`⚠️ autoModThresholds missing, creating default for guild: ${guildId}`);
        settings.autoModThresholds = { ...DEFAULT_MODERATION_SETTINGS.autoModThresholds };
    }
    
    // Проверяем все поля autoModThresholds
    const requiredThresholdFields = ['spam', 'caps', 'maxWarnings', 'muteDuration'];
    requiredThresholdFields.forEach(field => {
        if (settings.autoModThresholds[field] === undefined) {
            settings.autoModThresholds[field] = DEFAULT_MODERATION_SETTINGS.autoModThresholds[field];
        }
    });
    
    // ГАРАНТИРУЕМ, что warnings существует как Map
    if (!settings.warnings || !(settings.warnings instanceof Map)) {
        settings.warnings = new Map();
    }
    
    // Проверяем остальные основные поля
    const requiredFields = ['enabled', 'logChannel', 'muteRole', 'warnAutoDelete', 'logBans', 'logKicks', 'logMutes', 'logWarns', 'logClears'];
    requiredFields.forEach(field => {
        if (settings[field] === undefined) {
            settings[field] = DEFAULT_MODERATION_SETTINGS[field];
        }
    });
    
    // Для отладки
    console.log(`🔍 Moderation settings for ${guildId}:`, {
        enabled: settings.enabled,
        autoModEnabled: settings.autoMod?.enabled,
        hasAutoMod: !!settings.autoMod,
        autoModKeys: settings.autoMod ? Object.keys(settings.autoMod) : 'NO AUTO_MOD'
    });
    
    return settings;
}


// Функция для получения пользовательских предупреждений
function getUserWarnings(guildId, userId) {
    const settings = getModerationSettings(guildId);
    return settings.warnings.get(userId) || [];
}

// Функция для добавления предупреждения
function addWarning(guildId, userId, warningData) {
    const settings = getModerationSettings(guildId);
    const userWarnings = settings.warnings.get(userId) || [];
    userWarnings.push(warningData);
    settings.warnings.set(userId, userWarnings);
    saveModerationSettings(guildId, settings);
    return userWarnings;
}

// Функция для сброса предупреждений
function clearWarnings(guildId, userId) {
    const settings = getModerationSettings(guildId);
    settings.warnings.set(userId, []);
    saveModerationSettings(guildId, settings);
    return true;
}

// Функция проверки авто-модерации
function shouldAutoModerate(guildId) {
    const settings = getModerationSettings(guildId);
    return settings.enabled && settings.autoMod?.enabled;
}


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

// Загрузите настройки при запуске
loadAllSettings();

// Автосохранение каждые 5 минут
setInterval(saveAllSettings, 5 * 60 * 1000);

// Сохранение при завершении
process.on('SIGTERM', () => {
    console.log('💾 Полное сохранение перед завершением...');
    saveAllSettings();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('💾 Полное сохранение перед завершением...');
    saveAllSettings();
    process.exit(0);
});


// Запуск бота
client.login(token).catch(error => {
    console.error('❌ Login failed:', error);
    process.exit(1);
});

console.log('🚀 Bot starting with enhanced web dashboard...');
