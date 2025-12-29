import { Sequelize, DataTypes } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

// Инициализация базы данных
const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectOptions: {
        ssl: {
            require: true,
            rejectUnauthorized: false
        }
    },
    logging: false
});

// Модель для транскриптов
const Transcript = sequelize.define('Transcript', {
    id: {
        type: DataTypes.STRING,
        primaryKey: true
    },
    html: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    ticketInfo: {
        type: DataTypes.JSONB,
        allowNull: false
    },
    createdAt: {
        type: DataTypes.BIGINT,
        allowNull: false
    },
    accessedAt: {
        type: DataTypes.BIGINT,
        defaultValue: Date.now
    }
});

// Модель для настроек сервера
const ServerSettings = sequelize.define('ServerSettings', {
    guildId: {
        type: DataTypes.STRING,
        primaryKey: true
    },
    settings: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {}
    }
});

// Модель для настроек модерации
const ModerationSettings = sequelize.define('ModerationSettings', {
    guildId: {
        type: DataTypes.STRING,
        primaryKey: true
    },
    settings: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {}
    }
});

// Модель для настроек команд
const CommandSettings = sequelize.define('CommandSettings', {
    guildId: {
        type: DataTypes.STRING,
        primaryKey: true
    },
    settings: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {}
    }
});

// Модель для тикетов
const Ticket = sequelize.define('Ticket', {
    id: {
        type: DataTypes.STRING,
        primaryKey: true
    },
    guildId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    channelId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    userId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    status: {
        type: DataTypes.STRING,
        defaultValue: 'open'
    },
    data: {
        type: DataTypes.JSONB,
        defaultValue: {}
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    closedAt: {
        type: DataTypes.DATE
    }
});

// Функция инициализации базы данных
async function initializeDatabase() {
    try {
        await sequelize.authenticate();
        console.log('✅ Database connected successfully');
        
        await sequelize.sync({ alter: true });
        console.log('✅ Database synchronized');
        
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        return false;
    }
}

export { 
    sequelize, 
    Transcript, 
    ServerSettings, 
    ModerationSettings, 
    CommandSettings,
    Ticket,
    initializeDatabase 
};
