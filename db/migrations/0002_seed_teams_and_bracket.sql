-- Polla Mundial 2026 — Seed equipos y bracket P73-P104

-- 48 equipos: 3 anfitriones + 45 placeholders
do $$
declare
  v_groups char(1)[] := array['A','B','C','D','E','F','G','H','I','J','K','L'];
  v_g char(1);
  v_pos smallint;
  v_name text;
  v_code text;
  v_is_placeholder boolean;
begin
  foreach v_g in array v_groups loop
    for v_pos in 1..4 loop
      v_code := 'TBD-' || v_g || v_pos;
      v_name := 'Equipo ' || v_g || v_pos;
      v_is_placeholder := true;

      if v_g = 'A' and v_pos = 1 then
        v_code := 'MEX'; v_name := 'México'; v_is_placeholder := false;
      elsif v_g = 'B' and v_pos = 1 then
        v_code := 'CAN'; v_name := 'Canadá'; v_is_placeholder := false;
      elsif v_g = 'D' and v_pos = 1 then
        v_code := 'USA'; v_name := 'Estados Unidos'; v_is_placeholder := false;
      end if;

      insert into teams (code, name, group_letter, group_position, is_placeholder)
      values (v_code, v_name, v_g, v_pos, v_is_placeholder);
    end loop;
  end loop;
end $$;

-- Bracket P73-P104 (PDF)
insert into bracket_matches (match_code, round, match_date, venue, slot_spec) values
  ('P73', 'R32', '2026-06-28', 'Los Ángeles', '2°A vs 2°B'),
  ('P74', 'R32', '2026-06-28', 'Boston',      '1°E vs 3°A/B/C/D/F'),
  ('P75', 'R32', '2026-06-29', 'Monterrey',   '1°F vs 2°C'),
  ('P76', 'R32', '2026-06-29', 'Houston',     '1°C vs 2°F'),
  ('P77', 'R32', '2026-06-29', 'N.Y. / N.J.', '1°I vs 3°C/D/F/G/H'),
  ('P78', 'R32', '2026-06-30', 'Dallas',      '2°E vs 2°I'),
  ('P79', 'R32', '2026-06-30', 'CDMX',        '1°A vs 3°C/E/F/H/I'),
  ('P80', 'R32', '2026-06-30', 'Atlanta',     '1°L vs 3°E/H/I/J/K'),
  ('P81', 'R32', '2026-07-01', 'San Francisco','1°D vs 3°B/E/F/I/J'),
  ('P82', 'R32', '2026-07-01', 'Seattle',     '1°G vs 3°A/E/H/I/J'),
  ('P83', 'R32', '2026-07-01', 'Toronto',     '2°K vs 2°L'),
  ('P84', 'R32', '2026-07-02', 'Los Ángeles', '1°H vs 2°J'),
  ('P85', 'R32', '2026-07-02', 'Vancouver',   '1°B vs 3°E/F/G/I/J'),
  ('P86', 'R32', '2026-07-02', 'Miami',       '1°J vs 2°H'),
  ('P87', 'R32', '2026-07-03', 'Kansas City', '1°K vs 3°D/E/I/J/L'),
  ('P88', 'R32', '2026-07-03', 'Dallas',      '2°D vs 2°G'),
  ('P89', 'R16', '2026-07-04', 'Filadelfia',  'Ganador P74 vs Ganador P77'),
  ('P90', 'R16', '2026-07-04', 'Houston',     'Ganador P73 vs Ganador P75'),
  ('P91', 'R16', '2026-07-05', 'N.Y. / N.J.', 'Ganador P76 vs Ganador P78'),
  ('P92', 'R16', '2026-07-05', 'CDMX',        'Ganador P79 vs Ganador P80'),
  ('P93', 'R16', '2026-07-06', 'Vancouver',   'Ganador P83 vs Ganador P84'),
  ('P94', 'R16', '2026-07-06', 'Seattle',     'Ganador P81 vs Ganador P82'),
  ('P95', 'R16', '2026-07-07', 'Atlanta',     'Ganador P86 vs Ganador P88'),
  ('P96', 'R16', '2026-07-07', 'Miami',       'Ganador P85 vs Ganador P87'),
  ('P97',  'QF', '2026-07-09', 'Boston',      'Ganador P89 vs Ganador P90'),
  ('P98',  'QF', '2026-07-10', 'Los Ángeles', 'Ganador P91 vs Ganador P92'),
  ('P99',  'QF', '2026-07-11', 'Kansas City', 'Ganador P93 vs Ganador P94'),
  ('P100', 'QF', '2026-07-11', 'Miami',       'Ganador P95 vs Ganador P96'),
  ('P101', 'SF', '2026-07-14', 'Dallas',      'Ganador P97 vs Ganador P98'),
  ('P102', 'SF', '2026-07-15', 'Atlanta',     'Ganador P99 vs Ganador P100'),
  ('P103', '3RD',   '2026-07-18', 'Miami',       'Perdedor P101 vs Perdedor P102'),
  ('P104', 'FINAL', '2026-07-19', 'N.Y. / N.J.', 'Ganador P101 vs Ganador P102');

-- 72 group matches (round-robin estándar)
do $$
declare
  v_groups char(1)[] := array['A','B','C','D','E','F','G','H','I','J','K','L'];
  v_g char(1);
  v_idx int;
  v_t1 uuid; v_t2 uuid; v_t3 uuid; v_t4 uuid;
  v_md1 date; v_md2 date; v_md3 date;
begin
  for v_idx in 1..array_length(v_groups, 1) loop
    v_g := v_groups[v_idx];
    select id into v_t1 from teams where group_letter = v_g and group_position = 1;
    select id into v_t2 from teams where group_letter = v_g and group_position = 2;
    select id into v_t3 from teams where group_letter = v_g and group_position = 3;
    select id into v_t4 from teams where group_letter = v_g and group_position = 4;

    v_md1 := date '2026-06-11' + ((v_idx - 1) % 6);
    v_md2 := date '2026-06-17' + ((v_idx - 1) % 6);
    v_md3 := date '2026-06-23' + ((v_idx - 1) % 5);

    insert into group_matches (group_letter, match_day, match_date, home_team_id, away_team_id) values
      (v_g, 1, v_md1, v_t1, v_t2),
      (v_g, 1, v_md1, v_t3, v_t4),
      (v_g, 2, v_md2, v_t1, v_t3),
      (v_g, 2, v_md2, v_t4, v_t2),
      (v_g, 3, v_md3, v_t4, v_t1),
      (v_g, 3, v_md3, v_t2, v_t3);
  end loop;
end $$;
