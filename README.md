# AI Live Chat Voice Avatar Bot

Bot para live usando Render + Node.js + OBS.

Ele lê chat da Twitch, recebe eventos externos/Kick por webhook, escuta microfone no navegador, fala com voz do navegador, usa sentimentos, níveis de palavrão e avatar 2D simples.

## O que já vem pronto

- Painel web em `/`
- Tela limpa para OBS em `/obs`
- Twitch chat via `tmi.js`
- IA com Gemini opcional
- Respostas automáticas locais caso não tenha API
- Voz masculina/feminina pelo navegador
- Sentimentos separados e modo padrão `Misto / Todos`
- Níveis de palavrão 0 a 4
- Sensual leve, sarcasmo, raiva, deboche, fofo, triste, dramático etc.
- Captura de microfone pelo navegador
- Entrada manual para eventos do jogo/placa de captura
- Avatar 2D com boca mexendo enquanto fala
- Webhook para Kick ou qualquer ponte externa: `POST /api/kick-message`

## Arquivos importantes

```txt
server.js
public/index.html
public/obs.html
public/script.js
public/style.css
.env.example
```

## Como usar localmente

```bash
npm install
copy .env.example .env
npm start
```

Depois abra:

```txt
http://localhost:3000
```

## Render

Use Web Service.

Build command:

```bash
npm install
```

Start command:

```bash
npm start
```

Adicione as variáveis de ambiente do `.env.example` no Render.

## OBS

Adicione uma Fonte Navegador com:

```txt
https://SEU-SITE-DO-RENDER.onrender.com/obs
```

Para configurar e ligar voz/microfone, abra:

```txt
https://SEU-SITE-DO-RENDER.onrender.com/
```

## Twitch token

O token precisa começar com `oauth:`.

Escopos recomendados:

```txt
chat:read
chat:edit
```

## Kick

Nesta versão o Kick entra por webhook:

```txt
POST /api/kick-message
Content-Type: application/json

{
  "secret": "sua_senha_do_KICK_SHARED_SECRET",
  "user": "nome",
  "message": "mensagem do chat"
}
```

Isso permite ligar depois com uma ponte Kick/serviço externo sem refazer o bot.
