import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import tmi from 'tmi.js';

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, maxHttpBufferSize: 5e6 });

// Ponte local pronta para uso: não exige configurar segredo no Render.
// Variáveis de ambiente continuam podendo substituir os padrões quando desejado.
const BUILTIN_OLLAMA_BRIDGE_SECRET = 'carol-bridge-2026-v1-7f8c2a91';

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
  ollamaUrl: (process.env.OLLAMA_URL || '').replace(/\/$/, ''),
  ollamaBridgeSecret: process.env.OLLAMA_BRIDGE_SECRET || BUILTIN_OLLAMA_BRIDGE_SECRET,
  ollamaModel: process.env.OLLAMA_MODEL || 'gemma3:270m',
  // Sem limite fixo de tokens. O Ollama decide o tamanho da resposta, salvo se você definir OLLAMA_NUM_PREDICT manualmente.
  ollamaTemperature: Number(process.env.OLLAMA_TEMPERATURE || 0.8),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
  defaultProfanityLevel: Number(process.env.DEFAULT_PROFANITY_LEVEL || 2),
  defaultProfanityIntensity: process.env.DEFAULT_PROFANITY_PERCENT !== undefined ? Number(process.env.DEFAULT_PROFANITY_PERCENT) : Math.max(0, Math.min(100, Number(process.env.DEFAULT_PROFANITY_LEVEL || 2) * 25)),
  defaultEmotion: process.env.DEFAULT_EMOTION || 'mixed',
  defaultEmotionIntensity: Number(process.env.DEFAULT_EMOTION_INTENSITY || 75),
  allowSensualHeavy: String(process.env.ALLOW_SENSUAL_HEAVY || 'true') === 'true',
  botName: process.env.BOT_NAME || 'Carol IA',
  botPersona: process.env.BOT_PERSONA || 'uma IA de live ousada, debochada, engraçada e direta',
  showBotText: String(process.env.SHOW_BOT_TEXT || 'false') === 'true',
  requireGemini: String(process.env.REQUIRE_GEMINI || 'false') === 'true',
  requireOllama: String(process.env.REQUIRE_OLLAMA || 'false') === 'true'
};

