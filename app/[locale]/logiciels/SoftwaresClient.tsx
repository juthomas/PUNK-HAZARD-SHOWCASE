'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { softwaresCatalog } from '@/lib/softwares';
import type { FirmwareSoftware, LocalizedText, PublicSoftware } from '@/lib/softwares';
import * as flashSession from '@/lib/flashSerialSession';
import styles from './page.module.css';

type Locale = 'fr' | 'en';
type DesktopSoftware = Extract<PublicSoftware, { kind: 'desktop' }>;
type FlashStatus = 'idle' | 'waiting_for_port' | 'dialog_ready' | 'loading' | 'erasing' | 'installing' | 'configuring' | 'finished' | 'error';

type FirmwareManifest = {
  builds: Array<{
    chipFamily: string;
    parts: Array<{
      path: string;
      offset: number;
    }>;
  }>;
};

type EsptoolTerminal = {
  clean: () => void;
  writeLine: (data: string) => void;
  write: (data: string) => void;
};

type EsptoolTransport = {
  disconnect: () => Promise<void>;
};

type WriteFlashOptions = {
  fileArray: Array<{ data: Uint8Array | string; address: number }>;
  eraseAll: boolean;
  compress: boolean;
  flashMode: 'keep';
  flashFreq: 'keep';
  flashSize: 'keep';
  reportProgress?: (fileIndex: number, written: number, total: number) => void;
};

type EsploaderInstance = {
  main: () => Promise<string>;
  eraseFlash: () => Promise<void>;
  writeFlash: (options: WriteFlashOptions) => Promise<void>;
  after: () => Promise<void>;
};

type EsptoolModule = {
  Transport: new (device: unknown, tracing?: boolean) => EsptoolTransport;
  ESPLoader: new (options: {
    transport: EsptoolTransport;
    baudrate: number;
    terminal: EsptoolTerminal;
    debugLogging?: boolean;
  }) => EsploaderInstance;
};

type SerialNavigator = Navigator & {
  serial?: {
    requestPort: (options?: unknown) => Promise<unknown>;
    getPorts?: () => Promise<unknown[]>;
  };
};

type SerialPortLike = {
  readable?: ReadableStream<Uint8Array> | null;
  writable?: WritableStream<Uint8Array> | null;
  open?: (options: { baudRate: number }) => Promise<void>;
  close?: () => Promise<void>;
  setSignals?: (signals: {
    dataTerminalReady?: boolean;
    requestToSend?: boolean;
    break?: boolean;
  }) => Promise<void>;
  getInfo?: () => {
    usbVendorId?: number;
    usbProductId?: number;
  };
};

type ConfigFieldType = 'boolean' | 'number' | 'string' | 'json';

const CONFIG_UI_HIDDEN_KEYS = new Set<string>(['track_assignation', 'ap_enabled']);

const CONFIG_TAB_ORDER = ['general', 'network', 'buttons'] as const;
const CONFIG_FIELDS_BY_TAB: Record<(typeof CONFIG_TAB_ORDER)[number], string[]> = {
  general: ['loop_file', 'auto_play', 'note', 'volume'],
  network: [
    'device_mode',
    'udp_port',
    'mesh_ttl',
    'ap_safety_timeout_s',
    'ap_name',
    'ap_password',
    'ap_ip_config',
    'esp_now_channel',
  ],
  buttons: [
    'button_gpio13_track',
    'button_gpio16_track',
    'button_gpio13_pull_mode',
    'button_gpio16_pull_mode',
    'button_gpio13_active_level',
    'button_gpio16_active_level',
  ],
};

const CONFIG_SELECT_FIELDS: Record<
  string,
  { values: number[]; optionPrefix: string }
> = {
  device_mode: { values: [0, 1, 2, 3], optionPrefix: 'device_mode' },
  button_gpio13_pull_mode: { values: [0, 1, 2], optionPrefix: 'pull_mode' },
  button_gpio16_pull_mode: { values: [0, 1, 2], optionPrefix: 'pull_mode' },
  button_gpio13_active_level: { values: [0, 1], optionPrefix: 'active_level' },
  button_gpio16_active_level: { values: [0, 1], optionPrefix: 'active_level' },
};

const FLASH_CONFIG_STORAGE_KEY_PREFIX = 'punkhazard:flash-config:';

function getPersistedConfigDraft(firmwareId: string): Record<string, string | boolean> | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = localStorage.getItem(FLASH_CONFIG_STORAGE_KEY_PREFIX + firmwareId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const result: Record<string, string | boolean> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'boolean' || typeof value === 'string') {
        result[key] = value;
      }
    }
    return result;
  } catch {
    return null;
  }
}

function persistConfigDraft(firmwareId: string, values: Record<string, string | boolean>): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem(FLASH_CONFIG_STORAGE_KEY_PREFIX + firmwareId, JSON.stringify(values));
  } catch {
    // Ignore quota exceeded or private mode
  }
}

function uint8ToBinaryString(bytes: Uint8Array): string {
  // Keep byte-perfect conversion (0x00-0xFF) for esptool-js string input.
  // Do not use TextDecoder("latin1") because browsers map it to windows-1252.
  const chunkSize = 0x8000;
  let output = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    output += String.fromCharCode(...chunk);
  }
  return output;
}

function normalizeChipFamily(chipDescription: string): string {
  const normalized = chipDescription.trim().toUpperCase();

  if (normalized.includes('ESP32-C61')) return 'ESP32-C61';
  if (normalized.includes('ESP32-C6')) return 'ESP32-C6';
  if (normalized.includes('ESP32-C5')) return 'ESP32-C5';
  if (normalized.includes('ESP32-C3')) return 'ESP32-C3';
  if (normalized.includes('ESP32-C2')) return 'ESP32-C2';
  if (normalized.includes('ESP32-S3')) return 'ESP32-S3';
  if (normalized.includes('ESP32-S2')) return 'ESP32-S2';
  if (normalized.includes('ESP32-H2')) return 'ESP32-H2';
  if (normalized.includes('ESP32-P4')) return 'ESP32-P4';
  if (normalized.includes('ESP8266')) return 'ESP8266';
  if (normalized.includes('ESP32')) return 'ESP32';

  return chipDescription.trim();
}

function localize(text: LocalizedText, locale: Locale): string {
  return locale === 'en' ? text.en : text.fr;
}

function statusClassName(status: FlashStatus): string {
  switch (status) {
    case 'waiting_for_port':
      return styles.flashStatusWaiting;
    case 'dialog_ready':
      return styles.flashStatusReady;
    case 'loading':
    case 'erasing':
    case 'installing':
    case 'configuring':
      return styles.flashStatusInstalling;
    case 'finished':
      return styles.flashStatusFinished;
    case 'error':
      return styles.flashStatusError;
    default:
      return styles.flashStatusIdle;
  }
}

