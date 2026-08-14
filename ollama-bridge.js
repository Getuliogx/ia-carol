import 'dotenv/config';
import { io } from 'socket.io-client';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RENDER_URL = String(process.env.RENDER_URL || 'https://ia-carol.onrender.com').trim().replace(/\/+$/, '');
const BRIDGE_SECRET = String(process.env.OLLAMA_BRIDGE_SECRET || 'carol-bridge-2026-v1-7f8c2a91').trim();
const OLLAMA_LOCAL_URL = String(process.env.OLLAMA_LOCAL_URL || 'http://127.0.0.1:11434').trim().replace(/\/+$/, '');
const DEFAULT_MODEL = String(process.env.OLLAMA_MODEL || 'gemma3:270m').trim();
const REQUEST_TIMEOUT_MS = Math.max(5000, Number(process.env.OLLAMA_LOCAL_TIMEOUT_MS || 180000));
const KEEP_ALIVE = String(process.env.OLLAMA_KEEP_ALIVE ?? '30m').trim();

const TTS_WORKER_SCRIPT = fileURLToPath(new URL('./windows-tts-worker.ps1', import.meta.url));
const TTS_TIMEOUT_MS = Math.max(5000, Number(process.env.CAROL_TTS_TIMEOUT_MS || 45000));

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function ttsVoiceParams(emotion, intensity = 75) {
  const targets = {
    mixed: { rate: 0 }, neutral: { rate: 0 }, friendly: { rate: 0 }, happy: { rate: 1 },
    excited: { rate: 2 }, hype: { rate: 3 }, playful: { rate: 1 }, teasing: { rate: 0 },
    mischievous: { rate: 0 }, curious: { rate: 1 }, surprised: { rate: 2 }, confused: { rate: 0 },
    shy: { rate: -1 }, cute: { rate: 1 }, romantic: { rate: -1 }, sensual: { rate: -1 },
    calm: { rate: -1 }, sleepy: { rate: -3 }, sad: { rate: -2 }, melancholic: { rate: -2 },
    dramatic: { rate: 1 }, worried: { rate: 1 }, nervous: { rate: 2 }, scared: { rate: 2 },
    disgusted: { rate: -1 }, disappointed: { rate: -2 }, frustrated: { rate: 1 }, angry: { rate: 2 },
    furious: { rate: 3 }, jealous: { rate: 0 }, sarcastic: { rate: 0 }, ironic: { rate: -1 },
    savage: { rate: 1 }, arrogant: { rate: -1 }, cold: { rate: -2 }, serious: { rate: 0 },
    motivational: { rate: 2 }, chaotic: { rate: 3 }
  };
  const strength = clamp(intensity, 0, 100) / 100;
  const target = targets[String(emotion || 'mixed')] || targets.mixed;
  return {
    rate: Math.round(target.rate * strength),
    volume: 100
  };
}

let ttsWorker = null;
let ttsWorkerBuffer = '';
const ttsWorkerPending = new Map();

function stopTtsWorker(reason = 'TTS worker encerrado') {
  const child = ttsWorker;
  ttsWorker = null;
  ttsWorkerBuffer = '';
  for (const [id, pending] of ttsWorkerPending) {
    clearTimeout(pending.timer);
    pending.reject(new Error(reason));
    ttsWorkerPending.delete(id);
  }
  if (child) {
    try { child.kill(); } catch {}
  }
}

function ensureTtsWorker() {
  if (process.platform !== 'win32') throw new Error('TTS local requer Windows no PC da ponte.');
  if (ttsWorker && !ttsWorker.killed) return ttsWorker;

  const child = spawn('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', TTS_WORKER_SCRIPT
  ], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  ttsWorker = child;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    ttsWorkerBuffer += chunk;
    while (true) {
      const idx = ttsWorkerBuffer.indexOf('\n');
      if (idx < 0) break;
      const line = ttsWorkerBuffer.slice(0, idx).trim();
      ttsWorkerBuffer = ttsWorkerBuffer.slice(idx + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); }
      catch {
        console.error('TTS worker retornou linha inválida:', line.slice(0, 200));
        continue;
      }
      const pending = ttsWorkerPending.get(String(msg.id || ''));
      if (!pending) continue;
      clearTimeout(pending.timer);
      ttsWorkerPending.delete(String(msg.id));
      if (msg.ok) pending.resolve({ voiceName: String(msg.voiceName || '') });
      else pending.reject(new Error(String(msg.error || 'Falha no TTS do Windows')));
    }
  });
  child.stderr.on('data', chunk => {
    const text = String(chunk || '').trim();
    if (text) console.error('TTS worker:', text);
  });
  child.on('error', err => stopTtsWorker(`Falha no TTS persistente: ${err.message}`));
  child.on('exit', code => {
    if (ttsWorker === child) stopTtsWorker(`TTS persistente encerrou (${code ?? 'sem código'})`);
  });
  return child;
}

