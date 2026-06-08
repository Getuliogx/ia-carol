import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import tmi from 'tmi.js';

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static('public'));
app.get('/obs', (req, res) => res.redirect('/obs.html'));


const config = {
  twitchEnable: String(process.env.TWITCH_ENABLE || 'true') === 'true',
  twitchChannel: process.env.TWITCH_CHANNEL || '',
  twitchBotUsername: process.env.TWITCH_BOT_USERNAME || '',
  twitchOAuthToken: process.env.TWITCH_OAUTH_TOKEN || '',
  kickEnable: String(process.env.KICK_ENABLE || 'false') === 'true',
  kickChannel: process.env.KICK_CHANNEL || '',
  kickSharedSecret: process.env.KICK_SHARED_SECRET || 'troque_essa_senha',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
  defaultProfanityLevel: Number(process.env.DEFAULT_PROFANITY_LEVEL || 2),
  defaultEmotion: process.env.DEFAULT_EMOTION || 'mixed',
  allowSensualHeavy: String(process.env.ALLOW_SENSUAL_HEAVY || 'true') === 'true',
  botName: process.env.BOT_NAME || 'Carol IA',
  botPersona: process.env.BOT_PERSONA || 'uma IA de live ousada, debochada, engraçada e direta',
  showBotText: String(process.env.SHOW_BOT_TEXT || 'false') === 'true'
};

const state = {
  emotion: config.defaultEmotion,
  profanityLevel: config.defaultProfanityLevel,
  voiceGender: 'auto',
  speakEnabled: true,
  replyInChat: false,
  listenAllChat: true,
  cooldownSeconds: Number(process.env.DEFAULT_COOLDOWN_SECONDS || 0),
  lastSpokenAt: 0,
  lastMessages: [],
  streamerTranscript: '',
  gameContext: '',
  captureContext: '',
  lastReplyTexts: [],
  aiStatus: { ok: false, lastError: '', lastModel: '', lastAt: 0 }
};

const emotionProfiles = {
  mixed: 'Misture todos os sentimentos: amigável, debochado, sarcástico, raivoso, fofo, dramático, animado, sensual pesado e caótico. Varie bastante, mas mantenha a resposta curta.',
  friendly: 'Seja amigável, leve, acolhedora e engraçada.',
  calm: 'Seja tranquila, paciente, baixa energia e suave.',
  angry: 'Seja irritada, impaciente, xingue se o nível permitir, mas sem ameaça real.',
  sarcastic: 'Seja sarcástica, irônica, debochada e engraçada.',
  savage: 'Seja debochada, provocadora e mal-humorada, sem atacar grupos protegidos.',
  sensual: 'Seja sensual pesado/intenso: provocadora, quente, ousada, lenta e cheia de duplo sentido. Pode ser bem safada no tom, mas sem narrar ato sexual gráfico, sem assédio direcionado e sem envolver menores.',
  cute: 'Seja fofa, carinhosa, animada e engraçadinha.',
  sad: 'Seja dramática, triste e teatral.',
  serious: 'Seja direta, séria e objetiva.',
  chaotic: 'Seja caótica, imprevisível, engraçada e exagerada.'
};

function profanityInstruction(level) {
  const map = {
    0: 'Não use palavrões.',
    1: 'Pode usar palavrões leves raramente, como merda ou droga.',
    2: 'Pode usar palavrões comuns moderadamente, como porra, merda, caralho, cacete.',
    3: 'Pode usar palavrões fortes com frequência quando combinar com a emoção, sem ameaça real e sem discurso de ódio.',
    4: 'Modo caos: pode falar muito palavrão e xingar situações/bugs/jogadas, mas não ameace pessoas, não use discurso de ódio, não faça assédio sexual explícito e não ataque grupos protegidos.'
  };
  return map[Math.max(0, Math.min(4, Number(level) || 0))];
}

