-- v2: tracking de pago y fechas movidas
--   lock: 9 jun 23:59 (2 días antes del Mundial)
--   reveal: 10 jun 00:00 (1 día antes del Mundial)
--   has_paid en users (admin toggle)

alter table users add column if not exists has_paid boolean not null default false;

update app_config set
  predictions_lock_at = '2026-06-09T23:59:00-05:00',
  reveal_at = '2026-06-10T00:00:00-05:00'
where id = 1;
