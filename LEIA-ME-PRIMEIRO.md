# SIGR v4.2 — Segurança, Ocorrências e Escala

Pacote de atualização do Sistema Integrado de Gestão de Recrutas — CFSd 2ª/2026.

## Como publicar

1. Faça uma cópia dos arquivos atuais do repositório.
2. Extraia este pacote na raiz do projeto.
3. Substitua todos os arquivos do projeto pelos arquivos deste pacote, preservando somente Secrets configurados fora do repositório.
4. Envie os arquivos atualizados ao GitHub e aguarde a publicação do GitHub Pages.
5. Feche e abra o aplicativo no celular. O cache `v22-seguranca` força a atualização da PWA.

Se `supabase/sigr-v3-setup.sql` já foi aplicado, não é necessário recriar tabelas nem apagar dados. Se ainda não foi aplicado, execute-o antes de liberar gravações para operadores.

## Principais melhorias da v4.2

- A relação nominal deixou de existir dentro do HTML público. Os recrutas são carregados do Supabase somente depois de uma sessão válida.
- Remoção da escala e das presenças de demonstração que acompanhavam o frontend.
- Migração automática da escala local antiga, mantendo uma cópia de segurança no próprio navegador.
- Correção da gravação de ocorrências por contas com perfil `operator`, mesmo quando o módulo opcional de identificação por PIN ainda não está implantado.
- Validação de data, tipo, descrição e pontuação antes de registrar uma ocorrência.
- Sincronização cotidiana não destrutiva, evitando que um aparelho com uma cópia antiga apague registros criados por outro.
- Nome da conta autenticada usado na auditoria quando não houver uma identificação individual ativa.
- Campos vindos do banco e dos formulários são tratados antes de entrar em blocos HTML, reduzindo risco de injeção de conteúdo.
- O logout limpa do aparelho os dados operacionais locais da sessão, inclusive histórico de IA e escala.
- Opção administrativa **Apagar ocorrência**, com confirmação e recálculo da pontuação.
- Cartão de ocorrências abre a listagem paginada com data e responsável pelo registro.
- Consulta paginada ao Supabase carrega todos os registros, sem parar no limite padrão de 1.000 linhas.
- Escala semanal de segunda a sexta, sequência 097 → 001, trocas, confirmação do executante real, exclusão/restauração da semana e PDF.

## Importante antes de publicar

- Faça um backup JSON no SIGR atual e confirme que o arquivo foi baixado.
- Execute/valide `supabase/sigr-v3-setup.sql` no projeto Supabase. A escrita depende do RLS reconhecer a conta como `admin` ou `operator`.
- A `Publishable Key` pode permanecer no frontend; nunca publique `service_role`, `sb_secret_`, VAPID privado ou segredo de Cron.
- O pacote não inclui dados de recrutas. Depois do login, eles devem vir do banco.

## Melhorias preservadas da v4.1

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
- Consulte também `VALIDACAO-SIGR-v4.2.md` para o roteiro completo de conferência.

## Validações do pacote anterior

- Sintaxe dos três blocos JavaScript.
- Sintaxe CSS.
- Manifesto JSON.
- Service worker.
- IDs HTML sem duplicação.
- Handlers da interface declarados.
- Preservação dos módulos funcionais existentes.
- Teste de runtime do ajuste de pontos, pesquisa mobile, filtros e abertura/fechamento do modo holográfico.

---

## Patch oficial de 01/10/2026 — três correções

Esta cópia mantém a versão **SIGR v4.2** e adiciona somente os três ajustes solicitados: remoção de integrante, ampliação da SIGR IA e continuidade da Escala pelo executante real. Consulte `supabase/ATUALIZACAO-3-PONTOS-2026-10-01.md` antes de implantar as Edge Functions.