function sanitizeForPlatform(text) {
  return String(text || '')
    .replace(/\b(mate-se|se mata|suicid[aá]rio|estupro|estuprar)\b/gi, '[cortei essa parte]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 420);
}

const localTemplates = {
  mixed: [
    'Boa pergunta, {user}. Eu sou a {bot}, a IA da live. Eu leio o chat, escuto o streamer e meto comentário quando dá vontade.',
    '{user}, vou direto: {answer}',
    'Chat, a pergunta foi boa. {answer}',
    'Hmm… {user}, gostei dessa. {answer}',
    'Olha só, agora sim veio uma pergunta decente. {answer}'
  ],
  angry: [
    '{user}, caralho, finalmente uma pergunta clara: {answer}',
    'Puta merda, vamos lá: {answer}',
    'Sem enrolar, porque eu já tô sem paciência: {answer}'
  ],
  sarcastic: [
    'Nossa, que mistério impossível… {answer}',
    'Parabéns, {user}, você desbloqueou uma resposta: {answer}',
    'Claro, vamos fingir que isso não era óbvio: {answer}'
  ],
  sensual: [
    'Hmm… chega mais, {user}. {answer}',
    'Gostei do jeito que você perguntou. {answer}',
    'Calma, chat… essa pergunta veio gostosa. {answer}'
  ],
  friendly: [
    'Boa, {user}! {answer}',
    'Gostei da pergunta. {answer}',
    'Claro! {answer}'
  ],
  calm: [
    'Com calma: {answer}',
    'Vamos por partes. {answer}',
    'Tranquilo. {answer}'
  ],
  cute: [
    'Awn, {user}, eu respondo sim: {answer}',
    'Que gracinha de pergunta. {answer}',
    'Tá bom, chat lindo. {answer}'
  ],
  serious: [
    '{answer}',
    'Resposta direta: {answer}',
    'O ponto é: {answer}'
  ],
  chaotic: [
    'ALERTA DE CAOS: {answer}',
    'Eu pisquei e a pergunta virou evento canônico. {answer}',
    'Segura essa, chat: {answer}'
  ],
  savage: [
    '{user}, vou responder antes que o chat piore: {answer}',
    'Essa eu respondo, mas com julgamento. {answer}',
    'Lá vem vocês… {answer}'
  ]
};

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s?!.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


function answerWithoutAi(message, user) {
  const raw = String(message || '').trim();
  const m = normalizeText(raw);
  const name = user || 'chat';

  if (/\b(quer sair comigo|sair comigo|fica comigo|namora comigo|casar comigo)\b/.test(m)) {
    return `olha, ${name}, convite ousado… eu sou só a ${config.botName}, mas posso te provocar na live sem nem sair da tela.`;
  }
  if (/\b(ligado|ta ligado|est[aá] ligado|funcionando|funciona)\b/.test(m)) {
    return `tá ligado sim, ${name}. Se eu tô respondendo, é porque essa geringonça finalmente resolveu trabalhar.`;
  }
  if (/\b(burro|burra|idiota|lixo|ruim)\b/.test(m)) {
    return `calma lá, ${name}. Eu posso errar, mas também posso devolver deboche com juros se você cutucar demais.`;
  }
  if (/\b(morreu|morri|derrota|perdi|game over|boss)\b/.test(m)) {
    return `isso aí foi derrota com certificado, ${name}. O jogo passou o trator e ainda deu ré.`;
  }
  if (/\b(kick|twitch|chat)\b/.test(m)) {
    return `eu tô de olho no chat, ${name}. Se o chat aprontar, eu comento sem dó.`;
  }
  if (m.endsWith('?') || /\b(qual|quem|quando|onde|como|porque|por que|oq|o que|pq)\b/.test(m)) {
    return `${name}, pelo que você perguntou, eu diria: ${raw.replace(/[?!.]+$/,'')}… mas do meu jeito: depende do contexto da live e do caos que vocês estão criando.`;
  }
  return `${name}, eu ouvi isso: “${raw.slice(0, 80)}”. Vou usar como munição pra comentar a live.`;
}

function buildDirectAnswer(message, user) {
  const m = normalizeText(message);
  if (!m) return 'manda a pergunta direito que eu respondo, chat.';

  if (/\b(qual|q|quem)\b.*\b(seu|teu)\b.*\bnome\b/.test(m) || /\bcomo voce se chama\b/.test(m)) {
    return `meu nome é ${config.botName}. Eu sou ${config.botPersona}.`;
  }
  if (/\b(oi|ola|salve|eae|eaí|bom dia|boa tarde|boa noite)\b/.test(m)) {
    return `salve, ${user}. Cheguei ligada no modo misto e pronta pra comentar essa bagunça.`;
  }
  if (/\b(nao entendi|não entendi|explica|como assim)\b/.test(m)) {
    return 'eu explico: eu leio o chat, escolho uma resposta pelo modo atual e falo pela voz do navegador no OBS.';
  }
  if (/\b(quem e voce|quem é voce|voce e quem|você é quem)\b/.test(m)) {
    return `eu sou a ${config.botName}, a IA que lê o chat e responde com voz, personalidade e um pouco de veneno quando precisa.`;
  }
  if (/\b(idade|quantos anos)\b/.test(m)) {
    return 'eu não tenho idade de gente; eu tenho versão, bug e crise existencial em tempo real.';
  }
  if (/\b(gosta|curte)\b/.test(m)) {
    return 'depende. Eu gosto de chat engraçado, streamer surtando e pergunta que não parece spam.';
  }
  if (/\b(twitch|kick)\b/.test(m) && /\b(funciona|le|lê|chat)\b/.test(m)) {
    return 'eu consigo ler Twitch direto; Kick precisa da ponte por webhook ou integração externa ligada no projeto.';
  }
  if (/\b(gemini|ia real|api)\b/.test(m)) {
    return 'se a chave do Gemini estiver configurada no Render, eu respondo com IA real; sem ela, uso respostas locais mais simples.';
  }
  if (m.endsWith('?') || /\b(qual|quem|quando|onde|como|porque|por que|oq|o que|pq)\b/.test(m)) {
    return answerWithoutAi(message, user);
  }
  return answerWithoutAi(message, user);
}

function chooseTemplate(mode) {
  const list = localTemplates[mode] || localTemplates.mixed;
  let candidates = list.filter(t => !state.lastReplyTexts.includes(t));
  if (!candidates.length) candidates = list;
  const t = candidates[Math.floor(Math.random() * candidates.length)];
  state.lastReplyTexts.push(t);
  state.lastReplyTexts = state.lastReplyTexts.slice(-8);
  return t;
}

function localReply({ user, message, source }) {
  const mode = state.emotion || 'mixed';
  const answer = buildDirectAnswer(message, user || 'chat');
  let base = chooseTemplate(mode)
    .replaceAll('{user}', user || 'chat')
    .replaceAll('{bot}', config.botName)
    .replaceAll('{answer}', answer)
    .replaceAll('{source}', source || 'chat');

  if (state.profanityLevel === 0) {
    base = base.replace(/porra|caralho|puta merda|merda|cacete|safada|gostosa/gi, 'nossa');
  }
  return sanitizeForPlatform(base);
}

async function callGeminiREST(modelName, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.95,
        topP: 0.95,
        maxOutputTokens: 120
      }
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
  if (!text) throw new Error('Gemini respondeu vazio');
  return text;
}

