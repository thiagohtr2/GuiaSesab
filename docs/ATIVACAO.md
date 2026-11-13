# Ativação no Netlify — GuiaSesab

A aplicação usa **Netlify Database** (PostgreSQL), **Netlify Identity** (contas) e **Netlify Blobs** (PDFs). O navegador acessa somente a API do próprio site. Não há dependência ativa do Supabase; as migrações 001/002 em `db/` são apenas histórico do sistema anterior e não devem ser executadas no Netlify.

O calendário público segue funcionando sem conta, e o motor do PDF oficial foi preservado. Para registrar emissão/anexo, o médico entra no portal e abre o gerador no mesmo site.

## 1. Vincular o projeto e publicar

No projeto correto do Netlify, confira a vinculação ao repositório `thiagohtr2/GuiaSesab`. A publicação precisa executar o build e empacotar as Functions. Um drag-and-drop somente de HTML/`dist/` não instala o backend.

Configuração versionada em `netlify.toml`:

- Node.js 22, no mínimo 22.12.0;
- build: `node scripts/build.mjs`;
- conteúdo estático: `dist/`;
- funções: `netlify/functions/`, com bundler esbuild;
- API: `/api/*`, atendida por `netlify/functions/api.mjs`;
- migração: `netlify/database/migrations/202611130001_portal.sql`, aplicada automaticamente pelo Netlify.

O banco é habilitado manualmente em **Data & Storage > Database** deste projeto (o pacote `@netlify/database` não é usado, então o Netlify não o provisiona sozinho). Com o banco habilitado, o Netlify aplica automaticamente o SQL de `netlify/database/migrations/` em cada deploy, imediatamente antes de publicar; se a migração falhar, o deploy não é publicado e o site anterior continua no ar. O driver `pg` só abre a conexão quando uma operação autenticada precisa dos dados. As credenciais são lidas exclusivamente no servidor, das variáveis Netlify `NETLIFY_DB_URL` (nativo) ou `NETLIFY_DATABASE_URL` (integração anterior).

Contingência: `npm run db:migrate`, executado em ambiente autorizado com a variável de conexão, aplica o mesmo esquema apenas se ele ainda não existir. Não é necessário no fluxo normal. Não envie credenciais pelo chat.
O script de build copia somente o frontend para `dist/`. As Functions são empacotadas separadamente pelo Netlify. Dependências, SQL, testes e documentação operacional não são publicados como arquivos estáticos.

## 2. Habilitar Netlify Identity

No **mesmo projeto**, habilite Identity e o cadastro por e-mail/senha. Configure a URL real do site nos e-mails de confirmação e recuperação. O frontend aceita os fragmentos `confirmation_token` e `recovery_token`; se o e-mail abrir a raiz do site, `assets/auth-redirect.js` encaminha o fragmento para o portal sem colocá-lo em query string.

Mantenha confirmação de e-mail habilitada para contas reais. O frontend informa confirmação quando a configuração exigir. Cadastro com autoconfirm também funciona tecnicamente, mas a definição desse requisito cabe ao responsável pelo serviço. Confirme limites de envio, remetente e entregabilidade dos e-mails na sua conta Netlify antes de cadastrar toda a equipe.

A integração usa o SDK oficial `@netlify/identity` **no servidor** para login, cadastro, leitura da identidade verificada, confirmação, recuperação, alteração de senha e logout. A biblioteca gerencia os cookies de sessão. O frontend não grava tokens ou senhas em localStorage/sessionStorage. Todas as mutações da API verificam a origem da requisição contra CSRF.

O projeto não usa senha/identidade do Mapa do Centro. As contas do novo portal são as do Identity deste projeto Netlify.

## 3. Definir a conta master com identidade conferida

1. O proprietário cria a própria conta pelo portal e confirma o e-mail.
2. No painel **Identity > Users** do Netlify, confira o e-mail e copie o **UUID dessa conta**, não um identificador de outra pessoa.
3. Defina a variável de ambiente **`GUIASESAB_MASTER_USER_ID`**, no escopo **Functions**, com esse UUID. Não use senha nem token nessa variável.
4. Faça um novo deploy para que a Function receba a variável.
5. Entre nessa conta e salve seu cadastro profissional em **Minha conta**. Se ainda não existir outro master, o servidor atribui o papel master a essa identidade exata, com registro no histórico.
6. Confira a indicação **Conta master** e a área **Contas e permissões**. Remova a variável de bootstrap após confirmar o primeiro master, se desejar; o papel já está salvo no banco.

