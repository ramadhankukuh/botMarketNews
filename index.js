require('dotenv').config();
const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const cheerio = require('cheerio');
const os = require('os');

let lastSentTitles = [];
let subscribers = new Set();

// MongoDB setup
mongoose.connect(process.env.MONGO_URI).then(() => {
    console.log('✅ MongoDB connected!');
});

const store = new MongoStore({ mongoose });

const client = new Client({
    authStrategy: new RemoteAuth({
        store,
        backupSyncIntervalMs: 300000
    })
});

// Generate QR
client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
    console.log('📱 Silakan scan QR code untuk login');
});

client.on('ready', () => {
    console.log('🤖 Bot WhatsApp siap digunakan!');

    // Kirim berita otomatis setiap 5 menit
    setInterval(async () => {
        const newNews = await getIDXNewsForAutoSend();
        if (newNews.length > 0) {
            for (const chatId of subscribers) {
                for (const berita of newNews) {
                    await client.sendMessage(chatId, berita);
                }
            }
            newNews.forEach(n => {
                const title = n.split('\n')[1].replace(/\*/g, '');
                lastSentTitles.push(title);
            });
        } else {
            console.log('🕵️ Tidak ada berita baru saat ini.');
        }
    }, 5 * 60 * 1000);
});

// Komando
client.on('message', async msg => {
    const lower = msg.body.toLowerCase().trim();

    if (lower === '!saham') {
        if (!subscribers.has(msg.from)) {
            subscribers.add(msg.from);
            await msg.reply('✅ Kamu sudah berlangganan update berita saham otomatis!');
        } else {
            await msg.reply('ℹ️ Kamu sudah berlangganan sebelumnya.');
        }
    } else if (lower === '!saham stop') {
        if (subscribers.has(msg.from)) {
            subscribers.delete(msg.from);
            await msg.reply('✅ Kamu sudah berhenti berlangganan update berita saham.');
        } else {
            await msg.reply('ℹ️ Kamu belum berlangganan.');
        }
    } else if (lower === '!berita') {
        const berita = await getIDXNews();
        if (berita) {
            await msg.reply(berita);
        } else {
            msg.reply('❌ Tidak ditemukan berita terbaru dari IDX Channel.');
        }
    } else if (lower === '!info') {
        await msg.reply(getSystemInfo());
    }
});

// Scraper berita
async function getIDXNews() {
    try {
        const { data } = await axios.get('https://www.idxchannel.com/market-news');
        const $ = cheerio.load(data);

        const articles = [];
        $('.title_news').slice(0, 3).each((i, el) => {
            const title = $(el).text().trim();
            const url = $(el).find('a').attr('href');
            if (title && url) {
                articles.push(`${i + 1}. *${title}*\n${url}`);
            }
        });

        if (articles.length > 0) {
            return `📈 *Berita SAHAM Terbaru dari IDX Channel:*\n\n${articles.join('\n\n')}`;
        } else {
            return null;
        }
    } catch (error) {
        console.error('❌ Gagal scraping IDX:', error.message);
        return null;
    }
}

async function getIDXNewsForAutoSend() {
    try {
        const { data } = await axios.get('https://www.idxchannel.com/market-news');
        const $ = cheerio.load(data);

        const newArticles = [];
        $('.title_news').each((i, el) => {
            const title = $(el).text().trim();
            const url = $(el).find('a').attr('href');
            if (title && url && !lastSentTitles.includes(title)) {
                newArticles.push(`📢 *Berita Baru dari IDX Channel:*\n*${title}*\n${url}`);
            }
        });

        return newArticles;
    } catch (error) {
        console.error('❌ Gagal scraping IDX (auto):', error.message);
        return [];
    }
}

// Info sistem
function getSystemInfo() {
    const totalMem = (os.totalmem() / 1024 / 1024).toFixed(2);
    const freeMem = (os.freemem() / 1024 / 1024).toFixed(2);
    const usedMem = (totalMem - freeMem).toFixed(2);
    const cpus = os.cpus();
    const uptime = os.uptime();

    return `🤖 *Info Bot Sistem*

• RAM Total: ${totalMem} MB
• RAM Terpakai: ${usedMem} MB
• RAM Free: ${freeMem} MB

• CPU: ${cpus[0].model} (${cpus[0].speed} MHz)
• OS: ${os.platform()} (${os.arch()})
• Node.js: ${process.version}
• Uptime: ${Math.floor(uptime / 3600)} jam ${(uptime % 3600) / 60 | 0} menit`;
}

// Start bot
client.initialize();