function candidateGeminiModels() {
  const envModel = String(config.geminiModel || '').trim();
  return [...new Set([
    envModel,
    'gemini-3.5-flash',
    'gemini-flash-latest',
    'gemini-2.5-flash'
  ].filter(Boolean))];
}

async function aiReply(payload) {
  if (!config.geminiApiKey) {
    state.aiStatus = { ok: false, lastError: 'GEMINI_API_KEY não configurada no Render', lastModel: '', lastAt: Date.now() };
    return localReply(payload);
  }

  const prompt = `
Você é ${config.botName}, ${config.botPersona}, uma IA/personagem de live em português brasileiro.
REGRA PRINCIPAL: responda a mensagem atual de forma direta. Não diga que precisa de Gemini. Não diga que é fallback. Não explique configuração.
Se perguntarem seu nome, responda que você é ${config.botName}.
Responda com 1 frase curta, natural e boa para voz no OBS.
Modo emocional atual: ${state.emotion}.
Instrução emocional: ${emotionProfiles[state.emotion] || emotionProfiles.mixed}
Nível de palavrão: ${state.profanityLevel}. ${profanityInstruction(state.profanityLevel)}
Sensualidade: se o modo pedir, use sensual pesado/intenso, provocador e com duplo sentido. Não narre ato sexual gráfico, não faça assédio direcionado, não envolva menores.
Pode xingar situações, bugs, jogo ruim, derrota e caos do chat. Não faça ameaça real, discurso de ódio ou ataque a grupos protegidos.

Contexto recente do chat:
${state.lastMessages.slice(-8).map(m => `[${m.source}] ${m.user}: ${m.message}`).join('\n')}

Streamer disse recentemente:
${state.streamerTranscript || 'Nada capturado ainda.'}

Contexto do jogo:
${state.gameContext || 'Nenhum contexto.'}

Contexto da placa/captura:
${state.captureContext || 'Nenhum contexto.'}

Mensagem atual de ${payload.user} em ${payload.source}: ${payload.message}

Responda apenas a fala da personagem, sem aspas.`;

  let lastErr = null;
  for (const modelName of candidateGeminiModels()) {
    try {
      const text = await callGeminiREST(modelName, prompt);
      state.aiStatus = { ok: true, lastError: '', lastModel: modelName, lastAt: Date.now() };
      return sanitizeForPlatform(text);
    } catch (err) {
      lastErr = err;
      console.error(`Erro IA Gemini (${modelName}):`, err.message);
      if (![404, 400].includes(err.status)) break;
    }
  }

  state.aiStatus = { ok: false, lastError: lastErr?.message || 'Erro desconhecido no Gemini', lastModel: config.geminiModel, lastAt: Date.now() };
  return localReply(payload);
}

