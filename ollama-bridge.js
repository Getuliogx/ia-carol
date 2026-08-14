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
const KEEP_ALIVE = String(process.env.OLLAMA_KEEP_ALIVE ?? '0').trim();

const TTS_SCRIPT = fileURLToPath(new URL('./windows-tts.ps1', import.meta.url));
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

async function generateWindowsTts(text, options = {}) {
  if (process.platform !== 'win32') throw new Error('TTS local requer Windows no PC da ponte.');
  const cleanText = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 420);
  if (!cleanText) throw new Error('Texto vazio para TTS.');

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'carol-tts-'));
  const textPath = path.join(tempDir, 'fala.txt');
  const wavPath = path.join(tempDir, 'fala.wav');
  const genderRaw = String(options.voiceGender || 'auto').toLowerCase();
  const gender = ['female', 'male'].includes(genderRaw) ? genderRaw : 'auto';
  const params = ttsVoiceParams(options.emotion, options.emotionIntensity);
  await fs.writeFile(textPath, cleanText, 'utf8');

  let voiceName = '';
  try {
    voiceName = await new Promise((resolve, reject) => {
      const args = [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', TTS_SCRIPT,
        '-TextFile', textPath,
        '-OutputFile', wavPath,
        '-Gender', gender,
        '-Rate', String(params.rate),
        '-Volume', String(params.volume)
      ];
      const child = spawn('powershell.exe', args, { windowsHide: true });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        try { child.kill(); } catch {}
        reject(new Error(`TTS demorou mais de ${Math.round(TTS_TIMEOUT_MS / 1000)}s`));
      }, TTS_TIMEOUT_MS);
      child.stdout.on('data', d => { stdout += d.toString(); });
      child.stderr.on('data', d => { stderr += d.toString(); });
      child.on('error', err => {
        clearTimeout(timer);
        reject(new Error(`Falha ao abrir TTS do Windows: ${err.message}`));
      });
      child.on('close', code => {
        clearTimeout(timer);
        if (code === 0) resolve(stdout.trim());
        else reject(new Error(`TTS Windows falhou (${code}): ${stderr.trim() || stdout.trim() || 'erro desconhecido'}`));
      });
    });

    const wav = await fs.readFile(wavPath);
    if (!wav.length) throw new Error('TTS Windows gerou arquivo vazio.');
    return { audioBase64: wav.toString('base64'), mimeType: 'audio/wav', voiceName };
  } finally {
    try { await fs.rm(tempDir, { recursive: true, force: true }); } catch {}
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

socket.on('connect', () => {
  console.log('✓ Ponte conectada ao Render. ID:', socket.id);
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

socket.on('ollama-generate', async req => {
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

