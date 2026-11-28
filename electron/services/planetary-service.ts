import type {
  PlanetaryColonyDto,
  PlanetaryCommodityProfitDto,
  PlanetaryExtractorDto,
  PlanetaryOverviewDto,
  PlanetaryStorageDto
} from '@shared/types/modules-data';
import type { LocalDatabase } from '../db/connection';
import type { EsiClient } from './esi-client';
import type { MarketService } from './market-service';

interface PiItemMeta {
  typeId: number;
  name: string;
  tier: 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
  volumeM3: number;
  baseExportValue: number;
}

interface PiSchematicSpec {
  outputTypeId: number;
  outputQty: number;
  cycleTimeSeconds: number;
  inputs: Array<{ typeId: number; quantity: number }>;
}

const PI_ITEMS: Record<number, PiItemMeta> = {
  // P0 (0.01 m3)
  2268: { typeId: 2268, name: 'Aqueous Liquids', tier: 'P0', volumeM3: 0.01, baseExportValue: 5 },
  2305: { typeId: 2305, name: 'Autotrophs', tier: 'P0', volumeM3: 0.01, baseExportValue: 5 },
  2267: { typeId: 2267, name: 'Base Metals', tier: 'P0', volumeM3: 0.01, baseExportValue: 5 },
  2288: { typeId: 2288, name: 'Carbon Compounds', tier: 'P0', volumeM3: 0.01, baseExportValue: 5 },
  2287: { typeId: 2287, name: 'Complex Organisms', tier: 'P0', volumeM3: 0.01, baseExportValue: 5 },
  2307: { typeId: 2307, name: 'Felsic Magma', tier: 'P0', volumeM3: 0.01, baseExportValue: 5 },
  2272: { typeId: 2272, name: 'Heavy Metals', tier: 'P0', volumeM3: 0.01, baseExportValue: 5 },
  2309: { typeId: 2309, name: 'Ionic Solutions', tier: 'P0', volumeM3: 0.01, baseExportValue: 5 },
  2073: { typeId: 2073, name: 'Microorganisms', tier: 'P0', volumeM3: 0.01, baseExportValue: 5 },
  2310: { typeId: 2310, name: 'Noble Gas', tier: 'P0', volumeM3: 0.01, baseExportValue: 5 },
  2270: { typeId: 2270, name: 'Noble Metals', tier: 'P0', volumeM3: 0.01, baseExportValue: 5 },
  2306: { typeId: 2306, name: 'Non-CS Crystals', tier: 'P0', volumeM3: 0.01, baseExportValue: 5 },
  2286: { typeId: 2286, name: 'Planktic Colonies', tier: 'P0', volumeM3: 0.01, baseExportValue: 5 },
  2311: { typeId: 2311, name: 'Reactive Gas', tier: 'P0', volumeM3: 0.01, baseExportValue: 5 },
  2308: { typeId: 2308, name: 'Suspended Plasma', tier: 'P0', volumeM3: 0.01, baseExportValue: 5 },

  // P1 (0.38 m3, POCO base 400 ISK)
  2393: { typeId: 2393, name: 'Bacteria', tier: 'P1', volumeM3: 0.38, baseExportValue: 400 },
  2396: { typeId: 2396, name: 'Biofuels', tier: 'P1', volumeM3: 0.38, baseExportValue: 400 },
  3779: { typeId: 3779, name: 'Biomass', tier: 'P1', volumeM3: 0.38, baseExportValue: 400 },
  2401: { typeId: 2401, name: 'Chiral Structures', tier: 'P1', volumeM3: 0.38, baseExportValue: 400 },
  2390: { typeId: 2390, name: 'Electrolytes', tier: 'P1', volumeM3: 0.38, baseExportValue: 400 },
  2397: { typeId: 2397, name: 'Industrial Fibers', tier: 'P1', volumeM3: 0.38, baseExportValue: 400 },
  2392: { typeId: 2392, name: 'Oxidizing Compound', tier: 'P1', volumeM3: 0.38, baseExportValue: 400 },
  3683: { typeId: 3683, name: 'Oxygen', tier: 'P1', volumeM3: 0.38, baseExportValue: 400 },
  2389: { typeId: 2389, name: 'Plasmoids', tier: 'P1', volumeM3: 0.38, baseExportValue: 400 },
  2399: { typeId: 2399, name: 'Precious Metals', tier: 'P1', volumeM3: 0.38, baseExportValue: 400 },
  2395: { typeId: 2395, name: 'Proteins', tier: 'P1', volumeM3: 0.38, baseExportValue: 400 },
  2398: { typeId: 2398, name: 'Reactive Metals', tier: 'P1', volumeM3: 0.38, baseExportValue: 400 },
  9828: { typeId: 9828, name: 'Silicon', tier: 'P1', volumeM3: 0.38, baseExportValue: 400 },
  2400: { typeId: 2400, name: 'Toxic Metals', tier: 'P1', volumeM3: 0.38, baseExportValue: 400 },
  3645: { typeId: 3645, name: 'Water', tier: 'P1', volumeM3: 0.38, baseExportValue: 400 },

  // P2 (1.5 m3, POCO base 7200 ISK)
  2329: { typeId: 2329, name: 'Biocels', tier: 'P2', volumeM3: 1.5, baseExportValue: 7200 },
  3828: { typeId: 3828, name: 'Construction Blocks', tier: 'P2', volumeM3: 1.5, baseExportValue: 7200 },
  9836: { typeId: 9836, name: 'Consumer Electronics', tier: 'P2', volumeM3: 1.5, baseExportValue: 7200 },
  9832: { typeId: 9832, name: 'Coolant', tier: 'P2', volumeM3: 1.5, baseExportValue: 7200 },
  44: { typeId: 44, name: 'Enriched Uranium', tier: 'P2', volumeM3: 1.5, baseExportValue: 7200 },
  3693: { typeId: 3693, name: 'Fertilizer', tier: 'P2', volumeM3: 1.5, baseExportValue: 7200 },
  15317: { typeId: 15317, name: 'Genetically Enhanced Livestock', tier: 'P2', volumeM3: 1.5, baseExportValue: 7200 },
  9842: { typeId: 9842, name: 'Livestock', tier: 'P2', volumeM3: 1.5, baseExportValue: 7200 },
  9830: { typeId: 9830, name: 'Mechanical Parts', tier: 'P2', volumeM3: 1.5, baseExportValue: 7200 },
  9840: { typeId: 9840, name: 'Microfiber Shielding', tier: 'P2', volumeM3: 1.5, baseExportValue: 7200 },
  3689: { typeId: 3689, name: 'Miniature Electronics', tier: 'P2', volumeM3: 1.5, baseExportValue: 7200 },
  2327: { typeId: 2327, name: 'Nanites', tier: 'P2', volumeM3: 1.5, baseExportValue: 7200 },
  2463: { typeId: 2463, name: 'Oxides', tier: 'P2', volumeM3: 1.5, baseExportValue: 7200 },
  2317: { typeId: 2317, name: 'Polyaramids', tier: 'P2', volumeM3: 1.5, baseExportValue: 7200 },
  2321: { typeId: 2321, name: 'Polytextiles', tier: 'P2', volumeM3: 1.5, baseExportValue: 7200 },
  3695: { typeId: 3695, name: 'Rocket Fuel', tier: 'P2', volumeM3: 1.5, baseExportValue: 7200 },
  9838: { typeId: 9838, name: 'Silicate Glass', tier: 'P2', volumeM3: 1.5, baseExportValue: 7200 },
  9834: { typeId: 9834, name: 'Superconductors', tier: 'P2', volumeM3: 1.5, baseExportValue: 7200 },
  2319: { typeId: 2319, name: 'Supertensile Plastics', tier: 'P2', volumeM3: 1.5, baseExportValue: 7200 },
  2328: { typeId: 2328, name: 'Synthetic Oil', tier: 'P2', volumeM3: 1.5, baseExportValue: 7200 },
  2312: { typeId: 2312, name: 'Test Cultures', tier: 'P2', volumeM3: 1.5, baseExportValue: 7200 },
  3697: { typeId: 3697, name: 'Transmitter', tier: 'P2', volumeM3: 1.5, baseExportValue: 7200 },
  3775: { typeId: 3775, name: 'Viral Agent', tier: 'P2', volumeM3: 1.5, baseExportValue: 7200 },
  3691: { typeId: 3691, name: 'Water-Cooled CPU', tier: 'P2', volumeM3: 1.5, baseExportValue: 7200 },

  // P3 (6.0 m3, POCO base 60000 ISK)
  2358: { typeId: 2358, name: 'Biotech Research Reports', tier: 'P3', volumeM3: 6.0, baseExportValue: 60000 },
  2345: { typeId: 2345, name: 'Camera Drones', tier: 'P3', volumeM3: 6.0, baseExportValue: 60000 },
  2344: { typeId: 2344, name: 'Condensates', tier: 'P3', volumeM3: 6.0, baseExportValue: 60000 },
  2367: { typeId: 2367, name: 'Cryoprotectant Solution', tier: 'P3', volumeM3: 6.0, baseExportValue: 60000 },
  17392: { typeId: 17392, name: 'Data Chips', tier: 'P3', volumeM3: 6.0, baseExportValue: 60000 },
  2348: { typeId: 2348, name: 'Gel-Matrix Biopaste', tier: 'P3', volumeM3: 6.0, baseExportValue: 60000 },
  9848: { typeId: 9848, name: 'Guidance Systems', tier: 'P3', volumeM3: 6.0, baseExportValue: 60000 },
  2354: { typeId: 2354, name: 'Hazmat Detection Systems', tier: 'P3', volumeM3: 6.0, baseExportValue: 60000 },
  2366: { typeId: 2366, name: 'Hermetic Membranes', tier: 'P3', volumeM3: 6.0, baseExportValue: 60000 },
  2361: { typeId: 2361, name: 'High-Tech Transmitters', tier: 'P3', volumeM3: 6.0, baseExportValue: 60000 },
  17898: { typeId: 17898, name: 'Industrial Explosives', tier: 'P3', volumeM3: 6.0, baseExportValue: 60000 },
  2360: { typeId: 2360, name: 'Neocoms', tier: 'P3', volumeM3: 6.0, baseExportValue: 60000 },
  2352: { typeId: 2352, name: 'Nuclear Reactors', tier: 'P3', volumeM3: 6.0, baseExportValue: 60000 },
  9846: { typeId: 9846, name: 'Planetary Vehicles', tier: 'P3', volumeM3: 6.0, baseExportValue: 60000 },
  9844: { typeId: 9844, name: 'Robotics', tier: 'P3', volumeM3: 6.0, baseExportValue: 60000 },
  2349: { typeId: 2349, name: 'Smartfab Units', tier: 'P3', volumeM3: 6.0, baseExportValue: 60000 },
  2346: { typeId: 2346, name: 'Supercomputers', tier: 'P3', volumeM3: 6.0, baseExportValue: 60000 },
  12836: { typeId: 12836, name: 'Synthetic Synapses', tier: 'P3', volumeM3: 6.0, baseExportValue: 60000 },
  17136: { typeId: 17136, name: 'Transcranial Microcontrollers', tier: 'P3', volumeM3: 6.0, baseExportValue: 60000 },
  28974: { typeId: 28974, name: 'Ukomi Superconductors', tier: 'P3', volumeM3: 6.0, baseExportValue: 60000 },
  2351: { typeId: 2351, name: 'Vaccines', tier: 'P3', volumeM3: 6.0, baseExportValue: 60000 },

  // P4 (100.0 m3, POCO base 1200000 ISK)
  2867: { typeId: 2867, name: 'Broadcast Node', tier: 'P4', volumeM3: 100.0, baseExportValue: 1200000 },
  2868: { typeId: 2868, name: 'Integrity Response Drones', tier: 'P4', volumeM3: 100.0, baseExportValue: 1200000 },
  2869: { typeId: 2869, name: 'Nano-Factory', tier: 'P4', volumeM3: 100.0, baseExportValue: 1200000 },
  2870: { typeId: 2870, name: 'Organic Mortar Applicators', tier: 'P4', volumeM3: 100.0, baseExportValue: 1200000 },
  2871: { typeId: 2871, name: 'Recursive Computing Module', tier: 'P4', volumeM3: 100.0, baseExportValue: 1200000 },
  2872: { typeId: 2872, name: 'Self-Harmonizing Power Core', tier: 'P4', volumeM3: 100.0, baseExportValue: 1200000 },
  2875: { typeId: 2875, name: 'Sterile Conduits', tier: 'P4', volumeM3: 100.0, baseExportValue: 1200000 },
  2876: { typeId: 2876, name: 'Wetware Mainframe', tier: 'P4', volumeM3: 100.0, baseExportValue: 1200000 }
};

