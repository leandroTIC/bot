const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const app = express();
const port = process.env.PORT || 3000;

// Middleware básico
app.use(express.json());

// Configuração simplificada do WhatsApp
const client = new Client({
  authStrategy: new LocalAuth({
    clientId: "payment-bot"
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--single-process'
    ]
  }
});

// Variáveis de estado
let isConnected = false;

// Eventos do WhatsApp
client.on('qr', (qr) => {
  console.log('📱 QR Code recebido! Escaneie com o WhatsApp:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('✅ WhatsApp conectado e pronto!');
  isConnected = true;
});

client.on('disconnected', () => {
  console.log('🔌 WhatsApp desconectado');
  isConnected = false;
  setTimeout(() => client.initialize(), 5000);
});

// Inicializar WhatsApp
client.initialize();

// Rotas básicas
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    whatsapp: isConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/qr', (req, res) => {
  res.send(`
    <html>
      <body>
        <h1>Verifique os logs no Railway para ver o QR Code</h1>
        <p>Acesse: Railway Dashboard → Seu App → Logs</p>
      </body>
    </html>
  `);
});

// Rota para enviar mensagem
app.post('/send-message', async (req, res) => {
  if (!isConnected) {
    return res.status(503).json({ error: 'WhatsApp não conectado' });
  }

  const { phone, athleteName, month, value } = req.body;
  
  if (!phone || !athleteName || !month || !value) {
    return res.status(400).json({ error: 'Dados incompletos' });
  }

  try {
    const formattedPhone = phone.replace(/\D/g, '');
    const finalPhone = formattedPhone.length === 11 ? '55' + formattedPhone : formattedPhone;
    const chatId = finalPhone + '@c.us';

    const message = `✅ *Pagamento Confirmado!*

Olá *${athleteName}*! 

Seu pagamento de *${month}* no valor de *R$ ${parseFloat(value).toFixed(2)}* foi confirmado!

📅 Data: ${new Date().toLocaleDateString('pt-BR')}
💪 Status: ✅ Pago

Obrigado!`;

    await client.sendMessage(chatId, message);
    
    console.log(`✅ Mensagem enviada para ${athleteName}`);
    res.json({ success: true, message: 'Mensagem enviada' });
    
  } catch (error) {
    console.error('❌ Erro:', error);
    res.status(500).json({ error: error.message });
  }
});

// Iniciar servidor
app.listen(port, () => {
  console.log(`🚀 Servidor rodando na porta ${port}`);
});
