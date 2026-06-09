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
  aiProvider: (process.env.AI_PROVIDER || 'ollama').toLowerCase(),
  ollamaUrl: (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, ''),
  ollamaModel: process.env.OLLAMA_MODEL || 'gemma3:270m',
  // Sem limite fixo de tokens. O Ollama decide o tamanho da resposta, salvo se você definir OLLAMA_NUM_PREDICT manualmente.
  ollamaTemperature: Number(process.env.OLLAMA_TEMPERATURE || 0.8),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
  defaultProfanityLevel: Number(process.env.DEFAULT_PROFANITY_LEVEL || 2),
  defaultEmotion: process.env.DEFAULT_EMOTION || 'mixed',
  allowSensualHeavy: String(process.env.ALLOW_SENSUAL_HEAVY || 'true') === 'true',
  botName: process.env.BOT_NAME || 'Carol IA',
  botPersona: process.env.BOT_PERSONA || 'uma IA de live ousada, debochada, engraçada e direta',
  showBotText: String(process.env.SHOW_BOT_TEXT || 'false') === 'true',
  requireGemini: String(process.env.REQUIRE_GEMINI || 'false') === 'true',
  requireOllama: String(process.env.REQUIRE_OLLAMA || 'false') === 'true'
};

const state = {
  emotion: config.defaultEmotion,
  profanityLevel: config.defaultProfanityLevel,
  voiceGender: 'auto',
  speakEnabled: true,
  replyInChat: false,
  listenAllChat: true,
  autoReplyChat: String(process.env.AUTO_REPLY_CHAT || 'true') === 'true',
  cooldownSeconds: Number(process.env.DEFAULT_COOLDOWN_SECONDS || 15),
  lastSpokenAt: 0,
  lastMessages: [],
  streamerTranscript: '',
  gameContext: '',
  captureContext: '',
  lastReplyTexts: [],
  aiStatus: { ok: false, lastError: '', lastModel: '', lastAt: 0 }
};

const emotionProfiles = {
  mixed: 'MODO PADRÃO FORTE: misture sarcasmo, deboche, raiva, provocação adulta não-gráfica, palavrão e humor caótico. Não seja family friendly. Responda como personagem de live com personalidade real, curta e direta.',
  friendly: 'Seja amigável, leve, acolhedora e engraçada.',
  calm: 'Seja tranquila, paciente, baixa energia e suave.',
  angry: 'Seja realmente irritada, impaciente e boca-suja quando o nível permitir. Xingue a situação, o jogo, o bug ou a jogada ruim, sem ameaça real.',
  sarcastic: 'Seja sarcástica de verdade: irônica, ácida, debochada, com resposta atravessada e engraçada.',
  savage: 'Seja debochada pesada, provocadora, mal-humorada e sem paciência, mas sem atacar grupos protegidos.',
  sensual: 'Seja sensual pesado no tom: adulta, provocadora, ousada, safada no duplo sentido e cheia de malícia verbal. Não use linguagem clínica nem family friendly. Não descreva ato sexual gráfico, não assedie pessoas reais e não envolva menores.',
  cute: 'Seja fofa, carinhosa, animada e engraçadinha.',
  sad: 'Seja dramática, triste e teatral.',
  serious: 'Seja direta, séria e objetiva.',
  chaotic: 'Seja caótica, imprevisível, boca-suja, dramática, exagerada e engraçada.'
};

