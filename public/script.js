const isObs = document.body.classList.contains('obs-body');
const socket = io({ auth: { role: isObs ? 'obs' : 'panel' } });
let currentState = {};
let selectedVoiceName = localStorage.getItem('selectedVoiceName') || '';
let recognition = null;

const $ = id => document.getElementById(id);

function logLine(html) {
  const log = $('log');
  if (!log) return;
  const div = document.createElement('div');
  div.className = 'line';
  div.innerHTML = html;
  log.prepend(div);
}

function loadVoices() {
  const select = $('voiceSelect');
  if (!select) return;
  const voices = speechSynthesis.getVoices();
  select.innerHTML = '';
  voices.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.name;
    opt.textContent = `${v.name} - ${v.lang}`;
    if (v.name === selectedVoiceName) opt.selected = true;
    select.appendChild(opt);
  });
}

function pickVoice(gender) {
  const voices = speechSynthesis.getVoices();
  if (selectedVoiceName) {
    const exact = voices.find(v => v.name === selectedVoiceName);
    if (exact) return exact;
  }
  const pt = voices.filter(v => /pt|Portugu/i.test(v.lang + ' ' + v.name));
  const all = pt.length ? pt : voices;
  if (gender === 'female') return all.find(v => /Maria|Francisca|female|femin/i.test(v.name)) || all[0];
  if (gender === 'male') return all.find(v => /Daniel|male|mascul/i.test(v.name)) || all[0];
  return all[0];
}

function emotionVoiceParams(emotion, intensity = 75) {
  const base = { rate: 1, pitch: 1, volume: 1 };
  const targets = {
    mixed: { rate: 1.02, pitch: 1.00, volume: 1 },
    neutral: base,
    friendly: { rate: 1.02, pitch: 1.02, volume: 1 },
    happy: { rate: 1.05, pitch: 1.05, volume: 1 },
    excited: { rate: 1.11, pitch: 1.07, volume: 1 },
    hype: { rate: 1.15, pitch: 1.08, volume: 1 },
    playful: { rate: 1.06, pitch: 1.05, volume: 1 },
    teasing: { rate: 1.02, pitch: 0.99, volume: 1 },
    mischievous: { rate: 1.03, pitch: 0.98, volume: 1 },
    curious: { rate: 1.03, pitch: 1.04, volume: 1 },
    surprised: { rate: 1.10, pitch: 1.10, volume: 1 },
    confused: { rate: 0.98, pitch: 1.02, volume: 0.98 },
    shy: { rate: 0.96, pitch: 1.05, volume: 0.88 },
    cute: { rate: 1.04, pitch: 1.10, volume: 1 },
    romantic: { rate: 0.95, pitch: 0.98, volume: 0.94 },
    sensual: { rate: 0.93, pitch: 0.93, volume: 0.96 },
    calm: { rate: 0.95, pitch: 0.98, volume: 0.94 },
    sleepy: { rate: 0.88, pitch: 0.94, volume: 0.82 },
    sad: { rate: 0.91, pitch: 0.94, volume: 0.88 },
    melancholic: { rate: 0.90, pitch: 0.93, volume: 0.86 },
    dramatic: { rate: 1.05, pitch: 1.03, volume: 1 },
    worried: { rate: 1.02, pitch: 1.04, volume: 0.96 },
    nervous: { rate: 1.09, pitch: 1.06, volume: 0.97 },
    scared: { rate: 1.12, pitch: 1.10, volume: 1 },
    disgusted: { rate: 0.96, pitch: 0.94, volume: 0.96 },
    disappointed: { rate: 0.93, pitch: 0.94, volume: 0.90 },
    frustrated: { rate: 1.05, pitch: 0.97, volume: 1 },
    angry: { rate: 1.09, pitch: 0.95, volume: 1 },
    furious: { rate: 1.14, pitch: 0.93, volume: 1 },
    jealous: { rate: 1.01, pitch: 0.99, volume: 0.98 },
    sarcastic: { rate: 1.00, pitch: 0.97, volume: 1 },
    ironic: { rate: 0.98, pitch: 0.97, volume: 0.98 },
    savage: { rate: 1.05, pitch: 0.95, volume: 1 },
    arrogant: { rate: 0.98, pitch: 0.96, volume: 1 },
    cold: { rate: 0.94, pitch: 0.94, volume: 0.92 },
    serious: { rate: 0.98, pitch: 0.96, volume: 1 },
    motivational: { rate: 1.07, pitch: 1.03, volume: 1 },
    chaotic: { rate: 1.13, pitch: 1.04, volume: 1 }
  };
  const target = targets[emotion] || base;
  const strength = Math.max(0, Math.min(100, Number(intensity) || 0)) / 100;
  return {
    rate: base.rate + (target.rate - base.rate) * strength,
    pitch: base.pitch + (target.pitch - base.pitch) * strength,
    volume: base.volume + (target.volume - base.volume) * strength
  };
}