const PI_SCHEMATICS: PiSchematicSpec[] = [
  // P0 -> P1 (1800s, 3000 P0 -> 20 P1)
  { outputTypeId: 2393, outputQty: 20, cycleTimeSeconds: 1800, inputs: [{ typeId: 2073, quantity: 3000 }] },
  { outputTypeId: 2396, outputQty: 20, cycleTimeSeconds: 1800, inputs: [{ typeId: 2288, quantity: 3000 }] },
  { outputTypeId: 3779, outputQty: 20, cycleTimeSeconds: 1800, inputs: [{ typeId: 2286, quantity: 3000 }] },
  { outputTypeId: 2401, outputQty: 20, cycleTimeSeconds: 1800, inputs: [{ typeId: 2306, quantity: 3000 }] },
  { outputTypeId: 2390, outputQty: 20, cycleTimeSeconds: 1800, inputs: [{ typeId: 2309, quantity: 3000 }] },
  { outputTypeId: 2397, outputQty: 20, cycleTimeSeconds: 1800, inputs: [{ typeId: 2305, quantity: 3000 }] },
  { outputTypeId: 2392, outputQty: 20, cycleTimeSeconds: 1800, inputs: [{ typeId: 2311, quantity: 3000 }] },
  { outputTypeId: 3683, outputQty: 20, cycleTimeSeconds: 1800, inputs: [{ typeId: 2310, quantity: 3000 }] },
  { outputTypeId: 2389, outputQty: 20, cycleTimeSeconds: 1800, inputs: [{ typeId: 2308, quantity: 3000 }] },
  { outputTypeId: 2399, outputQty: 20, cycleTimeSeconds: 1800, inputs: [{ typeId: 2270, quantity: 3000 }] },
  { outputTypeId: 2395, outputQty: 20, cycleTimeSeconds: 1800, inputs: [{ typeId: 2287, quantity: 3000 }] },
  { outputTypeId: 2398, outputQty: 20, cycleTimeSeconds: 1800, inputs: [{ typeId: 2267, quantity: 3000 }] },
  { outputTypeId: 9828, outputQty: 20, cycleTimeSeconds: 1800, inputs: [{ typeId: 2307, quantity: 3000 }] },
  { outputTypeId: 2400, outputQty: 20, cycleTimeSeconds: 1800, inputs: [{ typeId: 2272, quantity: 3000 }] },
  { outputTypeId: 3645, outputQty: 20, cycleTimeSeconds: 1800, inputs: [{ typeId: 2268, quantity: 3000 }] },

  // P1 -> P2 (3600s, 40 + 40 -> 5)
  { outputTypeId: 2329, outputQty: 5, cycleTimeSeconds: 3600, inputs: [{ typeId: 2396, quantity: 40 }, { typeId: 2399, quantity: 40 }] },
  { outputTypeId: 3828, outputQty: 5, cycleTimeSeconds: 3600, inputs: [{ typeId: 2398, quantity: 40 }, { typeId: 2400, quantity: 40 }] },
  { outputTypeId: 9836, outputQty: 5, cycleTimeSeconds: 3600, inputs: [{ typeId: 2401, quantity: 40 }, { typeId: 2400, quantity: 40 }] },
  { outputTypeId: 9832, outputQty: 5, cycleTimeSeconds: 3600, inputs: [{ typeId: 2390, quantity: 40 }, { typeId: 3645, quantity: 40 }] },
  { outputTypeId: 44, outputQty: 5, cycleTimeSeconds: 3600, inputs: [{ typeId: 2399, quantity: 40 }, { typeId: 2400, quantity: 40 }] },
  { outputTypeId: 3693, outputQty: 5, cycleTimeSeconds: 3600, inputs: [{ typeId: 2393, quantity: 40 }, { typeId: 2395, quantity: 40 }] },
  { outputTypeId: 15317, outputQty: 5, cycleTimeSeconds: 3600, inputs: [{ typeId: 3779, quantity: 40 }, { typeId: 2395, quantity: 40 }] },
  { outputTypeId: 9842, outputQty: 5, cycleTimeSeconds: 3600, inputs: [{ typeId: 2396, quantity: 40 }, { typeId: 2395, quantity: 40 }] },
  { outputTypeId: 9830, outputQty: 5, cycleTimeSeconds: 3600, inputs: [{ typeId: 2399, quantity: 40 }, { typeId: 2398, quantity: 40 }] },
  { outputTypeId: 9840, outputQty: 5, cycleTimeSeconds: 3600, inputs: [{ typeId: 2397, quantity: 40 }, { typeId: 9828, quantity: 40 }] },
  { outputTypeId: 3689, outputQty: 5, cycleTimeSeconds: 3600, inputs: [{ typeId: 2401, quantity: 40 }, { typeId: 9828, quantity: 40 }] },
  { outputTypeId: 2327, outputQty: 5, cycleTimeSeconds: 3600, inputs: [{ typeId: 2393, quantity: 40 }, { typeId: 2398, quantity: 40 }] },
  { outputTypeId: 2463, outputQty: 5, cycleTimeSeconds: 3600, inputs: [{ typeId: 2392, quantity: 40 }, { typeId: 3683, quantity: 40 }] },
  { outputTypeId: 2317, outputQty: 5, cycleTimeSeconds: 3600, inputs: [{ typeId: 2397, quantity: 40 }, { typeId: 2392, quantity: 40 }] },
  { outputTypeId: 2321, outputQty: 5, cycleTimeSeconds: 3600, inputs: [{ typeId: 2396, quantity: 40 }, { typeId: 2397, quantity: 40 }] },
  { outputTypeId: 3695, outputQty: 5, cycleTimeSeconds: 3600, inputs: [{ typeId: 2390, quantity: 40 }, { typeId: 2389, quantity: 40 }] },
  { outputTypeId: 9838, outputQty: 5, cycleTimeSeconds: 3600, inputs: [{ typeId: 2392, quantity: 40 }, { typeId: 9828, quantity: 40 }] },
  { outputTypeId: 9834, outputQty: 5, cycleTimeSeconds: 3600, inputs: [{ typeId: 2389, quantity: 40 }, { typeId: 3645, quantity: 40 }] },
  { outputTypeId: 2319, outputQty: 5, cycleTimeSeconds: 3600, inputs: [{ typeId: 3779, quantity: 40 }, { typeId: 3683, quantity: 40 }] },
  { outputTypeId: 2328, outputQty: 5, cycleTimeSeconds: 3600, inputs: [{ typeId: 2390, quantity: 40 }, { typeId: 3683, quantity: 40 }] },
  { outputTypeId: 2312, outputQty: 5, cycleTimeSeconds: 3600, inputs: [{ typeId: 2393, quantity: 40 }, { typeId: 3645, quantity: 40 }] },
  { outputTypeId: 3697, outputQty: 5, cycleTimeSeconds: 3600, inputs: [{ typeId: 2401, quantity: 40 }, { typeId: 2389, quantity: 40 }] },
  { outputTypeId: 3775, outputQty: 5, cycleTimeSeconds: 3600, inputs: [{ typeId: 2393, quantity: 40 }, { typeId: 3779, quantity: 40 }] },
  { outputTypeId: 3691, outputQty: 5, cycleTimeSeconds: 3600, inputs: [{ typeId: 2398, quantity: 40 }, { typeId: 3645, quantity: 40 }] },

  // P2 -> P3 (3600s, 10 per input -> 3)
  { outputTypeId: 2358, outputQty: 3, cycleTimeSeconds: 3600, inputs: [{ typeId: 3828, quantity: 10 }, { typeId: 9842, quantity: 10 }, { typeId: 2327, quantity: 10 }] },
  { outputTypeId: 2345, outputQty: 3, cycleTimeSeconds: 3600, inputs: [{ typeId: 3695, quantity: 10 }, { typeId: 9838, quantity: 10 }] },
  { outputTypeId: 2344, outputQty: 3, cycleTimeSeconds: 3600, inputs: [{ typeId: 9832, quantity: 10 }, { typeId: 2463, quantity: 10 }] },
  { outputTypeId: 2367, outputQty: 3, cycleTimeSeconds: 3600, inputs: [{ typeId: 3693, quantity: 10 }, { typeId: 2328, quantity: 10 }, { typeId: 2312, quantity: 10 }] },
  { outputTypeId: 17392, outputQty: 3, cycleTimeSeconds: 3600, inputs: [{ typeId: 9840, quantity: 10 }, { typeId: 2319, quantity: 10 }] },
  { outputTypeId: 2348, outputQty: 3, cycleTimeSeconds: 3600, inputs: [{ typeId: 2329, quantity: 10 }, { typeId: 2463, quantity: 10 }, { typeId: 9834, quantity: 10 }] },
  { outputTypeId: 9848, outputQty: 3, cycleTimeSeconds: 3600, inputs: [{ typeId: 3697, quantity: 10 }, { typeId: 3691, quantity: 10 }] },
  { outputTypeId: 2354, outputQty: 3, cycleTimeSeconds: 3600, inputs: [{ typeId: 2321, quantity: 10 }, { typeId: 3697, quantity: 10 }, { typeId: 3775, quantity: 10 }] },
  { outputTypeId: 2366, outputQty: 3, cycleTimeSeconds: 3600, inputs: [{ typeId: 15317, quantity: 10 }, { typeId: 2317, quantity: 10 }] },
  { outputTypeId: 2361, outputQty: 3, cycleTimeSeconds: 3600, inputs: [{ typeId: 2317, quantity: 10 }, { typeId: 3697, quantity: 10 }] },
  { outputTypeId: 17898, outputQty: 3, cycleTimeSeconds: 3600, inputs: [{ typeId: 3693, quantity: 10 }, { typeId: 2321, quantity: 10 }] },
  { outputTypeId: 2360, outputQty: 3, cycleTimeSeconds: 3600, inputs: [{ typeId: 2329, quantity: 10 }, { typeId: 9838, quantity: 10 }] },
  { outputTypeId: 2352, outputQty: 3, cycleTimeSeconds: 3600, inputs: [{ typeId: 44, quantity: 10 }, { typeId: 9840, quantity: 10 }] },
  { outputTypeId: 9846, outputQty: 3, cycleTimeSeconds: 3600, inputs: [{ typeId: 9830, quantity: 10 }, { typeId: 3689, quantity: 10 }, { typeId: 9834, quantity: 10 }] },
  { outputTypeId: 9844, outputQty: 3, cycleTimeSeconds: 3600, inputs: [{ typeId: 9836, quantity: 10 }, { typeId: 9830, quantity: 10 }] },
  { outputTypeId: 2349, outputQty: 3, cycleTimeSeconds: 3600, inputs: [{ typeId: 3828, quantity: 10 }, { typeId: 3689, quantity: 10 }] },
  { outputTypeId: 2346, outputQty: 3, cycleTimeSeconds: 3600, inputs: [{ typeId: 9836, quantity: 10 }, { typeId: 9832, quantity: 10 }, { typeId: 3691, quantity: 10 }] },
  { outputTypeId: 12836, outputQty: 3, cycleTimeSeconds: 3600, inputs: [{ typeId: 2319, quantity: 10 }, { typeId: 2312, quantity: 10 }] },
  { outputTypeId: 17136, outputQty: 3, cycleTimeSeconds: 3600, inputs: [{ typeId: 2329, quantity: 10 }, { typeId: 2327, quantity: 10 }] },
  { outputTypeId: 28974, outputQty: 3, cycleTimeSeconds: 3600, inputs: [{ typeId: 9834, quantity: 10 }, { typeId: 2328, quantity: 10 }] },
  { outputTypeId: 2351, outputQty: 3, cycleTimeSeconds: 3600, inputs: [{ typeId: 9842, quantity: 10 }, { typeId: 3775, quantity: 10 }] },

  // P3 -> P4 (3600s -> 1)
  { outputTypeId: 2867, outputQty: 1, cycleTimeSeconds: 3600, inputs: [{ typeId: 17392, quantity: 6 }, { typeId: 2361, quantity: 6 }, { typeId: 2360, quantity: 6 }] },
  { outputTypeId: 2868, outputQty: 1, cycleTimeSeconds: 3600, inputs: [{ typeId: 2348, quantity: 6 }, { typeId: 2354, quantity: 6 }, { typeId: 9846, quantity: 6 }] },
  { outputTypeId: 2869, outputQty: 1, cycleTimeSeconds: 3600, inputs: [{ typeId: 17898, quantity: 6 }, { typeId: 28974, quantity: 6 }, { typeId: 2398, quantity: 40 }] },
  { outputTypeId: 2870, outputQty: 1, cycleTimeSeconds: 3600, inputs: [{ typeId: 2344, quantity: 6 }, { typeId: 9844, quantity: 6 }, { typeId: 2393, quantity: 40 }] },
  { outputTypeId: 2871, outputQty: 1, cycleTimeSeconds: 3600, inputs: [{ typeId: 9848, quantity: 6 }, { typeId: 12836, quantity: 6 }, { typeId: 17136, quantity: 6 }] },
  { outputTypeId: 2872, outputQty: 1, cycleTimeSeconds: 3600, inputs: [{ typeId: 2345, quantity: 6 }, { typeId: 2366, quantity: 6 }, { typeId: 2352, quantity: 6 }] },
  { outputTypeId: 2875, outputQty: 1, cycleTimeSeconds: 3600, inputs: [{ typeId: 2349, quantity: 6 }, { typeId: 2351, quantity: 6 }, { typeId: 3645, quantity: 40 }] },
  { outputTypeId: 2876, outputQty: 1, cycleTimeSeconds: 3600, inputs: [{ typeId: 2358, quantity: 6 }, { typeId: 2367, quantity: 6 }, { typeId: 2346, quantity: 6 }] }
];

