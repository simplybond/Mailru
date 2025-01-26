import TelegramBot from 'node-telegram-bot-api';
import Imap from 'imap';
import { simpleParser } from 'mailparser';

// Получаем переменные из окружения Railway
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const mailRuEmail = process.env.MAIL_RU_EMAIL;
const mailRuPassword = process.env.MAIL_RU_PASSWORD;


// Проверяем наличие переменных окружения, чтобы не было ошибок
if (!botToken || !mailRuEmail || !mailRuPassword) {
  console.error('Ошибка: Отсутствуют переменные окружения. Проверьте настройки в Railway.');
  process.exit(1); // Завершаем программу с ошибкой
}

const bot = new TelegramBot(botToken, { polling: true });

async function checkUnreadEmailsMailRu(chatId, email, password) {
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
        console.error('Error opening mailbox:', err);
        bot.sendMessage(chatId, 'Ошибка при открытии почтового ящика.');
        imap.end();
        return;
      }
      imap.search(['UNSEEN'], (err, results) => {
        if (err) {
          console.error('Error searching for unread messages:', err);
          bot.sendMessage(chatId, 'Ошибка при поиске непрочитанных сообщений.');
          imap.end();
          return;
        }

        if (results.length === 0) {
          bot.sendMessage(chatId, 'У вас нет непрочитанных писем.');
          imap.end();
          return;
        }
        bot.sendMessage(chatId, `У вас ${results.length} непрочитанных писем.`);

        const f = imap.fetch(results, { bodies: '', struct: true });

        f.on('message', (msg, seqno) => {
          msg.on('body', (stream, info) => {
            simpleParser(stream, {}, (err, mail) => {
              if (err) {
                console.error('Error parsing email:', err);
                return;
              }
              bot.sendMessage(
                chatId,
                `**От:** ${mail.from.text}\n**Тема:** ${mail.subject}\n**Дата:** ${mail.date}`
              );
            });
          });
        });

        f.once('error', (err) => {
          console.error('Error fetching messages:', err);
          bot.sendMessage(chatId, 'Произошла ошибка при получении писем.');
          imap.end();
        });

        f.once('end', () => {
          imap.end();
        });
      });
    });
  });

  imap.once('error', (err) => {
    console.error('Connection error:', err);
    bot.sendMessage(chatId, 'Ошибка подключения к почтовому серверу.');
  });

  imap.connect();
}

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Начинаю проверку непрочитанных писем...');
  await checkUnreadEmailsMailRu(chatId, mailRuEmail, mailRuPassword);
});
// Help command
bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(chatId,
        'Доступные команды:\n' +
        '/start - Проверить непрочитанные письма'
    );
});


console.log('Бот запущен...');
