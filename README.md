# Carol IA — versão leve / um clique

Esta versão usa o **Ollama `gemma3:270m`** e foi ajustada para a live ficar mais leve e responder mais rápido.

## Uso no PC da live

1. Tenha Ollama e Node.js instalados.
2. Dê dois cliques em **`CAROL IA - INICIAR.bat`**.
3. Só isso. A ponte conecta automaticamente em `https://ia-carol.onrender.com`.

Não precisa digitar link do Ollama, criar túnel, editar `.env` ou abrir servidor local manualmente.

## Otimizações desta versão

- `gemma3:270m` continua sendo o modelo padrão; nenhum modelo maior foi colocado.
- `OLLAMA_KEEP_ALIVE=30m`: o modelo não é descarregado depois de cada resposta.
- Contexto local padrão reduzido para `1024`.
- Resposta local limitada a `80` tokens por geração, suficiente para 1–2 frases de live e sem limite de quantidade de mensagens.
- Apenas uma geração do Ollama por vez para não disputar CPU.
- O modelo é pré-carregado uma vez quando a Carol inicia, evitando carregar tudo na primeira mensagem do chat.
- O TTS do Windows agora usa **um processo persistente de baixa prioridade**; não abre um PowerShell novo a cada fala.
- O WAV só é gerado quando a fonte `/obs` realmente está conectada.
- A fila do OBS mantém no máximo as falas mais recentes para não ficar falando respostas velhas atrasadas.

## OBS

Adicione uma **Fonte do navegador**:

`https://ia-carol.onrender.com/obs`

Ative **Controlar áudio via OBS / Control audio via OBS**. A página mostra somente o avatar, com fundo transparente, e a voz aparece como áudio próprio da fonte no Mixer do OBS.

## Sentimentos

Continuam disponíveis os 38 sentimentos, com intensidade de 0% a 100%, além da barrinha de palavrão de 0% a 100%.

## Parar a conexão

Use **`CAROL IA - PARAR.bat`**. Ele encerra apenas a ponte da Carol e não fecha o Ollama, para não interferir em outros programas.
