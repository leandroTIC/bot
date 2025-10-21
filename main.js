const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Variáveis globais
let qrCodeData = null;
let clientReady = false;

// Configuração do cliente WhatsApp
const client = new Client({
  authStrategy: new LocalAuth({
    clientId: "payment-bot",
    dataPath: "./sessions"
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ]
  },
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
  }
});

// Eventos do WhatsApp
client.on('qr', (qr) => {
  console.log('📱 QR Code recebido! Escaneie com o WhatsApp:');
  qrCodeData = qr;
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('✅ WhatsApp conectado e pronto!');
  clientReady = true;
  qrCodeData = null;
});

client.on('authenticated', () => {
  console.log('🔐 Autenticado com sucesso!');
  clientReady = true;
});

client.on('auth_failure', (msg) => {
  console.error('❌ Falha na autenticação:', msg);
  clientReady = false;
});

client.on('disconnected', (reason) => {
  console.log('🔌 WhatsApp desconectado:', reason);
  clientReady = false;
  
  // Tentar reconectar após 10 segundos
  setTimeout(() => {
    console.log('🔄 Tentando reconectar...');
    client.initialize();
  }, 10000);
});

client.on('message', async (message) => {
  // Responder mensagens automáticas se desejar
  if (message.body === '!ping') {
    message.reply('pong 🏓');
  }
});

// Inicializar WhatsApp
console.log('🚀 Inicializando WhatsApp...');
client.initialize();

// Serviço de envio de mensagens
class WhatsAppService {
  static async sendPaymentMessage(phone, athleteName, month, value) {
    if (!clientReady) {
      throw new Error('WhatsApp não está conectado');
    }

    try {
      // Formatar número (remover caracteres não numéricos e adicionar @c.us)
      const formattedPhone = phone.replace(/\D/g, '');
      
      // Verificar se o número tem código do país
      const finalPhone = formattedPhone.length === 11 
        ? '55' + formattedPhone 
        : formattedPhone;
      
      const chatId = finalPhone + '@c.us';
      
      const message = `✅ *Pagamento Confirmado!*

Olá *${athleteName}*! 

Seu pagamento referente a *${month}* no valor de *R$ ${parseFloat(value).toFixed(2)}* foi confirmado com sucesso!

📅 *Data da confirmação:* ${new Date().toLocaleDateString('pt-BR')}
💪 *Status:* ✅ Pago

Agradecemos pela sua mensalidade em dia! 

Qualquer dúvida, entre em contato conosco.

_Esta é uma mensagem automática, por favor não responda._`;

      console.log(`📤 Enviando mensagem para: ${athleteName} (${phone})`);
      
      await client.sendMessage(chatId, message);
      console.log(`✅ Mensagem enviada para ${athleteName}`);
      
      return { success: true, message: 'Mensagem enviada com sucesso' };
    } catch (error) {
      console.error('❌ Erro ao enviar mensagem:', error);
      return { 
        success: false, 
        error: error.message,
        details: 'Verifique se o número está correto e com DDD'
      };
    }
  }

  static getStatus() {
    return {
      ready: clientReady,
      qrNeeded: !clientReady && qrCodeData !== null,
      timestamp: new Date().toISOString()
    };
  }
}

// Rotas da API
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'WhatsApp Payment Bot',
    version: '1.0.0',
    whatsapp: clientReady ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      status: '/status',
      send: '/send-message (POST)',
      qr: '/qr'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/status', (req, res) => {
  const status = WhatsAppService.getStatus();
  res.json(status);
});

app.get('/qr', (req, res) => {
  if (qrCodeData) {
    qrcode.toString(qrCodeData, { type: 'terminal' }, (err, qrString) => {
      if (err) {
        return res.status(500).json({ error: 'Erro ao gerar QR Code' });
      }
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>QR Code WhatsApp</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 20px; }
                pre { background: #f4f4f4; padding: 20px; display: inline-block; }
                .info { margin: 20px 0; color: #666; }
            </style>
        </head>
        <body>
            <h1>📱 Escaneie o QR Code</h1>
            <div class="info">
                Abra o WhatsApp > Configurações > Dispositivos conectados > Conectar um dispositivo
            </div>
            <pre>${qrString}</pre>
            <div class="info">
                Após escanear, esta página pode ser fechada
            </div>
        </body>
        </html>
      `);
    });
  } else if (clientReady) {
    res.json({ status: 'connected', message: 'WhatsApp já está conectado' });
  } else {
    res.json({ status: 'waiting', message: 'Aguardando QR Code...' });
  }
});

// Rota para enviar mensagem (para integração com seu sistema)
app.post('/send-message', async (req, res) => {
  try {
    const { phone, athleteName, month, value } = req.body;

    // Validações
    if (!phone || !athleteName || !month || !value) {
      return res.status(400).json({
        success: false,
        error: 'Dados incompletos. Envie: phone, athleteName, month, value'
      });
    }

    const result = await WhatsAppService.sendPaymentMessage(phone, athleteName, month, value);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('❌ Erro na rota send-message:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Rota de teste
app.post('/test-message', async (req, res) => {
  // Use um número de teste aqui
  const testData = {
    phone: '5577988556030', // Substitua por um número real para teste
    athleteName: 'João Silva',
    month: 'Janeiro/2024',
    value: '150.00'
  };

  try {
    const result = await WhatsAppService.sendPaymentMessage(
      testData.phone,
      testData.athleteName,
      testData.month,
      testData.value
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Iniciar servidor
app.listen(port, '0.0.0.0', () => {
  console.log(`
🎉 Servidor iniciado!
📍 Porta: ${port}
🌐 URL: http://localhost:${port}
📱 WhatsApp: ${clientReady ? 'Conectado' : 'Aguardando QR Code'}

📊 Endpoints disponíveis:
   GET  /          - Status do serviço
   GET  /health    - Health check
   GET  /status    - Status do WhatsApp
   GET  /qr        - QR Code para conexão
   POST /send-message - Enviar mensagem de pagamento
   POST /test-message - Teste de mensagem
  `);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Desligando servidor...');
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Servidor terminado');
  client.destroy();
  process.exit(0);
});
