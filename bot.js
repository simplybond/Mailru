import TelegramBot from 'node-telegram-bot-api';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import dotenv from 'dotenv';

dotenv.config(); // Загрузка переменных окружения из .env файла

// Настройки почтовых ящиков
const mailboxes = {
    mailbox1: {
        name: "airstosand@mail.ru",
        email: process.env.MAIL_RU_EMAIL_1,
        password: process.env.MAIL_RU_PASSWORD_1,
        emoji: '🔵'
    },
    mailbox2: {
        name: "aristoss@inbox.ru",
        email: process.env.MAIL_RU_EMAIL_2,
        password: process.env.MAIL_RU_PASSWORD_2,
        emoji: '🟢' 
    }
};

// Получаем переменные из окружения
const botToken = process.env.TELEGRAM_BOT_TOKEN;

// Проверяем наличие переменных окружения
if (!botToken) {
    console.error('Ошибка: Отсутствует переменная окружения TELEGRAM_BOT_TOKEN.');
    process.exit(1);
}

for (const key in mailboxes) {
    const mailbox = mailboxes[key];
    if (!mailbox.email || !mailbox.password) {
        console.error(`Ошибка: Отсутствуют переменные окружения для почтового ящика ${mailbox.name}.`);
        process.exit(1);
    }
}

const bot = new TelegramBot(botToken, { polling: true });


// Функция для проверки новых писем
async function checkUnreadEmailsMailRu(chatId, email, password, mailboxName, mailboxEmoji) {
    const imap = new Imap({
        user: email,
        password: password,
        host: 'imap.mail.ru',
        port: 993,
        tls: true,
    });

    imap.once('ready', () => {
        imap.openBox('INBOX', true, (err, box) => {
            if (err) {
                console.error('Ошибка открытия почтового ящика:', err);
                  bot.sendMessage(chatId, `Ошибка при открытии почтового ящика ${mailboxName}.`);
                imap.end();
                return;
            }

            imap.search(['UNSEEN'], (err, results) => {
              if (err) {
                    console.error('Ошибка поиска писем:', err);
                   bot.sendMessage(chatId, `Ошибка при поиске писем в ${mailboxName}.`);
                    imap.end();
                    return;
                 }

                if (results.length === 0) {
                     bot.sendMessage(chatId, `У вас нет новых писем в ${mailboxName}.`);
                    imap.end();
                    return;
                }

                bot.sendMessage(chatId, `У вас ${results.length} непрочитанных писем в ${mailboxName}.`);

                const f = imap.fetch(results, { bodies: '', struct: true, uid: true });

                f.on('message', (msg, seqno) => {
                    let uid;
                    msg.on('attributes', (attrs) => {
                        uid = attrs.uid; 
                    });

                    msg.on('body', (stream, info) => {
                        simpleParser(stream, {}, (err, mail) => {
                            if (err) {
                                console.error('Ошибка парсинга письма:', err);
                                return;
                            }

                            const deleteButton = {
                                reply_markup: {
                                    inline_keyboard: [
                                        [{ text: 'Удалить 🗑️', callback_data: `delete_${mailboxName}_${uid}` }]
                                    ]
                                }
                            };

                            bot.sendMessage(
                                chatId,
                                `${mailboxEmoji} **От:** ${mail.from?.text}\n**Тема:** ${mail.subject}\n**Дата:** ${mail.date}`,
                                deleteButton
                            );
                        });
                    });
                });

                f.once('error', (err) => {
                  console.error('Ошибка получения писем:', err);
                   bot.sendMessage(chatId, `Ошибка при получении писем в ${mailboxName}.`);
                });

                f.once('end', () => {
                    imap.end();
                });
            });
        });
    });

    imap.once('error', (err) => {
       console.error('Ошибка подключения:', err);
        bot.sendMessage(chatId, `Ошибка подключения к почтовому серверу ${mailboxName}.`);
    });

    imap.connect();
}

// Функция для удаления писем
async function deleteEmail(chatId, email, password, mailboxName, uid) {
 //.. (код функции deleteEmail без изменений)
}


// Обработчик команды /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const mailboxKeyboard = {
        reply_markup: {
            inline_keyboard: Object.keys(mailboxes).map(key => [
                { text: `${mailboxes[key].emoji} ${mailboxes[key].name}`, callback_data: `check_${key}` }
            ])
        }
    };

    await bot.sendMessage(chatId, 'Выберите почтовый ящик для проверки:', mailboxKeyboard);
});

// Обработчик нажатий кнопок
bot.on('callback_query', async (query) => {
 //... (код обработчика кнопок без изменений)
});

// Команда /help
bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
     await bot.sendMessage(chatId, 'Доступные команды:\n/start - Проверить непрочитанные письма');
});

console.log('Бот запущен...');