Não existe promoção automática do primeiro usuário. Metadata de cadastro, e-mail informado em formulário, papel vindo do browser e argumentos extras de API não promovem nenhuma conta. A troca de master, se necessária futuramente, exige uma operação administrativa de banco revisada; o portal protege a conta master contra rebaixamento pela interface.

## 4. Unidades e permissões

- Master: crie a unidade com o nome oficial e a empresa que irão para o formulário.
- Master: em **Contas e permissões**, defina sua unidade e a de cada médico. Durante a fase de teste, o proprietário pode controlar diretamente todos os vínculos.
- Master: promova administradores. O papel admin administra a unidade à qual a conta está vinculada. Um admin ainda sem unidade pode criar uma; admin já vinculado não cria outra sem intervenção do master.
- Médico: pode solicitar entrada em uma unidade. O admin dessa unidade aprova pessoas sem vínculo; transferências entre unidades exigem o master.
- Os vínculos novos não transferem arquivos antigos: o histórico permanece na unidade original.
- Selecione **mês e unidade** para editar o prazo. A data inclui o dia inteiro, até 23h59, no horário de Salvador. É um alerta; não bloqueia anexos enviados com atraso.

## 5. Fluxo de homologação

Use contas e documentos de teste: master, admin/médico da unidade A e admin/médico da unidade B.

1. Verifique cadastro, confirmação de e-mail, login, recuperação, alteração de senha e logout no domínio real.
2. Salve nome, CRM/RQE e especialidade, vincule a unidade e abra o gerador conectado. Confira o preenchimento automático.
3. Clique nos dias: **SD → SN → SD+SN → vazio**; demais categorias: **4M → 4T → 6M → 6T → vazio**. Confira semanas que cruzam os limites do mês e múltiplas categorias.
4. Gere a guia. Confirme o registro no mês correto, sem mudança no formulário oficial. A contagem de páginas inclui todos os relatórios realmente gerados.
5. Assine **o PDF completo** no serviço oficial gov.br. Preserve todas as páginas e a ordem original; não retire o relatório antes de assinar.
6. Anexe o original em **Minha guia** e confira a data de recebimento no painel de outra conta.
7. Admin: baixe o original e confira a assinatura no serviço oficial de validação. O portal confere formato, abertura do PDF, limite, quantidade de páginas e integridade; **não valida criptograficamente a assinatura gov.br nem confirma o conteúdo profissional do documento**.
8. Marque as guias na conferência administrativa e gere o PDF completo. A seleção inicial consolida somente guias ainda não impressas. Confirme que todas as folhas de relatório foram excluídas da cópia, inclusive quando há mais de uma categoria.
9. Abra, imprima e clique em **Confirmar que imprimi**. Baixar/abrir não marca como impresso automaticamente. A aplicação não tem confirmação física da impressora.
10. Após entregar efetivamente, clique em **Confirmar envio** de cada guia. Isso registra uma declaração administrativa; não envia e-mail nem transmite o arquivo à SESAB.
11. Confira as quatro datas, as pendências e o alerta de prazo. A visão geral atualiza a cada 60 segundos enquanto aberta/visível; também há atualização manual.
12. Substitua um anexo antes do envio. O anterior deve permanecer preservado e impressão/envio devem reiniciar. Um lote anterior à substituição deve ser recusado na confirmação de impressão.
13. Tente editar o próprio papel, consultar dados privados ou baixar originais de outra unidade por API: o servidor deve recusar. Não basta verificar se o botão está escondido.
14. Depois de enviar uma guia, uma correção exige reabertura pela administração. A operação deve aparecer no histórico.

## 6. Originais e cópias para impressão