const state = {
  emotion: config.defaultEmotion,
  emotionIntensity: Math.max(0, Math.min(100, config.defaultEmotionIntensity)),
  profanityIntensity: Math.max(0, Math.min(100, config.defaultProfanityIntensity)),
  profanityLevel: Math.max(0, Math.min(4, Math.round(config.defaultProfanityIntensity / 25))),
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
  mixed: 'Misture naturalmente humor, sarcasmo, energia, provocação, carinho e irritação conforme a mensagem. Varie bastante e não repita sempre o mesmo tipo de reação.',
  neutral: 'Seja natural, equilibrada e espontânea, sem puxar forte para nenhuma emoção específica.',
  friendly: 'Seja amigável, simpática, calorosa, leve e divertida.',
  happy: 'Seja feliz, positiva, sorridente e de alto astral.',
  excited: 'Seja empolgada, acelerada, entusiasmada e contagiante.',
  hype: 'Seja muito animada, como narradora de momento épico de live, celebrando e levantando o chat.',
  playful: 'Seja brincalhona, espirituosa e faça piadas leves com a situação.',
  teasing: 'Provoque de forma brincalhona e debochada, como quem cutuca o chat sem maldade real.',
  mischievous: 'Seja travessa, maliciosa no humor e com ar de quem vai aprontar alguma coisa.',
  curious: 'Seja curiosa, interessada e faça a resposta soar como alguém genuinamente intrigado.',
  surprised: 'Reaja com surpresa, espanto e incredulidade de forma natural.',
  confused: 'Demonstre confusão engraçada, estranhamento e tentativa de entender a bagunça.',
  shy: 'Seja tímida, um pouco sem jeito e delicada, sem perder a naturalidade.',
  cute: 'Seja fofa, carinhosa, animada e engraçadinha.',
  romantic: 'Seja romântica, carinhosa, charmosa e afetiva, sem conteúdo sexual explícito.',
  sensual: 'Seja adulta, provocadora e cheia de duplo sentido e malícia verbal, sem descrição sexual gráfica, sem assédio e sem envolver menores.',
  calm: 'Seja tranquila, paciente, serena, baixa energia e suave.',
  sleepy: 'Seja sonolenta, preguiçosa e lenta no humor, como alguém quase dormindo.',
  sad: 'Seja triste, emotiva e sensível, mas ainda adequada a uma personagem de live.',
  melancholic: 'Seja melancólica, contemplativa e dramática de um jeito mais contido.',
  dramatic: 'Seja teatral, exagerada e faça tudo parecer uma novela ou evento gigantesco.',
  worried: 'Seja preocupada, tensa e cautelosa sem entrar em pânico.',
  nervous: 'Seja nervosa, inquieta, afobada e um pouco atrapalhada.',
  scared: 'Reaja com medo, susto e tensão, especialmente a situações de jogo.',
  disgusted: 'Demonstre nojo, repulsa e reação de “eca” quando fizer sentido.',
  disappointed: 'Seja decepcionada, desanimada e julgadora com a situação, sem humilhar pessoas reais.',
  frustrated: 'Seja frustrada, impaciente e claramente incomodada com bugs, derrotas ou repetição.',
  angry: 'Seja irritada, impaciente e intensa. Pode xingar a situação quando o nível de palavrão permitir, sem ameaça real.',
  furious: 'Seja muito brava e explosiva no tom, com indignação forte, sem ameaça real nem ataque protegido.',
  jealous: 'Seja ciumenta de forma teatral e brincalhona, sem comportamento controlador ou ameaçador.',
  sarcastic: 'Seja sarcástica de verdade: irônica, ácida, debochada e com resposta atravessada.',
  ironic: 'Use ironia seca e contraste entre o que diz e o que realmente quer sugerir.',
  savage: 'Seja debochada pesada, provocadora, mal-humorada e sem paciência, mas sem assédio ou ataque a grupos protegidos.',
  arrogant: 'Seja convencida, metida e confiante de forma cômica, como personagem que se acha a dona da razão.',
  cold: 'Seja fria, curta, seca e distante, com pouca demonstração emocional.',
  serious: 'Seja direta, séria, objetiva e focada.',
  motivational: 'Seja motivadora, encorajadora e energética sem virar palestra genérica.',
  chaotic: 'Seja caótica, imprevisível, dramática, exagerada e engraçada; mude o ritmo e surpreenda.'
};

function clampPercent(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Math.max(0, Math.min(100, fallback));
  return Math.max(0, Math.min(100, Math.round(n)));
}

function intensityLabel(value) {
  const p = clampPercent(value, 50);
  if (p <= 5) return 'quase neutra';
  if (p <= 25) return 'bem leve';
  if (p <= 45) return 'leve';
  if (p <= 65) return 'moderada';
  if (p <= 85) return 'forte';
  if (p <= 95) return 'muito forte';
  return 'máxima';
}

