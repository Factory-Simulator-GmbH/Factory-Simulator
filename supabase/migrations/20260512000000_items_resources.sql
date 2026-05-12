-- Items
create table public.items (
  id                   text primary key,
  type                 text not null,
  label                text not null,
  size                 text not null,
  help_text            text not null,
  max_available_count  integer,
  spawning_resource    text,
  rate                 integer,
  input                jsonb,
  output               text
);

insert into public.items (id, type, label, size, help_text, spawning_resource, rate) values
  ('Spawner1', 'spawner', 'Metall Spawner',  'large', '<strong>Spawner</strong><br>Erzeugt neue Ressourcen (Metall).',  'metall',  1000),
  ('Spawner2', 'spawner', 'Kupfer Spawner',  'large', '<strong>Spawner</strong><br>Erzeugt neue Ressourcen (Kupfer).',  'kupfer',  7000),
  ('Spawner3', 'spawner', 'Plastik Spawner', 'large', '<strong>Spawner</strong><br>Erzeugt neue Ressourcen (Plastik).', 'plastik', 10000);

insert into public.items (id, type, label, size, help_text, input, output) values
  ('maschine1', 'machine', 'Metallpresse',          'large', '<strong>Metallpresse – Maschine</strong><br>Verarbeitet Metall zu Gehäusen.<br>Benötigt mindestens eine Input- und eine Output-Seite.<br><strong>Rezept:</strong><br><p>5x Metall → 1x Gehäuse</p>',                                '{"metall": 5}',                 'gehäuse'),
  ('maschine2', 'machine', 'Kabelmaschine',         'large', '<strong>Kabelmaschine – Maschine</strong><br>Verarbeitet Kupfer zu Kabeln.<br>Benötigt mindestens eine Input- und eine Output-Seite.<br><strong>Rezept:</strong><br><p>1x Kupfer → 1x Kabel</p>',                                  '{"kupfer": 1}',                 'kabel'),
  ('maschine3', 'machine', 'Leiterplattenfertigung','large', '<strong>Leiterplattenfertigung – Maschine</strong><br>Verarbeitet Kupfer und Plastik zu Leiterplatten.<br>Benötigt mindestens eine Input- und eine Output-Seite.<br><strong>Rezept:</strong><br><p>1x Kupfer + 2x Plastik → 1x Leiterplatte</p>', '{"kupfer": 1, "plastik": 2}',   'leiterplatte'),
  ('maschine4', 'machine', 'Elektronikmontage',     'large', '<strong>Elektronikmontage – Maschine</strong><br>Verarbeitet Kabel und Leiterplatten zu Elektronik.<br>Benötigt mindestens eine Input- und eine Output-Seite.<br><strong>Rezept:</strong><br><p>5x Kabel + 3x Leiterplatte → 1x Elektronik</p>', '{"kabel": 5, "leiterplatte": 3}', 'elektronik'),
  ('maschine5', 'machine', 'PC-Montage',            'large', '<strong>PC-Montage – Maschine</strong><br>Verarbeitet Elektronik und Gehäuse zu PCs.<br>Benötigt mindestens eine Input- und eine Output-Seite.<br><strong>Rezept:</strong><br><p>2x Elektronik + 1x Gehäuse → 1x PC</p>',            '{"elektronik": 2, "gehäuse": 1}', 'pc');

insert into public.items (id, type, label, size, help_text, max_available_count) values
  ('input',  'input',  'Input',  'small', '<strong>Input-Modul</strong><br>Schnittstelle für den Ressourcen-Austausch zwischen Förderbändern und Maschinen.',  5),
  ('output', 'output', 'Output', 'small', '<strong>Output-Modul</strong><br>Schnittstelle für den Ressourcen-Austausch zwischen Förderbändern und Maschinen.', 7);

-- Resources
create table public.resources (
  id    text primary key,
  label text not null
);

insert into public.resources (id, label) values
  ('metall',  'Metall'),
  ('kupfer',  'Kupfer'),
  ('plastik', 'Plastik');

-- RLS
alter table public.items enable row level security;
create policy "items öffentlich lesbar" on public.items for select using (true);

alter table public.resources enable row level security;
create policy "resources öffentlich lesbar" on public.resources for select using (true);
