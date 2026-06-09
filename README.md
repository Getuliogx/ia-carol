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


## Sentimentos fortes
Esta versão reforça os sentimentos no servidor, não só no prompt:
- Pós-processamento força palavrão quando nível 3/4 e o modelo tenta ficar limpo.
- Sensual pesado fica mais provocante e adulto, com duplo sentido, mas sem sexo gráfico explícito.
- Misto/Todos vem menos family friendly por padrão.

Configuração recomendada no Render:
DEFAULT_EMOTION=mixed
DEFAULT_PROFANITY_LEVEL=4
ALLOW_SENSUAL_HEAVY=true
BOT_PERSONA=uma IA de live adulta, boca-suja, debochada, sarcástica, provocadora e direta
