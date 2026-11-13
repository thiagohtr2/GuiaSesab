-- Netlify Database. Identidade verificada por Netlify Functions; PDFs em Netlify Blobs.
begin;
create table public.gs_accounts (
 id uuid primary key, email text not null check(length(email)<=320), created_at timestamptz not null default now()
);
create function public.gs_actor() returns uuid language sql stable set search_path='' as $$
 select nullif(current_setting('app.user_id',true),'')::uuid
$$;
create table public.gs_units (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 2 and 160),
 company text not null default '' check(length(company)<=80), created_by uuid not null references public.gs_accounts(id),
 created_at timestamptz not null default now()
);
create table public.gs_profiles (
 id uuid primary key references public.gs_accounts(id) on delete cascade,
 name text not null check(length(trim(name)) between 2 and 120), crm text not null default '' check(length(crm)<=40),
 rqe text not null default '' check(length(rqe)<=40), specialty text not null default 'ANESTESIOLOGIA' check(length(specialty)<=80),
 role text not null default 'medico' check(role in ('medico','admin','master')),
 unit_id uuid references public.gs_units(id), created_at timestamptz not null default now()
);
create table public.gs_requests (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.gs_profiles(id),
 unit_id uuid not null references public.gs_units(id), status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(), decided_at timestamptz, decided_by uuid references public.gs_accounts(id)
);
create unique index gs_one_request on public.gs_requests(user_id,unit_id) where status='pending';
create table public.gs_months (
 unit_id uuid not null references public.gs_units(id), reference date not null check(extract(day from reference)=1),
 deadline date not null, updated_at timestamptz not null default now(), updated_by uuid not null references public.gs_accounts(id),
 primary key(unit_id,reference)
);
create table public.gs_guides (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.gs_profiles(id),
 unit_id uuid not null references public.gs_units(id), reference date not null check(extract(day from reference)=1),
 revision uuid not null default gen_random_uuid(), guide_pages integer not null check(guide_pages between 1 and 6),
 total_pages integer not null check(total_pages between 1 and 30), generated_at timestamptz not null default now(),
 current_upload_id uuid, uploaded_at timestamptz, printed_at timestamptz, printed_by uuid references public.gs_accounts(id),
 sent_at timestamptz, sent_by uuid references public.gs_accounts(id), unique(user_id,unit_id,reference)
);
create table public.gs_uploads (
 id uuid primary key default gen_random_uuid(), guide_id uuid not null references public.gs_guides(id),
 revision uuid not null, user_id uuid not null references public.gs_profiles(id), unit_id uuid not null references public.gs_units(id),
 path text not null unique, sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 total_pages integer not null check(total_pages between 1 and 30), guide_pages integer not null check(guide_pages between 1 and 6),
 original_name text not null check(length(original_name)<=180),
 byte_size integer not null check(byte_size between 1 and 15728640), stored_at timestamptz, created_at timestamptz not null default now(), finalized_at timestamptz
);
alter table public.gs_guides add constraint gs_current_upload_fk foreign key(current_upload_id) references public.gs_uploads(id);
create table public.gs_batches (
 id uuid primary key default gen_random_uuid(), unit_id uuid not null references public.gs_units(id), reference date not null,
 upload_ids uuid[] not null, created_at timestamptz not null default now(), created_by uuid not null references public.gs_accounts(id), printed_at timestamptz
);
create table public.gs_events (
 id bigint generated always as identity primary key, actor uuid not null references public.gs_accounts(id),
 unit_id uuid references public.gs_units(id), guide_id uuid references public.gs_guides(id), action text not null,
 details jsonb not null default '{}', created_at timestamptz not null default now()
);
create index on public.gs_guides(unit_id,reference);
create index on public.gs_profiles(unit_id);
create index on public.gs_uploads(guide_id);
create index on public.gs_events(unit_id,created_at desc);

create function public.gs_is_master() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.gs_profiles where id=public.gs_actor() and role='master')
$$;
create function public.gs_can_manage(p_unit uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.gs_profiles where id=public.gs_actor() and (role='master' or (role='admin' and unit_id=p_unit)))
$$;