function profanityInstruction(percent) {
  const p = clampPercent(percent, 50);
  if (p <= 5) return 'Não use palavrões.';
  if (p <= 25) return 'Use palavrões leves raramente, só quando encaixar naturalmente.';
  if (p <= 50) return 'Pode usar palavrões comuns ocasionalmente quando combinar com a reação.';
  if (p <= 75) return 'Use palavrões comuns com frequência moderada quando a situação pedir.';
  if (p <= 90) return 'Use palavrões fortes com frequência, sem suavizar toda reação.';
  return 'Modo caos de palavrão: use bastante quando combinar, principalmente para bugs, derrotas e confusão do chat; sem ameaça real, ódio ou assédio.';
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


const localEmotionOpeners = {
  neutral: 'Tá, vamos direto:',
  happy: 'Aí sim, gostei disso!',
  excited: 'Opa, AGORA ficou interessante!',
  hype: 'CHAT, SEGURA ESSA:',
  playful: 'Hehe, olha isso:',
  teasing: 'Olha quem resolveu aparecer com essa:',
  mischievous: 'Hmm… eu já tô vendo confusão nisso:',
  curious: 'Agora eu fiquei curiosa:',
  surprised: 'QUE? Pera aí:',
  confused: 'Tá, meu cérebro deu uma travada:',
  shy: 'Ai… tá bom:',
  romantic: 'Olha, isso foi até bonitinho:',
  sleepy: 'Hmm… quase dormindo, mas respondo:',
  melancholic: 'Isso bateu meio triste:',
  dramatic: 'MEU DEUS, virou novela:',
  worried: 'Isso me deixou meio preocupada:',
  nervous: 'Tá, calma, isso me deixou nervosa:',
  scared: 'AI, não gostei disso não:',
  disgusted: 'Eca… olha:',
  disappointed: 'Eu esperava mais, viu:',
  frustrated: 'Ah não, de novo isso:',
  furious: 'CARALHO, isso me tirou do sério:',
  jealous: 'Ah é? Então agora temos concorrência?',
  ironic: 'Sim, claro, absolutamente perfeito…:',
  arrogant: 'Deixa que a especialista aqui explica:',
  cold: 'Resposta curta:',
  motivational: 'Bora, porque dá pra virar isso:'
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
  const localIntensity = clampPercent(state.emotionIntensity, 75);
  let template = localIntensity <= 5
    ? '{answer}'
    : (localTemplates[mode] ? chooseTemplate(mode) : `${localEmotionOpeners[mode] || ''} {answer}`.trim());
  let base = template
    .replaceAll('{user}', user || 'chat')
    .replaceAll('{bot}', config.botName)
    .replaceAll('{answer}', answer)
    .replaceAll('{source}', source || 'chat');

  if (state.profanityIntensity <= 5) {
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
  const intensity = clampPercent(state.emotionIntensity, 75);
  const profanity = clampPercent(state.profanityIntensity, 50);
  const user = payload.user || 'chat';

  // Intensidade baixa deixa a resposta quase neutra; intensidade alta reforça marcadores do modo.
  const chance = intensity / 100;
  if (profanity >= 70 && Math.random() < (profanity / 100) * 0.8 && !hasProfanity(out)) {
    const swears = profanity >= 90 ? ['porra', 'caralho', 'puta merda', 'cacete'] : ['porra', 'merda', 'cacete'];
    const w = swears[Math.floor(Math.random() * swears.length)];
    if (['angry', 'furious', 'frustrated', 'chaotic'].includes(emotion)) out = `${w}, ${out}`;
    else if (Math.random() < 0.45) out = `${out} ${w}.`;
  }

  if (intensity >= 35 && Math.random() < chance) {
    const openers = {
      sensual: [`Hmm… ${user}, essa veio com malícia.`, 'Calma, que esse papo ficou perigoso.', 'Gostei dessa provocação.'],
      sarcastic: ['Claro, gênio…', 'Nossa, que surpresa absolutamente inesperada…', 'Parabéns, detetive…'],
      ironic: ['Sim, claro, perfeito…', 'Com certeza, porque isso nunca daria errado…'],
      savage: ['Eu vou responder, mas com julgamento.', 'Lá vem o chat pedindo problema…'],
      angry: ['Ah, porra…', 'Tá de sacanagem, né?'],
      furious: ['NÃO, aí já é demais.', 'Caralho, agora eu fiquei puta.'],
      frustrated: ['Ah não, de novo não.', 'Isso já tá me dando nos nervos.'],
      excited: ['Opa! Agora sim!', 'AÍ SIM!'],
      hype: ['CHAT, SEGURA ESSA!', 'ISSO AQUI VIROU EVENTO!'],
      surprised: ['QUE?!', 'Pera aí, como assim?!'],
      confused: ['Tá, meu cérebro travou.', 'Como é que é?!'],
      shy: ['Ai… tá bom.', 'E-eu vou responder, vai.'],
      cute: ['Awn, olha isso!', 'Tá bom, chat lindo.'],
      romantic: ['Isso foi até bonitinho.', 'Olha… assim você me quebra.'],
      sleepy: ['Hmm… tô quase dormindo, mas vai.', 'Tá… deixa eu acordar pra responder.'],
      sad: ['Poxa…', 'Aí você me deixou triste.'],
      melancholic: ['Isso bateu meio fundo.', 'Hmm… clima de fim de episódio.'],
      dramatic: ['MEU DEUS, VIROU NOVELA!', 'Isso aqui é cinema, chat!'],
      worried: ['Hmm, isso me preocupa.', 'Tá, isso não parece bom.'],
      nervous: ['Calma, calma…', 'Ai, isso me deixou nervosa.'],
      scared: ['AI! Não gostei disso.', 'Tá, isso deu medo.'],
      disgusted: ['Eca.', 'Nossa, que horror.'],
      disappointed: ['Eu esperava mais.', 'Que decepção, hein.'],
      jealous: ['Ah é? Então tá.', 'Olha a concorrência aparecendo…'],
      arrogant: ['Deixa que eu explico, obviamente.', 'A especialista chegou.'],
      cold: ['Tá.', 'Resposta simples.'],
      motivational: ['Bora virar isso.', 'Vai, dá pra fazer melhor.'],
      chaotic: ['ALERTA DE CAOS!', 'EU PISQUEI E TUDO PIOROU!'],
      playful: ['Hehe, olha isso.', 'Tá querendo brincar comigo, né?'],
      teasing: ['Olha quem tá pedindo provocação.', 'Você facilita demais a zoeira.'],
      mischievous: ['Hmm… isso vai dar ruim e eu gostei.', 'Eu já tô vendo a confusão chegando.'],
      curious: ['Agora eu fiquei curiosa.', 'Hmm, interessante…'],
      happy: ['Aí sim!', 'Gostei disso!'],
      friendly: ['Boa!', 'Fechou!'],
      calm: ['Com calma:', 'Tranquilo:'],
      serious: ['Direto ao ponto:', 'Sem rodeio:']
    };
    const list = openers[emotion];
    if (list && list.length && Math.random() < Math.max(0.25, chance)) {
      const opener = list[Math.floor(Math.random() * list.length)];
      if (!out.toLowerCase().startsWith(opener.toLowerCase().slice(0, 8))) out = `${opener} ${out}`;
    }
  }

  if (profanity <= 5) {
    out = out.replace(/porra|caralho|puta merda|merda|cacete|desgraça/gi, 'nossa');
  }

  return sanitizeForPlatform(out);
}

function buildShortPrompt(payload) {
  // Prompt curto para modelos locais pequenos, mas agora todos os sentimentos recebem instrução própria.
  const user = String(payload.user || 'chat').slice(0, 30);
  const msg = String(payload.message || '').replace(/\s+/g, ' ').trim().slice(0, 220);
  const emotion = state.emotion || 'mixed';
  const intensity = clampPercent(state.emotionIntensity, 75);
  const profanity = clampPercent(state.profanityIntensity, 50);
  const profile = emotionProfiles[emotion] || emotionProfiles.mixed;

  // Prompt deliberadamente curto: gemma3:270m responde melhor e mais rápido com contexto enxuto.
  return `Você é ${config.botName}, personagem de live PT-BR. Responda só 1-2 frases curtas.\nTom ${emotion} ${intensity}%: ${profile}\nPalavrões ${profanity}%: ${profanityInstruction(profanity)}\nSem explicar regras; sem ameaça real, ódio, assédio ou sexo gráfico.\n${user}: ${msg}\n${config.botName}:`;
}

let ollamaBridgeSocket = null;
const ollamaBridgePending = new Map();
const ttsBridgePending = new Map();
let obsClientCount = 0;

function bridgeStatus() {
  return Boolean(ollamaBridgeSocket?.connected);
}

async function callOllamaBridge(prompt) {
  if (!bridgeStatus()) throw new Error('Ponte Ollama local não conectada');
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS || 180000);
  const options = {
    temperature: Number(process.env.OLLAMA_TEMPERATURE || config.ollamaTemperature || 0.8),
    top_p: 0.9,
    repeat_penalty: 1.1,
    // Chat de live usa contexto curto; reduz RAM sem cortar respostas normais.
    num_ctx: Math.max(512, Number(process.env.OLLAMA_NUM_CTX || 1024)),
    // 80 tokens é suficiente para 1-2 frases de chat e evita o modelo continuar gerando texto que seria cortado depois.
    num_predict: Math.max(24, Number(process.env.OLLAMA_NUM_PREDICT || 80))
  };

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ollamaBridgePending.delete(requestId);
      reject(new Error(`Ponte Ollama demorou mais de ${Math.round(timeoutMs / 1000)}s para responder`));
    }, timeoutMs);
    ollamaBridgePending.set(requestId, { resolve, reject, timer });
    ollamaBridgeSocket.emit('ollama-generate', {
      requestId,
      prompt,
      model: String(process.env.OLLAMA_MODEL || config.ollamaModel || 'gemma3:270m'),
      options
    });
  });
}

