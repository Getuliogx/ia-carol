# AI Live Bot - correção voz/resposta

Correções desta versão:
- Adicionada opção "Responder automaticamente ao chat" no painel.
- Corrigido bug: ao salvar configurações, o auto-reply podia ficar falso sem aparecer no painel.
- Adicionado botão "Testar voz no OBS".
- Adicionado botão/aviso na tela OBS para ativar áudio com clique pelo Interagir do OBS.
- Adicionados logs mostrando se mensagem foi ignorada por cooldown ou configuração.
- Mantém Ollama externo, OBS sem texto e sensual pesado.

Depois de subir no GitHub, faça Manual Deploy -> Clear build cache & deploy no Render.

No OBS, abra a fonte navegador, clique com botão direito -> Interagir, clique no aviso "ativar áudio" e depois teste pelo painel usando "Testar voz no OBS".


## Voz natural
Esta versão remove os ajustes exagerados de voz por sentimento. O modo sensual pesado agora usa rate 0.92 e pitch 0.92 para não parecer lento/lerdo no OBS.
