# GuiaSesab

Emissão e acompanhamento das guias de serviços médicos da SESAB para a equipe de
anestesiologia do Hospital Geral Roberto Santos.

Credenciamento nº 001/2024 · Portaria nº 921/2024

---

## O que são os arquivos

| arquivo | o que é |
| --- | --- |
| `index.html` | O site público. O anestesista preenche seus dados, marca os plantões no calendário e baixa as guias já preenchidas em PDF. |
| `admin.html` | Painel de uso, com login. Lista as guias emitidas. **Nenhum link do site público aponta para ele.** |
| `base/Guia_Limpa.pdf` | O formulário oficial em branco. É a base sobre a qual o PDF é escrito. |
| `db/` | As migrações do banco, em ordem. |

Cada HTML é autocontido: não há build, nem dependência instalada, nem framework.
O formulário oficial vai embutido no `index.html` em base64, e a única biblioteca
externa é a `pdf-lib`, carregada do cdnjs.

## Como o PDF é montado

O sistema não recria o formulário: ele carrega o PDF oficial em branco e escreve
por cima, nas coordenadas medidas do próprio arquivo. Nada é apagado ou coberto.

As coordenadas estão no topo do bloco `<script>` do `index.html`:

- `COLS` — as sete colunas dos dias
- `ROT_FIM` — onde termina o rótulo SEG/TER/… e começa a data
- `CX` — o centro das três caixas `( )` de cada coluna
- `SECOES` — por faixa da ficha: célula do dia, linha do 4H, linha do 6H e a área livre
- `CAMPOS` — os cinco campos do cabeçalho
- `ASSIN_PROF` — a linha de assinatura do profissional

**Se a SESAB mudar o formulário**, troque `base/Guia_Limpa.pdf`, remeça essas
coordenadas e regere o base64 embutido. Não tente ajustar no olho.

## Estrutura da guia gerada

Uma folha por semana de segunda a domingo que toque o mês de referência, mais
uma folha de relatório por categoria de serviço. Cada dia marcado recebe o
carimbo de identificação do profissional; nas faixas de 4H/6H recebe também os
dois X, de duração e de período.

## Banco de dados

Supabase, projeto `Mapa_do_Centro` (compartilhado com o Mapa do Centro Cirúrgico,
em tabelas separadas).

- `guias_emitidas` — trilha de uso. O papel anônimo só insere; a leitura exige
  autenticação. Não há política de UPDATE nem de DELETE para quem está de fora.
- A conta de acesso ao painel é a mesma do Mapa do Centro Cirúrgico. Trocar a
  senha em um troca no outro.

A chave que aparece no HTML é a **publicável**, feita para ficar exposta. A
proteção é o RLS, não o sigilo da chave.

## Publicação

O site é servido pelo Netlify a partir da raiz do repositório. Não há etapa de
build: `netlify.toml` aponta `publish = "."`.

Enquanto o repositório não estiver ligado ao Netlify, a publicação é manual —
arrastar os HTML na área de deploy.