export default function SoftwaresClient() {
  const t = useTranslations('softwares');
  const locale = useLocale() === 'en' ? 'en' : 'fr';

  const [selectedFirmware, setSelectedFirmware] = useState<FirmwareSoftware | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGoogleChrome, setIsGoogleChrome] = useState(false);
  const [isWebSerialSupported, setIsWebSerialSupported] = useState(false);
  const [manifestToken, setManifestToken] = useState(0);
  // Initialise from persistent session so first paint after locale change shows real flash state
  const [flashStatus, setFlashStatus] = useState<FlashStatus>(() =>
    flashSession.hasSession() ? flashSession.getState().flashStatus : 'idle'
  );
  const [flashProgress, setFlashProgress] = useState<number | null>(() =>
    flashSession.hasSession() ? flashSession.getState().flashProgress : null
  );
  type LogEntryType = 'build' | 'serial_out' | 'serial_in';
  type LogEntry = { text: string; type: LogEntryType };
  const [flashLogs, setFlashLogs] = useState<LogEntry[]>(() =>
    flashSession.hasSession() ? flashSession.getState().flashLogs : []
  );
  const [isFlashing, setIsFlashing] = useState(() =>
    flashSession.hasSession() ? flashSession.getState().isFlashing : false
  );
  const [isPortPicking, setIsPortPicking] = useState(false);
  const [eraseBeforeFlash, setEraseBeforeFlash] = useState(true);
  const [showFlashConfirm, setShowFlashConfirm] = useState(() =>
    flashSession.hasSession() ? flashSession.getState().showFlashConfirm : false
  );
  const [isCopyingLogs, setIsCopyingLogs] = useState(false);
  const [isPortReleasing, setIsPortReleasing] = useState(false);
  const [isDialogMounted, setIsDialogMounted] = useState(false);
  const [selectedSerialPort, setSelectedSerialPort] = useState<unknown | null>(() =>
    flashSession.hasSession() ? flashSession.getState().port : null
  );
  const [serialMonitorLogs, setSerialMonitorLogs] = useState<LogEntry[]>(() =>
    flashSession.hasSession() ? flashSession.getState().serialMonitorLogs : []
  );
  const [isSerialMonitoring, setIsSerialMonitoring] = useState(() =>
    flashSession.hasSession() ? flashSession.getState().isMonitoring : false
  );
  const [isSerialMonitorStarting, setIsSerialMonitorStarting] = useState(false);
  const [activeLogView, setActiveLogView] = useState<'flash' | 'serial'>(() => {
    if (!flashSession.hasSession()) return 'flash';
    const s = flashSession.getState();
    return s.isFlashing ? 'flash' : s.activeLogView;
  });
  const [isConfigTemplateLoading, setIsConfigTemplateLoading] = useState(false);
  const [configFieldOrder, setConfigFieldOrder] = useState<string[]>([]);
  const [configFieldTypes, setConfigFieldTypes] = useState<Record<string, ConfigFieldType>>({});
  const [configDraftValues, setConfigDraftValues] = useState<Record<string, string | boolean>>({});
  const [configTab, setConfigTab] = useState<(typeof CONFIG_TAB_ORDER)[number]>('general');

  const logContainerRef = useRef<HTMLPreElement | null>(null);
  const terminalBufferRef = useRef('');
  const serialMonitorBufferRef = useRef('');
  const lastProgressPercentRef = useRef(-1);
  const partProgressByIndexRef = useRef<Record<number, number>>({});
  const lastProgressBytesRef = useRef(0);
  const lastProgressAddressRef = useRef(0);
  const serialMonitorReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const serialMonitorPortRef = useRef<unknown | null>(null);
  const serialMonitorOpenedLocallyRef = useRef(false);
  const serialMonitorStopRequestedRef = useRef(false);
  const serialMonitorLoopExitedPromiseRef = useRef<Promise<void> | null>(null);
  const serialMonitorLoopExitedResolveRef = useRef<(() => void) | null>(null);
  const openPortInFlightRef = useRef(false);
  const releasePortInFlightRef = useRef(false);
  const copyLogsInFlightRef = useRef(false);
  const flashStartInFlightRef = useRef(false);
  const flashSessionClosedRef = useRef(false);
  const flashingFirmwareIdRef = useRef<string | null>(null);
  const suppressSerialConsoleErrorsRef = useRef(false);

  const firmwareSoftwares = useMemo(
    () => softwaresCatalog.filter((software): software is FirmwareSoftware => software.kind === 'firmware'),
    []
  );
  const desktopSoftwares = useMemo(
    () => softwaresCatalog.filter((software): software is DesktopSoftware => software.kind === 'desktop'),
    []
  );

  useEffect(() => {
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      if (suppressSerialConsoleErrorsRef.current && args.length > 0) {
        const msg = String(args[0]);
        if (
          msg.includes('Read timeout exceeded') ||
          msg.includes('Error reading from serial port')
        ) {
          return;
        }
      }
      originalError.apply(console, args);
    };
    return () => {
      console.error = originalError;
    };
  }, []);

  useEffect(() => {
    const hasWebSerial = typeof navigator !== 'undefined' && 'serial' in navigator;
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const vendor = typeof navigator !== 'undefined' ? navigator.vendor : '';
    const isChromeUa =
      userAgent.includes('Chrome') &&
      !userAgent.includes('Edg') &&
      !userAgent.includes('OPR') &&
      vendor.includes('Google');

    setIsWebSerialSupported(hasWebSerial);
    setIsGoogleChrome(isChromeUa);
  }, []);

  useEffect(() => {
    const node = logContainerRef.current;
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [flashLogs, serialMonitorLogs, activeLogView]);

  // Hydrate from persistent session on mount (e.g. after locale change) and subscribe to log updates
  useEffect(() => {
    if (flashSession.hasSession()) {
      const state = flashSession.getState();
      setSelectedSerialPort(state.port);
      setFlashLogs(state.flashLogs);
      setSerialMonitorLogs(state.serialMonitorLogs);
      setIsSerialMonitoring(!!state.reader);
      setIsFlashing(state.isFlashing);
      setFlashProgress(state.flashProgress);
      setFlashStatus(state.flashStatus);
      setShowFlashConfirm(state.showFlashConfirm);
      setActiveLogView(state.isFlashing ? 'flash' : state.activeLogView);
      serialMonitorPortRef.current = state.port;
      serialMonitorReaderRef.current = state.reader;
      serialMonitorOpenedLocallyRef.current = state.openedLocally;
      serialMonitorBufferRef.current = state.monitorBuffer;
    }
    const unsub = flashSession.subscribe(() => {
      const state = flashSession.getState();
      setFlashLogs(state.flashLogs);
      setSerialMonitorLogs(state.serialMonitorLogs);
      setIsSerialMonitoring(!!state.reader);
      if (state.isFlashing) {
        setIsFlashing(state.isFlashing);
        setFlashProgress(state.flashProgress);
        setFlashStatus(state.flashStatus);
        setShowFlashConfirm(state.showFlashConfirm);
        setActiveLogView('flash');
      } else {
        setActiveLogView(state.activeLogView);
      }
    });
    return unsub;
  }, []);

  // Keep session in sync with flash state so closing/reopening modal during flash shows correct progress
  useEffect(() => {
    if (flashSession.hasSession()) {
      flashSession.setFlashState({
        isFlashing,
        flashProgress,
        flashStatus,
        showFlashConfirm,
      });
    }
  }, [isFlashing, flashProgress, flashStatus, showFlashConfirm]);

  // Persist log tab (flash vs serial) so green monitor messages stay visible after locale change + close/reopen
  useEffect(() => {
    if (flashSession.hasSession()) {
      flashSession.setActiveLogView(activeLogView);
    }
  }, [activeLogView]);

  function appendFlashLog(message: string, entryType: LogEntryType = 'build') {
    const timestamp = new Date().toLocaleTimeString(locale === 'en' ? 'en-GB' : 'fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const text = `[${timestamp}] ${message}`;
    const entry: LogEntry = { text, type: entryType };
    flashSession.appendFlashLog(entry);
  }

  function appendSerialMonitorLog(message: string) {
    const timestamp = new Date().toLocaleTimeString(locale === 'en' ? 'en-GB' : 'fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const text = `[${timestamp}] ${message}`;
    const entry: LogEntry = { text, type: 'serial_in' };
    flashSession.appendSerialMonitorLog(entry);
  }

  useEffect(() => {
    if (!isModalOpen || !selectedFirmware?.configTemplatePath) {
      setIsConfigTemplateLoading(false);
      setConfigFieldOrder([]);
      setConfigFieldTypes({});
      setConfigDraftValues({});
      return;
    }

    let isCancelled = false;
    setIsConfigTemplateLoading(true);

    const templateUrl = `${selectedFirmware.configTemplatePath}?ts=${Date.now()}`;
    void (async () => {
      try {
        const template = await loadConfigTemplate(templateUrl);
        if (isCancelled) {
          return;
        }

        const draft = buildConfigDraftFromTemplate(template);
        setConfigFieldOrder(draft.order);
        setConfigFieldTypes(draft.types);
        const saved = selectedFirmware?.id ? getPersistedConfigDraft(selectedFirmware.id) : null;
        const merged = { ...draft.values };
        if (saved) {
          for (const key of draft.order) {
            if (!(key in saved)) continue;
            const wantType = draft.types[key];
            const savedVal = saved[key];
            if (wantType === 'boolean' && typeof savedVal === 'boolean') merged[key] = savedVal;
            else if (
              (wantType === 'string' || wantType === 'number' || wantType === 'json') &&
              typeof savedVal === 'string'
            )
              merged[key] = savedVal;
          }
        }
        setConfigDraftValues(merged);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setConfigFieldOrder([]);
        setConfigFieldTypes({});
        setConfigDraftValues({});
        appendFlashLog(
          t('modal.logs.configTemplateLoadFailed', { error: normalizePortErrorMessage(error) })
        );
      } finally {
        if (!isCancelled) {
          setIsConfigTemplateLoading(false);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [isModalOpen, selectedFirmware?.id, selectedFirmware?.configTemplatePath]);

  function asSerialPort(port: unknown): SerialPortLike | null {
    if (!port || typeof port !== 'object') {
      return null;
    }

    return port as SerialPortLike;
  }

  function isPortOpen(port: unknown): boolean {
    const serialPort = asSerialPort(port);
    return Boolean(serialPort?.readable || serialPort?.writable);
  }

  async function getGrantedPorts(): Promise<unknown[]> {
    const serialApi = (navigator as SerialNavigator).serial;
    if (!serialApi?.getPorts) {
      return [];
    }

    try {
      return await serialApi.getPorts();
    } catch {
      return [];
    }
  }

  async function getFirstOpenGrantedPort(): Promise<unknown | null> {
    const ports = await getGrantedPorts();
    return ports.find((port) => isPortOpen(port)) ?? null;
  }

  async function closeOpenGrantedPorts(excludedPorts: unknown[] = []): Promise<number> {
    const excluded = new Set(excludedPorts);
    const ports = await getGrantedPorts();
    let closedCount = 0;

    for (const port of ports) {
      if (excluded.has(port)) {
        continue;
      }

      const serialPort = asSerialPort(port);
      if (!serialPort?.close || !isPortOpen(port)) {
        continue;
      }

      try {
        await serialPort.close();
        closedCount += 1;
      } catch {
        // Ignore close failures for already-closing ports.
      }
    }

    return closedCount;
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function isLikelyPortBusyMessage(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
      normalized.includes('failed to open serial port') ||
      normalized.includes('already open') ||
      normalized.includes('resource busy') ||
      normalized.includes('access denied') ||
      normalized.includes('networkerror') ||
      normalized.includes('device is already in use') ||
      normalized.includes('port is busy')
    );
  }

  function getErrorMessage(error: unknown): string {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return t('modal.logs.userCancelled');
    }

    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }

    if (typeof error === 'string' && error.trim().length > 0) {
      return error;
    }

    return t('errors.unexpected');
  }

  function normalizePortErrorMessage(error: unknown): string {
    const message = getErrorMessage(error);
    if (message === t('modal.logs.userCancelled')) {
      return message;
    }

    if (isLikelyPortBusyMessage(message)) {
      return t('modal.logs.portBusy');
    }

    return message;
  }

  function detectConfigFieldType(value: unknown): ConfigFieldType {
    if (typeof value === 'boolean') {
      return 'boolean';
    }
    if (typeof value === 'number') {
      return 'number';
    }
    if (typeof value === 'string') {
      return 'string';
    }
    return 'json';
  }

  function buildConfigDraftFromTemplate(template: Record<string, unknown>): {
    order: string[];
    types: Record<string, ConfigFieldType>;
    values: Record<string, string | boolean>;
  } {
    const order = Object.keys(template);
    const types: Record<string, ConfigFieldType> = {};
    const values: Record<string, string | boolean> = {};

    for (const key of order) {
      const value = template[key];
      const fieldType = detectConfigFieldType(value);
      types[key] = fieldType;

      if (fieldType === 'boolean') {
        values[key] = Boolean(value);
        continue;
      }

      if (fieldType === 'number') {
        values[key] =
          typeof value === 'number' && Number.isFinite(value) ? String(value) : '0';
        continue;
      }

      if (fieldType === 'string') {
        values[key] = typeof value === 'string' ? value : '';
        continue;
      }

      try {
        values[key] = JSON.stringify(value ?? null, null, 2);
      } catch {
        values[key] = 'null';
      }
    }

    return { order, types, values };
  }

  function buildSerialConfigPayload(): Record<string, unknown> | null {
    if (!selectedFirmware?.configTemplatePath || configFieldOrder.length === 0) {
      return null;
    }

    const payload: Record<string, unknown> = {};
    for (const key of configFieldOrder) {
      const fieldType = configFieldTypes[key];
      const rawValue = configDraftValues[key];

      if (fieldType === 'boolean') {
        payload[key] = Boolean(rawValue);
        continue;
      }

      const normalizedRaw = typeof rawValue === 'string' ? rawValue : '';
      if (fieldType === 'number') {
        const parsed = Number(normalizedRaw);
        if (!Number.isFinite(parsed)) {
          throw new Error(t('errors.invalidNumberField', { field: key }));
        }
        payload[key] = parsed;
        continue;
      }

      if (fieldType === 'string') {
        payload[key] = normalizedRaw;
        continue;
      }

      try {
        payload[key] = JSON.parse(normalizedRaw);
      } catch {
        throw new Error(t('errors.invalidJsonField', { field: key }));
      }
    }

    return payload;
  }

  function shouldIgnoreTerminalLine(line: string): boolean {
    const normalized = line.trim().toLowerCase();
    return normalized.startsWith('writing at 0x') || normalized.includes('esp32');
  }

  function getPartDisplayName(partPath: string, fileIndex: number): string {
    const normalizedPath = partPath.replace(/\\/g, '/');
    const partName = normalizedPath.split('/').pop();
    if (partName && partName.length > 0) {
      return partName;
    }
    return `part-${fileIndex + 1}`;
  }

  function formatHexAddress(value: number): string {
    return `0x${Math.max(0, value).toString(16)}`;
  }

  async function probePortAvailability(port: unknown): Promise<void> {
    const serialPort = asSerialPort(port);
    if (!serialPort || !serialPort.open || !serialPort.close) {
      return;
    }

    if (isPortOpen(serialPort)) {
      throw new Error(t('modal.logs.portBusy'));
    }

    let opened = false;
    try {
      await serialPort.open({ baudRate: 115200 });
      opened = true;
    } catch (error) {
      throw new Error(normalizePortErrorMessage(error));
    } finally {
      if (opened) {
        try {
          await serialPort.close();
        } catch {
          // Ignore close failures during availability probe.
        }
      }
    }
  }

  async function cancelSerialMonitorReaderOnly(): Promise<void> {
    const reader = serialMonitorReaderRef.current;
    serialMonitorReaderRef.current = null;
    if (reader) {
      try {
        await reader.cancel();
      } catch {
        // Reader may already be closed.
      }
      try {
        reader.releaseLock();
      } catch {
        // Ignore lock release errors.
      }
    }
  }

  async function cleanupSerialMonitorConnection(): Promise<void> {
    await cancelSerialMonitorReaderOnly();

    const monitorPort = serialMonitorPortRef.current;
    serialMonitorPortRef.current = null;
    serialMonitorOpenedLocallyRef.current = false;
    serialMonitorBufferRef.current = '';

    const serialPort = asSerialPort(monitorPort);
    if (monitorPort && serialPort?.close) {
      try {
        await serialPort.close();
      } catch {
        // Ignore close failures on monitor shutdown.
      }
    }
  }

  async function closePortIfOpen(port: unknown): Promise<boolean> {
    const serialPort = asSerialPort(port);
    if (!serialPort?.close) {
      return false;
    }

    try {
      await serialPort.close();
      return true;
    } catch {
      return false;
    }
  }

  async function releaseSelectedPort(options?: {
    silent?: boolean;
    keepSelection?: boolean;
    port?: unknown;
  }) {
    if (releasePortInFlightRef.current) {
      return;
    }

    releasePortInFlightRef.current = true;
    const silent = options?.silent ?? false;
    const keepSelection = options?.keepSelection ?? false;
    const currentPort = options?.port ?? selectedSerialPort ?? serialMonitorPortRef.current;

    setIsPortReleasing(true);
    try {
      if (isSerialMonitoring || isSerialMonitorStarting) {
        await stopSerialMonitor({ silent: true, switchToFlashLogs: false });
      }

      const wasReleased = currentPort ? await closePortIfOpen(currentPort) : false;
      const additionalReleased = await closeOpenGrantedPorts(currentPort ? [currentPort] : []);
      const releasedCount = (wasReleased ? 1 : 0) + additionalReleased;

      const remainingOpenPort = await getFirstOpenGrantedPort();
      if (remainingOpenPort) {
        setSelectedSerialPort(remainingOpenPort);
        flashSession.setPort(remainingOpenPort);
        setShowFlashConfirm(false);
        setFlashProgress(null);
        setFlashStatus('error');
        if (!silent) {
          appendFlashLog(t('modal.logs.portReleaseFailed'));
        }
        return;
      }

      if (!silent && releasedCount > 0) {
        appendFlashLog(t('modal.logs.portReleased'));
      }

      if (!keepSelection) {
        setSelectedSerialPort(null);
        setShowFlashConfirm(false);
        flashSession.clearSession();
      }
    } finally {
      setIsPortReleasing(false);
      releasePortInFlightRef.current = false;
    }
  }

  async function stopSerialMonitor(options?: { silent?: boolean; switchToFlashLogs?: boolean }) {
    const silent = options?.silent ?? false;
    const switchToFlashLogs = options?.switchToFlashLogs ?? false;
    serialMonitorStopRequestedRef.current = true;
    flashSession.requestStopMonitor();

    await cancelSerialMonitorReaderOnly();
    const exitedPromise = serialMonitorLoopExitedPromiseRef.current;
    if (exitedPromise) {
      await Promise.race([
        exitedPromise,
        new Promise<void>((resolve) => setTimeout(resolve, 3000)),
      ]);
    }
    flashSession.setReader(null);
    flashSession.setMonitoring(false);
    flashSession.setMonitorBuffer('');
    flashSession.clearStopRequested();
    setIsSerialMonitoring(false);
    setIsSerialMonitorStarting(false);

    if (switchToFlashLogs) {
      setActiveLogView('flash');
    }

    if (!silent) {
      appendSerialMonitorLog(t('modal.logs.serialMonitorStopped'));
    }
  }

  async function pulseBoardReset(port: unknown): Promise<boolean> {
    const serialPort = asSerialPort(port);
    if (!serialPort?.setSignals) {
      return false;
    }

    let openedLocally = false;
    try {
      if (!serialPort.readable && serialPort.open) {
        await serialPort.open({ baudRate: 115200 });
        openedLocally = true;
      }

      await serialPort.setSignals({ dataTerminalReady: false, requestToSend: true });
      await sleep(120);
      await serialPort.setSignals({ dataTerminalReady: false, requestToSend: false });
      await sleep(120);
      return true;
    } finally {
      if (openedLocally && serialPort.close) {
        try {
          await serialPort.close();
        } catch {
          // Ignore close failures after reset pulse.
        }
      }
    }
  }

  async function sendFirstBootSerialConfig(
    port: unknown,
    payload: Record<string, unknown>,
    options?: { keepPortOpenForMonitor?: boolean }
  ): Promise<void> {
    if (!selectedFirmware?.configTemplatePath) {
      return;
    }

    const serialPort = asSerialPort(port);
    if (!serialPort?.open) {
      appendFlashLog(t('modal.logs.serialConfigUnsupported'));
      return;
    }

    const prefix = selectedFirmware.serialConfigPrefix ?? 'WEBCFG:';
    const readyMarker = 'WEBCFG:READY';
    const baudRate = selectedFirmware.serialConfigBaudRate ?? 115200;
    const payloadLine = `${prefix}${JSON.stringify(payload)}\n`;
    const waitReadyTimeoutMs = 25000;
    let openedLocally = false;

    try {
      if (!isPortOpen(serialPort)) {
        await serialPort.open({ baudRate });
        openedLocally = true;
      }

      const readable = serialPort.readable;
      if (!readable) {
        appendFlashLog(t('modal.logs.serialConfigNoReadable'));
        return;
      }

      const reader = readable.getReader();
      appendFlashLog(
        t('modal.logs.serialConfigWaitingReadyLong', { seconds: String(waitReadyTimeoutMs / 1000) })
      );

      if (serialPort.setSignals) {
        appendFlashLog(t('modal.logs.resetStart'));
        await serialPort.setSignals({ dataTerminalReady: false, requestToSend: true });
        await sleep(120);
        await serialPort.setSignals({ dataTerminalReady: false, requestToSend: false });
        await sleep(120);
        appendFlashLog(t('modal.logs.resetDone'));
      }

      const decoder = new TextDecoder();
      let buffer = '';
      const deadline = Date.now() + waitReadyTimeoutMs;
      let readySeen = false;

      try {
        while (Date.now() < deadline) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value?.length) {
            buffer += decoder.decode(value, { stream: true });
            if (buffer.length > 1024) buffer = buffer.slice(-512);
            if (buffer.includes(readyMarker)) {
              readySeen = true;
              break;
            }
          }
          await sleep(20);
        }
      } finally {
        reader.releaseLock();
      }

      if (!readySeen) {
        appendFlashLog(t('modal.logs.serialConfigReadyTimeout'));
        return;
      }

      appendFlashLog(t('modal.logs.serialConfigReadyReceived'));
      const writable = serialPort.writable;
      if (!writable) {
        appendFlashLog(t('modal.logs.serialConfigNoWritable'));
        return;
      }

      appendFlashLog(t('modal.logs.serialConfigSending'));
      const writer = writable.getWriter();
      const encoder = new TextEncoder();
      const maxEchoLen = 500;
      const echoLine =
        payloadLine.length <= maxEchoLen
          ? payloadLine.trim()
          : payloadLine.slice(0, maxEchoLen).trim() + '...';
      appendFlashLog(`${t('modal.logs.sentToBoard')} ${echoLine}`, 'serial_out');
      try {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          await writer.write(encoder.encode(payloadLine));
          await sleep(140);
        }
      } finally {
        writer.releaseLock();
      }

      appendFlashLog(t('modal.logs.serialConfigSent'));
    } catch (error) {
      appendFlashLog(
        t('modal.logs.serialConfigSendFailed', { error: normalizePortErrorMessage(error) })
      );
    } finally {
      const keepOpen = options?.keepPortOpenForMonitor === true;
      if (openedLocally && serialPort.close && !keepOpen) {
        try {
          await serialPort.close();
        } catch {
          // Ignore close failures after config transmission.
        }
      }
    }
  }

  function teardownFlashSession(updateUiState: boolean) {
    if (updateUiState) {
      setIsDialogMounted(false);
      setFlashProgress(null);
      setIsFlashing(false);
    }
  }

  useEffect(() => {
    return () => {
      teardownFlashSession(false);
      serialMonitorStopRequestedRef.current = true;
      const reader = serialMonitorReaderRef.current;
      if (reader) {
        void reader.cancel();
      }
      flashSession.setMonitoring(false);
      flashSession.setReader(null);
    };
  }, []);

  function openFirmwareModal(firmware: FirmwareSoftware) {
    if (
      firmware.id === flashingFirmwareIdRef.current &&
      isFlashing
    ) {
      setIsModalOpen(true);
      return;
    }
    flashSessionClosedRef.current = false;
    if (flashSession.hasSession()) {
      const state = flashSession.getState();
      setSelectedSerialPort(state.port);
      setFlashLogs(state.flashLogs);
      setSerialMonitorLogs(state.serialMonitorLogs);
      setIsSerialMonitoring(!!state.reader);
      setIsFlashing(state.isFlashing);
      setFlashProgress(state.flashProgress);
      setFlashStatus(state.flashStatus);
      setShowFlashConfirm(state.showFlashConfirm);
      setActiveLogView(state.isFlashing ? 'flash' : state.activeLogView);
      serialMonitorPortRef.current = state.port;
      serialMonitorReaderRef.current = state.reader;
      serialMonitorOpenedLocallyRef.current = state.openedLocally;
      serialMonitorBufferRef.current = state.monitorBuffer;
    } else {
      teardownFlashSession(true);
      setSelectedSerialPort(null);
      setFlashStatus('idle');
      setFlashLogs([]);
      setSerialMonitorLogs([]);
      setShowFlashConfirm(false);
      terminalBufferRef.current = '';
      serialMonitorBufferRef.current = '';
      lastProgressPercentRef.current = -1;
      partProgressByIndexRef.current = {};
      lastProgressBytesRef.current = 0;
      lastProgressAddressRef.current = 0;
      setActiveLogView('flash');
    }
    setSelectedFirmware(firmware);
    setIsModalOpen(true);
    setManifestToken(Date.now());
    setEraseBeforeFlash(true);
    setIsCopyingLogs(false);
    setIsPortReleasing(false);
    setIsPortPicking(false);
    setIsConfigTemplateLoading(false);
    setConfigFieldOrder([]);
    setConfigFieldTypes({});
    setConfigDraftValues({});
  }

  function closeFirmwareModal() {
    if (isFlashing) {
      setIsModalOpen(false);
      return;
    }
    flashSessionClosedRef.current = true;
    teardownFlashSession(true);
    setIsModalOpen(false);
    setSelectedFirmware(null);
    setManifestToken(0);
    setFlashStatus('idle');
    setEraseBeforeFlash(true);
    setShowFlashConfirm(false);
    setIsCopyingLogs(false);
    setIsPortReleasing(false);
    setIsPortPicking(false);
    setActiveLogView('flash');
    setIsConfigTemplateLoading(false);
    setConfigFieldOrder([]);
    setConfigFieldTypes({});
    setConfigDraftValues({});
    terminalBufferRef.current = '';
    lastProgressPercentRef.current = -1;
    partProgressByIndexRef.current = {};
    lastProgressBytesRef.current = 0;
    lastProgressAddressRef.current = 0;
    // Keep port, flashLogs, serialMonitorLogs and selectedSerialPort in session so reopening or locale change resumes
  }

  function resolvePartUrl(manifestPath: string, partPath: string): string {
    if (/^https?:\/\//i.test(partPath)) {
      return partPath;
    }

    const base = new URL(manifestPath, window.location.origin);
    return new URL(partPath, base).toString();
  }

  async function fetchBinary(url: string): Promise<Uint8Array> {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Unable to fetch firmware binary: ${url}`);
    }
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }

  async function loadManifest(manifestPath: string): Promise<FirmwareManifest> {
    const response = await fetch(manifestPath, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Manifest fetch failed (${response.status})`);
    }

    return (await response.json()) as FirmwareManifest;
  }

  async function loadConfigTemplate(templatePath: string): Promise<Record<string, unknown>> {
    const response = await fetch(templatePath, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Config template fetch failed (${response.status})`);
    }

    const parsed = (await response.json()) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(t('errors.invalidConfigFormat'));
    }

    return parsed as Record<string, unknown>;
  }

  function buildTerminalLogger(): EsptoolTerminal {
    return {
      clean() {
        terminalBufferRef.current = '';
      },
      writeLine(data: string) {
        const trimmed = data.trim();
        if (trimmed.length > 0 && !shouldIgnoreTerminalLine(trimmed)) {
          appendFlashLog(trimmed, 'build');
        }
      },
      write(data: string) {
        terminalBufferRef.current += data;
        const lines = terminalBufferRef.current.split('\n');
        terminalBufferRef.current = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.length > 0 && !shouldIgnoreTerminalLine(trimmed)) {
            appendFlashLog(trimmed, 'build');
          }
        }
      },
    };
  }

  function formatSelectedPort(port: unknown): string | null {
    const maybePort = asSerialPort(port);
    if (!maybePort?.getInfo) {
      return null;
    }

    try {
      const info = maybePort.getInfo();
      if (!info) {
        return null;
      }

      const vendor =
        typeof info.usbVendorId === 'number'
          ? `0x${info.usbVendorId.toString(16)}`
          : 'n/a';
      const product =
        typeof info.usbProductId === 'number'
          ? `0x${info.usbProductId.toString(16)}`
          : 'n/a';

      return `VID ${vendor} / PID ${product}`;
    } catch {
      return null;
    }
  }

  async function openPortForFlashing() {
    if (!selectedFirmware) {
      return;
    }

    if (openPortInFlightRef.current) {
      return;
    }

    if (isPortReleasing) {
      return;
    }

    if (!isGoogleChrome || !isWebSerialSupported) {
      setFlashProgress(null);
      setFlashStatus('error');
      appendFlashLog(t('modal.logs.chromeRequired'));
      return;
    }

    if (!window.isSecureContext) {
      setFlashProgress(null);
      setFlashStatus('error');
      appendFlashLog(t('modal.logs.notSecureContext'));
      return;
    }

    if (selectedSerialPort) {
      setFlashStatus('dialog_ready');
      setShowFlashConfirm(true);
      appendFlashLog(t('modal.logs.portAlreadySelected'));
      return;
    }

    const alreadyOpenPort = await getFirstOpenGrantedPort();
    if (alreadyOpenPort) {
      setSelectedSerialPort(alreadyOpenPort);
      flashSession.setPort(alreadyOpenPort);
      setFlashProgress(null);
      setFlashStatus('error');
      setShowFlashConfirm(false);
      appendFlashLog(t('modal.logs.portAlreadyOpen'));
      return;
    }

    openPortInFlightRef.current = true;
    setIsPortPicking(true);
    setShowFlashConfirm(false);
    setSelectedSerialPort(null);
    setFlashStatus('waiting_for_port');
    setActiveLogView('flash');
    appendFlashLog(t('modal.logs.requestingPort'));

    try {
      const serialApi = (navigator as SerialNavigator).serial;
      if (!serialApi) {
        throw new Error(t('modal.logs.chromeRequired'));
      }

      const pickedPort = await serialApi.requestPort({});
      appendFlashLog(t('modal.logs.checkingPort'));
      await probePortAvailability(pickedPort);
      setSelectedSerialPort(pickedPort);
      flashSession.setPort(pickedPort);
      setShowFlashConfirm(true);
      setFlashStatus('dialog_ready');
      appendFlashLog(t('modal.logs.portSelected'));
      const portLabel = formatSelectedPort(pickedPort);
      if (portLabel) {
        appendFlashLog(t('modal.logs.portInfo', { info: portLabel }));
      }
      appendFlashLog(t('modal.logs.portAvailable'));
      appendFlashLog(t('modal.logs.readyToConfirm'));
    } catch (error) {
      const message = normalizePortErrorMessage(error);
      if (message === t('modal.logs.userCancelled')) {
        setFlashStatus('idle');
      } else {
        setFlashProgress(null);
        setFlashStatus('error');
      }
      appendFlashLog(t('modal.logs.flashError', { error: message }));
    } finally {
      setIsPortPicking(false);
      openPortInFlightRef.current = false;
    }
  }

  async function startIntegratedFlasher() {
    if (!selectedFirmware) {
      return;
    }

    if (flashStartInFlightRef.current) {
      return;
    }

    if (isPortReleasing) {
      return;
    }

    if (!selectedSerialPort) {
      appendFlashLog(t('modal.logs.noPortSelected'));
      return;
    }

    if (!isGoogleChrome || !isWebSerialSupported) {
      setFlashProgress(null);
      setFlashStatus('error');
      appendFlashLog(t('modal.logs.chromeRequired'));
      return;
    }

    if (!window.isSecureContext) {
      setFlashProgress(null);
      setFlashStatus('error');
      appendFlashLog(t('modal.logs.notSecureContext'));
      return;
    }

    if (selectedFirmware.configTemplatePath && isConfigTemplateLoading) {
      setFlashProgress(null);
      setFlashStatus('error');
      appendFlashLog(t('modal.logs.configTemplateStillLoading'));
      return;
    }

    let serialConfigPayload: Record<string, unknown> | null = null;
    try {
      serialConfigPayload = buildSerialConfigPayload();
    } catch (error) {
      setFlashProgress(null);
      setFlashStatus('error');
      appendFlashLog(t('modal.logs.flashError', { error: normalizePortErrorMessage(error) }));
      return;
    }

    flashStartInFlightRef.current = true;
    flashSessionClosedRef.current = false;
    suppressSerialConsoleErrorsRef.current = true;
    flashingFirmwareIdRef.current = selectedFirmware?.id ?? null;
    try {
      if (flashSession.getState().reader != null || isSerialMonitoring || isSerialMonitorStarting) {
        await stopSerialMonitor({ silent: true, switchToFlashLogs: true });
        await sleep(300);
      }

      teardownFlashSession(true);
      setIsFlashing(true);
      setIsDialogMounted(true);
      setShowFlashConfirm(false);
      setFlashProgress(0);
      setManifestToken(Date.now());
      setFlashStatus('loading');
      flashSession.setFlashState({
        isFlashing: true,
        flashProgress: 0,
        flashStatus: 'loading',
        showFlashConfirm: false,
      });
      setActiveLogView('flash');
      lastProgressPercentRef.current = -1;
      partProgressByIndexRef.current = {};
      lastProgressBytesRef.current = 0;
      lastProgressAddressRef.current = 0;
      terminalBufferRef.current = '';
      appendFlashLog(t('modal.logs.flashConfirmed'));

      let transport: EsptoolTransport | null = null;
      let flashSucceeded = false;

      try {
      appendFlashLog(t('modal.logs.loadingFlasherLib'));

      const dynamicImport = new Function(
        'modulePath',
        'return import(modulePath);'
      ) as (modulePath: string) => Promise<unknown>;

      const moduleCandidates = [
        'https://cdn.jsdelivr.net/npm/esptool-js/+esm',
        'https://esm.sh/esptool-js?bundle',
      ];

      let esptoolModule: EsptoolModule | null = null;
      let lastLoadError: unknown = null;

      for (const moduleUrl of moduleCandidates) {
        try {
          esptoolModule = (await dynamicImport(moduleUrl)) as EsptoolModule;
          appendFlashLog(t('modal.logs.flasherLibLoadedFrom', { url: moduleUrl }));
          break;
        } catch (error) {
          lastLoadError = error;
          appendFlashLog(t('modal.logs.flasherLibLoadFailed', { url: moduleUrl }));
        }
      }

      if (!esptoolModule) {
        throw lastLoadError instanceof Error
          ? lastLoadError
          : new Error('Unable to load esptool-js');
      }

      if (selectedSerialPort) {
        await closePortIfOpen(selectedSerialPort);
        await sleep(600);
      }

      const terminal = buildTerminalLogger();
      // Disable low-level transport tracing to avoid noisy timeout errors in console.
      transport = new esptoolModule.Transport(selectedSerialPort, false);

      appendFlashLog(t('modal.logs.connectingBootloader'));
      const loader = new esptoolModule.ESPLoader({
        transport,
        baudrate: 115200,
        terminal,
        debugLogging: false,
      });

      const detectedChip = await loader.main();
      const chipFamily = normalizeChipFamily(detectedChip);
      appendFlashLog(t('modal.logs.chipDetected', { chip: detectedChip }));
      appendFlashLog(t('modal.logs.chipFamilyUsed', { chip: chipFamily }));

      const manifest = await loadManifest(manifestUrl);
      appendFlashLog(t('modal.logs.manifestLoaded'));

      const build = manifest.builds.find(
        (candidate) => candidate.chipFamily.toUpperCase() === chipFamily.toUpperCase()
      );
      if (!build) {
        throw new Error(
          t('modal.logs.unsupportedChip', {
            chip: `${detectedChip} -> ${chipFamily}`,
          })
        );
      }

      flashSession.setFlashState({
        isFlashing: true,
        flashProgress: flashSession.getState().flashProgress,
        flashStatus: 'loading',
        showFlashConfirm: false,
      });
      appendFlashLog(t('modal.logs.downloadingBinaries'));

      const binaries: Array<{
        address: number;
        bytes: Uint8Array;
        binaryString: string;
        path: string;
      }> = [];
      for (const part of build.parts) {
        const resolvedPath = resolvePartUrl(manifestUrl, part.path);
        const bytes = await fetchBinary(resolvedPath);
        const partName = getPartDisplayName(part.path, binaries.length);
        binaries.push({
          address: part.offset,
          bytes,
          binaryString: uint8ToBinaryString(bytes),
          path: part.path,
        });
        appendFlashLog(
          t('modal.logs.fileDownloaded', { path: partName, size: String(bytes.byteLength) })
        );
      }

      const prefixTotals: number[] = [];
      let globalTotal = 0;
      for (const binary of binaries) {
        prefixTotals.push(globalTotal);
        globalTotal += binary.bytes.byteLength;
      }

      if (eraseBeforeFlash) {
        setFlashStatus('erasing');
        flashSession.setFlashState({
          isFlashing: true,
          flashProgress: flashSession.getState().flashProgress,
          flashStatus: 'erasing',
          showFlashConfirm: false,
        });
        appendFlashLog(t('modal.logs.eraseStart'));
        await loader.eraseFlash();
        appendFlashLog(t('modal.logs.eraseDone'));
      }

      setFlashStatus('installing');
      flashSession.setFlashState({
        isFlashing: true,
        flashProgress: flashSession.getState().flashProgress,
        flashStatus: 'installing',
        showFlashConfirm: false,
      });
      appendFlashLog(t('modal.logs.startWrite'));

      await loader.writeFlash({
        fileArray: binaries.map((binary) => ({
          data: binary.binaryString,
          address: binary.address,
        })),
        eraseAll: false,
        compress: true,
        flashMode: 'keep',
        flashFreq: 'keep',
        flashSize: 'keep',
        reportProgress: (fileIndex, written, total) => {
          const currentBinary = binaries[fileIndex];
          const fileOffset = currentBinary?.address ?? 0;
          const boundedTotal = Math.max(1, total);
          const boundedWritten = Math.max(0, Math.min(written, boundedTotal));
          const partTotalBytes = currentBinary?.bytes.byteLength ?? boundedTotal;
          const partRatio = Math.min(1, boundedWritten / boundedTotal);
          const estimatedPartWritten = Math.min(
            partTotalBytes,
            Math.floor(partTotalBytes * partRatio)
          );
          const globalWritten = Math.min(
            globalTotal,
            (prefixTotals[fileIndex] ?? 0) + estimatedPartWritten
          );
          const stableGlobalWritten = Math.max(lastProgressBytesRef.current, globalWritten);
          lastProgressBytesRef.current = stableGlobalWritten;

          const percentage =
            globalTotal > 0 ? Math.floor((stableGlobalWritten / globalTotal) * 100) : 0;
          const stablePercentage = Math.max(lastProgressPercentRef.current, percentage);
          const stableAddress = Math.max(
            lastProgressAddressRef.current,
            fileOffset + estimatedPartWritten
          );
          lastProgressAddressRef.current = stableAddress;
          setFlashProgress(stablePercentage);
          flashSession.setFlashState({
            isFlashing: true,
            flashProgress: stablePercentage,
            flashStatus: 'installing',
            showFlashConfirm: false,
          });

          if (stablePercentage !== lastProgressPercentRef.current) {
            lastProgressPercentRef.current = stablePercentage;
          }

          const partProgressPercent = Math.floor(partRatio * 100);
          const previousPartProgress = partProgressByIndexRef.current[fileIndex] ?? -1;
          const stablePartProgress = Math.max(previousPartProgress, partProgressPercent);
          if (stablePartProgress !== previousPartProgress) {
            partProgressByIndexRef.current[fileIndex] = stablePartProgress;
            const partName = getPartDisplayName(currentBinary?.path ?? '', fileIndex);
            appendFlashLog(
              t('modal.logs.partWriteProgress', {
                name: partName,
                address: formatHexAddress(fileOffset),
                current: formatHexAddress(fileOffset + estimatedPartWritten),
                value: String(stablePartProgress),
              })
            );
          }
        },
      });

      await loader.after();
      setFlashProgress(100);
      if (!flashSessionClosedRef.current) {
        setFlashStatus(serialConfigPayload ? 'installing' : 'finished');
      }
      flashSession.setFlashState({
        isFlashing: !flashSessionClosedRef.current,
        flashProgress: 100,
        flashStatus: flashSessionClosedRef.current ? 'error' : serialConfigPayload ? 'installing' : 'finished',
        showFlashConfirm: false,
      });
      appendFlashLog(t('modal.logs.finished'));
      flashSucceeded = true;
    } catch (error) {
      const message = normalizePortErrorMessage(error);
      if (!flashSessionClosedRef.current) {
        setFlashProgress(null);
        setFlashStatus('error');
        flashSession.setFlashState({
          isFlashing: false,
          flashProgress: null,
          flashStatus: 'error',
          showFlashConfirm: false,
        });
      }
      appendFlashLog(t('modal.logs.flashError', { error: message }));
      } finally {
        if (transport) {
          try {
            await transport.disconnect();
          } catch {
            // Ignore disconnect errors; port may already be closed.
          }
        }
        if (selectedSerialPort) {
          await closePortIfOpen(selectedSerialPort);
        }
        if (flashSucceeded && selectedSerialPort) {
          if (serialConfigPayload) {
            setFlashStatus('configuring');
            flashSession.setFlashState({
              isFlashing: true,
              flashProgress: 100,
              flashStatus: 'configuring',
              showFlashConfirm: false,
            });
            appendFlashLog(t('modal.logs.serialConfigHandshakeMode'));
            await sendFirstBootSerialConfig(selectedSerialPort, serialConfigPayload);
          } else {
            appendFlashLog(t('modal.logs.resetStart'));
            try {
              const hasReset = await pulseBoardReset(selectedSerialPort);
              appendFlashLog(hasReset ? t('modal.logs.resetDone') : t('modal.logs.resetSkipped'));
            } catch (error) {
              appendFlashLog(t('modal.logs.resetFailed', { error: normalizePortErrorMessage(error) }));
            }
          }
        }
        if (flashSucceeded) {
          flashSession.setActiveLogView('serial');
          setActiveLogView('serial');
        }
        setIsFlashing(false);
        flashSession.setFlashState({
          isFlashing: false,
          flashProgress: flashSucceeded ? 100 : null,
          flashStatus: flashSucceeded ? (serialConfigPayload ? 'configuring' : 'finished') : 'error',
          showFlashConfirm: false,
        });
        if (flashSucceeded) {
          void startSerialMonitor({ ignoreFlashingGuard: true });
        } else if (selectedSerialPort) {
          await closePortIfOpen(selectedSerialPort);
        }
      }
    } finally {
      flashStartInFlightRef.current = false;
      flashingFirmwareIdRef.current = null;
      setTimeout(() => {
        suppressSerialConsoleErrorsRef.current = false;
      }, 1500);
    }
  }

  async function copyLogsToClipboard() {
    const logsToCopy =
      activeLogView === 'serial' ? [...flashLogs, ...serialMonitorLogs] : flashLogs;
    if (logsToCopy.length === 0 || isCopyingLogs || copyLogsInFlightRef.current) {
      return;
    }
    copyLogsInFlightRef.current = true;
    setIsCopyingLogs(true);
    const text = logsToCopy.map((e) => e.text).join('\n');
    const appendCopyMessage = (success: boolean) => {
      const message = success ? t('modal.logs.logsCopied') : t('modal.logs.logsCopyFailed');
      if (activeLogView === 'serial') {
        appendSerialMonitorLog(message);
      } else {
        appendFlashLog(message);
      }
    };

    try {
      await navigator.clipboard.writeText(text);
      appendCopyMessage(true);
    } catch {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        appendCopyMessage(true);
      } catch {
        appendCopyMessage(false);
      }
    } finally {
      setIsCopyingLogs(false);
      copyLogsInFlightRef.current = false;
    }
  }

  async function startSerialMonitor(options?: { ignoreFlashingGuard?: boolean }) {
    const ignoreFlashingGuard = options?.ignoreFlashingGuard ?? false;
    const hasActiveReader = flashSession.getState().reader != null;
    if (
      (!ignoreFlashingGuard && isFlashing) ||
      isSerialMonitorStarting ||
      hasActiveReader ||
      isPortReleasing
    ) {
      return;
    }

    if (!isGoogleChrome || !isWebSerialSupported) {
      setActiveLogView('flash');
      appendFlashLog(t('modal.logs.chromeRequired'));
      return;
    }

    if (!window.isSecureContext) {
      setActiveLogView('flash');
      appendFlashLog(t('modal.logs.notSecureContext'));
      return;
    }

    setIsSerialMonitorStarting(true);
    flashSession.setActiveLogView('serial');
    setActiveLogView('serial');
    serialMonitorStopRequestedRef.current = false;
    appendSerialMonitorLog(t('modal.logs.serialMonitorStarting'));

    try {
      let monitorPort = selectedSerialPort;
      const alreadyOpenPort = await getFirstOpenGrantedPort();
      if (!monitorPort && alreadyOpenPort) {
        monitorPort = alreadyOpenPort;
        setSelectedSerialPort(alreadyOpenPort);
        flashSession.setPort(alreadyOpenPort);
      }

      if (!monitorPort) {
        appendSerialMonitorLog(t('modal.logs.serialMonitorRequestingPort'));
        const serialApi = (navigator as SerialNavigator).serial;
        if (!serialApi) {
          throw new Error(t('modal.logs.chromeRequired'));
        }
        monitorPort = await serialApi.requestPort({});
        setSelectedSerialPort(monitorPort);
        flashSession.setPort(monitorPort);
        appendSerialMonitorLog(t('modal.logs.portSelected'));
      }

      const serialPort = asSerialPort(monitorPort);
      if (!serialPort?.open) {
        throw new Error(t('modal.logs.serialMonitorUnsupported'));
      }

      if (!flashSession.getState().reader && (serialPort.readable || serialPort.writable) && serialPort.close) {
        try {
          await serialPort.close();
          await sleep(250);
        } catch {
          // Ignore; we will try open() next.
        }
      }

      if (!serialPort.readable) {
        await serialPort.open({ baudRate: 115200 });
        serialMonitorOpenedLocallyRef.current = true;
      } else {
        serialMonitorOpenedLocallyRef.current = false;
      }

      if (!serialPort.readable) {
        throw new Error(t('modal.logs.serialMonitorNoReadable'));
      }

      serialMonitorPortRef.current = monitorPort;
      serialMonitorBufferRef.current = '';
      const reader = serialPort.readable.getReader();
      serialMonitorReaderRef.current = reader;
      flashSession.setPort(monitorPort);
      flashSession.setReader(reader);
      flashSession.setOpenedLocally(serialMonitorOpenedLocallyRef.current);
      flashSession.setMonitoring(true);
      flashSession.clearStopRequested();
      setIsSerialMonitoring(true);
      setIsSerialMonitorStarting(false);
      appendSerialMonitorLog(t('modal.logs.serialMonitorStarted'));
      setFlashStatus('finished');
      flashSession.setFlashState({
        isFlashing: false,
        flashProgress: flashSession.getState().flashProgress,
        flashStatus: 'finished',
        showFlashConfirm: false,
      });

      let resolveLoopExited: () => void;
      serialMonitorLoopExitedPromiseRef.current = new Promise<void>((resolve) => {
        resolveLoopExited = resolve;
      });
      serialMonitorLoopExitedResolveRef.current = () => resolveLoopExited();

      const decoder = new TextDecoder();
      while (!serialMonitorStopRequestedRef.current && !flashSession.isStopRequested()) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        if (!value || value.length === 0) {
          continue;
        }

        serialMonitorBufferRef.current += decoder.decode(value, { stream: true });
        flashSession.setMonitorBuffer(serialMonitorBufferRef.current);
        const lines = serialMonitorBufferRef.current.split(/\r?\n/);
        serialMonitorBufferRef.current = lines.pop() ?? '';
        flashSession.setMonitorBuffer(serialMonitorBufferRef.current);
        for (const line of lines) {
          if (line.length > 0) {
            appendSerialMonitorLog(line);
          }
        }
      }

      const tail = serialMonitorBufferRef.current.trim();
      if (tail.length > 0) {
        appendSerialMonitorLog(tail);
      }
    } catch (error) {
      appendSerialMonitorLog(
        t('modal.logs.serialMonitorError', { error: normalizePortErrorMessage(error) })
      );
    } finally {
      const stoppedByUser = serialMonitorStopRequestedRef.current || flashSession.isStopRequested();
      await cleanupSerialMonitorConnection();
      flashSession.setReader(null);
      flashSession.setMonitoring(false);
      flashSession.setMonitorBuffer('');
      flashSession.clearStopRequested();
      setIsSerialMonitoring(false);
      setIsSerialMonitorStarting(false);
      serialMonitorStopRequestedRef.current = false;
      serialMonitorLoopExitedResolveRef.current?.();
      serialMonitorLoopExitedResolveRef.current = null;
      serialMonitorLoopExitedPromiseRef.current = null;
      if (!stoppedByUser) {
        appendSerialMonitorLog(t('modal.logs.serialMonitorStopped'));
      }
    }
  }

  function clearActiveLogs() {
    if (activeLogView === 'serial') {
      flashSession.clearLogs('serial');
      return;
    }
    flashSession.clearLogs('flash');
  }

  const manifestUrl = selectedFirmware
    ? `${selectedFirmware.manifestPath}?ts=${manifestToken}`
    : '';
  const hasSelectedPort = Boolean(selectedSerialPort);
  const isSelectedPortOpen =
    Boolean(selectedSerialPort && isPortOpen(selectedSerialPort)) ||
    isSerialMonitoring ||
    isSerialMonitorStarting ||
    isFlashing;
  const isPortSessionReserved = hasSelectedPort || isSelectedPortOpen;
  const flashProgressValue =
    flashProgress === null ? 0 : Math.max(0, Math.min(100, Math.round(flashProgress)));
  const visibleLogs =
    activeLogView === 'serial' ? [...flashLogs, ...serialMonitorLogs] : flashLogs;

  return (
    <>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('sections.firmwares')}</h2>
        {firmwareSoftwares.length === 0 && <p className={styles.infoText}>{t('states.noFirmware')}</p>}
        {firmwareSoftwares.length > 0 && (
          <div className={styles.grid}>
            {firmwareSoftwares.map((software) => (
              <article key={software.id} className={styles.card}>
                <div>
                  <h3 className={styles.cardTitle}>{localize(software.name, locale)}</h3>
                  <p className={styles.cardDescription}>{localize(software.description, locale)}</p>
                </div>
                <p className={styles.cardMeta}>
                  <strong>{t('cards.boardLabel')}:</strong> {software.board}
                </p>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => openFirmwareModal(software)}
                >
                  {t('cards.openFlasher')}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('sections.desktop')}</h2>
        {desktopSoftwares.length === 0 && <p className={styles.infoText}>{t('states.noDesktop')}</p>}
        {desktopSoftwares.length > 0 && (
          <div className={styles.grid}>
            {desktopSoftwares.map((software) => (
              <article key={software.id} className={styles.card}>
                <div>
                  <h3 className={styles.cardTitle}>{localize(software.name, locale)}</h3>
                  <p className={styles.cardDescription}>{localize(software.description, locale)}</p>
                </div>
                <p className={styles.cardMeta}>
                  <strong>{t('cards.licenseLabel')}:</strong> {localize(software.license, locale)}
                </p>
                <p className={styles.badge}>{t(`desktopStatus.${software.status}`)}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      {isModalOpen && selectedFirmware && (
        <div className={styles.modalOverlay} onClick={closeFirmwareModal}>
          <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className={styles.closeButton}
              onClick={closeFirmwareModal}
              aria-label={t('modal.close')}
            >
              ×
            </button>

            <h3 className={styles.modalTitle}>{localize(selectedFirmware.name, locale)}</h3>

            {!isGoogleChrome || !isWebSerialSupported ? (
              <p className={styles.warningText}>{t('modal.chromeOnly')}</p>
            ) : (
              <p className={styles.infoText}>{t('modal.chromeReady')}</p>
            )}

            {selectedFirmware.configTemplatePath && (
              <div className={styles.configSection}>
                {isConfigTemplateLoading && (
                  <div className={styles.configSectionHeader}>
                    <span className={styles.cardMeta}>{t('states.loadingConfig')}</span>
                  </div>
                )}
                {!isConfigTemplateLoading && configFieldOrder.length > 0 && (
                  <>
                    <div className={styles.configTabs}>
                      {CONFIG_TAB_ORDER.map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          className={
                            configTab === tab
                              ? `${styles.configTab} ${styles.configTabActive}`
                              : styles.configTab
                          }
                          onClick={() => setConfigTab(tab)}
                        >
                          {t(`modal.configTabs.${tab}`)}
                        </button>
                      ))}
                    </div>
                    <div className={styles.formGrid}>
                      {(() => {
                        const allTabKeysSet = new Set(
                          CONFIG_TAB_ORDER.flatMap(
                            (t) => CONFIG_FIELDS_BY_TAB[t]
                          )
                        );
                        const baseForTab = (
                          CONFIG_FIELDS_BY_TAB[configTab] ?? []
                        ).filter(
                          (key) =>
                            configFieldOrder.includes(key) &&
                            !CONFIG_UI_HIDDEN_KEYS.has(key)
                        );
                        const extraGeneral =
                          configTab === 'general'
                            ? configFieldOrder.filter(
                                (key) =>
                                  !CONFIG_UI_HIDDEN_KEYS.has(key) &&
                                  !allTabKeysSet.has(key)
                              )
                            : [];
                        const fieldKeysForTab = [
                          ...baseForTab,
                          ...extraGeneral,
                        ];
                        return fieldKeysForTab;
                      })().map((fieldKey) => {
                          const fieldType = configFieldTypes[fieldKey];
                          const fieldValue = configDraftValues[fieldKey];
                          const selectSpec = CONFIG_SELECT_FIELDS[fieldKey];
                          const fieldLabel =
                            t(`modal.configFields.${fieldKey}` as any) || fieldKey;

                          return (
                            <div key={fieldKey} className={styles.field}>
                              <span className={styles.fieldLabel}>
                                {fieldLabel}
                              </span>
                              {fieldType === 'boolean' ? (
                                <label className={styles.checkboxField}>
                                  <input
                                    type="checkbox"
                                    className={styles.checkboxInput}
                                    checked={Boolean(fieldValue)}
                                    onChange={(event) => {
                                      const nextValue =
                                        event.currentTarget.checked;
                                      setConfigDraftValues((previous) => {
                                        const next = {
                                          ...previous,
                                          [fieldKey]: nextValue,
                                        };
                                        if (selectedFirmware?.id)
                                          persistConfigDraft(
                                            selectedFirmware.id,
                                            next
                                          );
                                        return next;
                                      });
                                    }}
                                  />
                                  <span className={styles.cardMeta}>
                                    {Boolean(fieldValue) ? 'true' : 'false'}
                                  </span>
                                </label>
                              ) : selectSpec ? (
                                <select
                                  className={styles.input}
                                  value={
                                    typeof fieldValue === 'string'
                                      ? fieldValue
                                      : String(fieldValue ?? '')
                                  }
                                  onChange={(event) => {
                                    const nextValue =
                                      event.currentTarget.value;
                                    setConfigDraftValues((previous) => {
                                      const next = {
                                        ...previous,
                                        [fieldKey]: nextValue,
                                      };
                                      if (selectedFirmware?.id)
                                        persistConfigDraft(
                                          selectedFirmware.id,
                                          next
                                        );
                                      return next;
                                    });
                                  }}
                                >
                                  {selectSpec.values.map((v) => (
                                    <option key={v} value={String(v)}>
                                      {t(
                                        `modal.configOptions.${selectSpec.optionPrefix}_${v}` as any
                                      )}
                                    </option>
                                  ))}
                                </select>
                              ) : fieldType === 'json' ? (
                                <textarea
                                  className={styles.textarea}
                                  value={
                                    typeof fieldValue === 'string'
                                      ? fieldValue
                                      : ''
                                  }
                                  onChange={(event) => {
                                    const nextValue =
                                      event.currentTarget.value;
                                    setConfigDraftValues((previous) => {
                                      const next = {
                                        ...previous,
                                        [fieldKey]: nextValue,
                                      };
                                      if (selectedFirmware?.id)
                                        persistConfigDraft(
                                          selectedFirmware.id,
                                          next
                                        );
                                      return next;
                                    });
                                  }}
                                />
                              ) : (
                                <input
                                  type={
                                    fieldType === 'number' ? 'number' : 'text'
                                  }
                                  className={styles.input}
                                  value={
                                    typeof fieldValue === 'string'
                                      ? fieldValue
                                      : ''
                                  }
                                  onChange={(event) => {
                                    const nextValue =
                                      event.currentTarget.value;
                                    setConfigDraftValues((previous) => {
                                      const next = {
                                        ...previous,
                                        [fieldKey]: nextValue,
                                      };
                                      if (selectedFirmware?.id)
                                        persistConfigDraft(
                                          selectedFirmware.id,
                                          next
                                        );
                                      return next;
                                    });
                                  }}
                                />
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={isPortSessionReserved ? styles.secondaryButton : styles.flashButton}
                onClick={() => {
                  if (isPortSessionReserved) {
                    void releaseSelectedPort();
                    return;
                  }
                  void openPortForFlashing();
                }}
                disabled={
                  !isGoogleChrome ||
                  !isWebSerialSupported ||
                  isFlashing ||
                  isPortPicking ||
                  isSerialMonitorStarting ||
                  isPortReleasing
                }
              >
                {isPortReleasing
                  ? t('modal.releasingPort')
                  : isPortSessionReserved
                    ? t('modal.releasePort')
                    : isPortPicking
                      ? t('modal.openingPort')
                      : t('modal.openPort')}
              </button>
              {showFlashConfirm && (
                <>
                  <button
                    type="button"
                    className={styles.confirmFlashButton}
                    onClick={() => {
                      void startIntegratedFlasher();
                    }}
                    disabled={
                      !isGoogleChrome ||
                      !isWebSerialSupported ||
                      isFlashing ||
                      isConfigTemplateLoading ||
                      isSerialMonitoring ||
                      isSerialMonitorStarting ||
                      isPortReleasing
                    }
                  >
                    {t('modal.confirmFlash')}
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => {
                      void releaseSelectedPort({ silent: true });
                      setFlashStatus('idle');
                      appendFlashLog(t('modal.logs.portReset'));
                    }}
                    disabled={isFlashing || isPortReleasing}
                  >
                    {t('modal.cancelFlash')}
                  </button>
                </>
              )}
              {selectedSerialPort && (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => {
                    if (isSerialMonitoring || isSerialMonitorStarting) {
                      void stopSerialMonitor({ switchToFlashLogs: false });
                      return;
                    }
                    void startSerialMonitor();
                  }}
                  disabled={isFlashing || isPortPicking || isPortReleasing}
                >
                  {isSerialMonitoring
                    ? t('modal.stopSerialMonitor')
                    : isSerialMonitorStarting
                      ? t('modal.startingSerialMonitor')
                      : t('modal.startSerialMonitor')}
                </button>
              )}
            </div>

            <div className={styles.flashPanel}>
              <div className={styles.flashPanelHeader}>
                {!isDialogMounted && !flashSession.hasSession() && (
                  <p className={`${styles.infoText} ${styles.flashPanelHint}`}>
                    {t('modal.dialogPlaceholder')}
                  </p>
                )}
                <div className={styles.flashPanelHeaderRight}>
                  {(flashStatus === 'loading' || flashStatus === 'erasing' || flashStatus === 'configuring' || (isFlashing && flashStatus === 'installing')) && (
                    <span className={styles.flashLoader} aria-hidden="true" />
                  )}
                  <span className={`${styles.flashStatusBadge} ${statusClassName(flashStatus)}`}>
                    {t(`modal.status.${flashStatus}`)}
                  </span>
                </div>
              </div>
              {flashProgress !== null && flashStatus !== 'error' && (
                <>
                  <p className={styles.cardMeta}>
                    {t('modal.progressLabel', { value: flashProgressValue })}
                  </p>
                  <div
                    className={styles.progressBar}
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={flashProgressValue}
                    aria-label={t('modal.progressLabel', { value: flashProgressValue })}
                  >
                    <span
                      className={styles.progressBarFill}
                      style={{ width: `${flashProgressValue}%` }}
                    />
                  </div>
                </>
              )}
              <div className={styles.liveLogs}>
                <div className={styles.liveLogsHeader}>
                  <p className={styles.liveLogsTitle}>
                    {activeLogView === 'serial'
                      ? t('modal.serialMonitorTitle')
                      : t('modal.liveLogsTitle')}
                  </p>
                  <div className={styles.logActions}>
                    <button
                      type="button"
                      className={styles.logActionButton}
                      onClick={() => {
                        void copyLogsToClipboard();
                      }}
                      disabled={visibleLogs.length === 0 || isCopyingLogs}
                    >
                      {isCopyingLogs ? t('modal.copyingLogs') : t('modal.copyLogs')}
                    </button>
                    <button
                      type="button"
                      className={styles.logActionButton}
                      onClick={clearActiveLogs}
                      disabled={visibleLogs.length === 0}
                    >
                      {t('modal.clearLiveLogs')}
                    </button>
                  </div>
                </div>
                <pre ref={logContainerRef} className={styles.logPre}>
                  {visibleLogs.length > 0
                    ? visibleLogs.map((entry, i) => (
                        <span
                          key={i}
                          className={styles.logLine}
                          data-log-type={entry.type}
                        >
                          {entry.text}
                          {'\n'}
                        </span>
                      ))
                    : t('modal.liveLogsEmpty')}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

