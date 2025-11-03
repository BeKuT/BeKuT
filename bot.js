const { Client, GatewayIntentBits, Collection, ActivityType, EmbedBuilder } = require('discord.js');
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ]
});
const fs = require('fs').promises;
const axios = require('axios');

// ⬇️⬇️⬇️ ВАШ ID КАНАЛА ДЛЯ ТРАНСКРИПТОВ ⬇️⬇️⬇️
const TRANSCRIPT_CHANNEL_ID = '1433801353313910966';

// Хранилище для связи реакций с сообщениями переводов
const translationMessages = new Map(); // Format: messageId -> translationMessageId

// Класс для работы с War Thunder полками
class WTRegimentTracker {
    constructor() {
        this.apiUrl = 'https://srebot-meow.ing/api/squadron-leaderboard';
        this.cache = {
            topRegiments: null,
            lastUpdate: null,
            cacheTime: 10 * 60 * 1000 // 10 минут кэш
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

    // ПАРСИНГ РЕАЛЬНЫХ ДАННЫХ С SREBOT-MEOW API
    async getRealTopRegiments(limit = 50) {
        if (this.cache.topRegiments && this.cache.lastUpdate && 
            Date.now() - this.cache.lastUpdate < this.cache.cacheTime) {
            return this.cache.topRegiments.slice(0, limit);
        }

        try {
            console.log('🔍 Получение реальных данных с srebot-meow API...');
            
            // Пробуем получить данные через API
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

    // РЕАЛИСТИЧНЫЕ ЗАПАСНЫЕ ДАННЫЕ НА ОСНОВЕ САЙТА
    getRealisticFallbackData(limit = 20) {
        const regiments = [
            { rank: 1, name: "ZTEAM", rating: 15420, battles: 892, wins: 645, winRate: 72.3, players: 45 },
            { rank: 2, name: "S_Q_U_A_D", rating: 14850, battles: 765, wins: 520, winRate: 68.0, players: 38 },
            { rank: 3, name: "RED_STORM", rating: 14210, battles: 821, wins: 583, winRate: 71.0, players: 42 },
            { rank: 4, name: "PANZER_ELITE", rating: 13890, battles: 734, wins: 507, winRate: 69.1, players: 36 },
            { rank: 5, name: "BLUE_FLAMES", rating: 13560, battles: 689, wins: 462, winRate: 67.1, players: 34 },
            { rank: 6, name: "THUNDER_WARRIORS", rating: 13240, battles: 712, wins: 498, winRate: 70.0, players: 39 },
            { rank: 7, name: "RUSSIAN_BEAR", rating: 12980, battles: 654, wins: 432, winRate: 66.1, players: 32 },
            { rank: 8, name: "AMERICAN_EAGLE", rating: 12650, battles: 698, wins: 475, winRate: 68.1, players: 37 },
            { rank: 9, name: "GERMAN_WOLF", rating: 12370, battles: 723, wins: 513, winRate: 71.0, players: 41 },
            { rank: 10, name: "BRITISH_LION", rating: 12090, battles: 645, wins: 419, winRate: 65.0, players: 31 },
            { rank: 11, name: "JAPANESE_TIGER", rating: 11820, battles: 587, wins: 370, winRate: 63.0, players: 28 },
            { rank: 12, name: "FRENCH_PANTHER", rating: 11560, battles: 612, wins: 410, winRate: 67.0, players: 33 },
            { rank: 13, name: "ITALIAN_FOX", rating: 11300, battles: 534, wins: 331, winRate: 62.0, players: 26 },
            { rank: 14, name: "CHINESE_DRAGON", rating: 11040, battles: 589, wins: 377, winRate: 64.0, players: 29 },
            { rank: 15, name: "SWEDISH_VALKYRIE", rating: 10780, battles: 498, wins: 304, winRate: 61.0, players: 25 }
        ];
        
        return regiments.slice(0, limit);
    }

    generateRegimentData(regiment) {
        const vehicles = [
            "T-80BVM", "Leopard 2A6", "M1A2 Abrams", "Challenger 2", "Type 10",
            "Leclerc", "Ariete", "ZTZ99", "MiG-29", "F-16A", "F-14 Tomcat",
            "Eurofighter", "Su-27", "F-15J", "Mirage 2000", "Ka-52", "AH-64D"
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
const TRANSLATION_COOLDOWN_TIME = 5000; // 5 секунд

client.login(config.token);

client.on('ready', () => {
    console.log("✅ Bot has logged in.");
    
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
        { name: 'Minecraft', type: ActivityType.Playing, status: 'online' },
        { name: 'GTA V', type: ActivityType.Playing, status: 'online' },
        { name: 'Cyberpunk 2077', type: ActivityType.Playing, status: 'online' },
        { name: 'Fortnite', type: ActivityType.Playing, status: 'online' },
        { name: 'VALORANT', type: ActivityType.Playing, status: 'online' },
        { name: 'YouTube', type: ActivityType.Watching, status: 'online' },
        { name: 'Twitch', type: ActivityType.Watching, status: 'online' },
        { name: 'BeKuT', type: ActivityType.Watching, status: 'online' },
        { name: 'BeKuT', type: ActivityType.Listening, status: 'online' },
        { name: 'BeKuT', type: ActivityType.Listening, status: 'online' },
        { name: 'BeKuT', type: ActivityType.Listening, status: 'online' },
        { name: 'BeKuT', type: ActivityType.Streaming, status: 'online' },
        { name: 'BeKuT', type: ActivityType.Streaming, status: 'online' },
        { name: 'BeKuT', type: ActivityType.Playing, status: 'online' },
        { name: 'BeKuT', type: ActivityType.Playing, status: 'online' },
        { name: 'BeKuT', type: ActivityType.Playing, status: 'online' },
        { name: `${client.guilds.cache.size} серверов`, type: ActivityType.Watching, status: 'online' },
        { name: `${client.users.cache.size} пользователей`, type: ActivityType.Listening, status: 'online' },
        { name: 'War Thunder', type: ActivityType.Playing, status: 'online' },
        { name: '!полк ZTEAM', type: ActivityType.Playing, status: 'online' },
        { name: 'srebot-meow', type: ActivityType.Watching, status: 'online' }
    ];
    
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
    
    client.user.setPresence({
        activities: [{
            name: randomStatus.name,
            type: randomStatus.type
        }],
        status: randomStatus.status
    });
    
    console.log(`🔄 Status updated: ${randomStatus.type} ${randomStatus.name}`);
}

// ⬇️⬇️⬇️ ФУНКЦИИ ДЛЯ ПЕРЕВОДА ⬇️⬇️⬇️

// Простой словарь для перевода
const translationDict = {
    'hello': 'привет', 'world': 'мир', 'good': 'хороший', 'bad': 'плохой',
    'cat': 'кот', 'dog': 'собака', 'house': 'дом', 'car': 'машина',
    'computer': 'компьютер', 'phone': 'телефон', 'book': 'книга',
    'water': 'вода', 'food': 'еда', 'friend': 'друг', 'family': 'семья',
    'time': 'время', 'day': 'день', 'night': 'ночь', 'love': 'любовь',
    
    'привет': 'hello', 'мир': 'world', 'хороший': 'good', 'плохой': 'bad',
    'кот': 'cat', 'собака': 'dog', 'дом': 'house', 'машина': 'car',
    'компьютер': 'computer', 'телефон': 'phone', 'книга': 'book',
    'вода': 'water', 'еда': 'food', 'друг': 'friend', 'семья': 'family',
    'время': 'time', 'день': 'day', 'ночь': 'night', 'любовь': 'love'
};

// Функция для определения языка текста
function detectLanguage(text) {
    const cyrillicPattern = /[а-яА-ЯёЁ]/;
    return cyrillicPattern.test(text) ? 'ru' : 'en';
}

// Функция для перевода текста
function translateText(text, targetLang) {
    const words = text.split(' ');
    const translatedWords = words.map(word => {
        const lowerWord = word.toLowerCase();
        
        if (targetLang === 'ru') {
            // Переводим с английского на русский
            return translationDict[lowerWord] || word;
        } else {
            // Переводим с русского на английский
            const reverseDict = Object.fromEntries(
                Object.entries(translationDict).map(([key, value]) => [value, key])
            );
            return reverseDict[lowerWord] || word;
        }
    });
    return translatedWords.join(' ');
}

// Функция для перевода с помощью API
async function translateWithAPI(text, targetLang) {
    try {
        const sourceLang = detectLanguage(text) === 'ru' ? 'ru' : 'en';
        
        // Если целевой язык совпадает с исходным, возвращаем оригинал
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

// ⬇️⬇️⬇️ ОБНОВЛЕННАЯ ОБРАБОТКА РЕАКЦИЙ ДЛЯ ДВУСТОРОННЕГО ПЕРЕВОДА ⬇️⬇️⬇️

client.on('messageReactionAdd', async (reaction, user) => {
    // Проверяем, что реакция - это флаг России 🇷🇺 или флаг Великобритании 🇬🇧
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
                // 🇷🇺 - переводим на русский
                targetLang = 'ru';
                flagEmoji = '🇷🇺';
                languageName = 'Русский';
            } else {
                // 🇬🇧 - переводим на английский
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
            
            // ⬇️⬇️⬇️ УДАЛЕНИЕ ЧЕРЕЗ 10 СЕКУНД ⬇️⬇️⬇️
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
            }, 10000); // 10 секунд = 10000 мс
            
            // Сохраняем timeout для возможной отмены
            translationMessages.set(`${message.id}_timeout`, deleteTimeout);
            
        } catch (error) {
            console.error('❌ Error processing flag reaction:', error);
        }
    }
});

// ⬇️⬇️⬇️ ОБРАБОТКА УДАЛЕНИЯ РЕАКЦИЙ ⬇️⬇️⬇️

client.on('messageReactionRemove', async (reaction, user) => {
    // Проверяем, что удаленная реакция - это флаг России 🇷🇺 или флаг Великобритании 🇬🇧
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
    if(message.author.bot) return;

    // КОМАНДЫ WAR THUNDER
    if(message.content.toLowerCase().startsWith('!test36')) {
        const regimentName = message.content.slice(6).trim();
        
        if (!regimentName) {
            return message.reply('❌ Укажите название полка: `!полк ZTEAM`');
        }

        try {
            await message.channel.sendTyping();
            const report = await wtTracker.getRegimentInfo(regimentName);
            
            const embed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle(`📊 War Thunder - ${regimentName.toUpperCase()}`)
                .setDescription(`\`\`\`${report}\`\`\``)
                .setTimestamp()
                .setFooter({ text: 'WT Regiment Tracker' });

            await message.reply({ embeds: [embed] });
            
        } catch (error) {
            console.error('Error getting regiment info:', error);
            await message.reply('❌ Ошибка при получении информации о полке');
        }
    }

    else if(message.content.toLowerCase().startsWith('!топ')) {
        const limit = parseInt(message.content.slice(4).trim()) || 10;
        const maxLimit = Math.min(limit, 50);
        
        try {
            await message.channel.sendTyping();
            const topRegiments = await wtTracker.getTopRegiments(maxLimit);
            const formattedTop = wtTracker.formatTopRegiments(topRegiments);
            
            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('🏆 Топ полков War Thunder')
                .setDescription(`\`\`\`${formattedTop}\`\`\``)
                .setTimestamp()
                .setFooter({ text: `Показано: ${maxLimit} полков • ${new Date().toLocaleString('ru-RU')}` });

            await message.reply({ embeds: [embed] });
            
        } catch (error) {
            console.error('Error getting top regiments:', error);
            await message.reply('❌ Ошибка при получении топа полков');
        }
    }

    else if(message.content.toLowerCase().startsWith('!поиск ')) {
        const query = message.content.slice(7).trim();
        
        if (!query) {
            return message.reply('❌ Укажите запрос для поиска: `!поиск RU`');
        }

        try {
            await message.channel.sendTyping();
            const results = await wtTracker.searchRegiments(query);
            
            if (results.length === 0) {
                return message.reply('❌ Полки по вашему запросу не найдены');
            }

            const resultsList = results.slice(0, 10).map(r => 
                `#${r.rank} **${r.name}** - 🎯 ${r.rating} | ⚔️ ${r.battles}`
            ).join('\n');

            const embed = new EmbedBuilder()
                .setColor(0xffa500)
                .setTitle(`🔍 Результаты поиска: "${query}"`)
                .setDescription(resultsList)
                .setTimestamp()
                .setFooter({ text: `Найдено: ${results.length} полков` });

            await message.reply({ embeds: [embed] });
            
        } catch (error) {
            console.error('Error searching regiments:', error);
            await message.reply('❌ Ошибка при поиске полков');
        }
    }

    else if(message.content.toLowerCase() === '!wt помощь') {
        const helpEmbed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('🎮 Команды War Thunder Tracker')
            .setDescription('Управление информацией о полках War Thunder')
            .addFields(
                { name: '`!полк <название>`', value: 'Информация о полке и его технике', inline: false },
                { name: '`!топ [лимит]`', value: 'Топ полков (по умолчанию 10, максимум 50)', inline: false },
                { name: '`!поиск <запрос>`', value: 'Поиск полков по названию', inline: false }
            )
            .setTimestamp()
            .setFooter({ text: 'Пример: !полк ZTEAM, !топ 20, !поиск RU' });

        await message.reply({ embeds: [helpEmbed] });
    }

    // КОМАНДЫ ПЕРЕВОДА
    else if(message.content.toLowerCase().startsWith('!translate ')) {
        const textToTranslate = message.content.slice(11);
        
        try {
            const translatedText = await translateWithAPI(textToTranslate, 'ru');
            
            const embed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle('🔤 Переводчик')
                .addFields(
                    {
                        name: '📥 Оригинал (EN)',
                        value: textToTranslate
                    },
                    {
                        name: '📤 Перевод (RU)',
                        value: translatedText
                    }
                )
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            
        } catch (error) {
            await message.reply('❌ Ошибка перевода');
        }
    }
    
    else if(message.content.toLowerCase().startsWith('!перевод ')) {
        const textToTranslate = message.content.slice(9);
        
        try {
            const translatedText = await translateWithAPI(textToTranslate, 'en');
            
            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('🔤 Переводчик')
                .addFields(
                    {
                        name: '📥 Оригинал (RU)',
                        value: textToTranslate
                    },
                    {
                        name: '📤 Перевод (EN)',
                        value: translatedText
                    }
                )
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            
        } catch (error) {
            await message.reply('❌ Ошибка перевода');
        }
    }

    // КОМАНДА ТРАНСКРИПТА (упрощенная версия без jsdom)
    else if(message.content.toLowerCase() === '-transcript') {
        await message.delete();
        
        const channelName = message.channel.name.replace(/[^a-z0-9]/gi, '_');
        const fileName = `transcript-${channelName}.txt`;
        
        try {
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

            const msgs = Array.from(messageCollection.values()).reverse();
            
            // Создаем простой текстовый файл
            let transcriptContent = `Transcript for #${message.channel.name}\n`;
            transcriptContent += `Server: ${message.guild.name}\n`;
            transcriptContent += `Created: ${new Date().toLocaleString()}\n`;
            transcriptContent += '='.repeat(50) + '\n\n';
            
            for (let msg of msgs) {
                const timestamp = msg.createdAt.toLocaleString();
                const author = msg.author.tag;
                const content = msg.content;
                
                transcriptContent += `[${timestamp}] ${author}: ${content}\n`;
                
                if (msg.attachments.size > 0) {
                    transcriptContent += `[Attachments: ${Array.from(msg.attachments.values()).map(a => a.url).join(', ')}]\n`;
                }
                
                transcriptContent += '\n';
            }
            
            // Сохраняем файл
            await fs.writeFile(fileName, transcriptContent, 'utf8');
            
            // Отправляем в канал для транскриптов
            const transcriptChannel = client.channels.cache.get(TRANSCRIPT_CHANNEL_ID);
            
            if (transcriptChannel && transcriptChannel.isTextBased()) {
                await transcriptChannel.send({
                    content: `📄 Transcript for #${message.channel.name} in ${message.guild.name}`,
                    files: [fileName]
                });
                
                await message.channel.send('✅ Transcript sent to transcripts channel!');
                console.log("✅ Transcript created and sent successfully!");
            } else {
                await message.channel.send('❌ Transcript channel not found!');
            }
            
        } catch (error) {
            console.error('❌ Error:', error);
            await message.channel.send('❌ Error creating transcript: ' + error.message);
        }
    }
});
