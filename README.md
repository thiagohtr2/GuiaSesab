# GuiaSesab

Geração e acompanhamento das guias de serviços médicos da SESAB. O calendário conhecido pela equipe e o preenchimento do formulário oficial foram preservados. O novo portal adiciona autenticação, unidades, acompanhamento mensal e impressão dos anexos recebidos.

Credenciamento nº 001/2024 · Portaria nº 921/2024.

## Telas

- `index.html`: gerador público; clique repetido alterna SD, SN, SD+SN e vazio. As outras categorias mantêm 4M, 4T, 6M e 6T. A conta conectada é preenchida automaticamente e a emissão fica vinculada ao mês/unidade.
- `portal.html`: entrar/cadastrar/recuperar senha; visão geral da equipe; minha guia; minha conta; administração por papel.
- `admin.html`: entrada antiga, redireciona à administração do portal.
- `assets/`: estilos responsivos, cliente da API, integração do gerador e consolidação de PDFs.
- `db/netlify/202611130001_portal.sql`: esquema PostgreSQL, regras de negócio, RLS adicional e trilha de eventos.
- `netlify/functions/api.mjs` e `server/portal-service.mjs`: API autenticada de dados/arquivos; Netlify Database, Identity e Blobs.
- `docs/ATIVACAO.md`: implantação, bootstrap seguro do master, limites e homologação.

## Fluxo

Médico gera a guia → assina **o arquivo completo** pelo gov.br → anexa o original → admin confere assinatura e prepara cópia consolidada → imprime e confirma impressão → entrega e confirma envio. O portal registra o recebimento do anexo; não valida criptograficamente a assinatura nem transmite o arquivo à SESAB.

O painel de nomes, etapas e datas fica visível para todas as contas autenticadas. PDFs e informações de conta são restritos ao titular, à administração da unidade e ao master. As permissões são verificadas no PostgreSQL, não apenas na interface. Somente o master promove/rebaixa administradores ou transfere pessoas diretamente entre unidades. Não existe impersonação.

Cada original é preservado, sem regravação, com SHA-256 e caminho imutável. O consolidado contém apenas as primeiras N folhas oficiais de cada PDF, sendo N o número de semanas registrado na geração. Exclui todas as páginas seguintes de relatório. A cópia consolidada **não conserva a validade digital das assinaturas dos originais**. O original deve manter a ordem das páginas do arquivo gerado.

## Formulário oficial preservado

`base/Guia_Limpa.pdf` é a referência original, embutida em base64 no `index.html`. O gerador escreve sobre esse PDF; não recria nem apaga o formulário. `montarPdf`, `relatorio`, coordenadas e lógica do calendário não foram reescritos. Os testes verificam os hashes do motor e do calendário em relação ao commit original `8a561f5` e geram PDFs reais.

Se a SESAB alterar o formulário, substitua a base, remeça coordenadas e atualize o base64. Não ajuste o documento por aproximação visual.

## Banco e autenticação

**Netlify Database + Netlify Identity + Netlify Blobs.** Não há dependência ativa do Supabase. As migrações em `db/001` e `db/002` documentam apenas o backend anterior e não são aplicadas no banco Netlify.

A API `/api/*` valida a identidade no servidor pelo SDK oficial, checa origem contra CSRF, restringe as leituras por titular/unidade/papel e expõe somente operações de negócio fixas. A conexão PostgreSQL e as credenciais de Blobs não chegam ao browser. O ator é definido pelo servidor, em transação, na mesma conexão usada pelas consultas.

A primeira conta master é definida por UUID previamente conferido no Netlify Identity e configurado em `GUIASESAB_MASTER_USER_ID` no escopo Functions. Não existe autopromoção pelo cadastro nem promoção do primeiro usuário. Consulte [o roteiro de ativação](docs/ATIVACAO.md).

A ativação do banco é manual e posterior ao deploy: `npm run db:migrate`, com a conexão Netlify configurada no ambiente. A publicação não provisiona banco nem executa migrações. Habilite o banco e Identity no projeto correto, configure os e-mails e homologue o deploy antes de liberar para a equipe. O frontend público continua gerando PDFs quando o backend estiver indisponível, com aviso quando o acompanhamento não puder ser registrado.

## Desenvolvimento e publicação

O frontend é HTML/CSS/JavaScript nativo; a única biblioteca de navegador é `pdf-lib` 1.17.1, pelo cdnjs. As Functions usam os SDKs oficiais `@netlify/identity` e `@netlify/blobs`, com o driver PostgreSQL `pg`, além de pdf-lib para verificar os anexos. Não há framework nem bundler.

```sh
npm ci
npm test
npm run build
```

A etapa de build apenas copia os arquivos públicos para `dist/` com Node.js nativo. O Netlify usa esse diretório; testes, SQL, documentação e dependências ficam fora da publicação. As Functions são empacotadas separadamente pelo Netlify. Publique a partir do repositório/CLI com build e funções; somente enviar `dist/` não instala o backend.

Os testes usam PostgreSQL em WASM (PGlite) e o serviço de API com identidade/Blobs simulados e o formulário PDF real. Cobrem permissões, isolamento de unidades, substituição de anexo, lotes desatualizados, datas, proibição de autopromoção, CSRF, callbacks, transporte em partes e exclusão dos relatórios. Homologue também no Netlify real antes de liberar para a equipe.