const PLANET_MATRIX: Array<{ planetType: string; p0Resources: string[]; singlePlanetP2: string[] }> = [
  {
    planetType: 'Barren',
    p0Resources: ['Aqueous Liquids', 'Base Metals', 'Carbon Compounds', 'Microorganisms', 'Noble Metals'],
    singlePlanetP2: ['Biocels', 'Livestock', 'Mechanical Parts', 'Nanites', 'Test Cultures']
  },
  {
    planetType: 'Gas',
    p0Resources: ['Aqueous Liquids', 'Base Metals', 'Ionic Solutions', 'Noble Gas', 'Reactive Gas'],
    singlePlanetP2: ['Coolant', 'Oxides', 'Synthetic Oil', 'Water-Cooled CPU']
  },
  {
    planetType: 'Ice',
    p0Resources: ['Aqueous Liquids', 'Heavy Metals', 'Microorganisms', 'Noble Gas', 'Planktic Colonies'],
    singlePlanetP2: ['Supertensile Plastics', 'Test Cultures', 'Viral Agent']
  },
  {
    planetType: 'Lava',
    p0Resources: ['Base Metals', 'Felsic Magma', 'Heavy Metals', 'Non-CS Crystals', 'Suspended Plasma'],
    singlePlanetP2: ['Construction Blocks', 'Consumer Electronics', 'Miniature Electronics', 'Transmitter']
  },
  {
    planetType: 'Oceanic',
    p0Resources: ['Aqueous Liquids', 'Carbon Compounds', 'Complex Organisms', 'Microorganisms', 'Planktic Colonies'],
    singlePlanetP2: ['Fertilizer', 'Genetically Enhanced Livestock', 'Livestock', 'Test Cultures', 'Viral Agent']
  },
  {
    planetType: 'Plasma',
    p0Resources: ['Base Metals', 'Heavy Metals', 'Noble Metals', 'Non-CS Crystals', 'Suspended Plasma'],
    singlePlanetP2: ['Construction Blocks', 'Consumer Electronics', 'Enriched Uranium', 'Mechanical Parts', 'Transmitter']
  },
  {
    planetType: 'Storm',
    p0Resources: ['Aqueous Liquids', 'Base Metals', 'Ionic Solutions', 'Noble Gas', 'Suspended Plasma'],
    singlePlanetP2: ['Coolant', 'Rocket Fuel', 'Superconductors', 'Synthetic Oil', 'Water-Cooled CPU']
  },
  {
    planetType: 'Temperate',
    p0Resources: ['Aqueous Liquids', 'Autotrophs', 'Carbon Compounds', 'Complex Organisms', 'Microorganisms'],
    singlePlanetP2: ['Fertilizer', 'Livestock', 'Polytextiles', 'Test Cultures']
  }
];