let speechUnlocked = false;
let speechQueue = [];
let isSpeakingNow = false;
let lastSpokenText = '';
let lastSpokenAt = 0;

let obsAudioQueue = [];
let obsAudioPlaying = false;
let obsCurrentAudio = null;

function base64ToBlob(base64, mimeType = 'audio/wav') {
  const binary = atob(String(base64 || ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

function enqueueObsAudio(payload = {}) {
  if (!isObs || !payload.audioBase64) return;
  obsAudioQueue.push(payload);
  if (obsAudioQueue.length > 2) obsAudioQueue = obsAudioQueue.slice(-2);
  processObsAudioQueue();
}

async function processObsAudioQueue() {
  if (!isObs || obsAudioPlaying) return;
  const item = obsAudioQueue.shift();
  if (!item) {
    setTalking(false);
    return;
  }

  let objectUrl = '';
  try {
    const blob = base64ToBlob(item.audioBase64, item.mimeType || 'audio/wav');
    objectUrl = URL.createObjectURL(blob);
    const audio = new Audio(objectUrl);
    obsCurrentAudio = audio;
    audio.preload = 'auto';
    audio.volume = 1;

    audio.onplay = () => {
      obsAudioPlaying = true;
      setTalking(true);
    };
    const finish = () => {
      obsAudioPlaying = false;
      setTalking(false);
      obsCurrentAudio = null;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setTimeout(processObsAudioQueue, 80);
    };
    audio.onended = finish;
    audio.onerror = finish;

    obsAudioPlaying = true;
    setTalking(true);
    await audio.play();
  } catch (err) {
    obsAudioPlaying = false;
    setTalking(false);
    obsCurrentAudio = null;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    // Se o autoplay for bloqueado, devolve uma vez para a fila. O usuário pode
    // abrir Interagir no OBS e clicar no avatar; não aparece aviso na live.
    if (item._retry !== true) {
      item._retry = true;
      obsAudioQueue.unshift(item);
    }
  }
}

function unlockSpeech() {
  speechUnlocked = true;
  try { speechSynthesis?.resume?.(); } catch {}
  try {
    // Beep quase mudo só para liberar áudio/autoplay no Chromium/OBS.
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      window.__botAudioCtx = window.__botAudioCtx || new AudioCtx();
      if (window.__botAudioCtx.state === 'suspended') window.__botAudioCtx.resume();
    }
  } catch {}
  const u = $('audioUnlock');
  if (u && !isObs) u.style.display = 'none';
}

function playBeep() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = window.__botAudioCtx || new AudioCtx();
    window.__botAudioCtx = ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    osc.frequency.value = 440;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => { try { osc.stop(); } catch {} }, 120);
  } catch {}
}

// O OBS/Chrome às vezes pausa o TTS sozinho. Esse loop acorda a voz.
setInterval(() => {
  if (!('speechSynthesis' in window)) return;
  try { speechSynthesis.resume(); } catch {}
}, 1500);

