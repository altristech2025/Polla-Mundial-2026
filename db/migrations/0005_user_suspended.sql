-- Soft-suspend cosmético: admin puede retirar momentáneamente a un pana
-- ("Vetado por Huevón"). Sigue logueado y editando; solo desaparece de
-- /resultados y del ranking público. Sus predicciones y total_score quedan
-- intactos. Default false para los 10 panas existentes.
alter table users add column if not exists is_suspended boolean not null default false;