-- Cria perfis somente após identidade autenticada. Role/unidade nunca vêm de metadata do usuário.
create function public.gs_save_profile(p_name text,p_crm text,p_rqe text,p_specialty text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if public.gs_actor() is null then raise exception 'Entre na sua conta.'; end if;
 insert into public.gs_profiles(id,name,crm,rqe,specialty) values(public.gs_actor(),trim(p_name),trim(p_crm),trim(p_rqe),trim(p_specialty))
 on conflict(id) do update set name=excluded.name,crm=excluded.crm,rqe=excluded.rqe,specialty=excluded.specialty;
 if public.gs_actor()::text=nullif(current_setting('app.bootstrap_master_id',true),'') and not exists(select 1 from public.gs_profiles where role='master') then
  update public.gs_profiles set role='master' where id=public.gs_actor();
  insert into public.gs_events(actor,action) values(public.gs_actor(),'master_bootstrapped');
 end if;
end $$;
create function public.gs_create_unit(p_name text,p_company text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not exists(select 1 from public.gs_profiles where id=public.gs_actor() and role in ('master','admin')) then raise exception 'Apenas administradores podem criar unidades.'; end if;
 if exists(select 1 from public.gs_profiles where id=public.gs_actor() and role='admin' and unit_id is not null) then raise exception 'Sua conta já administra uma unidade. Peça a alteração à conta master.'; end if;
 insert into public.gs_units(name,company,created_by) values(trim(p_name),trim(p_company),public.gs_actor()) returning id into v_id;
 update public.gs_profiles set unit_id=v_id where id=public.gs_actor() and role='admin';
 insert into public.gs_events(actor,unit_id,action) values(public.gs_actor(),v_id,'unit_created');
 return v_id;
end $$;
create function public.gs_request_unit(p_unit uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.gs_profiles where id=public.gs_actor()) then raise exception 'Complete seu cadastro.'; end if;
 if exists(select 1 from public.gs_profiles where id=public.gs_actor() and unit_id=p_unit) then raise exception 'Você já faz parte desta unidade.'; end if;
 insert into public.gs_requests(user_id,unit_id) values(public.gs_actor(),p_unit) on conflict(user_id,unit_id) where status='pending' do nothing;
end $$;
create function public.gs_assign_unit(p_user uuid,p_unit uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.gs_is_master() then raise exception 'Apenas a conta master pode definir unidades diretamente.'; end if;
 update public.gs_profiles set unit_id=p_unit where id=p_user;
 if not found then raise exception 'Conta não encontrada.'; end if;
 update public.gs_requests set status=case when unit_id=p_unit then 'approved' else 'rejected' end,decided_at=now(),decided_by=public.gs_actor() where user_id=p_user and status='pending';
 insert into public.gs_events(actor,unit_id,action,details) values(public.gs_actor(),p_unit,'unit_assigned',jsonb_build_object('user_id',p_user));
end $$;
create function public.gs_decide_request(p_id uuid,p_approve boolean) returns void language plpgsql security definer set search_path='' as $$
declare r public.gs_requests; current_unit uuid;
begin
 select * into r from public.gs_requests where id=p_id and status='pending' for update;
 if not found or not public.gs_can_manage(r.unit_id) then raise exception 'Solicitação indisponível.'; end if;
 select unit_id into current_unit from public.gs_profiles where id=r.user_id for update;
 if p_approve and current_unit is not null and current_unit<>r.unit_id and not public.gs_is_master() then raise exception 'Transferências entre unidades dependem da conta master.'; end if;
 if p_approve then update public.gs_profiles set unit_id=r.unit_id where id=r.user_id; end if;
 update public.gs_requests set status=case when p_approve then 'approved' else 'rejected' end,decided_at=now(),decided_by=public.gs_actor() where id=p_id;
 if p_approve then update public.gs_requests set status='rejected',decided_at=now(),decided_by=public.gs_actor() where user_id=r.user_id and status='pending'; end if;
 insert into public.gs_events(actor,unit_id,action,details) values(public.gs_actor(),r.unit_id,'request_decided',jsonb_build_object('request_id',p_id,'approved',p_approve));
end $$;
create function public.gs_set_role(p_user uuid,p_role text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.gs_is_master() or p_role not in ('medico','admin') then raise exception 'Permissão insuficiente.'; end if;
 update public.gs_profiles set role=p_role where id=p_user and role<>'master';
 if not found then raise exception 'Conta não encontrada ou conta master protegida.'; end if;
 insert into public.gs_events(actor,action,details) values(public.gs_actor(),'role_changed',jsonb_build_object('user_id',p_user,'role',p_role));
end $$;
create function public.gs_set_deadline(p_unit uuid,p_reference date,p_deadline date) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.gs_can_manage(p_unit) then raise exception 'Apenas a administração da unidade pode alterar o prazo.'; end if;
 insert into public.gs_months(unit_id,reference,deadline,updated_by) values(p_unit,p_reference,p_deadline,public.gs_actor())
 on conflict(unit_id,reference) do update set deadline=excluded.deadline,updated_at=now(),updated_by=public.gs_actor();
 insert into public.gs_events(actor,unit_id,action,details) values(public.gs_actor(),p_unit,'deadline_changed',jsonb_build_object('reference',p_reference,'deadline',p_deadline));
end $$;
create function public.gs_register_generation(p_unit uuid,p_reference date,p_guide_pages integer,p_total_pages integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid; existing public.gs_guides;
begin
 if not exists(select 1 from public.gs_profiles where id=public.gs_actor() and unit_id=p_unit) then raise exception 'Sua conta precisa estar vinculada à unidade.'; end if;
 select * into existing from public.gs_guides where user_id=public.gs_actor() and unit_id=p_unit and reference=p_reference for update;
 if existing.sent_at is not null then raise exception 'Guia já enviada. Solicite reabertura à administração.'; end if;
 if p_total_pages<p_guide_pages then raise exception 'Quantidade de páginas inválida.'; end if;
 insert into public.gs_guides(user_id,unit_id,reference,guide_pages,total_pages) values(public.gs_actor(),p_unit,p_reference,p_guide_pages,p_total_pages)
 on conflict(user_id,unit_id,reference) do update set revision=gen_random_uuid(),guide_pages=excluded.guide_pages,total_pages=excluded.total_pages,generated_at=now(),current_upload_id=null,uploaded_at=null,printed_at=null,printed_by=null,sent_at=null,sent_by=null returning id into v_id;
 insert into public.gs_events(actor,unit_id,guide_id,action) values(public.gs_actor(),p_unit,v_id,'generated');
 return v_id;
end $$;
create function public.gs_reserve_upload(p_guide uuid,p_sha256 text,p_total_pages integer,p_original_name text,p_byte_size integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.gs_guides; u public.gs_uploads; v_id uuid:=gen_random_uuid();
begin
 select * into g from public.gs_guides where id=p_guide and user_id=public.gs_actor() for update;
 if not found or not exists(select 1 from public.gs_profiles where id=public.gs_actor() and unit_id=g.unit_id) then raise exception 'Guia indisponível para sua conta/unidade.'; end if;
 if g.sent_at is not null then raise exception 'Guia já enviada. Solicite reabertura à administração.'; end if;
 perform 1 from public.gs_profiles where id=public.gs_actor() for update;
 if (select count(*) from public.gs_uploads where user_id=public.gs_actor() and created_at>now()-interval '10 minutes')>=20 then raise exception 'Limite de tentativas de anexo atingido. Aguarde dez minutos.'; end if;
 if p_total_pages<>g.total_pages then raise exception 'O anexo deve conter todas as páginas da guia gerada, incluindo relatórios.'; end if;
 insert into public.gs_uploads(id,guide_id,revision,user_id,unit_id,path,sha256,total_pages,guide_pages,original_name,byte_size)
 values(v_id,g.id,g.revision,public.gs_actor(),g.unit_id,g.unit_id||'/'||public.gs_actor()||'/'||v_id||'.pdf',p_sha256,p_total_pages,g.guide_pages,p_original_name,p_byte_size) returning * into u;
 return to_jsonb(u);
end $$;
create function public.gs_finalize_upload(p_upload uuid) returns void language plpgsql security definer set search_path='' as $$
declare u public.gs_uploads; g public.gs_guides;
begin
 select * into u from public.gs_uploads where id=p_upload and user_id=public.gs_actor() for update;
 if not found or u.finalized_at is not null then raise exception 'Anexo indisponível.'; end if;
 select * into g from public.gs_guides where id=u.guide_id for update;
 if g.revision<>u.revision or g.sent_at is not null or not exists(select 1 from public.gs_profiles where id=public.gs_actor() and unit_id=g.unit_id) then raise exception 'A guia mudou. Gere e assine a versão atual.'; end if;
 if u.stored_at is null then raise exception 'Upload incompleto. Tente novamente.'; end if;
 update public.gs_uploads set finalized_at=now() where id=p_upload;
 update public.gs_guides set current_upload_id=u.id,uploaded_at=now(),printed_at=null,printed_by=null,sent_at=null,sent_by=null where id=g.id;
 insert into public.gs_events(actor,unit_id,guide_id,action,details) values(public.gs_actor(),g.unit_id,g.id,'signed_file_received',jsonb_build_object('upload_id',u.id));
end $$;
create function public.gs_create_batch(p_unit uuid,p_reference date,p_uploads uuid[]) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_count integer;
begin
 if not public.gs_can_manage(p_unit) then raise exception 'Apenas a administração pode consolidar.'; end if;
 if coalesce(cardinality(p_uploads),0) not between 1 and 200 then raise exception 'Selecione de 1 a 200 arquivos.'; end if;
 select count(*) into v_count from public.gs_guides g join public.gs_uploads u on u.id=g.current_upload_id where g.unit_id=p_unit and g.reference=p_reference and u.finalized_at is not null and u.id=any(p_uploads);
 if v_count<>cardinality(p_uploads) then raise exception 'Uma guia foi atualizada. Atualize o painel e gere o lote novamente.'; end if;
 insert into public.gs_batches(unit_id,reference,upload_ids,created_by) values(p_unit,p_reference,p_uploads,public.gs_actor()) returning id into v_id;
 insert into public.gs_events(actor,unit_id,action,details) values(public.gs_actor(),p_unit,'batch_created',jsonb_build_object('batch_id',v_id,'files',v_count));
 return v_id;
end $$;
create function public.gs_confirm_print(p_batch uuid) returns void language plpgsql security definer set search_path='' as $$
declare b public.gs_batches; v_count integer;
begin
 select * into b from public.gs_batches where id=p_batch for update;
 if not found or not public.gs_can_manage(b.unit_id) then raise exception 'Lote indisponível.'; end if;
 if b.printed_at is not null then return; end if;
 perform 1 from public.gs_guides where current_upload_id=any(b.upload_ids) order by id for update;
 select count(*) into v_count from public.gs_guides where unit_id=b.unit_id and reference=b.reference and current_upload_id=any(b.upload_ids);
 if v_count<>cardinality(b.upload_ids) then raise exception 'Uma guia foi substituída. Gere um novo lote antes de confirmar a impressão.'; end if;
 update public.gs_batches set printed_at=now() where id=p_batch;
 update public.gs_guides set printed_at=now(),printed_by=public.gs_actor() where current_upload_id=any(b.upload_ids) and printed_at is null;
 insert into public.gs_events(actor,unit_id,action,details) values(public.gs_actor(),b.unit_id,'print_confirmed',jsonb_build_object('batch_id',p_batch));
end $$;
create function public.gs_mark_sent(p_guide uuid,p_upload uuid) returns void language plpgsql security definer set search_path='' as $$
declare g public.gs_guides;
begin
 select * into g from public.gs_guides where id=p_guide for update;
 if not found or not public.gs_can_manage(g.unit_id) then raise exception 'Guia indisponível.'; end if;
 if g.printed_at is null or g.current_upload_id is distinct from p_upload then raise exception 'Confirme a impressão da versão atual antes do envio.'; end if;
 if g.sent_at is not null then return; end if;
 update public.gs_guides set sent_at=now(),sent_by=public.gs_actor() where id=g.id;
 insert into public.gs_events(actor,unit_id,guide_id,action) values(public.gs_actor(),g.unit_id,g.id,'sent_confirmed');
end $$;
create function public.gs_reopen(p_guide uuid) returns void language plpgsql security definer set search_path='' as $$
declare g public.gs_guides;
begin
 select * into g from public.gs_guides where id=p_guide for update;
 if not found or not public.gs_can_manage(g.unit_id) then raise exception 'Guia indisponível.'; end if;
 update public.gs_guides set printed_at=null,printed_by=null,sent_at=null,sent_by=null where id=g.id;
 insert into public.gs_events(actor,unit_id,guide_id,action) values(public.gs_actor(),g.unit_id,g.id,'reopened');
end $$;
-- Painel visível a qualquer conta autenticada; não expõe e-mails, CRM nem arquivos.
create function public.gs_dashboard(p_reference date) returns table(
 user_id uuid,name text,unit_id uuid,unit_name text,guide_id uuid,generated_at timestamptz,uploaded_at timestamptz,
 printed_at timestamptz,sent_at timestamptz,deadline date,current_upload_id uuid
) language sql stable security definer set search_path='' as $$
 select p.id,p.name,p.unit_id,u.name,g.id,g.generated_at,g.uploaded_at,g.printed_at,g.sent_at,m.deadline,g.current_upload_id
 from public.gs_profiles p left join public.gs_units u on u.id=p.unit_id
 left join public.gs_guides g on g.user_id=p.id and g.unit_id=p.unit_id and g.reference=p_reference
 left join public.gs_months m on m.unit_id=p.unit_id and m.reference=p_reference
 where public.gs_actor() is not null order by p.name
$$;
create function public.gs_users() returns table(id uuid,name text,email text,role text,unit_id uuid,crm text,created_at timestamptz)
language sql stable security definer set search_path='' as $$
 select p.id,p.name,u.email::text,p.role,p.unit_id,p.crm,p.created_at from public.gs_profiles p join public.gs_accounts u on u.id=p.id where public.gs_is_master() order by p.name
$$;
-- Defense in depth. The database is not exposed to browsers; Functions own the connection.
-- RLS also protects restricted PostgreSQL roles if granted SELECT later.
alter table public.gs_accounts enable row level security;
alter table public.gs_units enable row level security;
alter table public.gs_profiles enable row level security;
alter table public.gs_requests enable row level security;
alter table public.gs_months enable row level security;
alter table public.gs_guides enable row level security;
alter table public.gs_uploads enable row level security;
alter table public.gs_batches enable row level security;
alter table public.gs_events enable row level security;
create policy gs_units_read on public.gs_units for select using(public.gs_actor() is not null);
create policy gs_profiles_read on public.gs_profiles for select using(id=public.gs_actor() or public.gs_can_manage(unit_id));
create policy gs_requests_read on public.gs_requests for select using(user_id=public.gs_actor() or public.gs_can_manage(unit_id));
create policy gs_months_read on public.gs_months for select using(public.gs_actor() is not null);
create policy gs_guides_read on public.gs_guides for select using(user_id=public.gs_actor() or public.gs_can_manage(unit_id));
create policy gs_uploads_read on public.gs_uploads for select using(user_id=public.gs_actor() or public.gs_can_manage(unit_id));
create policy gs_batches_read on public.gs_batches for select using(public.gs_can_manage(unit_id));
create policy gs_events_read on public.gs_events for select using(actor=public.gs_actor() or public.gs_can_manage(unit_id) or public.gs_is_master());
revoke all on public.gs_accounts,public.gs_units,public.gs_profiles,public.gs_requests,public.gs_months,public.gs_guides,public.gs_uploads,public.gs_batches,public.gs_events from public;
do $$ declare f record; begin
 for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'gs\_%' escape '\' loop
 execute format('revoke all on function %s from public',f.sig);
 end loop;
end $$;
commit;