async function generateWindowsTts(text, options = {}) {
  const cleanText = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 320);
  if (!cleanText) throw new Error('Texto vazio para TTS.');

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'carol-tts-'));
  const wavPath = path.join(tempDir, 'fala.wav');
  const genderRaw = String(options.voiceGender || 'auto').toLowerCase();
  const gender = ['female', 'male'].includes(genderRaw) ? genderRaw : 'auto';
  const params = ttsVoiceParams(options.emotion, options.emotionIntensity);
  const id = `voice-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  try {
    const child = ensureTtsWorker();
    const meta = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        ttsWorkerPending.delete(id);
        stopTtsWorker('TTS local travou e foi reiniciado');
        reject(new Error(`TTS demorou mais de ${Math.round(TTS_TIMEOUT_MS / 1000)}s`));
      }, TTS_TIMEOUT_MS);
      ttsWorkerPending.set(id, { resolve, reject, timer });

      const job = JSON.stringify({
        id,
        text: cleanText,
        outputFile: wavPath,
        gender,
        rate: params.rate,
        volume: params.volume
      });
      child.stdin.write(job + '\n', 'utf8', err => {
        if (!err) return;
        clearTimeout(timer);
        ttsWorkerPending.delete(id);
        reject(new Error(`Falha enviando texto ao TTS: ${err.message}`));
      });
    });

    const wav = await fs.readFile(wavPath);
    if (!wav.length) throw new Error('TTS Windows gerou arquivo vazio.');
    return { audioBase64: wav.toString('base64'), mimeType: 'audio/wav', voiceName: meta.voiceName };
  } finally {
    try { await fs.rm(tempDir, { recursive: true, force: true }); } catch {}
  }
}

let ollamaQueue = Promise.resolve();

async function handleOllamaGenerate(req) {
  const requestId = String(req?.requestId || '');
  if (!requestId) return;

  const model = String(req?.model || DEFAULT_MODEL).trim();
  const prompt = String(req?.prompt || '');
  const options = req?.options && typeof req.options === 'object' ? req.options : {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${OLLAMA_LOCAL_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false, options, keep_alive: KEEP_ALIVE }),
      signal: controller.signal
    });

    const raw = await response.text();
    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}: ${raw.slice(0, 500)}`);

    let data;
    try { data = JSON.parse(raw); }
    catch { throw new Error(`Ollama retornou JSON inválido: ${raw.slice(0, 300)}`); }

    const text = String(data?.response || '').trim();
    if (!text) throw new Error('Ollama respondeu vazio');
    socket.emit('ollama-result', { requestId, ok: true, text });
  } catch (err) {
    const message = err?.name === 'AbortError'
      ? `Ollama local demorou mais de ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s`
      : String(err?.message || err);
    console.error('Erro processando pedido do Render:', message);
    socket.emit('ollama-result', { requestId, ok: false, error: message });
  } finally {
    clearTimeout(timer);
  }
}

async function warmOllama() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    console.log(`Aquecendo ${DEFAULT_MODEL} uma única vez...`);
    const response = await fetch(`${OLLAMA_LOCAL_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        prompt: 'ok',
        stream: false,
        keep_alive: KEEP_ALIVE,
        options: { num_ctx: 512, num_predict: 1, temperature: 0 }
      }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await response.text();
    console.log(`✓ ${DEFAULT_MODEL} carregado e pronto. keep_alive=${KEEP_ALIVE}`);
  } catch (err) {
    console.warn('Não consegui pré-carregar o Ollama; a primeira resposta pode demorar mais:', err.message);
  } finally {
    clearTimeout(timer);
  }
}

console.log('Iniciando ponte Ollama...');
console.log('Render:', RENDER_URL);
console.log('Ollama local:', OLLAMA_LOCAL_URL);
console.log('Modelo padrão:', DEFAULT_MODEL);

const socket = io(RENDER_URL, {
  transports: ['websocket', 'polling'],
  auth: { role: 'ollama-bridge', secret: BRIDGE_SECRET },
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10000,
  timeout: 20000
});

let warmed = false;
socket.on('connect', () => {
  console.log('✓ Ponte conectada ao Render. ID:', socket.id);
  if (!warmed) {
    warmed = true;
    ollamaQueue = ollamaQueue.catch(() => {}).then(() => warmOllama());
  }
});

socket.on('disconnect', reason => {
  console.log('Ponte desconectada do Render:', reason, '- reconectando automaticamente...');
});

socket.on('connect_error', err => {
  console.error('Falha ao conectar no Render:', err.message);
});

socket.on('bridge-error', data => {
  console.error('Render recusou a ponte:', data?.error || 'erro desconhecido');
});

socket.on('ollama-generate', req => {
  // Nunca deixa duas gerações disputarem CPU/GPU ao mesmo tempo.
  ollamaQueue = ollamaQueue
    .catch(() => {})
    .then(() => handleOllamaGenerate(req));
});

socket.on('tts-generate', async req => {
  const requestId = String(req?.requestId || '');
  if (!requestId) return;
  try {
    const result = await generateWindowsTts(req?.text, {
      voiceGender: req?.voiceGender,
      emotion: req?.emotion,
      emotionIntensity: req?.emotionIntensity
    });
    socket.emit('tts-result', { requestId, ok: true, ...result });
  } catch (err) {
    const message = String(err?.message || err);
    console.error('Erro gerando voz local:', message);
    socket.emit('tts-result', { requestId, ok: false, error: message });
  }
});