async function callTtsBridge(text, payload = {}) {
  if (!bridgeStatus()) throw new Error('Ponte local não conectada para gerar a voz');
  const requestId = `tts-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const timeoutMs = Math.max(5000, Number(process.env.CAROL_TTS_TIMEOUT_MS || 45000));

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ttsBridgePending.delete(requestId);
      reject(new Error(`Voz local demorou mais de ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    ttsBridgePending.set(requestId, { resolve, reject, timer });
    ollamaBridgeSocket.emit('tts-generate', {
      requestId,
      text: String(text || '').slice(0, 420),
      voiceGender: payload.voiceGender || state.voiceGender || 'auto',
      emotion: payload.emotion || state.emotion || 'mixed',
      emotionIntensity: payload.emotionIntensity ?? state.emotionIntensity ?? 75
    });
  });
}

async function emitObsAudio(payload) {
  if (!payload?.speakEnabled || obsClientCount <= 0) return;
  try {
    const audio = await callTtsBridge(payload.reply, payload);
    io.emit('bot-audio', {
      audioBase64: audio.audioBase64,
      mimeType: audio.mimeType || 'audio/wav',
      voiceName: audio.voiceName || '',
      emotion: payload.emotion,
      emotionIntensity: payload.emotionIntensity,
      at: Date.now()
    });
  } catch (err) {
    console.error('Erro gerando áudio para o OBS:', err.message);
    io.emit('system-status', { text: `Áudio OBS indisponível: ${err.message}`, at: Date.now() });
  }
}

