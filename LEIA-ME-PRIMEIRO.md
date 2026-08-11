# SIGR v4.1 — IA 3.0 HOLO

Pacote de atualização do Sistema Integrado de Gestão de Recrutas — CFSd 2ª/2026.

## Como publicar

1. Faça uma cópia dos arquivos atuais do repositório.
2. Extraia este pacote na raiz do projeto.
3. Substitua `index.html`, `service-worker.js` e `manifest.webmanifest`.
4. Mantenha a pasta `icons` já existente no GitHub. O pacote não substitui os ícones.
5. Envie os três arquivos atualizados ao GitHub e aguarde a publicação do GitHub Pages.
6. Feche e abra o aplicativo no celular. O cache `v7-holo` força a atualização da PWA.

Não é necessário alterar as tabelas, os dados ou as Edge Functions do Supabase para usar esta atualização visual e funcional.

## Principais melhorias

- Ajuste de ocorrência no mesmo padrão do lançamento: tipo, gravidade/classificação, valor exato e justificativa.
- Histórico de auditoria preservando operador, data, valor anterior, novo valor, tipo e classificação.
- Barra de pesquisa visível dentro do Efetivo no celular.
- Filtro de condição sincronizado entre desktop e celular.
- Botões visíveis de exportação e importação JSON no mobile.
- Importação continua protegida: somente administrador pode substituir a base.
- Interface geral com tipografia Inter, espaçamento ampliado, cartões e navegação móvel refinada.
- Chat interno com aparência de aplicativo de mensagens moderno.
- SIGR IA 3.0 com modos Chat e Holograma.
- Entidade holográfica azul/ciano original, formada por rosto, corpo, circuitos, partículas, anéis e varredura digital.
- Estados visuais integrados à conversa: Ouvindo, Processando, Falando, Pronta e Erro.
- No modo Holograma, a fala é enviada automaticamente para a SIGR IA e a resposta é reproduzida por voz quando o navegador oferece suporte.
- Cache PWA atualizado e instalação mais resistente quando algum ícone opcional estiver temporariamente indisponível.
- Correção do atalho de período de 7, 15 e 30 dias, cuja função estava ausente no arquivo recebido.

## Aviso de senha comprometida

O alerta “Mude sua senha” é produzido pelo Gerenciador de Senhas do Google. Ele não pode ser corrigido apenas pelo HTML.

Para encerrar o alerta com segurança:

1. Troque a senha operacional atual no Supabase Authentication por uma senha nova e exclusiva.
2. Atualize ou remova a credencial antiga salva no Google Chrome.
3. Entre novamente no SIGR nos aparelhos da equipe.

Não desative o aviso de segurança do navegador.

## Teste rápido após publicar

- Entrar no SIGR e confirmar a identificação do operador.
- Abrir Efetivo e pesquisar por número e nome no celular.
- Exportar um backup JSON.
- Confirmar que a importação exige administrador.
- Abrir um recruta, selecionar uma ocorrência e testar Ajustar pontos.
- Conferir a atualização no total, ranking, relatório e histórico da ocorrência.
- Abrir SIGR IA, alternar entre Chat e Holograma e permitir o microfone.
- Testar uma pergunta por voz e confirmar os estados Ouvindo, Processando e Falando.
- Enviar uma mensagem no Chat da Equipe.

## Validações executadas

- Sintaxe dos três blocos JavaScript.
- Sintaxe CSS.
- Manifesto JSON.
- Service worker.
- IDs HTML sem duplicação.
- Handlers da interface declarados.
- Preservação das 282 funções originais.
- Teste de runtime do ajuste de pontos, pesquisa mobile, filtros e abertura/fechamento do modo holográfico.

