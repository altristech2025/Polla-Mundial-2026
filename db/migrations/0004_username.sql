-- Cambia auth de email→username. Email queda opcional para compatibilidad.
alter table users add column if not exists username text;
alter table users alter column email drop not null;
create unique index if not exists users_username_uniq on users (lower(username));