Mesclar páginas ou retirar relatórios altera o PDF. Por isso, o lote é uma **cópia para impressão**; não conserva a validade digital das assinaturas dos originais. O original assinado é salvo byte por byte, com UUID e SHA-256, por escrita condicional `onlyIfNew` em Netlify Blobs. Nenhuma rota do aplicativo substitui ou exclui esses originais.

Na cópia, o servidor/browser usa o número N de folhas oficiais registrado na emissão. Mantém as primeiras N páginas de cada original e exclui **todas** as posteriores, que são os relatórios de horas. A correspondência de médico/mês/ordem e a assinatura devem ser conferidas pelo responsável antes da impressão.

O transporte divide o arquivo em partes de 1 MB para evitar os limites de upload de uma Function em uma requisição única. O servidor verifica o tamanho de cada parte, reconstitui o arquivo, verifica SHA-256 e páginas e só então finaliza a etapa. A integridade também é conferida pelo browser antes de consolidar. Partes temporárias são removidas após sucesso; originais permanecem.

Limites: 15 MB por original, até 20 tentativas de anexo por usuário em dez minutos, intenção de upload válida por 24 horas, até 200 arquivos e 100 MB por consolidação no browser. Para lotes maiores, desmarque guias e faça lotes menores. Arquivos temporários de tentativas abandonadas devem ser incluídos na política operacional de retenção/limpeza do responsável; esta versão não agenda exclusão dos originais nem uma política automática de retenção.

## 7. Proteção dos dados

O painel de nomes, etapas e datas é compartilhado entre contas autenticadas. CRM, e-mails e arquivos não aparecem no painel compartilhado. Original: médico proprietário, admin da unidade ou master. E-mails de todas as contas são retornados exclusivamente ao master.

Não há conexão de banco no browser nem endpoint de SQL arbitrário. A Function verifica a identidade pelo SDK oficial e define `app.user_id` em **uma transação, na mesma conexão**. Todas as leituras de tabela têm filtros de permissão no servidor; mutações passam por uma lista fixa de operações e pelas regras PostgreSQL. Não se confia em um UUID fornecido pelo cliente para definir o ator.

As tabelas têm RLS como defesa adicional para papéis restritos. A conexão do serviço é proprietária e pode ultrapassar RLS; por isso os filtros explícitos da API e as verificações das funções SQL são obrigatórios e são testados como parte da proteção. Banco e Blobs só são acessados com as credenciais do runtime Netlify; não coloque essas credenciais em arquivos públicos ou no chat.

## 8. Validação e retorno

```sh
npm ci
npm test
npm run build
```

Os testes executam o PostgreSQL em WASM (PGlite), o serviço real de API com identidade/Blobs simulados e o PDF oficial. Conferem permissões, isolamento, CSRF, transporte em partes, integridade, preservação dos originais, lotes antigos, datas, callbacks e a igualdade do motor do calendário/PDF com o commit original `8a561f5`.

Esses testes **não substituem** o teste no Netlify real de Identity, banco provisionado, cookies, e-mails, Blobs e assinatura gov.br real. A prévia em `docs/portal-preview.jpg` foi feita com dados de teste, sem representar cadastros/entregas reais.

Para desenvolvimento integrado, use `netlify dev` com o projeto correto vinculado. A prévia estática isolada só mostra o frontend; ela não executa as Functions nem provisiona serviços.

Rollback: retorne ao deploy de código anterior. Não apague tabelas ou originais para retornar o visual. As guias emitidas anteriormente no backend legado não são importadas automaticamente, pois não comprovam a identidade autenticada, assinatura, impressão ou envio do novo portal.

## Referências oficiais

- [Netlify Database](https://docs.netlify.com/build/data-and-storage/netlify-database/)
- [Driver PostgreSQL com Netlify Database](https://docs.netlify.com/build/data-and-storage/netlify-database/tooling/)
- [API de Database e transações](https://docs.netlify.com/build/data-and-storage/netlify-database/api/)
- [Identity em Functions](https://docs.netlify.com/manage/security/secure-access-to-sites/identity/use-identity-in-functions/)
- [Configurar Identity](https://docs.netlify.com/manage/security/secure-access-to-sites/identity/get-started/)
- [Blobs e escritas condicionais](https://docs.netlify.com/build/data-and-storage/netlify-blobs/)
