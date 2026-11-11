-- 002 — Painel de acompanhamento: equipe fixa, arquivo e impressão
--
-- STATUS: PENDENTE. Não foi aplicada.
-- O conector Supabase da sessão passou a apontar para outra conta e o projeto
-- Mapa_do_Centro ficou fora de alcance. Aplicar assim que a conta certa for
-- reconectada.
--
-- Por que cada parte existe:
--   * guias_equipe  — sem uma lista de quem é esperado, o painel só consegue
--                     listar quem entregou; quem sumiu não aparece.
--   * so_digitos    — a ligação entre o cadastro e a guia emitida é feita pelo
--                     CRM, comparando só os dígitos ("32.303" = "32303").
--   * arquivo       — caminho do PDF no bucket, para o painel imprimir.
--   * impresso_em   — preenchido no momento em que alguém imprime pelo painel.

-- ========== equipe fixa de anestesistas ==========
create table if not exists public.guias_equipe (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null check (length(nome) between 1 and 120),
  registro      text check (length(registro) <= 40),
  rqe           text check (length(rqe) <= 40),
  especialidade text check (length(especialidade) <= 80),
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);

comment on table public.guias_equipe is
  'Equipe fixa esperada a entregar guia todo mes. Base para apontar pendentes no painel.';

create or replace function public.so_digitos(t text)
returns text language sql immutable as $$
  select nullif(regexp_replace(coalesce(t,''), '[^0-9]', '', 'g'), '')
$$;

create unique index if not exists guias_equipe_registro_idx
  on public.guias_equipe (public.so_digitos(registro))
  where public.so_digitos(registro) is not null;

alter table public.guias_equipe enable row level security;

drop policy if exists guias_equipe_tudo_auth on public.guias_equipe;
create policy guias_equipe_tudo_auth
  on public.guias_equipe for all
  to authenticated
  using (true) with check (true);

-- ========== guias emitidas: arquivo e impressao ==========
alter table public.guias_emitidas
  add column if not exists arquivo      text,
  add column if not exists impresso_em  timestamptz,
  add column if not exists impresso_por text;

create index if not exists guias_emitidas_ref_idx
  on public.guias_emitidas (ano, mes);

create index if not exists guias_emitidas_registro_idx
  on public.guias_emitidas (public.so_digitos(registro));

-- marcar como impressa é privilégio de quem está autenticado
drop policy if exists guias_emitidas_upd_auth on public.guias_emitidas;
create policy guias_emitidas_upd_auth
  on public.guias_emitidas for update
  to authenticated
  using (true) with check (true);

-- ========== bucket dos PDFs ==========
-- Privado. O site publico envia; só quem está autenticado lê, por URL assinada.
-- Se o painel do Supabase recusar este bloco por permissão, crie o bucket pela
-- interface (Storage > New bucket, privado, 5 MB, apenas application/pdf) e
-- aplique as duas politicas por lá.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('guias', 'guias', false, 5242880, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['application/pdf'];

drop policy if exists guias_obj_ins on storage.objects;
create policy guias_obj_ins
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'guias');

drop policy if exists guias_obj_sel on storage.objects;
create policy guias_obj_sel
  on storage.objects for select
  to authenticated
  using (bucket_id = 'guias');
