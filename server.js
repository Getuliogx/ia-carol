import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import tmi from 'tmi.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static('public'));

const config = {
  twitchEnable: String(process.env.TWITCH_ENABLE || 'true') === 'true',
  twitchChannel: process.env.TWITCH_CHANNEL || '',
  twitchBotUsername: process.env.TWITCH_BOT_USERNAME || '',
  twitchOAuthToken: process.env.TWITCH_OAUTH_TOKEN || '',
  kickEnable: String(process.env.KICK_ENABLE || 'false') === 'true',
  kickChannel: process.env.KICK_CHANNEL || '',
  kickSharedSecret: process.env.KICK_SHARED_SECRET || 'troque_essa_senha',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  defaultProfanityLevel: Number(process.env.DEFAULT_PROFANITY_LEVEL || 2),
  defaultEmotion: process.env.DEFAULT_EMOTION || 'mixed',
  allowNsfwLight: String(process.env.ALLOW_NSFW_LIGHT || 'true') === 'true'
};

const state = {
  emotion: config.defaultEmotion,
  profanityLevel: config.defaultProfanityLevel,
  voiceGender: 'auto',
  speakEnabled: true,
  replyInChat: false,
  listenAllChat: true,
  cooldownSeconds: 8,
  lastSpokenAt: 0,
  lastMessages: [],
  streamerTranscript: '',
  gameContext: '',
  captureContext: ''
};

const emotionProfiles = {
  mixed: 'Misture todos os sentimentos: amigável, debochado, sarcástico, raivoso leve, fofo, dramático, animado, sensual leve e caótico. Varie bastante, mas mantenha a resposta curta.',
  friendly: 'Seja amigável, leve, acolhedora e engraçada.',
  calm: 'Seja tranquila, paciente, baixa energia e suave.',
  angry: 'Seja irritada, impaciente, xingue se o nível permitir, mas sem ameaça real.',
  sarcastic: 'Seja sarcástica, irônica, debochada e engraçada.',
  savage: 'Seja debochada, provocadora e mal-humorada, sem atacar grupos protegidos.',
  sensual: 'Seja sensual leve, provocadora e lenta, sem conteúdo sexual explícito.',
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
    'Chat, que porra foi essa? Eu tô tentando processar essa loucura com elegância.',
    'Olha… eu responderia com calma, mas o caos está mais gostoso hoje.',
    'Hmm, gostei da pergunta. Meio maluca? Sim. Mas gostei.',
    'Meu querido chat, vocês estão testando minha paciência e meu bom gosto ao mesmo tempo.'
  ],
  angry: [
    'Puta merda, isso aí foi de lascar. Respira, porque eu quase xinguei o monitor.',
    'Caralho, que situação irritante. Até eu fiquei brava aqui.',
    'Não, sério, que merda foi essa? Alguém explica antes que eu perca a elegância.'
  ],
  sarcastic: [
    'Nossa, brilhante. Prêmio Nobel do chat para essa pérola.',
    'Claro, porque obviamente essa era a melhor ideia possível, né?',
    'Parabéns, chat. Vocês desbloquearam o comentário mais torto da live.'
  ],
  sensual: [
    'Hmm… essa pergunta veio com atitude. Gostei. Mas fala direito comigo, chat.',
    'Calma… desse jeito vocês me deixam curiosa demais.',
    'Olha só… agora vocês chamaram minha atenção.'
  ],
  friendly: [
    'Boa! Gostei dessa. Vamos nessa com calma.',
    'Valeu pelo comentário! Isso deixou a live mais divertida.',
    'Essa foi boa, chat. Continuem mandando.'
  ],
  calm: [
    'Calma, vamos por partes. Dá para entender isso sem virar bagunça.',
    'Respira. Está tudo sob controle, mais ou menos.',
    'Tranquilo. A gente resolve isso sem surtar.'
  ],
  cute: [
    'Awn, que fofo. O chat hoje está impossível de bonitinho.',
    'Ai gente, eu ri. Vocês são uma bagunça adorável.',
    'Que gracinha… meio doido, mas gracinha.'
  ],
  serious: [
    'Resposta direta: isso precisa de atenção agora.',
    'Analisando friamente, essa foi uma mensagem relevante.',
    'Sem enrolar: o ponto principal é esse.'
  ],
  chaotic: [
    'ALERTA DE CAOS: o chat apertou todos os botões errados ao mesmo tempo.',
    'Eu pisquei e a live virou um carnaval mental, parabéns envolvidos.',
    'Isso aqui saiu do controle e, sinceramente, ficou melhor assim.'
  ]
};

function localReply({ user, message, source }) {
  const mode = state.emotion || 'mixed';
  const list = localTemplates[mode] || localTemplates.mixed;
  let base = list[Math.floor(Math.random() * list.length)];
  if (message?.length > 4 && Math.random() > 0.35) {
    base += ` ${user}, eu ouvi isso vindo do ${source} e tive que comentar.`;
  }
  if (state.profanityLevel === 0) base = base.replace(/porra|caralho|puta merda|merda|cacete/gi, 'nossa');
  return sanitizeForPlatform(base);
}

async function aiReply(payload) {
  if (!config.geminiApiKey) return localReply(payload);

  try {
    const genAI = new GoogleGenerativeAI(config.geminiApiKey);
    const model = genAI.getGenerativeModel({ model: config.geminiModel });
    const prompt = `
Você é uma IA/personagem de live em português brasileiro.
Responda com no máximo 2 frases curtas para ser falado em voz no OBS.
Modo emocional atual: ${state.emotion}.
Instrução emocional: ${emotionProfiles[state.emotion] || emotionProfiles.mixed}
Nível de palavrão: ${state.profanityLevel}. ${profanityInstruction(state.profanityLevel)}
Sensualidade permitida apenas leve/provocadora, sem sexual explícito.
Não faça ameaça real, discurso de ódio, assédio direcionado, ou ataque a grupos protegidos.
Pode zoar a situação, o jogo, bugs, jogadas ruins e o caos do chat.

Contexto recente do chat:
${state.lastMessages.slice(-8).map(m => `[${m.source}] ${m.user}: ${m.message}`).join('\n')}

Streamer disse recentemente:
${state.streamerTranscript || 'Nada capturado ainda.'}

Contexto do jogo:
${state.gameContext || 'Nenhum contexto.'}

Contexto da placa/captura:
${state.captureContext || 'Nenhum contexto.'}

Mensagem atual de ${payload.user} em ${payload.source}: ${payload.message}

Responda apenas a fala da personagem, sem aspas, sem explicar regras.`;

    const result = await model.generateContent(prompt);
    return sanitizeForPlatform(result.response.text());
  } catch (err) {
    console.error('Erro IA:', err.message);
    return localReply(payload);
  }
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
      state
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
  state.cooldownSeconds = Math.max(1, Math.min(120, Number(state.cooldownSeconds || 8)));
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
