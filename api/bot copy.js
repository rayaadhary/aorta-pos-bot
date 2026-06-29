const crypto = require('crypto');

// Konfigurasi rahasia (Nanti di-input via Dashboard Vercel demi keamanan)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID; // ID Telegram kamu (dari @userinfobot)
const SECRET_KEY = process.env.SECRET_KEY; // Harus 32 Karakter (String biasa)

// Fungsi enkripsi AES-256-CBC (Tanpa IV dinamis agar Flutter gampang dekrpsinya menggunakan key statis)
function generateLicense(deviceId, days) {
    // Buat objek data
    const expiredAt = new Date();
    expiredAt.setDate(expiredAt.getDate() + parseInt(days));

    const payload = {
        deviceId: deviceId,
        expiredAt: expiredAt.toISOString()
    };

    const payloadString = JSON.stringify(payload);

    // Gunakan IV statis (16 byte berisi angka 0) agar sinkron dengan konfigurasi default Flutter's encrypt package
    const iv = Buffer.alloc(16, 0); 
    const key = Buffer.from(SECRET_KEY, 'utf8');

    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(payloadString, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    return {
        code: encrypted,
        expiredAt: expiredAt.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    };
}

// Handler utama yang dipanggil Vercel saat menerima request dari Telegram
module.exports = async (req, res) => {
    // Pastikan request datang dari POST (Telegram Webhook)
    if (req.method !== 'POST') {
        return res.status(200).send('Bot is running!');
    }

    try {
        const { message } = req.body;
        if (!message || !message.text) return res.status(200).send('No message text');

        const chatId = message.chat.id.toString();
        const text = message.text.trim();

        // 1. SECURITY CHECK: Hanya merespons Owner/Admin
        if (chatId !== ADMIN_CHAT_ID) {
            await sendToTelegram(chatId, "❌ Maaf, Anda tidak memiliki akses ke bot administrasi ini.");
            return res.status(200).send('Unauthorized');
        }

        // 2. Handle Perintah /start
        if (text === '/start') {
            await sendToTelegram(chatId, "👋 Selamat datang di Aorta POS Admin Bot!\n\nFormat perintah:\n`/generate [Device_ID] [Jumlah_Hari]`\n\nContoh:\n`/generate SAMSUNG-123-XYZ 30` ");
            return res.status(200).send('OK');
        }

        // 3. Handle Perintah /generate
        if (text.startsWith('/generate')) {
            const args = text.split(' ');
            
            if (args.length < 3) {
                await sendToTelegram(chatId, "❌ Format salah!\nGunakan: `/generate [Device_ID] [Jumlah_Hari]`");
                return res.status(200).send('Bad Request');
            }

            const deviceId = args[1];
            const days = args[2];

            if (isNaN(days)) {
                await sendToTelegram(chatId, "❌ Jumlah hari harus berupa angka, bre!");
                return res.status(200).send('Bad Request');
            }

            // Jalankan fungsi enkripsi
            const result = generateLicense(deviceId, days);

            const responseMsg = `✅ *LICENSE GENERATED SUCCESS* \n\n` +
                                `📱 *Device ID:* \`${deviceId}\`\n` +
                                `📅 *Masa Aktif:* ${days} Hari\n` +
                                `⏳ *Valid Sampai:* ${result.expiredAt}\n\n` +
                                `🔑 *Kode Aktivasi (Salin teks di bawah ini):*\n\n` +
                                `\`${result.code}\``;

            await sendToTelegram(chatId, responseMsg);
            return res.status(200).send('OK');
        }

        // Jika perintah tidak dikenali
        await sendToTelegram(chatId, "❓ Perintah tidak dikenali, bre. Gunakan `/generate`.");
        return res.status(200).send('OK');

    } catch (error) {
        console.error("Error handler:", error);
        return res.status(200).send('Internal Error');
    }
};

// Fungsi helper untuk membalas pesan ke Telegram API
async function sendToTelegram(chatId, text) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'Markdown' // Agar teks format code seperti `ini` bisa diklik langsung salin di Tele
        })
    });
}