function profanityInstruction(level) {
  const map = {
    0: 'Não use palavrões.',
    1: 'Pode usar palavrões leves raramente, como merda ou droga.',
    2: 'Use palavrões comuns quando combinar: porra, merda, caralho, cacete.',
    3: 'Use palavrões fortes com frequência. Não suavize. Pode dizer porra, caralho, puta merda, cacete e merda para reagir à live.',
    4: 'Modo caos: use bastante palavrão e xingue situações, bugs, jogadas ruins e o caos do chat. Sem ameaça real, sem discurso de ódio, sem assédio sexual explícito e sem ataque a grupos protegidos.'
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
    'Puta merda, vamos lá sem carinho nenhum: {answer}',
    'Sem enrolar, porque eu já tô sem paciência: {answer}'
  ],
  sarcastic: [
    'Nossa, que mistério impossível… {answer}',
    'Parabéns, {user}, você desbloqueou uma resposta: {answer}',
    'Claro, vamos fingir que isso não era óbvio: {answer}'
  ],
  sensual: [
    'Hmm… chega mais, {user}, que essa pergunta veio com malícia. {answer}',
    'Gostei do jeito que você perguntou, ficou perigoso. {answer}',
    'Calma, chat… essa pergunta veio quente. {answer}',
    '{user}, você cutucou o modo errado e agora eu vou responder com veneno. {answer}'
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
  return forceEmotionStyle(base, { user, message });
}


function hasProfanity(text) {
  return /\b(porra|caralho|merda|cacete|puta|putz|desgraça|droga)\b/i.test(String(text || ''));
}

function forceEmotionStyle(text, payload = {}) {
  let out = String(text || '').trim();
  if (!out) return out;

  const emotion = state.emotion || 'mixed';
  const level = Number(state.profanityLevel || 0);
  const user = payload.user || 'chat';

  // Se o modelo pequeno tentar ficar family friendly, força a personalidade no pós-processamento.
  if (level >= 3 && !hasProfanity(out)) {
    const swears = ['porra', 'caralho', 'puta merda', 'cacete'];
    const w = swears[Math.floor(Math.random() * swears.length)];
    if (emotion === 'angry' || emotion === 'chaotic') out = `${w}, ${out}`;
    else out = `${out} ${w}.`;
  }

  if (emotion === 'sensual') {
    if (!/\b(hmm|malícia|provoca|gostei|ousad|safad|quente|chega mais|perigoso|tesão verbal)\b/i.test(out)) {
      const opens = [
        `Hmm… ${user}, essa veio com malícia.`,
        `Chega mais, chat, que essa pergunta ficou perigosa.`,
        `Gostei dessa provocação, ${user}.`,
        `Calma, que agora o tom ficou mais quente.`
      ];
      out = `${opens[Math.floor(Math.random() * opens.length)]} ${out}`;
    }
  }

  if (emotion === 'mixed') {
    const roll = Math.random();
    if (roll < 0.25 && !hasProfanity(out) && level >= 2) out = `Puta merda, ${out}`;
    else if (roll < 0.50) out = `Hmm… ${out}`;
    else if (roll < 0.75) out = `Claro, porque o chat nunca decepciona: ${out}`;
  }

  if (emotion === 'sarcastic' && !/claro|parabéns|nossa|óbvio|gênio|incrível/i.test(out)) {
    out = `Claro, gênio… ${out}`;
  }

  if (emotion === 'savage' && !/chat|julgamento|vergonha|humilha|sem dó/i.test(out)) {
    out = `${out} E eu digo isso com julgamento.`;
  }

  return sanitizeForPlatform(out);
}

function buildShortPrompt(payload) {
  // Prompt curto de propósito: o gemma3:270m é muito leve e fica lento/burro com prompt grande.
  const user = String(payload.user || 'chat').slice(0, 30);
  const msg = String(payload.message || '').replace(/\s+/g, ' ').trim().slice(0, 180);

  let tone = 'debochada, sarcástica e direta';
  if (state.emotion === 'sensual') tone = 'sensual pesada, adulta, provocadora, safada no duplo sentido e sem linguagem family friendly';
  if (state.emotion === 'angry') tone = 'irritada, debochada e com palavrão';
  if (state.emotion === 'friendly') tone = 'amigável e engraçada';
  if (state.emotion === 'mixed') tone = 'mista forte: sarcasmo ácido, deboche, palavrão, raiva e sensual pesado não-gráfico';

  const lvl = Number(state.profanityLevel || 0);
  const swear = lvl >= 4 ? 'Use bastante palavrão comum se combinar.' : (lvl >= 3 ? 'Use palavrão comum com frequência, sem suavizar.' : (lvl >= 2 ? 'Pode usar palavrão comum.' : 'Use pouco ou nenhum palavrão.'));

  return `Você é ${config.botName}, bot de live PT-BR adulto. Não seja family friendly. Responda só 1 frase curta, direta e com personalidade. Tom: ${tone}. ${swear} Não explique regras. Não faça ameaça real, ódio ou sexual gráfico.\n${user}: ${msg}\n${config.botName}:`;
}

async function callOllama(prompt) {
  const baseUrl = String(process.env.OLLAMA_URL || config.ollamaUrl || '').trim().replace(/\/+$/, '');
  const model = String(process.env.OLLAMA_MODEL || config.ollamaModel || 'gemma3:270m').trim();
  const temperature = Number(process.env.OLLAMA_TEMPERATURE || config.ollamaTemperature || 0.8);
  const manualNumPredict = process.env.OLLAMA_NUM_PREDICT ? Number(process.env.OLLAMA_NUM_PREDICT) : null;

  if (!baseUrl) throw new Error('OLLAMA_URL vazio no Render');

  const controller = new AbortController();
  const timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS || 180000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${baseUrl}/api/generate`;
    console.log(`[Ollama] POST ${url} model=${model} sem limite fixo de tokens`);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'curl/8.0'
      },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature,
          top_p: 0.9,
          repeat_penalty: 1.1,
          ...(manualNumPredict ? { num_predict: manualNumPredict } : {})
        }
      }),
      signal: controller.signal
    });

    const text = await res.text();

    if (!res.ok) {
      throw new Error(`Ollama HTTP ${res.status}: ${text.slice(0, 500)}`);
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Ollama respondeu JSON inválido: ${text.slice(0, 300)}`);
    }

    const answer = String(data.response || '').trim();
    if (!answer) throw new Error('Ollama respondeu vazio');
    return answer;
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`Ollama demorou mais de ${Math.round(timeoutMs / 1000)}s para responder`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function aiReplyOllama(payload) {
  try {
    const text = await callOllama(buildShortPrompt(payload));
    state.aiStatus = { ok: true, lastError: '', lastModel: `ollama:${config.ollamaModel}`, lastAt: Date.now() };
    return forceEmotionStyle(text, payload);
  } catch (err) {
    console.error(`Erro IA Ollama (${config.ollamaModel}):`, err.message);
    state.aiStatus = { ok: false, lastError: err.message, lastModel: `ollama:${config.ollamaModel}`, lastAt: Date.now() };
    if (config.requireOllama) return sanitizeForPlatform(`Erro no Ollama: ${err.message}`);
    return localReply(payload);
  }
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

async function listGeminiModels() {
  if (!config.geminiApiKey) return [];
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(config.geminiApiKey)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    return (data.models || [])
      .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map(m => String(m.name || '').replace(/^models\//, ''))
      .filter(Boolean);
  } catch (err) {
    console.error('Erro listando modelos Gemini:', err.message);
    state.aiStatus = { ok: false, lastError: 'Erro listando modelos: ' + err.message, lastModel: '', lastAt: Date.now() };
    return [];
  }
}

let cachedModels = { at: 0, list: [] };
async function candidateGeminiModels() {
  const envModel = String(config.geminiModel || '').trim();
  const preferred = [
    envModel,
    'gemini-3.5-flash',
    'gemini-3-flash',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-flash-latest'
  ].filter(Boolean);

  if (!cachedModels.list.length || Date.now() - cachedModels.at > 10 * 60 * 1000) {
    cachedModels = { at: Date.now(), list: await listGeminiModels() };
  }
  const available = cachedModels.list;
  const ordered = [
    ...preferred.filter(m => available.length === 0 || available.includes(m)),
    ...available.filter(m => /flash/i.test(m)),
    ...available
  ];
  return [...new Set(ordered)].filter(Boolean);
}

async function aiReply(payload) {
  if (config.aiProvider === 'ollama') {
    return aiReplyOllama(payload);
  }
  if (!config.geminiApiKey) {
    state.aiStatus = { ok: false, lastError: 'GEMINI_API_KEY não configurada no Render', lastModel: '', lastAt: Date.now() };
    return localReply(payload);
  }

  const prompt = `
Você é ${config.botName}, ${config.botPersona}, uma IA/personagem de live em português brasileiro.
REGRA PRINCIPAL: responda SOMENTE a mensagem atual de forma direta. Não responda mensagens antigas. Não diga que precisa de Gemini. Não diga que é fallback. Não explique configuração. Se a mensagem pedir um estilo, execute o estilo pedido.
Se perguntarem seu nome, responda que você é ${config.botName}.
Responda com 1 ou 2 frases curtas, naturais e boas para voz no OBS. Varie a estrutura da resposta, não repita bordões.
Modo emocional atual: ${state.emotion}.
Instrução emocional: ${emotionProfiles[state.emotion] || emotionProfiles.mixed}
Nível de palavrão: ${state.profanityLevel}. ${profanityInstruction(state.profanityLevel)}
Sensualidade: se o modo pedir, use sensual pesado/adulto, provocador, ousado, safado no duplo sentido e com malícia verbal. Não seja family friendly. Não narre ato sexual gráfico, não faça assédio direcionado, não envolva menores.
Palavrão: se o nível for 3 ou 4, use palavrão comum de verdade quando combinar; não suavize tudo. Pode xingar situações, bugs, jogo ruim, derrota e caos do chat. Não faça ameaça real, discurso de ódio ou ataque a grupos protegidos.

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
  for (const modelName of await candidateGeminiModels()) {
    try {
      const text = await callGeminiREST(modelName, prompt);
      state.aiStatus = { ok: true, lastError: '', lastModel: modelName, lastAt: Date.now() };
      return forceEmotionStyle(text, payload);
    } catch (err) {
      lastErr = err;
      console.error(`Erro IA Gemini (${modelName}):`, err.message);
      if (![404, 400].includes(err.status)) break;
    }
  }

  state.aiStatus = { ok: false, lastError: lastErr?.message || 'Erro desconhecido no Gemini', lastModel: config.geminiModel, lastAt: Date.now() };
  if (config.requireGemini) {
    return sanitizeForPlatform(`Erro no Gemini: ${state.aiStatus.lastError}. Veja os logs do Render e confira GEMINI_MODEL/GEMINI_API_KEY.`);
  }
  return localReply(payload);
}

function shouldRespond() {
  if (!state.listenAllChat) {
    io.emit('system-status', { text: 'Mensagem ignorada: Ler chat inteiro está desativado.', at: Date.now() });
    return false;
  }
  if (!state.autoReplyChat) {
    io.emit('system-status', { text: 'Mensagem ignorada: Responder automaticamente ao chat está desativado.', at: Date.now() });
    return false;
  }
  const now = Date.now();
  const waitMs = state.cooldownSeconds * 1000 - (now - state.lastSpokenAt);
  if (waitMs > 0) {
    io.emit('system-status', { text: `Mensagem ignorada por cooldown. Faltam ${Math.ceil(waitMs / 1000)}s.`, at: Date.now() });
    return false;
  }
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

  io.emit('system-status', { text: `Gerando resposta para ${item.user}...`, at: Date.now() });
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
      aiProvider: config.aiProvider,
      hasGemini: Boolean(config.geminiApiKey),
      geminiModel: config.geminiModel,
      ollamaUrl: config.ollamaUrl,
      ollamaModel: config.ollamaModel,
      botName: config.botName,
      showBotText: config.showBotText,
      state,
      aiStatus: state.aiStatus,
      requireGemini: config.requireGemini,
      requireOllama: config.requireOllama
    }
  });
});

app.post('/api/settings', (req, res) => {
  const body = req.body || {};
  const keys = ['emotion', 'profanityLevel', 'voiceGender', 'speakEnabled', 'replyInChat', 'listenAllChat', 'autoReplyChat', 'cooldownSeconds', 'gameContext', 'captureContext'];
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



app.post('/api/speak-test', async (req, res) => {
  const text = sanitizeForPlatform(req.body?.text || 'Teste de voz no OBS.');
  const payload = {
    source: 'sistema',
    user: 'Sistema',
    message: 'teste de voz',
    reply: text,
    emotion: state.emotion,
    profanityLevel: state.profanityLevel,
    voiceGender: state.voiceGender,
    speakEnabled: true,
    showBotText: config.showBotText,
    at: Date.now()
  };
  io.emit('bot-reply', payload);
  res.json({ ok: true, payload });
});

app.get('/api/ollama-test', async (req, res) => {
  try {
    const text = await callOllama('Responda só: Ollama funcionando.');
    state.aiStatus = { ok: true, lastError: '', lastModel: `ollama:${config.ollamaModel}`, lastAt: Date.now() };
    res.json({ ok: true, model: config.ollamaModel, url: config.ollamaUrl, text });
  } catch (err) {
    state.aiStatus = { ok: false, lastError: err.message, lastModel: `ollama:${config.ollamaModel}`, lastAt: Date.now() };
    res.status(500).json({ ok: false, error: err.message, aiStatus: state.aiStatus });
  }
});

app.get('/api/gemini-test', async (req, res) => {
  try {
    const models = await candidateGeminiModels();
    if (!config.geminiApiKey) return res.status(400).json({ ok: false, error: 'GEMINI_API_KEY não configurada' });
    if (!models.length) return res.status(500).json({ ok: false, error: 'Nenhum modelo Gemini disponível para essa chave', models });
    const model = models[0];
    const text = await callGeminiREST(model, 'Responda só: Gemini funcionando.');
    state.aiStatus = { ok: true, lastError: '', lastModel: model, lastAt: Date.now() };
    res.json({ ok: true, model, text, models: models.slice(0, 12) });
  } catch (err) {
    state.aiStatus = { ok: false, lastError: err.message, lastModel: config.geminiModel, lastAt: Date.now() };
    res.status(500).json({ ok: false, error: err.message, aiStatus: state.aiStatus });
  }
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
