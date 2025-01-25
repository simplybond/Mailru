import TelegramBot from 'node-telegram-bot-api';
import fetch from 'node-fetch';
import { URLSearchParams } from 'url';

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(botToken, { polling: true });

const mailru = {
    clientId: process.env.MAILRU_CLIENT_ID,
    clientSecret: process.env.MAILRU_CLIENT_SECRET,
    redirectUri: process.env.MAILRU_REDIRECT_URI || 'http://localhost', // default redirect URI
};

const userTokens = {};

// Обработчик команды /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(
        chatId,
        'Привет! Чтобы использовать бота, авторизуйтесь с помощью команды /auth_mailru и затем проверьте почту командой /check_mailru.'
    );
});

// Обработчик команды /auth_mailru
bot.onText(/\/auth_mailru/, async (msg) => {
    const chatId = msg.chat.id;
    const authUrl = `https://oauth.mail.ru/authorize?response_type=code&client_id=${mailru.clientId}&redirect_uri=${mailru.redirectUri}&scope=mail.full,userinfo`;
    await bot.sendMessage(chatId, `Перейдите по ссылке для авторизации: ${authUrl}`);
});


// Обработка полученного redirect_uri
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
    if (text.startsWith(mailru.redirectUri)) {
    const url = new URL(text)
    const code = url.searchParams.get('code');
    
    if (code) {
        try {
            const accessToken = await exchangeCodeForToken(code);
            userTokens[chatId] = accessToken;
            await bot.sendMessage(chatId, 'Успешная авторизация Mail.ru. Теперь можете проверять почту.');
        } catch (error) {
            console.error('Ошибка при авторизации:', error);
            await bot.sendMessage(chatId, 'Ошибка при авторизации Mail.ru. Попробуйте еще раз.');
        }
    }
     else {
           await bot.sendMessage(chatId, 'Неверный формат ссылки авторизации.');
    }
  }
});

// Функция обмена кода на токен
async function exchangeCodeForToken(code) {
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('client_id', mailru.clientId);
    params.append('client_secret', mailru.clientSecret);
    params.append('redirect_uri', mailru.redirectUri);

    const url = 'https://oauth.mail.ru/token';

    const response = await fetch(url, {
        method: 'POST',
        body: params,
    });

    const data = await response.json();
    return data;
}


// Обработчик команды /check_mailru
bot.onText(/\/check_mailru/, async (msg) => {
    const chatId = msg.chat.id;
    await checkMailruEmails(chatId);
});

// Функция проверки почты
async function checkMailruEmails(chatId) {
     const accessToken = userTokens[chatId]?.access_token;

    if (!accessToken) {
        await bot.sendMessage(chatId, 'Сначала авторизуйтесь с помощью команды /auth_mailru');
        return;
    }

    try {
        //  Уточните правильный endpoint для Mail.ru API в документации
        const url = 'https://api.mail.ru/messages?limit=10&unread=1';
        
         const response = await fetch(url, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                 'X-Mailru-Api-Version': '2' // Уточните API версию
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Ошибка при запросе к API Mail.ru:', errorText);
            await bot.sendMessage(chatId, `Произошла ошибка при проверке писем Mail.ru.`);
            return;
        }
        
        const data = await response.json();

        if (data?.messages?.length === 0) {
            await bot.sendMessage(chatId, `У вас нет непрочитанных писем в Mail.ru.`);
            return;
        }
        
        await bot.sendMessage(chatId, `У вас ${data?.messages?.length} непрочитанных писем в Mail.ru.`);
         for (const message of data.messages) {
            const subject = message.subject || 'Без темы';
            const from = message.from || 'Неизвестный отправитель';
             const date = message.date || 'Дата не указана';
            const text = `**От:** ${from}\n**Тема:** ${subject}\n**Дата:** ${date}`;
           await bot.sendMessage(chatId, text);
        }


    } catch (error) {
        console.error('Ошибка при проверке писем:', error);
        await bot.sendMessage(chatId, 'Произошла ошибка при проверке писем Mail.ru.');
    }
}
bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(chatId,
        'Доступные команды:\n' +
        '/help - Показать эту справку\n' +
        '/auth_mailru - Авторизация Mail.ru\n' +
         '/check_mailru - Проверить почту Mail.ru'
    );
});


console.log('Бот запущен...');