export type Locale = 'fr' | 'en';
export type LocalizedText = Record<Locale, string>;

type SoftwareBase = {
  id: string;
  kind: 'firmware' | 'desktop';
  name: LocalizedText;
  description: LocalizedText;
};

export type FirmwarePart = {
  id: string;
  label: LocalizedText;
  offset: number;
};

export type FirmwareSoftware = SoftwareBase & {
  kind: 'firmware';
  board: string;
  chipFamily: 'ESP32';
  manifestPath: string;
  includesFilesystemData: boolean;
  parts: FirmwarePart[];
};

export type DesktopSoftware = SoftwareBase & {
  kind: 'desktop';
  license: LocalizedText;
  status: 'coming_soon' | 'available';
};

export type PublicSoftware = FirmwareSoftware | DesktopSoftware;

export const softwaresCatalog: PublicSoftware[] = [
  {
    id: 'i2s-esp32-sd',
    kind: 'firmware',
    name: {
      fr: 'I2S ESP32 SD',
      en: 'I2S ESP32 SD',
    },
    description: {
      fr: 'Firmware ESP32 pre-compile (code + data/data.json) flashable en ligne.',
      en: 'Precompiled ESP32 firmware (code + data/data.json) flashable online.',
    },
    board: 'Adafruit Feather ESP32',
    chipFamily: 'ESP32',
    manifestPath: '/firmwares/i2s-esp32-sd/manifest.json',
    includesFilesystemData: true,
    parts: [
      {
        id: 'bootloader',
        label: { fr: 'Bootloader', en: 'Bootloader' },
        offset: 0x1000,
      },
      {
        id: 'partitions',
        label: { fr: 'Table de partitions', en: 'Partition table' },
        offset: 0x8000,
      },
      {
        id: 'boot_app0',
        label: { fr: 'Boot app', en: 'Boot app' },
        offset: 0xe000,
      },
      {
        id: 'firmware',
        label: { fr: 'Application firmware', en: 'Firmware application' },
        offset: 0x10000,
      },
      {
        id: 'spiffs',
        label: { fr: 'SPIFFS (data incluses)', en: 'SPIFFS (embedded data)' },
        offset: 0x210000,
      },
    ],
  },
  {
    id: 'as-simt-desktop',
    kind: 'desktop',
    name: {
      fr: 'AS-SIMT Desktop',
      en: 'AS-SIMT Desktop',
    },
    description: {
      fr: 'Suite PC sous licence pour preparation et monitoring de performances.',
      en: 'Licensed PC suite for performance preparation and monitoring.',
    },
    license: {
      fr: 'Licence commerciale',
      en: 'Commercial license',
    },
    status: 'coming_soon',
  },
];

