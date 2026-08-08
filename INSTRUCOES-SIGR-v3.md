# SIGR v3.0 — atualização

Esta versão preserva o banco atual e adiciona a nova experiência móvel, SIGR IA aprimorada, Central de Notificações, Web Push, perfis de acesso e auditoria.

## 1. Arquivos que vão para o GitHub

Na raiz do repositório do GitHub, substitua ou envie:

- `index.html`
- `manifest.webmanifest`
- `service-worker.js`
- a pasta `icons`

Os arquivos da pasta `supabase` são de configuração do backend e não precisam ser publicados pelo GitHub Pages para o site funcionar.

Depois do commit, aguarde o GitHub Pages atualizar. No iPhone, feche e abra novamente o SIGR pela tela inicial. O novo Service Worker usa cache `v3` para buscar a versão atualizada.

## 2. Melhorias que funcionam somente com a atualização do GitHub

- interface móvel redesenhada sem alterar o layout de desktop;
- menu móvel sobreposto, sem comprimir o Dashboard;
- navegação inferior no celular;
- botões, campos e tipografia maiores no celular;
- resumo operacional de hoje no Dashboard;
- remoção de Relatórios PDF e PDF Individual;
- identidade visual sem emojis;
- `SIGR IA | Análise Inteligente` com área maior no celular;
- autocomplete inteligente e sugestões enquanto a pergunta é digitada;
- memória de contexto para perguntas consecutivas;
- interpretação de quantidade + período + ranking + detalhamento;
- rankings diários, semanais e mensais baseados no próprio período;
- resposta detalhada mostrando o que cada recruta fez no intervalo solicitado.

Exemplos para testar:

1. `Mostre os 10 piores da semana e detalhe o que cada um fez.`
2. `Quais foram os 5 piores de hoje?`
3. `Quem mais levou ocorrência esta semana?`
4. `O que o recruta 035 fez esta semana?`
5. `Gere o relatório de hoje.`
6. `Gere o relatório semanal.`
7. Em seguida, pergunte apenas: `E ontem?`

## 3. Ativar segurança, perfis e auditoria no Supabase

Abra o SQL Editor do projeto Supabase e execute o arquivo:

`supabase/sigr-v3-setup.sql`

O script não apaga registros de recrutas, ocorrências, eventos ou baixas médicas. Ele cria os módulos novos e aplica políticas RLS do SIGR v3 às tabelas existentes.

Perfis disponíveis:

- `admin`: acesso completo;
- `operator`: consulta, cadastro e alteração;
- `viewer`: somente consulta.

O primeiro usuário já existente no Auth é definido como administrador. Novos usuários entram como `viewer`. Para autorizar outro usuário como operador, o administrador pode executar no SQL Editor:

```sql
update public.sigr_user_profiles
set role = 'operator', updated_at = now()
where email = 'EMAIL_DO_USUARIO';
```

Não foi adicionada opção para o usuário trocar o próprio e-mail, senha ou nível de acesso dentro do SIGR.

## 4. Ativar notificações reais com o aplicativo fechado

O frontend e o Service Worker já estão preparados. Para o Web Push funcionar, ainda é necessário implantar a Edge Function incluída em:

`supabase/functions/sigr-notify`

Antes da implantação, gere um par VAPID em uma máquina com Node.js:

```bash
npx web-push generate-vapid-keys
```

No Supabase, salve como Secrets da Edge Function:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` — pode ser a URL pública do SIGR;
- `SIGR_CRON_SECRET` — crie uma senha aleatória longa somente para o agendador.

Nunca coloque `VAPID_PRIVATE_KEY`, `SIGR_CRON_SECRET`, `service_role` ou qualquer Secret Key dentro do `index.html` ou no repositório público do GitHub.

Implante a função com o nome `sigr-notify`. Como ela faz a própria validação da sessão do usuário e do segredo do agendador, configure a função para permitir a chamada e deixe a verificação ocorrer no próprio código.

Depois, crie um Cron Job no Supabase para chamar `sigr-notify` a cada 15 minutos, enviando:

```json
{ "action": "scheduled" }
```

e o cabeçalho privado:

`x-sigr-cron-secret: O_MESMO_VALOR_DO_SIGR_CRON_SECRET`

Os horários padrão são:

- consulta do dia seguinte: após 18:00;
- consulta do próprio dia: após 06:00;
- maior incidência do dia: após 20:00;
- balanço de ocorrências: a cada 10 registros no mesmo dia.

Esses horários ficam na tabela `sigr_notification_settings` e podem ser alterados depois.

## 5. Ativar no iPhone

Abra o SIGR instalado pela tela inicial, faça login, toque no sino da Central de Notificações e depois em `Ativar notificações neste aparelho`. Aceite a permissão do iOS.

As notificações usam o mecanismo Web Push do iPhone. O som é controlado pelo iOS e pelas configurações de Notificações/Foco do aparelho. A versão PWA não define um arquivo de toque personalizado para a notificação do sistema.

## 6. Alertas configurados

Consulta:

`SIGR | CONSULTA PROGRAMADA`

`Recruta 035 | Amanhã, às 09h30 | Consulta odontológica.`

Balanço a cada 10 ocorrências:

`SIGR | BALANÇO OPERACIONAL`

`10 ocorrências registradas hoje. 9 negativas | 1 positiva.`

Maior incidência do dia:

`SIGR | ALERTA DE ACOMPANHAMENTO`

`O Recruta 035 apresentou o maior número de ocorrências registradas em 08/08/2026: 5, sendo 4 negativas e 1 positiva.`

## 7. Segurança

O `index.html` contém apenas a Project URL e a Publishable Key do Supabase, que são destinadas ao frontend. Chaves privadas não são incluídas no pacote público. O controle real de gravação é feito por RLS no banco.

Antes de liberar usuários adicionais, confirme no Supabase que o seu usuário aparece como `admin` em `sigr_user_profiles`.