const LAUNCHPAD_TYPE_IDS = new Set([2256, 2542, 2543, 2544, 2552, 2555, 2556, 2557]);
const STORAGE_TYPE_IDS = new Set([2257, 2536, 2537, 2538, 2539, 2540, 2541, 2558]);
const COMMAND_CENTER_TYPE_IDS = new Set([2254, 2524, 2525, 2533, 2534, 2535, 2549, 2550, 2551]);

export class PlanetaryService {
  private planetNameCache = new Map<number, string>();

  constructor(
    private readonly db: LocalDatabase,
    private readonly esiClient: EsiClient,
    private readonly marketService: MarketService
  ) {}

  private async resolvePlanetName(planetId: number): Promise<string> {
    const cached = this.planetNameCache.get(planetId);
    if (cached) return cached;
    const data = await this.esiClient
      .request<{ name?: string }>(`/universe/planets/${planetId}/`)
      .catch(() => null);
    const name = data?.name ?? `Planet #${planetId}`;
    this.planetNameCache.set(planetId, name);
    return name;
  }

  private resolveSystemName(solarSystemId: number): string {
    const row = this.db.get<{ solar_system_name: string }>(
      'SELECT solar_system_name FROM sde_solar_systems WHERE solar_system_id = ?',
      [solarSystemId]
    );
    return row?.solar_system_name ?? `System #${solarSystemId}`;
  }