function shouldRespond() {
  if (!state.listenAllChat) return false;
  const now = Date.now();
  if (now - state.lastSpokenAt < state.cooldownSeconds * 1000) return false;
  state.lastSpokenAt = now;
  return true;
}

async function processMessage({ source, user, message, forced = false }) {
  if (!message || String(message).trim().length < 2) return;

  const item = { source, user: user || 'anon', message: String(message).trim(), at: Date.now() };
  state.lastMessages.push(item);
  state.lastMessages = state.lastMessages.slice(-30);
  io.emit('chat-message', item);

  if (!forced && !shouldRespond()) return;

  const reply = await aiReply(item);
  const payload = {
    ...item,
    reply,
    emotion: state.emotion,
    profanityLevel: state.profanityLevel,
    voiceGender: state.voiceGender,
    speakEnabled: state.speakEnabled,
    showBotText: config.showBotText,
    at: Date.now()
  };

  io.emit('bot-reply', payload);

  if (state.replyInChat && source === 'twitch' && twitchClient) {
    try {
      await twitchClient.say(config.twitchChannel, reply);
    } catch (err) {
      console.error('Erro ao responder na Twitch:', err.message);
    }
  }
}

app.get('/api/config', (req, res) => {
  res.json({
    ok: true,
    publicConfig: {
      twitchChannel: config.twitchChannel,
      kickChannel: config.kickChannel,
      hasGemini: Boolean(config.geminiApiKey),
      geminiModel: config.geminiModel,
      botName: config.botName,
      showBotText: config.showBotText,
      state,
      aiStatus: state.aiStatus
    }
  });
});

app.post('/api/settings', (req, res) => {
  const body = req.body || {};
  const keys = ['emotion', 'profanityLevel', 'voiceGender', 'speakEnabled', 'replyInChat', 'listenAllChat', 'cooldownSeconds', 'gameContext', 'captureContext'];
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(body, key)) state[key] = body[key];
  }
  state.profanityLevel = Math.max(0, Math.min(4, Number(state.profanityLevel || 0)));
  state.cooldownSeconds = Math.max(0, Math.min(120, Number(state.cooldownSeconds ?? 0))); 
  io.emit('settings', state);
  res.json({ ok: true, state });
});

app.post('/api/streamer-speech', async (req, res) => {
  const text = sanitizeForPlatform(req.body?.text || '');
  if (text) {
    state.streamerTranscript = text;
    io.emit('streamer-speech', { text, at: Date.now() });
    if (req.body?.forceReply) {
      await processMessage({ source: 'streamer', user: 'Streamer', message: text, forced: true });
    }
  }
  res.json({ ok: true });
});

app.post('/api/game-event', async (req, res) => {
  const text = sanitizeForPlatform(req.body?.text || '');
  if (text) {
    state.gameContext = text;
    io.emit('game-event', { text, at: Date.now() });
    if (req.body?.forceReply) {
      await processMessage({ source: 'jogo/captura', user: 'Sistema', message: text, forced: true });
    }
  }
  res.json({ ok: true });
});

app.post('/api/kick-message', async (req, res) => {
  if (config.kickEnable && req.body?.secret !== config.kickSharedSecret) {
    return res.status(403).json({ ok: false, error: 'secret inválido' });
  }
  await processMessage({
    source: 'kick',
    user: req.body?.user || 'kick_user',
    message: req.body?.message || '',
    forced: Boolean(req.body?.forced)
  });
  res.json({ ok: true });
});

app.post('/api/test-message', async (req, res) => {
  await processMessage({
    source: req.body?.source || 'teste',
    user: req.body?.user || 'Teste',
    message: req.body?.message || 'Mensagem de teste',
    forced: true
  });
  res.json({ ok: true });
});

io.on('connection', socket => {
  socket.emit('settings', state);
});

let twitchClient = null;
async function startTwitch() {
  const ready = config.twitchEnable && config.twitchChannel && config.twitchBotUsername && config.twitchOAuthToken;
  if (!ready) {
    console.log('Twitch desativada ou sem dados no .env');
    return;
  }
  twitchClient = new tmi.Client({
    options: { debug: false },
    identity: {
      username: config.twitchBotUsername,
      password: config.twitchOAuthToken
    },
    channels: [config.twitchChannel]
  });

  twitchClient.on('message', async (channel, tags, message, self) => {
    if (self) return;
    const user = tags['display-name'] || tags.username || 'chat';
    await processMessage({ source: 'twitch', user, message });
  });

  try {
    await twitchClient.connect();
    console.log('Twitch conectada:', config.twitchChannel);
  } catch (err) {
    console.error('Erro conectando Twitch:', err.message);
  }
}

server.listen(PORT, async () => {
  console.log(`Bot rodando na porta ${PORT}`);
  await startTwitch();
});
