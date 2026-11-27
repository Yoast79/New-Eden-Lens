PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS module_configs (
  module_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL,
  settings_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS eve_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS characters (
  character_id INTEGER PRIMARY KEY,
  character_name TEXT NOT NULL,
  corporation_id INTEGER,
  alliance_id INTEGER,
  account_id INTEGER REFERENCES eve_accounts(id) ON DELETE SET NULL,
  description TEXT NOT NULL DEFAULT '',
  accent_color TEXT NOT NULL DEFAULT '',
  access_token_enc BLOB,
  refresh_token_enc BLOB NOT NULL,
  token_expires_at INTEGER NOT NULL,
  scopes TEXT NOT NULL,
  attributes_json TEXT,
  is_main INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  added_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS wallet_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES characters(character_id) ON DELETE CASCADE,
  balance REAL NOT NULL,
  estimated_asset_value REAL NOT NULL DEFAULT 0,
  captured_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wallet_snap_char_time ON wallet_snapshots(character_id, captured_at);

CREATE TABLE IF NOT EXISTS wallet_journal (
  character_id INTEGER NOT NULL REFERENCES characters(character_id) ON DELETE CASCADE,
  journal_id INTEGER NOT NULL,
  date INTEGER NOT NULL,
  ref_type TEXT NOT NULL,
  amount REAL NOT NULL,
  balance REAL,
  first_party_id INTEGER,
  second_party_id INTEGER,
  reason TEXT,
  PRIMARY KEY (character_id, journal_id)
);

CREATE TABLE IF NOT EXISTS character_assets (
  character_id INTEGER NOT NULL REFERENCES characters(character_id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL,
  type_id INTEGER NOT NULL,
  location_id INTEGER NOT NULL,
  location_type TEXT NOT NULL,
  location_flag TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  is_singleton INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (character_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_assets_char_type ON character_assets(character_id, type_id);

CREATE TABLE IF NOT EXISTS character_skills (
  character_id INTEGER NOT NULL REFERENCES characters(character_id) ON DELETE CASCADE,
  skill_id INTEGER NOT NULL,
  active_skill_level INTEGER NOT NULL,
  trained_skill_level INTEGER NOT NULL,
  skillpoints_in_skill INTEGER NOT NULL,
  PRIMARY KEY (character_id, skill_id)
);

CREATE TABLE IF NOT EXISTS character_skill_meta (
  character_id INTEGER PRIMARY KEY REFERENCES characters(character_id) ON DELETE CASCADE,
  total_sp INTEGER NOT NULL DEFAULT 0,
  unallocated_sp INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS skill_queue (
  character_id INTEGER NOT NULL REFERENCES characters(character_id) ON DELETE CASCADE,
  queue_position INTEGER NOT NULL,
  skill_id INTEGER NOT NULL,
  finished_level INTEGER NOT NULL,
  start_date INTEGER,
  finish_date INTEGER,
  training_start_sp INTEGER,
  level_start_sp INTEGER,
  level_end_sp INTEGER,
  PRIMARY KEY (character_id, queue_position)
);

CREATE TABLE IF NOT EXISTS character_clones (
  character_id INTEGER PRIMARY KEY REFERENCES characters(character_id) ON DELETE CASCADE,
  home_location_id INTEGER,
  last_clone_jump_date INTEGER,
  active_implants_json TEXT NOT NULL DEFAULT '[]',
  jump_clones_json TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS character_fittings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER REFERENCES characters(character_id) ON DELETE CASCADE,
  esi_fitting_id INTEGER,
  name TEXT NOT NULL,
  ship_type_id INTEGER NOT NULL,
  description TEXT,
  eft_text TEXT NOT NULL,
  items_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sde_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sde_regions (
  region_id INTEGER PRIMARY KEY,
  region_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sde_constellations (
  constellation_id INTEGER PRIMARY KEY,
  region_id INTEGER NOT NULL,
  constellation_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sde_solar_systems (
  solar_system_id INTEGER PRIMARY KEY,
  region_id INTEGER NOT NULL,
  constellation_id INTEGER NOT NULL,
  solar_system_name TEXT NOT NULL,
  security REAL NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  z REAL NOT NULL,
  sun_type_id INTEGER,
  wormhole_class INTEGER,
  wormhole_effect TEXT
);
CREATE INDEX IF NOT EXISTS idx_sde_sys_name ON sde_solar_systems(solar_system_name);

CREATE TABLE IF NOT EXISTS sde_stargates (
  from_solar_system_id INTEGER NOT NULL,
  to_solar_system_id INTEGER NOT NULL,
  PRIMARY KEY (from_solar_system_id, to_solar_system_id)
);

CREATE TABLE IF NOT EXISTS sde_inv_categories (
  category_id INTEGER PRIMARY KEY,
  category_name TEXT NOT NULL,
  published INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sde_inv_groups (
  group_id INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL,
  group_name TEXT NOT NULL,
  published INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sde_inv_types (
  type_id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL,
  type_name TEXT NOT NULL,
  description TEXT,
  mass REAL,
  volume REAL,
  packaged_volume REAL,
  capacity REAL,
  market_group_id INTEGER,
  published INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sde_type_name ON sde_inv_types(type_name);

CREATE TABLE IF NOT EXISTS sde_dogma_attributes (
  attribute_id INTEGER PRIMARY KEY,
  attribute_name TEXT NOT NULL,
  display_name TEXT,
  unit_id INTEGER,
  stackable INTEGER,
  high_is_good INTEGER
);

CREATE TABLE IF NOT EXISTS sde_type_dogma_attributes (
  type_id INTEGER NOT NULL,
  attribute_id INTEGER NOT NULL,
  value REAL NOT NULL,
  PRIMARY KEY (type_id, attribute_id)
);

CREATE TABLE IF NOT EXISTS sde_dogma_effects (
  effect_id INTEGER PRIMARY KEY,
  effect_name TEXT NOT NULL,
  effect_category INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sde_type_dogma_effects (
  type_id INTEGER NOT NULL,
  effect_id INTEGER NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (type_id, effect_id)
);

CREATE TABLE IF NOT EXISTS market_orders_cache (
  region_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL,
  type_id INTEGER NOT NULL,
  is_buy_order INTEGER NOT NULL,
  price REAL NOT NULL,
  volume_remain INTEGER NOT NULL,
  min_volume INTEGER NOT NULL,
  location_id INTEGER NOT NULL,
  system_id INTEGER NOT NULL,
  issued TEXT NOT NULL,
  duration INTEGER NOT NULL,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (region_id, order_id)
);
CREATE INDEX IF NOT EXISTS idx_market_region_type ON market_orders_cache(region_id, type_id, is_buy_order);

CREATE TABLE IF NOT EXISTS market_history_cache (
  region_id INTEGER NOT NULL,
  type_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  average REAL NOT NULL,
  highest REAL NOT NULL,
  lowest REAL NOT NULL,
  order_count INTEGER NOT NULL,
  volume INTEGER NOT NULL,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (region_id, type_id, date)
);

CREATE TABLE IF NOT EXISTS market_investments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER REFERENCES characters(character_id) ON DELETE SET NULL,
  type_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  buy_price REAL NOT NULL,
  target_region_id INTEGER NOT NULL DEFAULT 10000002,
  broker_fee_pct REAL NOT NULL DEFAULT 3.0,
  sales_tax_pct REAL NOT NULL DEFAULT 3.6,
  status TEXT NOT NULL DEFAULT 'HOLDING',
  sold_price REAL,
  notes TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS system_activity_cache (
  solar_system_id INTEGER PRIMARY KEY,
  ship_kills INTEGER NOT NULL DEFAULT 0,
  pod_kills INTEGER NOT NULL DEFAULT 0,
  npc_kills INTEGER NOT NULL DEFAULT 0,
  ship_jumps INTEGER NOT NULL DEFAULT 0,
  sov_alliance_id INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS system_notes (
  solar_system_id INTEGER PRIMARY KEY,
  has_ice_belt INTEGER NOT NULL DEFAULT 0,
  timer_label TEXT,
  timer_expires_at INTEGER,
  note TEXT
);

CREATE TABLE IF NOT EXISTS station_services_cache (
  station_id INTEGER PRIMARY KEY,
  solar_system_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  services_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_station_services_sys ON station_services_cache(solar_system_id);

CREATE TABLE IF NOT EXISTS saved_routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  waypoints_json TEXT NOT NULL,
  avoid_systems_json TEXT NOT NULL DEFAULT '[]',
  avoid_regions_json TEXT NOT NULL DEFAULT '[]',
  security_mode TEXT NOT NULL DEFAULT 'shortest',
  share_code TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS manual_standings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_name TEXT NOT NULL UNIQUE,
  standing REAL NOT NULL,
  source_label TEXT NOT NULL DEFAULT 'Manual',
  notes TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS manual_structures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  structure_type TEXT NOT NULL,
  solar_system_id INTEGER NOT NULL,
  timer_kind TEXT NOT NULL DEFAULT 'Armor',
  expires_at INTEGER NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS jump_gates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_system_id INTEGER NOT NULL,
  to_system_id INTEGER NOT NULL,
  bidirectional INTEGER NOT NULL DEFAULT 1,
  label TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  UNIQUE(from_system_id, to_system_id)
);

CREATE TABLE IF NOT EXISTS fleet_compositions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS fleet_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fleet_id INTEGER NOT NULL REFERENCES fleet_compositions(id) ON DELETE CASCADE,
  fitting_id INTEGER REFERENCES character_fittings(id) ON DELETE SET NULL,
  ship_type_id INTEGER NOT NULL,
  fit_name TEXT NOT NULL,
  role_label TEXT NOT NULL DEFAULT 'DPS',
  quantity INTEGER NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS killmails (
  killmail_id INTEGER PRIMARY KEY,
  killmail_time INTEGER NOT NULL,
  solar_system_id INTEGER NOT NULL,
  victim_character_id INTEGER,
  victim_corporation_id INTEGER,
  victim_alliance_id INTEGER,
  victim_ship_type_id INTEGER NOT NULL,
  total_value REAL NOT NULL DEFAULT 0,
  attacker_count INTEGER NOT NULL DEFAULT 0,
  is_npc INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_km_time_sys ON killmails(killmail_time DESC, solar_system_id);
CREATE INDEX IF NOT EXISTS idx_km_ship ON killmails(victim_ship_type_id);

CREATE TABLE IF NOT EXISTS kill_watchlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_kind TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  audio_alert INTEGER NOT NULL DEFAULT 1,
  desktop_notify INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS kill_tracker_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  origin_system_id INTEGER,
  origin_system_name TEXT,
  max_jumps INTEGER,
  role_filter TEXT NOT NULL DEFAULT 'both',
  sec_filter TEXT NOT NULL DEFAULT 'all',
  activity_filter TEXT NOT NULL DEFAULT 'all',
  entity_match_mode TEXT NOT NULL DEFAULT 'any',
  min_isk REAL NOT NULL DEFAULT 0,
  audio_alert INTEGER NOT NULL DEFAULT 1,
  desktop_notify INTEGER NOT NULL DEFAULT 1,
  is_popout_active INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS kill_tracker_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES kill_tracker_groups(id) ON DELETE CASCADE,
  match_kind TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  target_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kill_group_hits (
  group_id INTEGER NOT NULL REFERENCES kill_tracker_groups(id) ON DELETE CASCADE,
  killmail_id INTEGER NOT NULL REFERENCES killmails(killmail_id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, killmail_id)
);

CREATE TABLE IF NOT EXISTS wh_maps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS wh_nodes (
  map_id INTEGER NOT NULL REFERENCES wh_maps(id) ON DELETE CASCADE,
  solar_system_id INTEGER NOT NULL,
  pos_x REAL NOT NULL,
  pos_y REAL NOT NULL,
  custom_label TEXT,
  notes TEXT,
  PRIMARY KEY (map_id, solar_system_id)
);

CREATE TABLE IF NOT EXISTS wh_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  map_id INTEGER NOT NULL REFERENCES wh_maps(id) ON DELETE CASCADE,
  source_system_id INTEGER NOT NULL,
  target_system_id INTEGER NOT NULL,
  wh_type TEXT,
  mass_status TEXT NOT NULL DEFAULT 'stable',
  time_status TEXT NOT NULL DEFAULT 'normal',
  created_at INTEGER NOT NULL,
  UNIQUE(map_id, source_system_id, target_system_id)
);

CREATE TABLE IF NOT EXISTS wh_signatures (
  map_id INTEGER NOT NULL REFERENCES wh_maps(id) ON DELETE CASCADE,
  solar_system_id INTEGER NOT NULL,
  sig_id TEXT NOT NULL,
  sig_group TEXT NOT NULL,
  sig_type TEXT,
  name TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (map_id, solar_system_id, sig_id)
);

CREATE TABLE IF NOT EXISTS market_global_prices (
  type_id INTEGER PRIMARY KEY,
  average_price REAL NOT NULL DEFAULT 0,
  adjusted_price REAL NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS location_names_cache (
  location_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS character_asset_names (
  character_id INTEGER NOT NULL REFERENCES characters(character_id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (character_id, item_id)
);

