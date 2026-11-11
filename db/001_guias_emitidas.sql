-- 001 — Registro de uso do site de guias (APLICADA no projeto Mapa_do_Centro)
--
-- Trilha append-only: o site público insere, só quem está autenticado lê.
-- Confirmado em teste assumindo o papel anon: INSERT funciona, SELECT devolve
-- zero linhas, DELETE não afeta nada.

create table if not exists public.guias_emitidas (
  id            uuid primary key default gen_random_uuid(),
  criado_em     timestamptz not null default now(),
  nome          text not null check (length(nome) between 1 and 120),
  registro      text check (length(registro) <= 40),
  rqe           text check (length(rqe) <= 40),
  especialidade text check (length(especialidade) <= 80),
  unidade       text check (length(unidade) <= 160),
  empresa       text check (length(empresa) <= 80),
  mes           smallint check (mes between 0 and 11),
  ano           smallint check (ano between 2020 and 2100),
  folhas        smallint check (folhas between 0 and 10),
  total_horas   integer  check (total_horas between 0 and 1000),
  detalhe       jsonb
);

comment on table public.guias_emitidas is
  'Trilha de uso do site publico de guias de plantao. Append-only: anon insere, apenas autenticado le.';

create index if not exists guias_emitidas_criado_em_idx
  on public.guias_emitidas (criado_em desc);

alter table public.guias_emitidas enable row level security;

drop policy if exists guias_emitidas_ins_anon on public.guias_emitidas;
create policy guias_emitidas_ins_anon
  on public.guias_emitidas for insert
  to anon, authenticated
  with check (true);

drop policy if exists guias_emitidas_sel_auth on public.guias_emitidas;
create policy guias_emitidas_sel_auth
  on public.guias_emitidas for select
  to authenticated
  using (true);