  private getSourcePlanetsForP1(p1TypeId: number): string[] {
    const p1Name = PI_ITEMS[p1TypeId]?.name ?? '';
    const sch = PI_SCHEMATICS.find((s) => s.outputTypeId === p1TypeId);
    if (!sch) return [];
    const p0Name = PI_ITEMS[sch.inputs[0]?.typeId]?.name ?? p1Name;
    return PLANET_MATRIX.filter((pm) => pm.p0Resources.includes(p0Name)).map((pm) => pm.planetType);
  }

  async getOverview(
    characterId: number | null,
    regionId: number,
    pocoTaxPct: number
  ): Promise<PlanetaryOverviewDto> {
    const chars =
      characterId !== null
        ? this.db.all<{ character_id: number; character_name: string }>(
            'SELECT character_id, character_name FROM characters WHERE character_id = ?',
            [characterId]
          )
        : this.db.all<{ character_id: number; character_name: string }>(
            'SELECT character_id, character_name FROM characters ORDER BY character_name ASC'
          );

    const allPiTypeIds = Object.keys(PI_ITEMS).map(Number);
    const quotes = await this.marketService.getQuotesForTypes(regionId, allPiTypeIds).catch(
      () => ({} as Record<number, { sellMin?: number | null; buyMax?: number | null }>)
    );
    const pickPrice = (typeId: number): number => {
      const q = quotes[typeId];
      if (!q) return 0;
      return q.sellMin && q.sellMin > 0 ? q.sellMin : q.buyMax ?? 0;
    };

    const colonies: PlanetaryColonyDto[] = [];
    const now = Date.now();

    for (const ch of chars) {
      const rawPlanets = await this.esiClient
        .request<
          Array<{
            planet_id: number;
            planet_type: string;
            solar_system_id: number;
            upgrade_level: number;
            num_pins: number;
            last_update: string;
          }>
        >(`/characters/${ch.character_id}/planets/`, { characterId: ch.character_id })
        .catch(() => []);

      const list = Array.isArray(rawPlanets) ? rawPlanets : [];
      for (const p of list) {
        const [planetName, detail] = await Promise.all([
          this.resolvePlanetName(p.planet_id),
          this.esiClient
            .request<{
              pins?: Array<{
                pin_id: number;
                type_id: number;
                expiry_time?: string;
                schematic_id?: number;
                contents?: Array<{ type_id: number; amount: number }>;
                extractor_details?: {
                  cycle_time?: number;
                  product_type_id?: number;
                  qty_per_cycle?: number;
                };
              }>;
            }>(`/characters/${ch.character_id}/planets/${p.planet_id}/`, {
              characterId: ch.character_id
            })
            .catch(() => null)
        ]);

        const extractors: PlanetaryExtractorDto[] = [];
        const storages: PlanetaryStorageDto[] = [];
        let factoryCount = 0;
        let nextExpiryMs: number | null = null;
        let estStorageValueIsk = 0;

        for (const pin of detail?.pins ?? []) {
          if (pin.extractor_details) {
            const ex = pin.extractor_details;
            const cycleSec = Math.max(1, ex.cycle_time ?? 3600);
            const qty = ex.qty_per_cycle ?? 0;
            const expiryMs = pin.expiry_time ? Date.parse(pin.expiry_time) : null;
            let status: PlanetaryExtractorDto['status'] = 'idle';
            if (expiryMs) {
              if (expiryMs <= now) status = 'expired';
              else if (expiryMs - now <= 24 * 3600 * 1000) status = 'expiring_soon';
              else status = 'active';
              if (nextExpiryMs === null || expiryMs < nextExpiryMs) nextExpiryMs = expiryMs;
            }
            const prodId = ex.product_type_id ?? null;
            const prodName = prodId ? PI_ITEMS[prodId]?.name ?? `Resource #${prodId}` : 'Idle';
            extractors.push({
              pinId: pin.pin_id,
              productTypeId: prodId,
              productName: prodName,
              qtyPerCycle: qty,
              cycleTimeSeconds: cycleSec,
              unitsPerHour: Math.round((qty / cycleSec) * 3600),
              expiryTime: pin.expiry_time ?? null,
              expiryMs,
              status
            });
          } else if (pin.schematic_id) {
            factoryCount += 1;
          } else if (
            LAUNCHPAD_TYPE_IDS.has(pin.type_id) ||
            STORAGE_TYPE_IDS.has(pin.type_id) ||
            COMMAND_CENTER_TYPE_IDS.has(pin.type_id)
          ) {
            const kind: PlanetaryStorageDto['kind'] = LAUNCHPAD_TYPE_IDS.has(pin.type_id)
              ? 'launchpad'
              : STORAGE_TYPE_IDS.has(pin.type_id)
                ? 'storage'
                : 'command_center';
            const capacityM3 = kind === 'storage' ? 12000 : kind === 'launchpad' ? 10000 : 500;
            let totalVol = 0;
            const contents = (pin.contents ?? []).map((c) => {
              const meta = PI_ITEMS[c.type_id];
              const vol = (meta?.volumeM3 ?? 0.38) * c.amount;
              totalVol += vol;
              const val = pickPrice(c.type_id) * c.amount;
              estStorageValueIsk += val;
              return {
                typeId: c.type_id,
                typeName: meta?.name ?? `Item #${c.type_id}`,
                amount: c.amount,
                volumeM3: vol,
                estValueIsk: val
              };
            });
            if (kind !== 'command_center' || contents.length > 0) {
              storages.push({
                pinId: pin.pin_id,
                kind,
                totalVolumeM3: totalVol,
                capacityM3,
                fillPct: Math.min(100, (totalVol / capacityM3) * 100),
                contents
              });
            }
          }
        }

        colonies.push({
          characterId: ch.character_id,
          characterName: ch.character_name,
          planetId: p.planet_id,
          planetName,
          planetType: p.planet_type,
          solarSystemId: p.solar_system_id,
          solarSystemName: this.resolveSystemName(p.solar_system_id),
          upgradeLevel: p.upgrade_level,
          numPins: p.num_pins,
          lastUpdate: p.last_update,
          extractors,
          storages,
          factoryCount,
          nextExpiryMs,
          estStorageValueIsk
        });
      }
    }

    const taxRate = Math.max(0, pocoTaxPct) / 100;
    const commodities: PlanetaryCommodityProfitDto[] = PI_SCHEMATICS.map((sch) => {
      const outMeta = PI_ITEMS[sch.outputTypeId];
      const outputUnitPrice = pickPrice(sch.outputTypeId);
      const outputCycleValueIsk = outputUnitPrice * sch.outputQty;
      let inputCycleCostIsk = 0;
      let importTax = 0;

      const inputs = sch.inputs.map((inp) => {
        const meta = PI_ITEMS[inp.typeId];
        const unitPrice = pickPrice(inp.typeId);
        inputCycleCostIsk += unitPrice * inp.quantity;
        // POCO import tax is 50% of base export value * taxRate when importing P1+
        if (meta && meta.tier !== 'P0') {
          importTax += meta.baseExportValue * 0.5 * inp.quantity * taxRate;
        }
        return {
          typeId: inp.typeId,
          name: meta?.name ?? `Type #${inp.typeId}`,
          tier: (meta?.tier ?? 'P0') as 'P0' | 'P1' | 'P2' | 'P3',
          quantity: inp.quantity,
          unitPrice
        };
      });

      const exportTax = (outMeta?.baseExportValue ?? 0) * sch.outputQty * taxRate;
      const customsTaxIsk = exportTax + (outMeta?.tier === 'P1' ? 0 : importTax);
      const profitPerCycleIsk = outputCycleValueIsk - inputCycleCostIsk - customsTaxIsk;
      const cyclesPerDay = 86400 / sch.cycleTimeSeconds;
      const profitPerDayIsk = profitPerCycleIsk * cyclesPerDay;
      const totalCost = inputCycleCostIsk + customsTaxIsk;
      const marginPct = totalCost > 0 ? (profitPerCycleIsk / totalCost) * 100 : 0;

      const sourcePlanets =
        outMeta?.tier === 'P1'
          ? this.getSourcePlanetsForP1(sch.outputTypeId)
          : outMeta?.tier === 'P2'
            ? PLANET_MATRIX.filter((pm) => pm.singlePlanetP2.includes(outMeta.name)).map(
                (pm) => pm.planetType
              )
            : ['Multi-Planet / Factory'];

      return {
        typeId: sch.outputTypeId,
        name: outMeta?.name ?? `PI #${sch.outputTypeId}`,
        tier: (outMeta?.tier ?? 'P1') as 'P1' | 'P2' | 'P3' | 'P4',
        cycleTimeSeconds: sch.cycleTimeSeconds,
        outputQty: sch.outputQty,
        volumeM3: outMeta?.volumeM3 ?? 1,
        inputs,
        outputUnitPrice,
        outputCycleValueIsk,
        inputCycleCostIsk,
        customsTaxIsk,
        profitPerCycleIsk,
        profitPerDayIsk,
        marginPct,
        sourcePlanets
      };
    }).sort((a, b) => b.profitPerDayIsk - a.profitPerDayIsk);

    return {
      colonies,
      commodities,
      planetMatrix: PLANET_MATRIX,
      syncedAt: Date.now()
    };
  }
}