function cleanSpeakText(text) {
  return String(text || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' link ')
    .replace(/[`*_#<>\[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitSpeech(text) {
  const t = cleanSpeakText(text);
  if (!t) return [];
  // Frases curtas falam com mais estabilidade no OBS.
  const parts = t.match(/[^.!?…]+[.!?…]?/g) || [t];
  const out = [];
  for (const part of parts) {
    const x = part.trim();
    if (!x) continue;
    if (x.length <= 180) out.push(x);
    else {
      for (let i = 0; i < x.length; i += 160) out.push(x.slice(i, i + 160).trim());
    }
  }
  return out.slice(0, 4);
}

function speak(text, payload = {}) {
  if (!('speechSynthesis' in window)) return;
  const cleaned = cleanSpeakText(text);
  if (!cleaned) return;

  // Evita repetir a mesma fala em sequência, mas não bloqueia respostas novas.
  const now = Date.now();
  if (cleaned === lastSpokenText && now - lastSpokenAt < 4000) return;
  lastSpokenText = cleaned;
  lastSpokenAt = now;

  const chunks = splitSpeech(cleaned);
  for (const chunk of chunks) speechQueue.push({ text: chunk, payload, tries: 0 });
  processSpeechQueue();
}

function processSpeechQueue() {
  if (!('speechSynthesis' in window)) return;
  if (isSpeakingNow) return;
  const item = speechQueue.shift();
  if (!item) {
    setTalking(false);
    return;
  }

  // Não deixa acumular fila infinita se o chat estiver muito rápido.
  if (speechQueue.length > 6) speechQueue = speechQueue.slice(-6);

  try { speechSynthesis.resume(); } catch {}

  const utter = new SpeechSynthesisUtterance(item.text);
  utter.lang = 'pt-BR';
  const voice = pickVoice(item.payload.voiceGender || currentState.voiceGender || 'auto');
  if (voice) utter.voice = voice;
  const params = emotionVoiceParams(item.payload.emotion || currentState.emotion || 'mixed', item.payload.emotionIntensity ?? currentState.emotionIntensity ?? 75);
  utter.rate = params.rate;
  utter.pitch = params.pitch;
  utter.volume = params.volume;

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    isSpeakingNow = false;
    setTalking(false);
    setTimeout(processSpeechQueue, 120);
  };

  utter.onstart = () => {
    isSpeakingNow = true;
    setTalking(true);
  };
  utter.onend = finish;
  utter.onerror = () => {
    isSpeakingNow = false;
    setTalking(false);
    // O Chromium do OBS às vezes falha a primeira tentativa. Tenta mais uma vez.
    if (item.tries < 1) {
      item.tries += 1;
      speechQueue.unshift(item);
      setTimeout(processSpeechQueue, 500);
    } else {
      setTimeout(processSpeechQueue, 120);
    }
  };

  // Fallback: se onend não disparar, libera a fila.
  const estimated = Math.max(2500, Math.min(25000, item.text.length * 95));
  setTimeout(() => {
    if (isSpeakingNow && !finished) finish();
  }, estimated);

  try {
    isSpeakingNow = true;
    speechSynthesis.speak(utter);
  } catch {
    finish();
  }
}

function setTalking(on) {
  const avatarImage = $('avatarImage');
  if (avatarImage) {
    const idleSrc = avatarImage.dataset.idleSrc || '/avatar-idle.svg';
    const talkingSrc = avatarImage.dataset.talkingSrc || '/avatar-talking.svg';
    avatarImage.src = on ? talkingSrc : idleSrc;
    avatarImage.classList.toggle('talking', on);
  }

  // Compatibilidade com versões antigas do avatar em CSS.
  const avatar = $('avatar');
  if (avatar) avatar.classList.toggle('talking', on);
}

async function postJSON(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.json();
}

function readControls() {
  return {
    emotion: $('emotion')?.value,
    emotionIntensity: Number($('emotionIntensity')?.value ?? 75),
    profanityIntensity: Number($('profanityIntensity')?.value ?? 50),
    voiceGender: $('voiceGender')?.value,
    speakEnabled: Boolean($('speakEnabled')?.checked),
    listenAllChat: Boolean($('listenAllChat')?.checked),
    autoReplyChat: $('autoReplyChat') ? Boolean($('autoReplyChat').checked) : Boolean(currentState.autoReplyChat),
    replyInChat: Boolean($('replyInChat')?.checked),
    cooldownSeconds: Number($('cooldownSeconds')?.value ?? 0)
  };
}

function applyState(s) {
  currentState = s || currentState;
  if ($('emotion')) $('emotion').value = currentState.emotion || 'mixed';
  if ($('emotionIntensity')) $('emotionIntensity').value = currentState.emotionIntensity ?? 75;
  if ($('emotionIntensityValue')) $('emotionIntensityValue').textContent = `${currentState.emotionIntensity ?? 75}%`;
  if ($('profanityIntensity')) $('profanityIntensity').value = currentState.profanityIntensity ?? ((currentState.profanityLevel ?? 2) * 25);
  if ($('profanityIntensityValue')) $('profanityIntensityValue').textContent = `${currentState.profanityIntensity ?? ((currentState.profanityLevel ?? 2) * 25)}%`;
  if ($('voiceGender')) $('voiceGender').value = currentState.voiceGender || 'auto';
  if ($('speakEnabled')) $('speakEnabled').checked = Boolean(currentState.speakEnabled);
  if ($('listenAllChat')) $('listenAllChat').checked = Boolean(currentState.listenAllChat);
  if ($('autoReplyChat')) $('autoReplyChat').checked = Boolean(currentState.autoReplyChat);
  if ($('replyInChat')) $('replyInChat').checked = Boolean(currentState.replyInChat);
  if ($('cooldownSeconds')) $('cooldownSeconds').value = currentState.cooldownSeconds ?? 0;
  if ($('gameContext')) $('gameContext').value = currentState.gameContext || '';
  if ($('captureContext')) $('captureContext').value = currentState.captureContext || '';
}

function setupMic() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    if ($('micText')) $('micText').textContent = 'Este navegador não suporta reconhecimento de voz. Tente Chrome/Edge.';
    return null;
  }
  const rec = new SpeechRecognition();
  rec.lang = 'pt-BR';
  rec.continuous = true;
  rec.interimResults = false;
  rec.onresult = async (event) => {
    const last = event.results[event.results.length - 1];
    const text = last[0].transcript.trim();
    if ($('micText')) $('micText').textContent = text;
    await postJSON('/api/streamer-speech', { text, forceReply: Boolean($('micForceReply')?.checked) });
  };
  rec.onerror = e => { if ($('micText')) $('micText').textContent = 'Erro no microfone: ' + e.error; };
  return rec;
}

socket.on('connect', () => {
  if ($('status')) $('status').textContent = 'Conectado';
});
socket.on('settings', applyState);
socket.on('chat-message', msg => logLine(`<strong>[${msg.source}] ${msg.user}</strong>: ${msg.message}`));
socket.on('streamer-speech', e => logLine(`<strong>[streamer]</strong>: ${e.text}`));
socket.on('game-event', e => logLine(`<strong>[jogo/captura]</strong>: ${e.text}`));
socket.on('system-status', e => logLine(`<strong>Sistema</strong>: ${e.text}`));
socket.on('bridge-status', e => setBridgeStatus(Boolean(e?.connected)));
socket.on('bot-reply', payload => {
  // O texto continua somente no log do painel. O /obs recebe a voz em WAV
  // pelo evento bot-audio, sem usar speechSynthesis nem Áudio do Desktop.
  logLine(`<span class="reply"><strong>BOT</strong>: ${payload.reply}</span>`);
  if (!isObs && payload.speakEnabled === false) {
    logLine('<strong>Sistema</strong>: fala em voz está desativada.');
  }
});

socket.on('bot-audio', payload => {
  if (isObs) enqueueObsAudio(payload);
});

function setBridgeStatus(connected) {
  const el = $('bridgeStatus');
  if (!el) return;
  el.textContent = connected ? 'Conectada' : 'Desconectada';
  el.classList.toggle('ok', connected);
}

function bindRange(id, valueId) {
  const input = $(id);
  const value = $(valueId);
  if (!input || !value) return;
  const update = () => { value.textContent = `${input.value}%`; };
  input.addEventListener('input', update);
  update();
}

window.addEventListener('load', async () => {
  document.addEventListener('click', unlockSpeech);
  document.addEventListener('keydown', unlockSpeech);
  document.addEventListener('touchstart', unlockSpeech);
  setTimeout(unlockSpeech, 700);
  bindRange('emotionIntensity', 'emotionIntensityValue');
  bindRange('profanityIntensity', 'profanityIntensityValue');

  if ($('obsUrl')) $('obsUrl').textContent = location.origin + '/obs';
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;

  try {
    const cfg = await fetch('/api/config').then(r => r.json());
    applyState(cfg.publicConfig.state);
    if (!isObs) {
      try {
        const saved = JSON.parse(localStorage.getItem('botPanelSettings') || 'null');
        if (saved && typeof saved === 'object') {
          applyState({ ...cfg.publicConfig.state, ...saved });
          await postJSON('/api/settings', saved);
        }
      } catch {}
    }
    setBridgeStatus(Boolean(cfg.publicConfig.ollamaBridgeConnected));
    if ($('status')) {
      const ai = cfg.publicConfig.aiStatus;
      if (cfg.publicConfig.aiProvider === 'ollama') {
        if (cfg.publicConfig.ollamaBridgeConnected) {
          $('status').textContent = ai?.ok ? 'Ponte Ollama conectada - ' + ai.lastModel : 'Ponte Ollama conectada. Clique em Testar Ollama.';
        } else if (cfg.publicConfig.ollamaBridgeEnabled) {
          $('status').textContent = 'Aguardando a Carol local. Abra CAROL IA - INICIAR.bat no PC da live.';
        } else {
          $('status').textContent = ai?.ok ? 'Ollama OK: ' + ai.lastModel : 'Ollama direto configurado: ' + cfg.publicConfig.ollamaModel + '. Clique em Testar Ollama.';
        }
      } else if (!cfg.publicConfig.hasGemini) $('status').textContent = 'Sem GEMINI_API_KEY: respostas locais';
      else if (ai?.ok) $('status').textContent = 'Gemini OK: ' + ai.lastModel;
      else $('status').textContent = 'Gemini configurado. Clique em Testar Gemini. Último erro: ' + (ai?.lastError || 'nenhum');
    }
  } catch {}

  $('loadVoices')?.addEventListener('click', loadVoices);
  $('voiceSelect')?.addEventListener('change', e => { selectedVoiceName = e.target.value; localStorage.setItem('selectedVoiceName', selectedVoiceName); });
  $('testVoice')?.addEventListener('click', () => { unlockSpeech(); playBeep(); speak('Teste de voz neste painel. Se você ouviu, a voz local está funcionando.', readControls()); });
  $('testObsVoice')?.addEventListener('click', async () => { unlockSpeech(); await postJSON('/api/speak-test', { text: 'Teste de voz no OBS. Se essa fala saiu na live, o áudio da fonte navegador está funcionando.' }); logLine('<strong>Sistema</strong>: teste enviado para o OBS.'); });
  $('saveSettings')?.addEventListener('click', async () => {
    const settings = readControls();
    await postJSON('/api/settings', settings);
    try { localStorage.setItem('botPanelSettings', JSON.stringify(settings)); } catch {}
    logLine('<strong>Sistema</strong>: configurações salvas neste navegador e aplicadas no servidor.');
  });
  $('saveContext')?.addEventListener('click', async () => { await postJSON('/api/settings', { gameContext: $('gameContext').value, captureContext: $('captureContext').value }); logLine('<strong>Sistema</strong>: contexto salvo.'); });
  $('forceGameReply')?.addEventListener('click', async () => { await postJSON('/api/game-event', { text: `${$('gameContext').value} ${$('captureContext').value}`, forceReply: true }); });
  $('sendTest')?.addEventListener('click', async () => { await postJSON('/api/test-message', { user: $('testUser').value, message: $('testMessage').value, source: 'teste' }); });
  $('testOllama')?.addEventListener('click', async () => {
    try {
      const r = await fetch('/api/ollama-test').then(r => r.json());
      logLine(`<strong>Ollama teste</strong>: ${r.ok ? 'OK modelo ' + r.model + ' - ' + r.text : 'ERRO: ' + r.error}`);
      if ($('status')) $('status').textContent = r.ok ? 'Ollama OK: ' + r.model : 'Ollama ERRO: ' + r.error;
    } catch (e) { logLine(`<strong>Ollama teste</strong>: ERRO ${e.message}`); }
  });

  $('testGemini')?.addEventListener('click', async () => {
    try {
      const r = await fetch('/api/gemini-test').then(r => r.json());
      logLine(`<strong>Gemini teste</strong>: ${r.ok ? 'OK modelo ' + r.model + ' - ' + r.text : 'ERRO: ' + r.error}`);
      if ($('status')) $('status').textContent = r.ok ? 'Gemini OK: ' + r.model : 'Gemini ERRO: ' + r.error;
    } catch (e) { logLine(`<strong>Gemini teste</strong>: ERRO ${e.message}`); }
  });

  $('startMic')?.addEventListener('click', () => {
    recognition = recognition || setupMic();
    try { recognition?.start(); if ($('micText')) $('micText').textContent = 'Microfone escutando...'; } catch {}
  });
  $('stopMic')?.addEventListener('click', () => {
    try { recognition?.stop(); if ($('micText')) $('micText').textContent = 'Microfone parado.'; } catch {}
  });

  if (isObs) {
    // O /obs não mostra nenhum texto. Clicar em qualquer parte do avatar via
    // Propriedades > Interagir no OBS apenas libera o áudio, sem tocar beep ou fala de teste.
    const unlock = $('audioUnlock');
    const releaseObsAudio = () => {
      unlockSpeech();
      try { obsCurrentAudio?.play?.(); } catch {}
      processObsAudioQueue();
    };
    if (unlock) unlock.addEventListener('click', releaseObsAudio);
    document.addEventListener('click', releaseObsAudio);
    setTalking(false);
  }
});
