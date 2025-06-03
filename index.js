const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const cheerio = require('cheerio');
const os = require('os');

const mongoUrl = 'mongodb+srv://<user>:<pass>@cluster0.mongodb.net/whatsapp?retryWrites=true&w=majority';

mongoose.connect(mongoUrl).then(() => {
    console.log('✅ MongoDB connected!');
});

const store = new MongoStore({ mongoose });

const client = new Client({
    authStrategy: new RemoteAuth({
        store: store,
        backupSyncIntervalMs: 300000
    })
});

let lastSentTitles = [];
let subscribers = new Set();

client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
    console.log('📱 Silakan scan QR code untuk login');
});

client.on('ready', () => {
    console.log('🤖 Bot WhatsApp siap digunakan!');

    setInterval(async () => {
        try {
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
                console.log('ℹ️ Tidak ada berita baru saat ini.');
            }
        } catch (err) {
            console.error('❌ Error saat cek berita otomatis:', err);
        }
    }, 5 * 60 * 1000);
});

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
        const totalMemMB = (os.totalmem() / 1024 / 1024).toFixed(2);
        const freeMemMB = (os.freemem() / 1024 / 1024).toFixed(2);
        const usedMemMB = (totalMemMB - freeMemMB).toFixed(2);
        const cpus = os.cpus();
        const cpuModel = cpus[0].model;
        const cpuSpeedMHz = cpus[0].speed;
        const uptimeSeconds = os.uptime();
        const uptimeHours = Math.floor(uptimeSeconds / 3600);
        const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);
        const uptimeSecs = Math.floor(uptimeSeconds % 60);
        const nodeVersion = process.version;
        const platform = os.platform();
        const arch = os.arch();

        const infoMsg = 
`🤖 *Info Bot Sistem* 🤖

• RAM Total: ${totalMemMB} MB
• RAM Terpakai: ${usedMemMB} MB
• RAM Free: ${freeMemMB} MB

• CPU: ${cpuModel}
• CPU Speed: ${cpuSpeedMHz} MHz

• OS: ${platform} (${arch})
• Node.js Version: ${nodeVersion}

• Bot Uptime: ${uptimeHours} jam ${uptimeMinutes} menit ${uptimeSecs} detik`;

        await msg.reply(infoMsg);
    }
});

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

client.initialize();
