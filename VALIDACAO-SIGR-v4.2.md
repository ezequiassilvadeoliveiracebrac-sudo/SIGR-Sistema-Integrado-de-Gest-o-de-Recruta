# Validação da atualização SIGR v4.2

## O que foi corrigido

- Dados nominais removidos do HTML público.
- Dados demonstrativos removidos da Escala de Serviço.
- Carregamento completo do Supabase em páginas de 500 registros, sem truncar o painel em 1.000 ocorrências.
- Cartão de ocorrências com listagem detalhada, data, responsável, busca, filtros e paginação.
- Cadastro de ocorrência liberado corretamente para contas `admin` e `operator` autenticadas.
- Validação e confirmação de sincronização ao registrar ocorrências.
- Sincronização comum não destrutiva para preservar registros criados simultaneamente em aparelhos diferentes.
- Exclusão de ocorrência disponível somente para administrador, com confirmação e recálculo do score.
- Tratamento de conteúdo textual antes da exibição em HTML.
- Importação JSON limitada, validada e com configuração restrita às chaves conhecidas.
- Logout com limpeza dos dados operacionais armazenados localmente.
- Escala semanal, sequência 097 → 001, substituições, confirmação do executante real, apagar/restaurar semana e PDF preservados.
- Cache da PWA atualizado para `v22-seguranca`.

## Validações executadas no pacote

- Integridade do ZIP original.
- Sintaxe dos três blocos JavaScript do `index.html`.
- Sintaxe do `service-worker.js`.
- Leitura estrutural do HTML sem erro.
- Ausência de IDs HTML duplicados.
- Validade do `manifest.webmanifest`.
- Ausência de chave `service_role` ou `sb_secret_` no frontend.
- Relação nominal pública vazia (`ORIGINAL_RECRUITS = []`).
- Estado inicial da Escala de Serviço sem registros nem presenças demonstrativas.

## Teste obrigatório após publicar

1. Entre com a conta administrativa e confirme que o efetivo é carregado somente depois do login.
2. Entre com uma conta marcada como `operator` em `sigr_user_profiles`.
3. Abra um recruta, registre uma ocorrência e espere a mensagem **Ocorrência registrada e sincronizada**.
4. Atualize a página e confirme que a ocorrência continua visível.
5. Clique no cartão **Ocorrências** e confira data e responsável pelo registro.
6. Como administrador, apague uma ocorrência de teste e atualize a página para confirmar a exclusão.
7. Monte uma escala de segunda a sexta, confirme uma troca e verifique se a presença ficou com o executante real.
8. Apague e restaure uma semana de teste.
9. Gere o PDF semanal e confira cabeçalho, postos e assinaturas.
10. Faça logout e confirme que o painel não mostra dados antes de um novo login.

## Dependências do Supabase

O frontend usa as Edge Functions `sigr-ai`, `sigr-communications` e `sigr-notify`. Este pacote contém somente o código-fonte de `sigr-notify`; portanto, `sigr-ai` e `sigr-communications` precisam continuar implantadas no projeto Supabase atual. A ausência de `sigr-communications` desativa PIN individual, chat e chamadas, mas uma conta autenticada com perfil `operator` continua autorizada a registrar ocorrências pela regra corrigida da v4.2.

As permissões reais do banco dependem do RLS configurado por `supabase/sigr-v3-setup.sql`. Não publique nenhuma chave privada no GitHub.

## Validação adicional — 01/10/2026

- Base utilizada: somente o pacote oficial `SIGR-v4.2-seguranca-atualizado.zip`.
- Nenhum arquivo `teste`, `protótipo` ou HTML antigo foi incorporado.
- `sigr-communications` cobre todas as ações atualmente chamadas pelo frontend, incluindo `operator-delete` e `operator-change-pin`.
- Remoção de integrante validada para depender do papel `admin` da conta Supabase, sem exigir sessão operacional por PIN.
- SIGR IA ampliada com validação server-side de papel e conjunto de ações compatível com o executor do frontend.
- Continuidade da escala validada pelo executante real: último Nº 058 → próximo Nº 057.
- Cache PWA atualizado para `v23-correcao-3pontos`.
- Sintaxe dos blocos JavaScript do `index.html` e do `service-worker.js` validada com Node.js.
