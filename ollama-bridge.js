import 'dotenv/config';
import { io } from 'socket.io-client';

const RENDER_URL = String(process.env.RENDER_URL || 'https://ia-carol.onrender.com').trim().replace(/\/+$/, '');
const BRIDGE_SECRET = String(process.env.OLLAMA_BRIDGE_SECRET || 'carol-bridge-2026-v1-7f8c2a91').trim();
const OLLAMA_LOCAL_URL = String(process.env.OLLAMA_LOCAL_URL || 'http://127.0.0.1:11434').trim().replace(/\/+$/, '');
const DEFAULT_MODEL = String(process.env.OLLAMA_MODEL || 'gemma3:270m').trim();
const REQUEST_TIMEOUT_MS = Math.max(5000, Number(process.env.OLLAMA_LOCAL_TIMEOUT_MS || 180000));
const KEEP_ALIVE = String(process.env.OLLAMA_KEEP_ALIVE ?? '0').trim();

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