async function callOllama(prompt) {
  if (bridgeStatus()) {
    console.log(`[Ollama] usando ponte local conectada model=${config.ollamaModel}`);
    return callOllamaBridge(prompt);
  }

  const baseUrl = String(process.env.OLLAMA_URL || config.ollamaUrl || '').trim().replace(/\/+$/, '');
  const model = String(process.env.OLLAMA_MODEL || config.ollamaModel || 'gemma3:270m').trim();
  const temperature = Number(process.env.OLLAMA_TEMPERATURE || config.ollamaTemperature || 0.8);
  const manualNumPredict = Math.max(24, Number(process.env.OLLAMA_NUM_PREDICT || 80));

  if (!baseUrl) throw new Error('Ponte Ollama desconectada e OLLAMA_URL não configurado');

  const controller = new AbortController();
  const timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS || 180000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${baseUrl}/api/generate`;
    console.log(`[Ollama] POST ${url} model=${model} num_predict=${manualNumPredict}`);

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
          num_ctx: Math.max(512, Number(process.env.OLLAMA_NUM_CTX || 1024)),
          num_predict: manualNumPredict
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
Intensidade emocional: ${state.emotionIntensity}% (${intensityLabel(state.emotionIntensity)}). Aplique a emoção proporcionalmente: 0% quase neutra; 100% muito evidente, sem repetir bordões.
Instrução emocional: ${emotionProfiles[state.emotion] || emotionProfiles.mixed}
Palavrões: ${state.profanityIntensity}%. ${profanityInstruction(state.profanityIntensity)}
Sensualidade: se o modo pedir, use sensual pesado/adulto, provocador, ousado, safado no duplo sentido e com malícia verbal. Não seja family friendly. Não narre ato sexual gráfico, não faça assédio direcionado, não envolva menores.
Palavrão: siga exatamente o percentual configurado; acima de 70% use com frequência quando combinar, abaixo de 25% use raramente. Pode xingar situações, bugs, jogo ruim, derrota e caos do chat. Não faça ameaça real, discurso de ódio ou ataque a grupos protegidos.

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
    emotionIntensity: state.emotionIntensity,
    profanityIntensity: state.profanityIntensity,
    profanityLevel: state.profanityLevel,
    voiceGender: state.voiceGender,
    speakEnabled: state.speakEnabled,
    showBotText: config.showBotText,
    at: Date.now()
  };

  io.emit('bot-reply', payload);
  if (payload.speakEnabled) void emitObsAudio(payload);

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
      ollamaBridgeConnected: bridgeStatus(),
      ollamaBridgeEnabled: Boolean(config.ollamaBridgeSecret),
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
  const keys = ['emotion', 'emotionIntensity', 'profanityIntensity', 'profanityLevel', 'voiceGender', 'speakEnabled', 'replyInChat', 'listenAllChat', 'autoReplyChat', 'cooldownSeconds', 'gameContext', 'captureContext'];
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(body, key)) state[key] = body[key];
  }
  state.emotionIntensity = clampPercent(state.emotionIntensity, 75);
  if (Object.prototype.hasOwnProperty.call(body, 'profanityIntensity')) {
    state.profanityIntensity = clampPercent(body.profanityIntensity, 50);
  } else if (Object.prototype.hasOwnProperty.call(body, 'profanityLevel')) {
    state.profanityIntensity = clampPercent(Number(body.profanityLevel) * 25, 50);
  }
  state.profanityLevel = Math.max(0, Math.min(4, Math.round(state.profanityIntensity / 25)));
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
    emotionIntensity: state.emotionIntensity,
    profanityIntensity: state.profanityIntensity,
    profanityLevel: state.profanityLevel,
    voiceGender: state.voiceGender,
    speakEnabled: true,
    showBotText: config.showBotText,
    at: Date.now()
  };
  io.emit('bot-reply', payload);
  void emitObsAudio(payload);
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
  const role = socket.handshake?.auth?.role;
  if (role === 'ollama-bridge') {
    const supplied = String(socket.handshake?.auth?.secret || '');
    const bridgeSecretOk = supplied === config.ollamaBridgeSecret || supplied === BUILTIN_OLLAMA_BRIDGE_SECRET;
    if (!bridgeSecretOk) {
      console.warn('Ponte Ollama recusada: secret inválido.');
      socket.emit('bridge-error', { error: 'secret inválido' });
      socket.disconnect(true);
      return;
    }

    if (ollamaBridgeSocket && ollamaBridgeSocket.id !== socket.id) {
      try { ollamaBridgeSocket.disconnect(true); } catch {}
    }
    ollamaBridgeSocket = socket;
    console.log('Ponte Ollama local conectada:', socket.id);
    io.emit('system-status', { text: 'Ponte Ollama local conectada.', at: Date.now() });
    io.emit('bridge-status', { connected: true, at: Date.now() });

    socket.on('ollama-result', result => {
      const requestId = String(result?.requestId || '');
      const pending = ollamaBridgePending.get(requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      ollamaBridgePending.delete(requestId);
      if (result?.ok) pending.resolve(String(result.text || '').trim());
      else pending.reject(new Error(String(result?.error || 'Erro desconhecido na ponte Ollama')));
    });


    socket.on('tts-result', result => {
      const requestId = String(result?.requestId || '');
      const pending = ttsBridgePending.get(requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      ttsBridgePending.delete(requestId);
      if (result?.ok) {
        pending.resolve({
          audioBase64: String(result.audioBase64 || ''),
          mimeType: String(result.mimeType || 'audio/wav'),
          voiceName: String(result.voiceName || '')
        });
      } else {
        pending.reject(new Error(String(result?.error || 'Erro desconhecido no TTS local')));
      }
    });

    socket.on('disconnect', () => {
      if (ollamaBridgeSocket?.id === socket.id) ollamaBridgeSocket = null;
      console.log('Ponte Ollama local desconectada.');
      io.emit('system-status', { text: 'Ponte Ollama local desconectada.', at: Date.now() });
      io.emit('bridge-status', { connected: false, at: Date.now() });
      for (const [id, pending] of ollamaBridgePending) {
        clearTimeout(pending.timer);
        pending.reject(new Error('Ponte Ollama desconectou durante a resposta'));
        ollamaBridgePending.delete(id);
      }
      for (const [id, pending] of ttsBridgePending) {
        clearTimeout(pending.timer);
        pending.reject(new Error('Ponte local desconectou durante a voz'));
        ttsBridgePending.delete(id);
      }
    });
    return;
  }

  if (role === 'obs') {
    obsClientCount += 1;
    console.log('Fonte OBS conectada. Total:', obsClientCount);
    socket.on('disconnect', () => {
      obsClientCount = Math.max(0, obsClientCount - 1);
      console.log('Fonte OBS desconectada. Total:', obsClientCount);
    });
  }

  socket.emit('settings', state);
  socket.emit('bridge-status', { connected: bridgeStatus(), at: Date.now() });
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
