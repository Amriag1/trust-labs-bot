require('dotenv').config();
const express = require('express');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const LAB_INFO = require('./lab-info');

const app = express();
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BEVATEL_TOKEN   = process.env.BEVATEL_API_TOKEN;
const ACCOUNT_ID      = process.env.BEVATEL_ACCOUNT_ID;
const BEVATEL_URL     = process.env.BEVATEL_BASE_URL;

// تتبع المحادثات (سياق كل عميل)
const conversations = new Map();

// ── استقبال الـ Webhook من بيفاتل ─────────────────────
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // رد سريع لبيفاتل

  const body = req.body;
  console.log('📩 webhook:', JSON.stringify(body).slice(0, 200));

  // تأكد إنها رسالة واردة من العميل
  if (body.event !== 'message_created') return;
  if (body.message_type !== 'incoming') return;
  if (!body.content || body.content.trim().length < 1) return;

  const conversationId = body.conversation?.id;
  const messageText    = body.content.trim();

  if (!conversationId) return;

  console.log(`💬 محادثة ${conversationId}: "${messageText}"`);

  // تأخير طبيعي
  await delay(1200 + Math.random() * 800);

  // احصل على رد Claude
  const reply = await getClaudeReply(conversationId, messageText);
  if (!reply) return;

  // أرسل الرد عبر بيفاتل
  await sendBevatelMessage(conversationId, reply);
});

// ── Claude AI ──────────────────────────────────────────
async function getClaudeReply(conversationId, userMessage) {
  // سياق المحادثة
  if (!conversations.has(conversationId)) {
    conversations.set(conversationId, []);
  }
  const history = conversations.get(conversationId);
  history.push({ role: 'user', content: userMessage });

  // احتفظ بآخر 10 رسائل فقط
  if (history.length > 10) history.splice(0, 2);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 500,
      system: LAB_INFO,
      messages: history,
    });

    const reply = response.content[0].text;
    history.push({ role: 'assistant', content: reply });
    console.log(`🤖 رد: ${reply.slice(0, 100)}...`);
    return reply;

  } catch (err) {
    console.error('Claude error:', err.message);
    return null;
  }
}

// ── إرسال رسالة عبر بيفاتل API ────────────────────────
async function sendBevatelMessage(conversationId, content) {
  try {
    await axios.post(
      `${BEVATEL_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
      { content, message_type: 'outgoing', private: false },
      { headers: { 'api_access_token': BEVATEL_TOKEN } }
    );
    console.log('✅ رسالة أُرسلت عبر بيفاتل');
  } catch (err) {
    console.error('Bevatel error:', err.response?.data || err.message);
  }
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Health Check ───────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: '✅ بوت مختبرات ثقة شغّال!', time: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 السيرفر شغّال على port ${PORT}`));
