-- =============================================================================
-- Даймохк — обновление 78: справочник машин для анкеты таксиста
-- -----------------------------------------------------------------------------
-- п.3 замечаний 23.08: в анкете таксиста марка машины выбирается из
-- справочника с подсказками; если машины нет в списке — галочка
-- «моей машины нет в списке», ручной ввод уходит в предложения,
-- админ в разделе «Марки» добавляет его в базу.
-- Идемпотентно.
-- =============================================================================
set lock_timeout = '5s';

create table if not exists public.car_brands (
  id integer generated always as identity primary key,
  name text not null,
  is_active boolean not null default true,
  constraint car_brands_name_unique unique (name)
);

create table if not exists public.car_brand_suggestions (
  id integer generated always as identity primary key,
  name text not null,
  driver_id uuid references public.user_profiles(id) on delete set null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint car_suggestions_status_known check (status in ('pending', 'approved', 'rejected'))
);

alter table public.car_brands enable row level security;
drop policy if exists "car brands public read" on public.car_brands;
create policy "car brands public read" on public.car_brands for select using (true);

alter table public.car_brand_suggestions enable row level security;
drop policy if exists "car suggestions self insert" on public.car_brand_suggestions;
create policy "car suggestions self insert"
  on public.car_brand_suggestions for insert
  with check (auth.uid() = driver_id);
drop policy if exists "car suggestions read" on public.car_brand_suggestions;
create policy "car suggestions read"
  on public.car_brand_suggestions for select
  using (auth.uid() = driver_id or is_admin_email());

-- Стартовый справочник: то, что реально встречается у таксистов.
-- Повторный прогон не дублирует (on conflict do nothing).
insert into public.car_brands (name) values
  ('Lada Granta'), ('Lada Vesta'), ('Lada Priora'), ('Lada Kalina'),
  ('Lada Largus'), ('Lada Niva Legend'), ('Lada Niva Travel'), ('Lada XRAY'),
  ('ГАЗель Next'), ('ГАЗель Бизнес'), ('Соболь'), ('УАЗ Патриот'),
  ('УАЗ Хантер'), ('УАЗ СГР («буханка»)'), ('УАЗ Профи'),
  ('Toyota Camry'), ('Toyota Corolla'), ('Toyota RAV4'), ('Toyota Land Cruiser 200'),
  ('Toyota Land Cruiser Prado'), ('Toyota Avensis'), ('Toyota Carina'),
  ('Hyundai Solaris'), ('Hyundai Creta'), ('Hyundai Tucson'), ('Hyundai Santa Fe'),
  ('Hyundai Elantra'), ('Hyundai Accent'),
  ('Kia Rio'), ('Kia Ceed'), ('Kia Sportage'), ('Kia Sorento'), ('Kia Optima'), ('Kia Picanto'),
  ('Renault Logan'), ('Renault Sandero'), ('Renault Duster'), ('Renault Arkana'),
  ('Renault Kaptur'), ('Renault Megane'),
  ('Volkswagen Polo'), ('Volkswagen Tiguan'), ('Volkswagen Passat'), ('Volkswagen Jetta'),
  ('Volkswagen Golf'), ('Volkswagen Transporter'),
  ('Skoda Rapid'), ('Skoda Octavia'), ('Skoda Kodiaq'), ('Skoda Superb'), ('Skoda Yeti'),
  ('Chevrolet Niva'), ('Chevrolet Cruze'), ('Chevrolet Cobalt'), ('Chevrolet Aveo'), ('Chevrolet Lacetti'),
  ('Nissan Almera'), ('Nissan Qashqai'), ('Nissan X-Trail'), ('Nissan Terrano'), ('Nissan Note'), ('Nissan Sentra'),
  ('Mitsubishi Lancer'), ('Mitsubishi Outlander'), ('Mitsubishi ASX'), ('Mitsubishi Pajero Sport'),
  ('Ford Focus'), ('Ford Mondeo'), ('Ford Kuga'), ('Ford Fiesta'), ('Ford EcoSport'), ('Ford Transit'),
  ('Mazda 3'), ('Mazda 6'), ('Mazda CX-5'), ('Mazda CX-7'),
  ('Mercedes-Benz C-класса'), ('Mercedes-Benz E-класса'), ('Mercedes-Benz GLC'), ('Mercedes-Benz Vito'), ('Mercedes-Benz Sprinter'),
  ('BMW 3 серии'), ('BMW 5 серии'), ('BMW X3'), ('BMW X5'),
  ('Audi A4'), ('Audi A6'), ('Audi Q5'), ('Audi Q7'),
  ('Honda Civic'), ('Honda CR-V'), ('Honda Pilot'), ('Honda Accord'),
  ('Subaru Impreza'), ('Subaru Forester'), ('Subaru Outback'),
  ('Suzuki Swift'), ('Suzuki SX4'), ('Suzuki Vitara'), ('Suzuki Grand Vitara'),
  ('Peugeot 308'), ('Peugeot 408'), ('Peugeot Partner'), ('Peugeot Boxer'),
  ('Citroen C4'), ('Citroen Berlingo'), ('Citroen Jumper'),
  ('Fiat Ducato'), ('Fiat Albea'), ('Fiat Doblo'),
  ('Opel Astra'), ('Opel Insignia'), ('Opel Corsa'), ('Opel Mokka'), ('Opel Zafira'),
  ('Chery Tiggo'), ('Chery Tiggo 4'), ('Chery Tiggo 7 Pro'), ('Chery Arrizo'),
  ('Geely Coolray'), ('Geely Monjaro'), ('Geely Atlas'), ('Geely Emgrand'),
  ('Haval Jolion'), ('Haval F7'), ('Haval H9'), ('Haval M6'),
  ('Great Wall Poer'), ('Tank 300'),
  ('SsangYong Actyon'), ('SsangYong Kyron'),
  ('Lifan X60'), ('Lifan Solano'),
  ('Ravon R4'), ('Ravon Nexia'),
  ('Daewoo Nexia'), ('Daewoo Matiz'), ('Daewoo Gentra')
on conflict (name) do nothing;
