import TelegramBot from 'node-telegram-bot-api';
import Imap from 'imap';
import { simpleParser } from 'mailparser';

// Настройки почтовых ящиков
const mailboxes = {
    mailbox1: {
        name: "aristosand@mail.ru",
        email: process.env.MAIL_RU_EMAIL_1,
        password: process.env.MAIL_RU_PASSWORD_1,
        emoji: '🔵'  // Синий круг
    },
    mailbox2: {
        name: "aristoss@inbox.ru",
        email: process.env.MAIL_RU_EMAIL_2,
        password: process.env.MAIL_RU_PASSWORD_2,
        emoji: '🟢'  // Зеленый круг
    }
};

// Получаем переменные из окружения Railway
const botToken = process.env.TELEGRAM_BOT_TOKEN;

// Проверяем наличие переменных окружения, чтобы не было ошибок
if (!botToken) {
    console.error('Ошибка: Отсутствует переменная окружения TELEGRAM_BOT_TOKEN. Проверьте настройки в Railway.');
    process.exit(1); // Завершаем программу с ошибкой
}
for (const key in mailboxes){
    const mailbox = mailboxes[key]
    if (!mailbox.email || !mailbox.password){
    console.error(`Ошибка: Отсутствуют переменные окружения для почтового ящика ${mailbox.name}. Проверьте настройки в Railway.`);
        process.exit(1) // Завершаем программу с ошибкой
    }
}

const bot = new TelegramBot(botToken, { polling: true });

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
                console.error('Error opening mailbox:', err);
                bot.sendMessage(chatId, `Ошибка при открытии почтового ящика ${mailboxName}.`);
                imap.end();
                return;
            }
            imap.search(['UNSEEN'], (err, results) => {
              if (err) {
                console.error('Error searching for unread messages:', err);
                 bot.sendMessage(chatId, `Ошибка при поиске непрочитанных сообщений в ${mailboxName}.`);
                imap.end();
                 return;
               }

               if (results.length === 0) {
                    bot.sendMessage(chatId, `У вас нет непрочитанных писем в ${mailboxName}.`);
                    imap.end();
                    return;
                }
                bot.sendMessage(chatId, `У вас ${results.length} непрочитанных писем в ${mailboxName}.`);

                const f = imap.fetch(results, { bodies: '', struct: true });

                f.on('message', (msg, seqno) => {
                  msg.on('body', (stream, info) => {
                      simpleParser(stream, {}, (err, mail) => {
                        if (err) {
                          console.error('Error parsing email:', err);
                          return;
                         }
                         const deleteButton = {
                                    reply_markup: {
                                        inline_keyboard: [[
                                        { text: 'Удалить 🗑️', callback_data: `delete_${mailboxName}_${seqno}`}
                                        ]]
                                    }
                                };
                        bot.sendMessage(
                            chatId,
                            `${mailboxEmoji} **От:** ${mail.from.text}\n**Тема:** ${mail.subject}\n**Дата:** ${mail.date}`,
                            deleteButton
                        );
                    });
                   });
                 });
               f.once('error', (err) => {
                  console.error('Error fetching messages:', err);
                  bot.sendMessage(chatId, `Произошла ошибка при получении писем в ${mailboxName}.`);
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
        bot.sendMessage(chatId, `Ошибка подключения к почтовому серверу для ${mailboxName}.`);
    });

    imap.connect();
}


async function deleteEmail(chatId, email, password, mailboxName, seqno) {
  const imap = new Imap({
    user: email,
    password: password,
    host: 'imap.mail.ru',
    port: 993,
    tls: true,
  });
  imap.once('ready', function () {
    imap.openBox('INBOX', false, function (err, box) {
      if (err) {
          console.error('Error opening mailbox:', err);
          bot.sendMessage(chatId, `Ошибка при открытии почтового ящика ${mailboxName} для удаления письма.`);
          imap.end();
          return;
      }
      imap.addFlags(seqno, '\\Deleted', function (err) {
        if (err) {
            console.error('Error adding delete flag:', err);
            bot.sendMessage(chatId, `Ошибка при пометке письма на удаление в ${mailboxName}.`);
            imap.end();
            return;
        }
          imap.expunge(function(err){
                if(err){
                  console.error('Error expunging emails:', err);
                    bot.sendMessage(chatId, `Ошибка при удалении письма в ${mailboxName}.`);
                    imap.end();
                  return;
                }
                bot.sendMessage(chatId, `Письмо успешно удалено из ${mailboxName}.`);
                 imap.end();
          });
      });
    });
  });
  imap.once('error', function (err) {
    console.error('Connection error:', err);
    bot.sendMessage(chatId, `Ошибка подключения к почтовому серверу для ${mailboxName} при удалении письма.`);
  });
  imap.connect();
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


// Обработчик нажатия на кнопки
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

   if (data.startsWith('check_')) {
        const mailboxKey = data.split('_')[1];
        const selectedMailbox = mailboxes[mailboxKey];
       if (!selectedMailbox) {
            await bot.sendMessage(chatId, 'Ошибка: Неизвестный почтовый ящик.');
            return;
        }
       await checkUnreadEmailsMailRu(chatId, selectedMailbox.email, selectedMailbox.password, selectedMailbox.name, selectedMailbox.emoji);
       await bot.answerCallbackQuery(query.id);
   } else if (data.startsWith('delete_')) {
         const [, mailboxName, seqno] = data.split('_');
        const selectedMailbox = Object.values(mailboxes).find(mailbox => mailbox.name === mailboxName)
        if (!selectedMailbox) {
          await bot.sendMessage(chatId, 'Ошибка: Неизвестный почтовый ящик.');
          return;
        }
        await deleteEmail(chatId, selectedMailbox.email, selectedMailbox.password, selectedMailbox.name, seqno);
         await bot.answerCallbackQuery(query.id);
    }
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
