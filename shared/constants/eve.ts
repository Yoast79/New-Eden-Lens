export const ESI_BASE_URL = 'https://esi.evetech.net';
export const ESI_DEFAULT_COMPATIBILITY_DATE = '2026-08-18';
export const EVE_SSO_AUTHORIZE_URL = 'https://login.eveonline.com/v2/oauth/authorize';
export const EVE_SSO_TOKEN_URL = 'https://login.eveonline.com/v2/oauth/token';
export const EVE_IMAGE_SERVER = 'https://images.evetech.net';
export const FUZZWORK_DUMP_BASE = 'https://www.fuzzwork.co.uk/dump/latest/csv';

export const TRADE_HUBS = [
  { name: 'Jita IV - Moon 4', shortName: 'Jita', regionId: 10000002, systemId: 30000142, stationId: 60003760 },
  { name: 'Amarr VIII (Oris)', shortName: 'Amarr', regionId: 10000043, systemId: 30002187, stationId: 60008494 },
  { name: 'Dodixie IX - Moon 20', shortName: 'Dodixie', regionId: 10000032, systemId: 30002659, stationId: 60011866 },
  { name: 'Rens VI - Moon 8', shortName: 'Rens', regionId: 10000030, systemId: 30002510, stationId: 60004588 },
  { name: 'Hek VIII - Moon 12', shortName: 'Hek', regionId: 10000042, systemId: 30002053, stationId: 60005686 }
] as const;

export const DEFAULT_ESI_SCOPES = [
  'publicData',
  'esi-location.read_location.v1',
  'esi-location.read_ship_type.v1',
  'esi-location.read_online.v1',
  'esi-skills.read_skills.v1',
  'esi-skills.read_skillqueue.v1',
  'esi-wallet.read_character_wallet.v1',
  'esi-wallet.read_corporation_wallets.v1',
  'esi-assets.read_assets.v1',
  'esi-assets.read_corporation_assets.v1',
  'esi-clones.read_clones.v1',
  'esi-clones.read_implants.v1',
  'esi-fittings.read_fittings.v1',
  'esi-fittings.write_fittings.v1',
  'esi-ui.write_waypoint.v1',
  'esi-ui.open_window.v1',
  'esi-markets.read_character_orders.v1',
  'esi-markets.read_corporation_orders.v1',
  'esi-markets.structure_markets.v1',
  'esi-contracts.read_character_contracts.v1',
  'esi-contracts.read_corporation_contracts.v1',
  'esi-characters.read_contacts.v1',
  'esi-characters.read_loyalty.v1',
  'esi-characters.read_standings.v1',
  'esi-characters.read_notifications.v1',
  'esi-characters.read_fatigue.v1',
  'esi-characters.read_blueprints.v1',
  'esi-characters.read_corporation_roles.v1',
  'esi-corporations.read_contacts.v1',
  'esi-corporations.read_structures.v1',
  'esi-corporations.read_standings.v1',
  'esi-alliances.read_contacts.v1',
  'esi-universe.read_structures.v1',
  'esi-fleets.read_fleet.v1',
  'esi-fleets.write_fleet.v1',
  'esi-mail.read_mail.v1',
  'esi-mail.send_mail.v1',
  'esi-mail.organize_mail.v1',
  'esi-industry.read_character_jobs.v1',
  'esi-industry.read_character_mining.v1',
  'esi-planets.manage_planets.v1',
  'esi-killmails.read_killmails.v1',
  'esi-search.search_structures.v1'
] as const;

export type FactionThemeId =
  | 'photon'
  | 'amarr'
  | 'caldari'
  | 'gallente'
  | 'minmatar'
  | 'triglavian'
  | 'soe';

export interface FactionThemeMeta {
  id: FactionThemeId;
  name: string;
  subtitle: string;
  swatch: string;
  secondarySwatch: string;
}

export const FACTION_THEMES: FactionThemeMeta[] = [
  { id: 'photon', name: 'Photon Dark', subtitle: 'Standard Capsuleer Slate & Cyan', swatch: '#00F0FF', secondarySwatch: '#131822' },
  { id: 'caldari', name: 'Caldari State', subtitle: 'Corporate Steel & Ice Blue', swatch: '#4CC3FF', secondarySwatch: '#111A24' },
  { id: 'amarr', name: 'Amarr Empire', subtitle: 'Imperial Gold & Obsidian', swatch: '#E5A93C', secondarySwatch: '#19150E' },
  { id: 'gallente', name: 'Gallente Federation', subtitle: 'Federation Emerald & Teal', swatch: '#2EE59D', secondarySwatch: '#0F1E1A' },
  { id: 'minmatar', name: 'Minmatar Republic', subtitle: 'Tribal Rust & Crimson Amber', swatch: '#E8683C', secondarySwatch: '#1D1210' },
  { id: 'triglavian', name: 'Triglavian Collective', subtitle: 'Abyssal Crimson & Void', swatch: '#FF2A4B', secondarySwatch: '#180E12' },
  { id: 'soe', name: 'Sisters of EVE', subtitle: 'Sanctuary Arctic & Ivory', swatch: '#7AE0FF', secondarySwatch: '#141D24' }
];

