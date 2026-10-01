# SIGR v4.2 — atualização dos 3 pontos (01/10/2026)

Este pacote parte **somente da base oficial SIGR v4.2 — segurança atualizado**. Nenhum HTML de teste/protótipo foi incorporado.

## Correções incluídas

1. **Remover integrante**
   - `sigr-communications` agora contém a rota `operator-delete` compatível com o frontend atual.
   - A autorização é feita pela conta principal do Supabase: somente `admin` em `sigr_user_profiles` pode remover.
   - A remoção desativa o perfil (`active=false`) e encerra sessões/push do integrante, preservando histórico e auditoria.
   - O administrador não precisa criar uma nova chave do Supabase para essa correção.

2. **SIGR IA ampliada**
   - A Edge Function `sigr-ai` agora verifica o papel real da sessão (`admin`, `operator` ou `viewer`).
   - Identidade operacional por PIN também é validada no backend para liberar ações de operador.
   - Admin possui ferramentas de criação, alteração e exclusão; ações destrutivas continuam exigindo confirmação no aparelho.
   - Foram adicionadas ações para ocorrências, eventos, observações, cadastro/afastamento de recruta, baixas médicas, escala, navegação e remoção de integrante.

3. **Continuidade da escala semanal**
   - A fila da próxima escala passa a continuar a partir do **último executante real** do serviço confirmado.
   - Se houve substituição, o sistema usa `actualRecruitId`; sem substituição, usa `plannedRecruitId`.
   - Rascunhos incompletos não deslocam a fila da semana seguinte.
   - Exemplo validado: se o último executante real foi o Nº 058, a próxima escala começa no Nº 057.

## Implantação no Supabase

### Banco de comunicação
Se o módulo de PIN/chat/chamadas já funciona, as tabelas abaixo provavelmente já existem. O arquivo é idempotente (`create table if not exists`) e pode ser usado para conferência:

`supabase/sigr-communications-setup.sql`

### Edge Function sigr-communications
Substitua o código implantado pela pasta:

`supabase/functions/sigr-communications/`

A função precisa permanecer com `verify_jwt = false` porque a ação `login` acontece antes de existir uma sessão JWT; as demais rotas validam a sessão manualmente. Isso já está declarado em `supabase/config.toml`.

### Edge Function sigr-ai
Substitua o código implantado pela pasta:

`supabase/functions/sigr-ai/`

Ela usa as chaves de IA já configuradas (`GEMINI_API_KEY`, `GROQ_API_KEY` ou `OPENROUTER_API_KEY`). Tavily/Brave continuam opcionais para pesquisa web.

## Chaves do Supabase

Não é necessário criar uma chave nova apenas por causa desta atualização. As Edge Functions usam as credenciais injetadas pelo próprio Supabase (`SUPABASE_PUBLISHABLE_KEYS` / `SUPABASE_SECRET_KEYS`) e mantêm compatibilidade com `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` enquanto estiverem disponíveis.

Nunca coloque chave secreta no `index.html`.

## Testes após implantar

1. Entrar como administrador e remover um integrante de teste; atualizar a lista e confirmar que ele não aparece mais como ativo.
2. Na SIGR IA como admin, pedir uma ação simples (ex.: criar observação) e uma destrutiva de teste; confirmar que a destrutiva pergunta antes de executar.
3. Confirmar uma escala com substituição no último posto; gerar a próxima semana e verificar que começa no número imediatamente posterior ao executante real, seguindo 097 → 001.
4. Conferir ocorrência, relatórios, PDFs, QTS/COMEIA, chat e logout para garantir que as 12 correções anteriores continuam funcionando.
