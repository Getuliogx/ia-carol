# AI Live Bot - Render + Ollama externo

Versão feita para live longa usando Ollama fora do Render, com modelo leve `gemma3:270m`.

## URLs

Painel:
`https://SEU_APP.onrender.com/`

OBS:
`https://SEU_APP.onrender.com/obs.html`

## Variáveis no Render

Use:

```
AI_PROVIDER=ollama
OLLAMA_URL=https://SUA_URL_DO_TUNNEL
OLLAMA_MODEL=gemma3:270m
OLLAMA_MAX_TOKENS=35
OLLAMA_TEMPERATURE=0.8
REQUIRE_OLLAMA=false
DEFAULT_COOLDOWN_SECONDS=15
DEFAULT_EMOTION=mixed
DEFAULT_PROFANITY_LEVEL=3
ALLOW_SENSUAL_HEAVY=true
SHOW_BOT_TEXT=false
AUTO_REPLY_CHAT=true
BOT_NAME=Carol IA
BOT_PERSONA=uma IA de live ousada, debochada, sensual, sarcástica e direta
```

Twitch:

```
TWITCH_ENABLE=true
TWITCH_CHANNEL=nome_do_canal
TWITCH_BOT_USERNAME=nome_da_conta_bot
TWITCH_OAUTH_TOKEN=oauth:seu_token
```

## Ollama no PC servidor

Baixe o modelo:

```
ollama pull gemma3:270m
```

Teste:

```
ollama run gemma3:270m
```

Para o Render acessar seu PC, use Cloudflare Tunnel/ngrok apontando para a porta 11434.

Exemplo local do Ollama:

```
http://127.0.0.1:11434
```

No Render, use a URL pública do túnel, por exemplo:

```
OLLAMA_URL=https://sua-url.trycloudflare.com
```

## OBS

Adicione Fonte Navegador:

```
URL: https://SEU_APP.onrender.com/obs.html
Largura: 1920
Altura: 1080
Marcar: Controlar áudio via OBS
```

No mixer do OBS, use `Monitorar e enviar` se quiser ouvir também.

## Correção de voz no OBS
Esta versão usa fila de fala, não cancela uma fala quando chega outra resposta, divide textos longos em partes e tenta reativar o SpeechSynthesis automaticamente no OBS/Chrome.

No OBS, use a fonte Navegador com `Controlar áudio via OBS` marcado. Depois clique com botão direito na fonte > Interagir > clique uma vez dentro da tela para liberar a voz automática.
