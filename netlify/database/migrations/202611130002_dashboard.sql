-- Dashboard da unidade: inclui CRM/RQE, folhas da guia e prazo padrão.
-- Sem prazo definido pela administração, vale o último dia do mês de referência.
-- member_since permite não cobrar meses anteriores ao cadastro do médico.
-- Aplicada automaticamente pelo Netlify no deploy; a plataforma controla a transação.
drop function public.gs_dashboard(date);
create function public.gs_dashboard(p_reference date) returns table(
 user_id uuid,name text,crm text,rqe text,unit_id uuid,unit_name text,guide_id uuid,guide_pages integer,total_pages integer,
 generated_at timestamptz,uploaded_at timestamptz,printed_at timestamptz,sent_at timestamptz,deadline date,deadline_custom boolean,current_upload_id uuid,member_since timestamptz
) language sql stable security definer set search_path='' as $$
 select p.id,p.name,p.crm,p.rqe,p.unit_id,u.name,g.id,g.guide_pages,g.total_pages,
        g.generated_at,g.uploaded_at,g.printed_at,g.sent_at,
        coalesce(m.deadline,(p_reference+interval '1 month'-interval '1 day')::date),m.deadline is not null,g.current_upload_id,p.created_at
 from public.gs_profiles p left join public.gs_units u on u.id=p.unit_id
 left join public.gs_guides g on g.user_id=p.id and g.unit_id=p.unit_id and g.reference=p_reference
 left join public.gs_months m on m.unit_id=p.unit_id and m.reference=p_reference
 where public.gs_actor() is not null order by p.name
$$;
revoke all on function public.gs_dashboard(date) from public;
