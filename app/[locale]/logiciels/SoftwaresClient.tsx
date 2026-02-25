'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { softwaresCatalog } from '@/lib/softwares';
import type { FirmwareSoftware, LocalizedText, PublicSoftware } from '@/lib/softwares';
import styles from './page.module.css';

type Locale = 'fr' | 'en';
type DesktopSoftware = Extract<PublicSoftware, { kind: 'desktop' }>;
type FlashStatus = 'idle' | 'waiting_for_port' | 'dialog_ready' | 'installing' | 'finished' | 'error';

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
  };
};

type SerialPortLike = {
  readable?: ReadableStream<Uint8Array> | null;
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
    case 'installing':
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
  const [flashStatus, setFlashStatus] = useState<FlashStatus>('idle');
  const [flashProgress, setFlashProgress] = useState<number | null>(null);
  const [flashLogs, setFlashLogs] = useState<string[]>([]);
  const [isFlashing, setIsFlashing] = useState(false);
  const [isPortPicking, setIsPortPicking] = useState(false);
  const [eraseBeforeFlash, setEraseBeforeFlash] = useState(true);
  const [showFlashConfirm, setShowFlashConfirm] = useState(false);
  const [isCopyingLogs, setIsCopyingLogs] = useState(false);
  const [isPortReleasing, setIsPortReleasing] = useState(false);
  const [isDialogMounted, setIsDialogMounted] = useState(false);
  const [selectedSerialPort, setSelectedSerialPort] = useState<unknown | null>(null);
  const [serialMonitorLogs, setSerialMonitorLogs] = useState<string[]>([]);
  const [isSerialMonitoring, setIsSerialMonitoring] = useState(false);
  const [isSerialMonitorStarting, setIsSerialMonitorStarting] = useState(false);
  const [activeLogView, setActiveLogView] = useState<'flash' | 'serial'>('flash');

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

  const firmwareSoftwares = useMemo(
    () => softwaresCatalog.filter((software): software is FirmwareSoftware => software.kind === 'firmware'),
    []
  );
  const desktopSoftwares = useMemo(
    () => softwaresCatalog.filter((software): software is DesktopSoftware => software.kind === 'desktop'),
    []
  );

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

  function appendFlashLog(message: string) {
    const timestamp = new Date().toLocaleTimeString(locale === 'en' ? 'en-GB' : 'fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    setFlashLogs((previous) => [...previous, `[${timestamp}] ${message}`].slice(-250));
  }

  function appendSerialMonitorLog(message: string) {
    const timestamp = new Date().toLocaleTimeString(locale === 'en' ? 'en-GB' : 'fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    setSerialMonitorLogs((previous) => [...previous, `[${timestamp}] ${message}`].slice(-400));
  }

  function asSerialPort(port: unknown): SerialPortLike | null {
    if (!port || typeof port !== 'object') {
      return null;
    }

    return port as SerialPortLike;
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

    if (serialPort.readable) {
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

  async function cleanupSerialMonitorConnection(): Promise<void> {
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

    const monitorPort = serialMonitorPortRef.current;
    const openedLocally = serialMonitorOpenedLocallyRef.current;
    serialMonitorPortRef.current = null;
    serialMonitorOpenedLocallyRef.current = false;
    serialMonitorBufferRef.current = '';

    const serialPort = asSerialPort(monitorPort);
    const shouldAttemptClose = Boolean(serialPort?.close) && (openedLocally || Boolean(serialPort?.readable));
    if (shouldAttemptClose && serialPort?.close) {
      try {
        await serialPort.close();
      } catch {
        // Ignore close failures on monitor shutdown.
      }
    }
  }

  async function closePortIfOpen(port: unknown): Promise<boolean> {
    const serialPort = asSerialPort(port);
    if (!serialPort?.close || !serialPort.readable) {
      return false;
    }

    try {
      await serialPort.close();
      return true;
    } catch {
      return false;
    }
  }

  async function releaseSelectedPort(options?: { silent?: boolean; keepSelection?: boolean }) {
    const silent = options?.silent ?? false;
    const keepSelection = options?.keepSelection ?? false;
    const currentPort = selectedSerialPort;
    if (!currentPort && !isSerialMonitoring && !isSerialMonitorStarting) {
      return;
    }

    setIsPortReleasing(true);
    try {
      if (isSerialMonitoring || isSerialMonitorStarting) {
        await stopSerialMonitor({ silent: true, switchToFlashLogs: false });
      }

      const wasReleased = await closePortIfOpen(currentPort);
      if (!silent && (wasReleased || Boolean(currentPort))) {
        appendFlashLog(t('modal.logs.portReleased'));
      }

      if (!keepSelection) {
        setSelectedSerialPort(null);
        setShowFlashConfirm(false);
      }
    } finally {
      setIsPortReleasing(false);
    }
  }

  async function stopSerialMonitor(options?: { silent?: boolean; switchToFlashLogs?: boolean }) {
    const silent = options?.silent ?? false;
    const switchToFlashLogs = options?.switchToFlashLogs ?? false;
    serialMonitorStopRequestedRef.current = true;

    await cleanupSerialMonitorConnection();
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
    };
  }, []);

  function openFirmwareModal(firmware: FirmwareSoftware) {
    void releaseSelectedPort({ silent: true });
    teardownFlashSession(true);
    setSelectedFirmware(firmware);
    setIsModalOpen(true);
    setManifestToken(Date.now());
    setEraseBeforeFlash(true);
    setShowFlashConfirm(false);
    setIsCopyingLogs(false);
    setIsPortReleasing(false);
    setIsPortPicking(false);
    setSelectedSerialPort(null);
    setFlashStatus('idle');
    setFlashLogs([]);
    setSerialMonitorLogs([]);
    setActiveLogView('flash');
    terminalBufferRef.current = '';
    serialMonitorBufferRef.current = '';
    lastProgressPercentRef.current = -1;
    partProgressByIndexRef.current = {};
    lastProgressBytesRef.current = 0;
    lastProgressAddressRef.current = 0;
  }

  function closeFirmwareModal() {
    void releaseSelectedPort({ silent: true });
    teardownFlashSession(true);
    setIsModalOpen(false);
    setSelectedFirmware(null);
    setManifestToken(0);
    setFlashStatus('idle');
    setFlashLogs([]);
    setSerialMonitorLogs([]);
    setEraseBeforeFlash(true);
    setShowFlashConfirm(false);
    setIsCopyingLogs(false);
    setIsPortReleasing(false);
    setIsPortPicking(false);
    setSelectedSerialPort(null);
    setActiveLogView('flash');
    terminalBufferRef.current = '';
    serialMonitorBufferRef.current = '';
    lastProgressPercentRef.current = -1;
    partProgressByIndexRef.current = {};
    lastProgressBytesRef.current = 0;
    lastProgressAddressRef.current = 0;
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

  function buildTerminalLogger(): EsptoolTerminal {
    return {
      clean() {
        terminalBufferRef.current = '';
      },
      writeLine(data: string) {
        const trimmed = data.trim();
        if (trimmed.length > 0 && !shouldIgnoreTerminalLine(trimmed)) {
          appendFlashLog(trimmed);
        }
      },
      write(data: string) {
        terminalBufferRef.current += data;
        const lines = terminalBufferRef.current.split('\n');
        terminalBufferRef.current = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.length > 0 && !shouldIgnoreTerminalLine(trimmed)) {
            appendFlashLog(trimmed);
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

    if (isPortReleasing) {
      return;
    }

    if (!isGoogleChrome || !isWebSerialSupported) {
      setFlashStatus('error');
      appendFlashLog(t('modal.logs.chromeRequired'));
      return;
    }

    if (!window.isSecureContext) {
      setFlashStatus('error');
      appendFlashLog(t('modal.logs.notSecureContext'));
      return;
    }

    if (selectedSerialPort && asSerialPort(selectedSerialPort)?.readable) {
      await releaseSelectedPort({ silent: true, keepSelection: true });
    }

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

      setFlashStatus(message === t('modal.logs.userCancelled') ? 'idle' : 'error');
      appendFlashLog(t('modal.logs.flashError', { error: message }));
    } finally {
      setIsPortPicking(false);
    }
  }

  async function startIntegratedFlasher() {
    if (!selectedFirmware) {
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
      setFlashStatus('error');
      appendFlashLog(t('modal.logs.chromeRequired'));
      return;
    }

    if (!window.isSecureContext) {
      setFlashStatus('error');
      appendFlashLog(t('modal.logs.notSecureContext'));
      return;
    }

    if (isSerialMonitoring || isSerialMonitorStarting) {
      await stopSerialMonitor({ silent: true, switchToFlashLogs: true });
    }

    teardownFlashSession(true);
    setIsFlashing(true);
    setIsDialogMounted(true);
    setShowFlashConfirm(false);
    setFlashProgress(null);
    setManifestToken(Date.now());
    setFlashStatus('installing');
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

      setFlashStatus('dialog_ready');
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
        appendFlashLog(t('modal.logs.eraseStart'));
        await loader.eraseFlash();
        appendFlashLog(t('modal.logs.eraseDone'));
      }

      setFlashStatus('installing');
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
      setFlashStatus('finished');
      appendFlashLog(t('modal.logs.finished'));
      flashSucceeded = true;
    } catch (error) {
      const message = normalizePortErrorMessage(error);

      setFlashStatus('error');
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
        appendFlashLog(t('modal.logs.resetStart'));
        try {
          const hasReset = await pulseBoardReset(selectedSerialPort);
          appendFlashLog(hasReset ? t('modal.logs.resetDone') : t('modal.logs.resetSkipped'));
        } catch (error) {
          appendFlashLog(t('modal.logs.resetFailed', { error: normalizePortErrorMessage(error) }));
        }
      }
      setIsFlashing(false);
      if (flashSucceeded) {
        void startSerialMonitor({ ignoreFlashingGuard: true });
      }
    }
  }

  async function copyLogsToClipboard() {
    const logsToCopy =
      activeLogView === 'serial' ? [...flashLogs, ...serialMonitorLogs] : flashLogs;
    if (logsToCopy.length === 0 || isCopyingLogs) {
      return;
    }

    setIsCopyingLogs(true);
    const text = logsToCopy.join('\n');
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
    }
  }

  async function startSerialMonitor(options?: { ignoreFlashingGuard?: boolean }) {
    const ignoreFlashingGuard = options?.ignoreFlashingGuard ?? false;
    if (
      (!ignoreFlashingGuard && isFlashing) ||
      isSerialMonitorStarting ||
      isSerialMonitoring ||
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
    setActiveLogView('serial');
    serialMonitorStopRequestedRef.current = false;
    appendSerialMonitorLog(t('modal.logs.serialMonitorStarting'));

    try {
      let monitorPort = selectedSerialPort;
      if (!monitorPort) {
        appendSerialMonitorLog(t('modal.logs.serialMonitorRequestingPort'));
        const serialApi = (navigator as SerialNavigator).serial;
        if (!serialApi) {
          throw new Error(t('modal.logs.chromeRequired'));
        }
        monitorPort = await serialApi.requestPort({});
        setSelectedSerialPort(monitorPort);
        appendSerialMonitorLog(t('modal.logs.portSelected'));
      }

      const serialPort = asSerialPort(monitorPort);
      if (!serialPort?.open) {
        throw new Error(t('modal.logs.serialMonitorUnsupported'));
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
      setIsSerialMonitoring(true);
      setIsSerialMonitorStarting(false);
      appendSerialMonitorLog(t('modal.logs.serialMonitorStarted'));

      const decoder = new TextDecoder();
      while (!serialMonitorStopRequestedRef.current) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        if (!value || value.length === 0) {
          continue;
        }

        serialMonitorBufferRef.current += decoder.decode(value, { stream: true });
        const lines = serialMonitorBufferRef.current.split(/\r?\n/);
        serialMonitorBufferRef.current = lines.pop() ?? '';
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
      const stoppedByUser = serialMonitorStopRequestedRef.current;
      await cleanupSerialMonitorConnection();
      setIsSerialMonitoring(false);
      setIsSerialMonitorStarting(false);
      serialMonitorStopRequestedRef.current = false;
      if (!stoppedByUser) {
        appendSerialMonitorLog(t('modal.logs.serialMonitorStopped'));
      }
    }
  }

  function clearActiveLogs() {
    if (activeLogView === 'serial') {
      setFlashLogs([]);
      setSerialMonitorLogs([]);
      return;
    }
    setFlashLogs([]);
  }

  const manifestUrl = selectedFirmware
    ? `${selectedFirmware.manifestPath}?ts=${manifestToken}`
    : '';
  const isSelectedPortOpen =
    Boolean(selectedSerialPort && asSerialPort(selectedSerialPort)?.readable) ||
    isSerialMonitoring ||
    isSerialMonitorStarting ||
    isFlashing;
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
                {software.includesFilesystemData && (
                  <p className={styles.successText}>{t('cards.includesData')}</p>
                )}
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
            <p className={styles.modalSubtitle}>{localize(selectedFirmware.description, locale)}</p>

            {!isGoogleChrome || !isWebSerialSupported ? (
              <p className={styles.warningText}>{t('modal.chromeOnly')}</p>
            ) : (
              <p className={styles.infoText}>{t('modal.chromeReady')}</p>
            )}

            <p className={styles.infoText}>{t('modal.staticNotice')}</p>
            <p className={styles.infoText}>{t('modal.staticDataNotice')}</p>

            <div className={styles.formGrid}>
              {selectedFirmware.parts.map((part) => (
                <div key={part.id} className={styles.field}>
                  <span className={styles.fieldLabel}>{localize(part.label, locale)}</span>
                  <span className={styles.cardMeta}>
                    {t('modal.offsetLabel')}: 0x{part.offset.toString(16).toUpperCase()}
                  </span>
                </div>
              ))}
            </div>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={isSelectedPortOpen ? styles.secondaryButton : styles.flashButton}
                onClick={() => {
                  if (isSelectedPortOpen) {
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
                  : isSelectedPortOpen
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
            </div>

            <div className={styles.flashPanel}>
              <div className={styles.flashPanelHeader}>
                {!isDialogMounted && (
                  <p className={`${styles.infoText} ${styles.flashPanelHint}`}>
                    {t('modal.dialogPlaceholder')}
                  </p>
                )}
                <span className={`${styles.flashStatusBadge} ${statusClassName(flashStatus)}`}>
                  {t(`modal.status.${flashStatus}`)}
                </span>
              </div>
              {flashProgress !== null && (
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
                <pre ref={logContainerRef}>
                  {visibleLogs.length > 0 ? visibleLogs.join('\n') : t('modal.liveLogsEmpty')}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

