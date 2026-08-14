# Carol IA — modo UM CLIQUE

Depois de colocar esta versão no Render/GitHub, no PC da live você não precisa editar `.env`, copiar URL nem abrir terminal.

1. Tenha **Ollama** e **Node.js LTS** instalados uma única vez.
2. Dê dois cliques em **`CAROL IA - INICIAR.bat`**.
3. Pronto: o arquivo inicia o Ollama se necessário e conecta automaticamente ao serviço `https://ia-carol.onrender.com`.

A ponte usa `OLLAMA_KEEP_ALIVE=0` para descarregar o modelo depois de cada resposta e reduzir o uso de memória quando a IA fica parada. O servidor continua lendo o chat da Twitch automaticamente com as credenciais já salvas no Render.

---

# Carol IA para live — sentimentos por porcentagem + ponte Ollama

Esta versão corrige os sentimentos e remove a necessidade de ficar trocando o link/túnel do Ollama no Render.

## O que mudou

- Mais de 35 sentimentos/modos de personalidade no painel.
- Intensidade do sentimento de **0% a 100%** por barrinha.
- Nível de palavrão de **0% a 100%** por barrinha.
- A porcentagem agora afeta **o prompt da IA, o pós-processamento e a voz**.
- Todos os sentimentos são enviados para Ollama/Gemini; não ficam mais presos a apenas 4 modos.
- Em 0% o sentimento fica quase neutro; em 100% fica bem evidente.
- Configurações do painel também ficam salvas no `localStorage` do navegador e são reaplicadas quando o painel é aberto.
- Nova **Ponte Ollama Local**: o PC do Ollama conecta para o Render. O Render não precisa mais receber um `OLLAMA_URL` novo quando um túnel muda.
- Reconexão automática da ponte se a internet oscilar ou o Render reconectar.

## Sentimentos disponíveis

Misto, neutra, amigável, feliz, tranquila, séria, fria, empolgada, hype/eufórica, brincalhona, motivadora, curiosa, surpresa, fofa, tímida, romântica, sensual/provocadora, provocadora/zoeira, travessa, ciumenta teatral, triste, melancólica, dramática, preocupada, nervosa, assustada, sonolenta, frustrada, raivosa, furiosa, sarcástica, irônica, debochada, arrogante, decepcionada, com nojo, confusa e caótica.

# Configuração recomendada

## 1. No Render

Mantenha as variáveis que você já usa para Twitch/Gemini e acrescente:

```env
AI_PROVIDER=ollama
OLLAMA_BRIDGE_SECRET=coloque-uma-senha-grande-aqui
OLLAMA_MODEL=gemma3:270m
DEFAULT_EMOTION=mixed
DEFAULT_EMOTION_INTENSITY=75
DEFAULT_PROFANITY_PERCENT=50
```

`OLLAMA_BRIDGE_SECRET` é uma senha criada por você. Ela precisa ser igual no Render e no PC local.

**Com a ponte conectada, você pode remover `OLLAMA_URL` do Render.** Não é mais necessário usar URL de ngrok/Cloudflare/túnel para o Ollama.

Depois de enviar esta versão ao GitHub, faça um novo deploy no Render.

## 2. No PC onde o Ollama está rodando

Na pasta do projeto, crie um arquivo chamado `.env` (ou acrescente ao seu `.env`) com:

```env
RENDER_URL=https://SEU-SERVICO.onrender.com
OLLAMA_BRIDGE_SECRET=a-mesma-senha-que-voce-colocou-no-render
OLLAMA_LOCAL_URL=http://127.0.0.1:11434
OLLAMA_MODEL=gemma3:270m
```

O `RENDER_URL` é o endereço fixo do seu próprio serviço no Render. Você configura **uma vez no PC**, não precisa ficar alterando no painel do Render.

Instale as dependências uma vez:

```bash
npm install
```

Depois, sempre que for usar a IA local:

```bash
npm run bridge
```

Também existe `iniciar-ponte.bat` para Windows.

Quando aparecer:

```text
✓ Ponte conectada ao Render
```

o painel mostrará **Ponte Ollama local: Conectada**.

## 3. Teste

1. Abra o painel do Render.
2. Confira se a ponte aparece como **Conectada**.
3. Escolha um sentimento.
4. Coloque a intensidade em 20%, 60% e depois 100% para perceber a diferença.
5. Clique em **Salvar configurações**.
6. Clique em **Testar Ollama**.
7. Envie mensagens pela caixa de teste ou pelo chat da Twitch.

## Barrinhas

- **Intensidade do sentimento:** 0% = quase neutro; 100% = emoção máxima.
- **Nível de palavrão:** 0% = limpo; 100% = caos. O valor é independente do sentimento.

Exemplo: `Raivosa 90% + palavrão 10%` deixa a Carol muito irritada, mas quase sem palavrões. `Fofa 100% + palavrão 80%` mantém o jeito fofo com palavrão alto.

## OBS

A URL continua sendo:

```text
https://SEU-SERVICO.onrender.com/obs
```

A voz do `/obs` é recebida como arquivo WAV gerado localmente pela própria ponte da Carol; o painel normal não reproduz as respostas.

## Compatibilidade

A variável antiga `DEFAULT_PROFANITY_LEVEL` (0 a 4) ainda é aceita. Se `DEFAULT_PROFANITY_PERCENT` não estiver definida, ela é convertida automaticamente para porcentagem (`0=0%`, `1=25%`, `2=50%`, `3=75%`, `4=100%`).

## OBS - somente avatar e voz

Use uma **Fonte do navegador** com a URL:

`https://ia-carol.onrender.com/obs`

Sugestão de tamanho: **500 x 700** (pode redimensionar na cena).

Ative **Controlar áudio via OBS / Control audio via OBS** nas propriedades da Fonte do navegador para a voz da Carol aparecer como áudio separado no Mixer, sem depender do Áudio do Desktop.

A página `/obs` mostra somente o avatar em fundo transparente. Não exibe respostas em texto. Quando a Carol fala, a imagem muda para a versão de boca aberta e anima levemente.

A voz não usa mais `speechSynthesis` nas respostas. A ponte local gera um WAV com a voz instalada no Windows e manda o áudio ao Render; o `/obs` toca esse WAV dentro da própria Fonte do navegador. Isso mantém a voz no Mixer do OBS quando o controle de áudio da fonte está ativado.

Se o autoplay for bloqueado na primeira execução, abra **Interagir** na Fonte do navegador e clique uma vez sobre o avatar. Nada escrito aparece na live.
