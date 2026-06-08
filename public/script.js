const socket = io();
let currentState = {};
let selectedVoiceName = localStorage.getItem('selectedVoiceName') || '';
let recognition = null;

const $ = id => document.getElementById(id);
const isObs = document.body.classList.contains('obs-body');

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

function emotionVoiceParams(emotion) {
  const base = { rate: 1, pitch: 1, volume: 1 };
  const map = {
    mixed: { rate: 1.05, pitch: 1, volume: 1 },
    angry: { rate: 1.22, pitch: 0.82, volume: 1 },
    sarcastic: { rate: 0.95, pitch: 0.9, volume: 1 },
    savage: { rate: 1.08, pitch: 0.85, volume: 1 },
    sensual: { rate: 0.78, pitch: 0.75, volume: 0.9 },
    cute: { rate: 1.08, pitch: 1.25, volume: 1 },
    sad: { rate: 0.78, pitch: 0.8, volume: 0.75 },
    calm: { rate: 0.85, pitch: 0.92, volume: 0.85 },
    chaotic: { rate: 1.28, pitch: 1.1, volume: 1 },
    serious: { rate: 0.95, pitch: 0.88, volume: 0.9 },
    friendly: base
  };
  return map[emotion] || base;
}

function speak(text, payload = {}) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'pt-BR';
  const voice = pickVoice(payload.voiceGender || currentState.voiceGender || 'auto');
  if (voice) utter.voice = voice;
  const params = emotionVoiceParams(payload.emotion || currentState.emotion || 'mixed');
  utter.rate = params.rate;
  utter.pitch = params.pitch;
  utter.volume = params.volume;
  utter.onstart = () => setTalking(true);
  utter.onend = () => setTalking(false);
  utter.onerror = () => setTalking(false);
  speechSynthesis.speak(utter);
}

function setTalking(on) {
  const avatar = $('avatar');
  if (!avatar) return;
  avatar.classList.toggle('talking', on);
}

async function postJSON(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.json();
}

function readControls() {
  return {
    emotion: $('emotion')?.value,
    profanityLevel: Number($('profanityLevel')?.value ?? 2),
    voiceGender: $('voiceGender')?.value,
    speakEnabled: Boolean($('speakEnabled')?.checked),
    listenAllChat: Boolean($('listenAllChat')?.checked),
    replyInChat: Boolean($('replyInChat')?.checked),
    cooldownSeconds: Number($('cooldownSeconds')?.value || 8)
  };
}

function applyState(s) {
  currentState = s || currentState;
  if ($('emotion')) $('emotion').value = currentState.emotion || 'mixed';
  if ($('profanityLevel')) $('profanityLevel').value = currentState.profanityLevel ?? 2;
  if ($('voiceGender')) $('voiceGender').value = currentState.voiceGender || 'auto';
  if ($('speakEnabled')) $('speakEnabled').checked = Boolean(currentState.speakEnabled);
  if ($('listenAllChat')) $('listenAllChat').checked = Boolean(currentState.listenAllChat);
  if ($('replyInChat')) $('replyInChat').checked = Boolean(currentState.replyInChat);
  if ($('cooldownSeconds')) $('cooldownSeconds').value = currentState.cooldownSeconds || 8;
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
socket.on('bot-reply', payload => {
  if ($('bubble')) $('bubble').textContent = payload.reply;
  logLine(`<span class="reply"><strong>BOT</strong>: ${payload.reply}</span>`);
  if (payload.speakEnabled !== false) speak(payload.reply, payload);
});

window.addEventListener('load', async () => {
  if ($('obsUrl')) $('obsUrl').textContent = location.origin + '/obs';
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;

  try {
    const cfg = await fetch('/api/config').then(r => r.json());
    applyState(cfg.publicConfig.state);
    if ($('status')) $('status').textContent = cfg.publicConfig.hasGemini ? 'Conectado com IA Gemini' : 'Conectado sem API: respostas locais';
  } catch {}

  $('loadVoices')?.addEventListener('click', loadVoices);
  $('voiceSelect')?.addEventListener('change', e => { selectedVoiceName = e.target.value; localStorage.setItem('selectedVoiceName', selectedVoiceName); });
  $('testVoice')?.addEventListener('click', () => speak('Teste de voz do bot. Eu posso falar com sarcasmo, raiva, fofura e caos.', readControls()));
  $('saveSettings')?.addEventListener('click', async () => { await postJSON('/api/settings', readControls()); logLine('<strong>Sistema</strong>: configurações salvas.'); });
  $('saveContext')?.addEventListener('click', async () => { await postJSON('/api/settings', { gameContext: $('gameContext').value, captureContext: $('captureContext').value }); logLine('<strong>Sistema</strong>: contexto salvo.'); });
  $('forceGameReply')?.addEventListener('click', async () => { await postJSON('/api/game-event', { text: `${$('gameContext').value} ${$('captureContext').value}`, forceReply: true }); });
  $('sendTest')?.addEventListener('click', async () => { await postJSON('/api/test-message', { user: $('testUser').value, message: $('testMessage').value, source: 'teste' }); });

  $('startMic')?.addEventListener('click', () => {
    recognition = recognition || setupMic();
    try { recognition?.start(); if ($('micText')) $('micText').textContent = 'Microfone escutando...'; } catch {}
  });
  $('stopMic')?.addEventListener('click', () => {
    try { recognition?.stop(); if ($('micText')) $('micText').textContent = 'Microfone parado.'; } catch {}
  });

  if (isObs) {
    document.addEventListener('click', () => speechSynthesis.resume(), { once: true });
  }
});
