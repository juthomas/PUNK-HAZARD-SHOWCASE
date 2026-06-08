'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import styles from './page.module.css';

type SerialPortLike = {
  readable?: ReadableStream<Uint8Array> | null;
  open?: (options: { baudRate: number }) => Promise<void>;
  close?: () => Promise<void>;
};
type SerialNavigator = Navigator & {
  serial?: { requestPort: () => Promise<unknown> };
};
type LogEntry = { text: string };
type HexRow = { offset: number; hex: string; ascii: string };
type JsonEvent = { timestamp: string; parsed: string };
type LogicFrame = { timestamp: string; hex: string; char: string; bitsLsbFirst: string };
type NumericSample = { timestamp: number; value: number };
type GraphPoint = { x: number; y: number; timestamp: number; value: number };
type ViewType = 'terminal' | 'hexdump' | 'json' | 'graph' | 'logic';
type SplitDirection = 'horizontal' | 'vertical';
type DropSide = 'left' | 'right' | 'top' | 'bottom' | 'center';

type DockTab = { id: string; view: ViewType };
type LeafNode = {
  kind: 'leaf';
  id: string;
  tabs: DockTab[];
  activeTabId: string | null;
};
type SplitNode = {
  kind: 'split';
  id: string;
  direction: SplitDirection;
  ratio: number;
  first: LayoutNode;
  second: LayoutNode;
};
type LayoutNode = LeafNode | SplitNode;

const MAX_LOGS = 500;
const MAX_HEX_ROWS = 300;
const MAX_JSON_EVENTS = 120;
const MAX_JSON_ERRORS = 80;
const MAX_LOGIC_FRAMES = 300;
const MAX_SERIES_POINTS = 260;
const GRAPH_COLORS = ['#79d9cf', '#9fc6ff', '#ffcf6a', '#ff9ac6', '#b7ff9a', '#caa8ff'];
const CHART_WIDTH = 560;
const CHART_HEIGHT = 190;
const VIEWS: ViewType[] = ['terminal', 'hexdump', 'json', 'graph', 'logic'];
const TAB_TEMPLATE_MIME = 'text/x-monitor-tab-template-view';

function asSerialPort(port: unknown): SerialPortLike | null {
  return port && typeof port === 'object' ? (port as SerialPortLike) : null;
}
function formatTime(locale: string): string {
  return new Date().toLocaleTimeString(locale === 'en' ? 'en-GB' : 'fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
function toPrintableAscii(byte: number): string {
  return byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.';
}
function flattenNumericFields(value: unknown, prefix: string, output: Array<{ key: string; value: number }>) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    output.push({ key: prefix || 'value', value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenNumericFields(item, `${prefix}[${index}]`, output));
    return;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => flattenNumericFields(item, prefix ? `${prefix}.${key}` : key, output));
  }
}
function computeNiceStep(rawStep: number): number {
  const safe = Math.max(0.000001, rawStep);
  const magnitude = 10 ** Math.floor(Math.log10(safe));
  const normalized = safe / magnitude;
  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function findLeaf(node: LayoutNode, leafId: string): LeafNode | null {
  if (node.kind === 'leaf') return node.id === leafId ? node : null;
  return findLeaf(node.first, leafId) ?? findLeaf(node.second, leafId);
}

function findSplit(node: LayoutNode, splitId: string): SplitNode | null {
  if (node.kind === 'leaf') return null;
  if (node.id === splitId) return node;
  return findSplit(node.first, splitId) ?? findSplit(node.second, splitId);
}

function findFirstLeaf(node: LayoutNode): LeafNode {
  if (node.kind === 'leaf') return node;
  return findFirstLeaf(node.first);
}

function mapLeaf(node: LayoutNode, leafId: string, updater: (leaf: LeafNode) => LeafNode): LayoutNode {
  if (node.kind === 'leaf') return node.id === leafId ? updater(node) : node;
  return {
    ...node,
    first: mapLeaf(node.first, leafId, updater),
    second: mapLeaf(node.second, leafId, updater),
  };
}

function mapSplit(node: LayoutNode, splitId: string, updater: (split: SplitNode) => SplitNode): LayoutNode {
  if (node.kind === 'leaf') return node;
  if (node.id === splitId) return updater(node);
  return {
    ...node,
    first: mapSplit(node.first, splitId, updater),
    second: mapSplit(node.second, splitId, updater),
  };
}

function splitLeaf(
  node: LayoutNode,
  leafId: string,
  direction: SplitDirection,
  createLeaf: () => LeafNode,
  createSplitId: () => string
): LayoutNode {
  if (node.kind === 'leaf') {
    if (node.id !== leafId) return node;
    return {
      kind: 'split',
      id: createSplitId(),
      direction,
      ratio: 0.5,
      first: node,
      second: createLeaf(),
    };
  }
  return {
    ...node,
    first: splitLeaf(node.first, leafId, direction, createLeaf, createSplitId),
    second: splitLeaf(node.second, leafId, direction, createLeaf, createSplitId),
  };
}

function splitLeafWithSibling(
  node: LayoutNode,
  leafId: string,
  direction: SplitDirection,
  insertion: 'before' | 'after',
  sibling: LeafNode,
  createSplitId: () => string
): LayoutNode {
  if (node.kind === 'leaf') {
    if (node.id !== leafId) return node;
    const first = insertion === 'before' ? sibling : node;
    const second = insertion === 'before' ? node : sibling;
    return {
      kind: 'split',
      id: createSplitId(),
      direction,
      ratio: 0.5,
      first,
      second,
    };
  }
  return {
    ...node,
    first: splitLeafWithSibling(node.first, leafId, direction, insertion, sibling, createSplitId),
    second: splitLeafWithSibling(node.second, leafId, direction, insertion, sibling, createSplitId),
  };
}

function removeLeafNode(node: LayoutNode, leafId: string): LayoutNode | null {
  if (node.kind === 'leaf') return node.id === leafId ? null : node;

  const first = removeLeafNode(node.first, leafId);
  const second = removeLeafNode(node.second, leafId);

  if (!first && !second) return null;
  if (!first) return second;
  if (!second) return first;
  return { ...node, first, second };
}

function collectTabs(node: LayoutNode): DockTab[] {
  if (node.kind === 'leaf') return node.tabs;
  return [...collectTabs(node.first), ...collectTabs(node.second)];
}

export default function MonitorClient() {
  const t = useTranslations('softwaresMonitor');
  const locale = useLocale() === 'en' ? 'en' : 'fr';

  const [isGoogleChrome, setIsGoogleChrome] = useState(false);
  const [isWebSerialSupported, setIsWebSerialSupported] = useState(false);
  const [baudRate, setBaudRate] = useState('115200');
  const [selectedPort, setSelectedPort] = useState<unknown | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [hexRows, setHexRows] = useState<HexRow[]>([]);
  const [jsonEvents, setJsonEvents] = useState<JsonEvent[]>([]);
  const [jsonParseErrors, setJsonParseErrors] = useState<string[]>([]);
  const [logicFrames, setLogicFrames] = useState<LogicFrame[]>([]);
  const [numericSeriesByKey, setNumericSeriesByKey] = useState<Record<string, NumericSample[]>>({});
  const [visibleSeriesKeys, setVisibleSeriesKeys] = useState<string[]>([]);
  const [historyWindowSec, setHistoryWindowSec] = useState(60);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverGraphKey, setHoverGraphKey] = useState<string | null>(null);

  const idCounterRef = useRef(1);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const simulatorTimerRef = useRef<number | null>(null);
  const decoderRef = useRef(new TextDecoder());
  const stopRequestedRef = useRef(false);
  const bufferRef = useRef('');
  const byteOffsetRef = useRef(0);
  const hasAutoSelectedSeriesRef = useRef(false);
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  const makeId = (prefix: string) => {
    const id = `${prefix}-${idCounterRef.current}`;
    idCounterRef.current += 1;
    return id;
  };

  const createTab = (view: ViewType): DockTab => ({ id: makeId(`tab-${view}`), view });
  const createLeaf = (initialView: ViewType | null): LeafNode => {
    const tab = initialView ? createTab(initialView) : null;
    return {
      kind: 'leaf',
      id: makeId('leaf'),
      tabs: tab ? [tab] : [],
      activeTabId: tab?.id ?? null,
    };
  };

  const [layoutRoot, setLayoutRoot] = useState<LayoutNode>(() => createLeaf('terminal'));
  const [activeLeafId, setActiveLeafId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<{ leafId: string; side: DropSide } | null>(null);
  const [dragSourceLeafId, setDragSourceLeafId] = useState<string | null>(null);

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
    const keys = Object.keys(numericSeriesByKey).sort((a, b) => a.localeCompare(b));
    setVisibleSeriesKeys((previous) => {
      if (keys.length === 0) {
        hasAutoSelectedSeriesRef.current = false;
        return [];
      }
      const retained = previous.filter((k) => keys.includes(k));
      if (retained.length > 0) return retained;
      if (!hasAutoSelectedSeriesRef.current) {
        hasAutoSelectedSeriesRef.current = true;
        return keys.slice(0, Math.min(4, keys.length));
      }
      return [];
    });
  }, [numericSeriesByKey]);

  useEffect(() => {
    return () => {
      resizeCleanupRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (activeLeafId && findLeaf(layoutRoot, activeLeafId)) return;
    setActiveLeafId(findFirstLeaf(layoutRoot).id);
  }, [activeLeafId, layoutRoot]);

  function appendLog(message: string) {
    setLogs((previous) => [...previous, { text: `[${formatTime(locale)}] ${message}` }].slice(-MAX_LOGS));
  }

  function resetAnalyses() {
    bufferRef.current = '';
    byteOffsetRef.current = 0;
    decoderRef.current = new TextDecoder();
    setHexRows([]);
    setJsonEvents([]);
    setJsonParseErrors([]);
    setLogicFrames([]);
    setNumericSeriesByKey({});
    setVisibleSeriesKeys([]);
    setHoverX(null);
    setHoverGraphKey(null);
    hasAutoSelectedSeriesRef.current = false;
  }

  function appendHexRowsFromChunk(bytes: Uint8Array) {
    const baseOffset = byteOffsetRef.current;
    const rows: HexRow[] = [];
    for (let index = 0; index < bytes.length; index += 16) {
      const slice = bytes.slice(index, index + 16);
      rows.push({
        offset: baseOffset + index,
        hex: Array.from(slice).map((b) => b.toString(16).padStart(2, '0')).join(' '),
        ascii: Array.from(slice).map((b) => toPrintableAscii(b)).join(''),
      });
    }
    byteOffsetRef.current = baseOffset + bytes.length;
    setHexRows((previous) => [...previous, ...rows].slice(-MAX_HEX_ROWS));
  }

  function appendLogicFramesFromChunk(bytes: Uint8Array) {
    const timestamp = formatTime(locale);
    const frames: LogicFrame[] = Array.from(bytes).map((byte) => ({
      timestamp,
      hex: `0x${byte.toString(16).padStart(2, '0').toUpperCase()}`,
      char: toPrintableAscii(byte),
      bitsLsbFirst: Array.from({ length: 8 }, (_, i) => (((byte >> i) & 1) === 1 ? '1' : '0')).join(''),
    }));
    setLogicFrames((previous) => [...previous, ...frames].slice(-MAX_LOGIC_FRAMES));
  }

  function appendJsonAnalysisLine(line: string) {
    const trimmed = line.trim();
    if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      setJsonEvents((previous) =>
        [...previous, { timestamp: formatTime(locale), parsed: JSON.stringify(parsed, null, 2) }].slice(
          -MAX_JSON_EVENTS
        )
      );
      const extracted: Array<{ key: string; value: number }> = [];
      flattenNumericFields(parsed, '', extracted);
      if (extracted.length > 0) {
        const now = Date.now();
        setNumericSeriesByKey((previous) => {
          const next = { ...previous };
          extracted.forEach((item) => {
            next[item.key] = [...(next[item.key] ?? []), { timestamp: now, value: item.value }].slice(
              -MAX_SERIES_POINTS
            );
          });
          return next;
        });
      }
    } catch {
      setJsonParseErrors((previous) => [...previous, trimmed].slice(-MAX_JSON_ERRORS));
    }
  }

  function processIncomingChunk(bytes: Uint8Array) {
    appendHexRowsFromChunk(bytes);
    appendLogicFramesFromChunk(bytes);
    bufferRef.current += decoderRef.current.decode(bytes, { stream: true });
    const lines = bufferRef.current.split(/\r?\n/);
    bufferRef.current = lines.pop() ?? '';
    lines.forEach((line) => {
      if (!line.length) return;
      appendLog(line);
      appendJsonAnalysisLine(line);
    });
  }

  function flushDecoderTail() {
    bufferRef.current += decoderRef.current.decode();
    const tail = bufferRef.current.trim();
    if (tail.length > 0) {
      appendLog(tail);
      appendJsonAnalysisLine(tail);
    }
    bufferRef.current = '';
  }

  async function stopMonitoring() {
    stopRequestedRef.current = true;
    if (simulatorTimerRef.current !== null) {
      window.clearInterval(simulatorTimerRef.current);
      simulatorTimerRef.current = null;
    }
    setIsSimulating(false);
    const reader = readerRef.current;
    readerRef.current = null;
    if (reader) {
      try {
        await reader.cancel();
      } catch {}
      try {
        reader.releaseLock();
      } catch {}
    }
    const serialPort = asSerialPort(selectedPort);
    if (serialPort?.close) {
      try {
        await serialPort.close();
      } catch {}
    }
    setSelectedPort(null);
    setIsMonitoring(false);
    appendLog(t('logs.stopped'));
  }

  async function startMonitoring() {
    if (isConnecting || isMonitoring || isSimulating) return;
    if (!isGoogleChrome || !isWebSerialSupported) return appendLog(t('logs.chromeRequired'));
    if (!window.isSecureContext) return appendLog(t('logs.notSecureContext'));
    const parsedBaud = Number(baudRate);
    if (!Number.isFinite(parsedBaud) || parsedBaud <= 0) return appendLog(t('logs.invalidBaud'));

    setIsConnecting(true);
    stopRequestedRef.current = false;
    resetAnalyses();
    try {
      const serialApi = (navigator as SerialNavigator).serial;
      if (!serialApi) throw new Error(t('logs.chromeRequired'));
      const port = await serialApi.requestPort();
      const serialPort = asSerialPort(port);
      if (!serialPort?.open) throw new Error(t('logs.noPort'));
      await serialPort.open({ baudRate: parsedBaud });
      if (!serialPort.readable) throw new Error(t('logs.noReadable'));
      const reader = serialPort.readable.getReader();
      readerRef.current = reader;
      setSelectedPort(port);
      setIsMonitoring(true);
      appendLog(t('logs.started', { baud: String(parsedBaud) }));
      while (!stopRequestedRef.current) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value?.length) processIncomingChunk(value);
      }
      flushDecoderTail();
    } catch (error) {
      appendLog(t('logs.error', { error: error instanceof Error ? error.message : t('logs.unknownError') }));
    } finally {
      setIsConnecting(false);
      if (!stopRequestedRef.current) await stopMonitoring();
    }
  }

  function startSimulation() {
    if (isConnecting || isMonitoring || isSimulating) return;
    stopRequestedRef.current = false;
    resetAnalyses();
    setIsSimulating(true);
    appendLog(t('logs.simulationStarted'));
    const encoder = new TextEncoder();
    let tick = 0;
    simulatorTimerRef.current = window.setInterval(() => {
      if (stopRequestedRef.current) return;
      tick += 1;
      const message = {
        temp: Number((20 + Math.random() * 8).toFixed(2)),
        rpm: 880 + Math.floor(Math.random() * 420),
        voltage: Number((11 + Math.random() * 1.8).toFixed(2)),
        signal: tick % 2,
      };
      processIncomingChunk(encoder.encode(`${JSON.stringify(message)}\n`));
      processIncomingChunk(
        Uint8Array.from([0x55, 0xaa, tick & 0xff, Math.floor(Math.random() * 255), 0x03, 0x0d, 0x0a])
      );
    }, 220);
  }

  const numericSeriesKeys = Object.keys(numericSeriesByKey).sort((a, b) => a.localeCompare(b));
  const graphData = useMemo(() => {
    const minTimestamp = Date.now() - historyWindowSec * 1000;
    const activeKeys = visibleSeriesKeys.filter((key) => numericSeriesByKey[key]?.length);
    const byKey: Record<string, NumericSample[]> = {};
    activeKeys.forEach((key) => {
      byKey[key] = (numericSeriesByKey[key] ?? []).filter((point) => point.timestamp >= minTimestamp);
    });
    const allPoints = activeKeys.flatMap((key) => byKey[key] ?? []);
    if (allPoints.length < 2) {
      return {
        minValue: 0,
        maxValue: 0,
        minTs: 0,
        maxTs: 0,
        gridLines: [] as Array<{ y: number; value: number }>,
        paths: [] as Array<{ key: string; color: string; d: string; points: GraphPoint[] }>,
      };
    }

    const rawMin = Math.min(...allPoints.map((point) => point.value));
    const rawMax = Math.max(...allPoints.map((point) => point.value));
    const step = computeNiceStep(Math.max(0.000001, rawMax - rawMin) / 4);
    const minValue = Math.floor(rawMin / step) * step;
    const maxValue = Math.ceil(rawMax / step) * step;
    const valueSpan = Math.max(step, maxValue - minValue);
    const minTs = Math.min(...allPoints.map((point) => point.timestamp));
    const maxTs = Math.max(...allPoints.map((point) => point.timestamp));
    const tsSpan = Math.max(1, maxTs - minTs);

    const gridLines = Array.from({ length: Math.max(2, Math.round(valueSpan / step) + 1) }, (_, index) => {
      const value = maxValue - index * step;
      return { value, y: CHART_HEIGHT - ((value - minValue) / valueSpan) * CHART_HEIGHT };
    });
    const paths = activeKeys
      .map((key, index) => {
        const points = (byKey[key] ?? []).map((point) => ({
          timestamp: point.timestamp,
          value: point.value,
          x: ((point.timestamp - minTs) / tsSpan) * CHART_WIDTH,
          y: CHART_HEIGHT - ((point.value - minValue) / valueSpan) * CHART_HEIGHT,
        }));
        if (points.length < 2) return null;
        const d = points
          .map((point, pointIndex) => `${pointIndex === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
          .join(' ');
        return { key, color: GRAPH_COLORS[index % GRAPH_COLORS.length], d, points };
      })
      .filter((item): item is { key: string; color: string; d: string; points: GraphPoint[] } => item !== null);

    return { minValue, maxValue, minTs, maxTs, gridLines, paths };
  }, [historyWindowSec, numericSeriesByKey, visibleSeriesKeys]);

  const hoverData = useMemo(() => {
    if (hoverX === null || graphData.paths.length === 0 || graphData.maxTs <= graphData.minTs) return null;
    const targetTs =
      graphData.minTs + (Math.max(0, Math.min(CHART_WIDTH, hoverX)) / CHART_WIDTH) * (graphData.maxTs - graphData.minTs);
    let anchor: { point: GraphPoint; diff: number } | null = null;
    for (const series of graphData.paths) {
      for (const point of series.points) {
        const diff = Math.abs(point.timestamp - targetTs);
        if (!anchor || diff < anchor.diff) anchor = { point, diff };
      }
    }
    if (!anchor) return null;
    const lockedTs = anchor.point.timestamp;
    const x = ((lockedTs - graphData.minTs) / (graphData.maxTs - graphData.minTs)) * CHART_WIDTH;
    const rows: Array<{ key: string; color: string; value: number; y: number }> = [];
    for (const series of graphData.paths) {
      let nearest: GraphPoint | null = null;
      let bestDiff = Number.POSITIVE_INFINITY;
      for (const point of series.points) {
        const diff = Math.abs(point.timestamp - lockedTs);
        if (diff < bestDiff) {
          nearest = point;
          bestDiff = diff;
        }
      }
      if (nearest) rows.push({ key: series.key, color: series.color, value: nearest.value, y: nearest.y });
    }
    return {
      x,
      timeLabel: new Date(lockedTs).toLocaleTimeString(locale === 'en' ? 'en-GB' : 'fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      rows,
    };
  }, [graphData, hoverX, locale]);

  const chartEmptyMessage =
    visibleSeriesKeys.length === 0 && numericSeriesKeys.length > 0
      ? t('panes.noSeriesSelected')
      : t('panes.notEnoughPoints');

  function addTab(leafId: string, view: ViewType) {
    setLayoutRoot((previous) => {
      const leaf = findLeaf(previous, leafId);
      if (!leaf) return previous;
      const tab = createTab(view);
      return mapLeaf(previous, leafId, (current) => ({
        ...current,
        tabs: [...current.tabs, tab],
        activeTabId: tab.id,
      }));
    });
  }

  function setActiveTab(leafId: string, tabId: string) {
    setActiveLeafId(leafId);
    setLayoutRoot((previous) =>
      mapLeaf(previous, leafId, (current) => ({
        ...current,
        activeTabId: tabId,
      }))
    );
  }

  function closeTab(leafId: string, tabId: string) {
    setLayoutRoot((previous) => {
      const leaf = findLeaf(previous, leafId);
      if (!leaf) return previous;
      const tabs = leaf.tabs.filter((tab) => tab.id !== tabId);
      if (tabs.length > 0) {
        return mapLeaf(previous, leafId, (current) => ({
          ...current,
          tabs,
          activeTabId: current.activeTabId === tabId ? tabs[0]?.id ?? null : current.activeTabId,
        }));
      }
      return removeLeafNode(previous, leafId) ?? createLeaf('terminal');
    });
  }

  function splitGroup(leafId: string, direction: SplitDirection) {
    setLayoutRoot((previous) =>
      splitLeaf(
        previous,
        leafId,
        direction,
        () => createLeaf(null),
        () => makeId('split')
      )
    );
  }

  function closeGroup(leafId: string) {
    setLayoutRoot((previous) => {
      return removeLeafNode(previous, leafId) ?? createLeaf('terminal');
    });
  }

  function moveTab(tabId: string, targetLeafId: string) {
    moveTabWithDrop(tabId, targetLeafId, 'center');
  }

  function createTabWithDrop(view: ViewType, targetLeafId: string, dropSide: DropSide) {
    let nextActiveLeaf: string | null = null;
    setLayoutRoot((previous) => {
      const createdTab = createTab(view);
      if (dropSide === 'center') {
        const resolvedTargetLeaf = findLeaf(previous, targetLeafId) ?? findFirstLeaf(previous);
        nextActiveLeaf = resolvedTargetLeaf.id;
        return mapLeaf(previous, resolvedTargetLeaf.id, (current) => ({
          ...current,
          tabs: [...current.tabs, createdTab],
          activeTabId: createdTab.id,
        }));
      }

      const resolvedTargetLeaf = findLeaf(previous, targetLeafId) ?? findFirstLeaf(previous);
      const newLeaf: LeafNode = {
        kind: 'leaf',
        id: makeId('leaf'),
        tabs: [createdTab],
        activeTabId: createdTab.id,
      };
      const direction: SplitDirection = dropSide === 'left' || dropSide === 'right' ? 'vertical' : 'horizontal';
      const insertion: 'before' | 'after' = dropSide === 'left' || dropSide === 'top' ? 'before' : 'after';
      nextActiveLeaf = newLeaf.id;
      return splitLeafWithSibling(
        previous,
        resolvedTargetLeaf.id,
        direction,
        insertion,
        newLeaf,
        () => makeId('split')
      );
    });
    setActiveLeafId(nextActiveLeaf);
  }

  function moveTabWithDrop(tabId: string, targetLeafId: string, dropSide: DropSide) {
    let nextActiveLeaf: string | null = null;
    setLayoutRoot((previous) => {
      const tabs = collectTabs(previous);
      const tab = tabs.find((item) => item.id === tabId);
      if (!tab) return previous;

      let sourceLeafId: string | null = null;
      const findSource = (node: LayoutNode): void => {
        if (node.kind === 'leaf') {
          if (node.tabs.some((item) => item.id === tabId)) sourceLeafId = node.id;
          return;
        }
        findSource(node.first);
        findSource(node.second);
      };
      findSource(previous);
      if (!sourceLeafId) return previous;
      const sourceLeaf = findLeaf(previous, sourceLeafId);
      if (!sourceLeaf) return previous;
      const movingInsideSameLeaf = sourceLeafId === targetLeafId;
      if (movingInsideSameLeaf && dropSide === 'center') {
        nextActiveLeaf = targetLeafId;
        return previous;
      }

      let next = mapLeaf(previous, sourceLeafId, (current) => {
        const remaining = current.tabs.filter((item) => item.id !== tabId);
        return {
          ...current,
          tabs: remaining,
          activeTabId:
            current.activeTabId === tabId ? remaining[0]?.id ?? null : current.activeTabId,
        };
      });

      const sourceLeafAfterMove = findLeaf(next, sourceLeafId);
      if (sourceLeafAfterMove && sourceLeafAfterMove.tabs.length === 0 && !(movingInsideSameLeaf && dropSide !== 'center')) {
        next = removeLeafNode(next, sourceLeafId) ?? createLeaf('terminal');
      }

      if (dropSide === 'center') {
        const resolvedTargetLeaf = findLeaf(next, targetLeafId) ?? findFirstLeaf(next);
        next = mapLeaf(next, resolvedTargetLeaf.id, (current) => ({
          ...current,
          tabs: [...current.tabs, tab],
          activeTabId: tab.id,
        }));
        nextActiveLeaf = resolvedTargetLeaf.id;
        return next;
      }

      const resolvedTargetLeaf = findLeaf(next, targetLeafId) ?? findFirstLeaf(next);
      const newLeaf: LeafNode = {
        kind: 'leaf',
        id: makeId('leaf'),
        tabs: [tab],
        activeTabId: tab.id,
      };
      const direction: SplitDirection = dropSide === 'left' || dropSide === 'right' ? 'vertical' : 'horizontal';
      const insertion: 'before' | 'after' = dropSide === 'left' || dropSide === 'top' ? 'before' : 'after';
      next = splitLeafWithSibling(
        next,
        resolvedTargetLeaf.id,
        direction,
        insertion,
        newLeaf,
        () => makeId('split')
      );
      nextActiveLeaf = newLeaf.id;
      return next;
    });
    setActiveLeafId(nextActiveLeaf);
  }

  function getDropSide(event: React.DragEvent<HTMLElement>, targetLeafId: string): DropSide {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return 'center';
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const isSameSourceGroup = dragSourceLeafId !== null && dragSourceLeafId === targetLeafId;
    const edgeThreshold = isSameSourceGroup
      ? Math.max(44, Math.min(180, Math.min(rect.width, rect.height) * 0.45))
      : Math.max(18, Math.min(86, Math.min(rect.width, rect.height) * 0.24));
    const distances = [
      { side: 'left' as const, distance: x },
      { side: 'right' as const, distance: rect.width - x },
      { side: 'top' as const, distance: y },
      { side: 'bottom' as const, distance: rect.height - y },
    ].sort((a, b) => a.distance - b.distance);
    if (distances[0].distance > edgeThreshold) return 'center';
    return distances[0].side;
  }

  function handleDropIntoLeaf(event: React.DragEvent<HTMLElement>, leafId: string, dropSide: DropSide) {
    const tabId = event.dataTransfer.getData('text/x-monitor-tab-id');
    const templateView = event.dataTransfer.getData(TAB_TEMPLATE_MIME) as ViewType;
    setActiveLeafId(leafId);
    setDragPreview(null);
    if (tabId) {
      moveTabWithDrop(tabId, leafId, dropSide);
      return;
    }
    if (VIEWS.includes(templateView)) createTabWithDrop(templateView, leafId, dropSide);
  }

  function startResize(splitId: string, direction: SplitDirection, event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const container = event.currentTarget.parentElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const size = direction === 'vertical' ? rect.width : rect.height;
    if (size <= 0) return;
    const startOffset = direction === 'vertical' ? rect.left : rect.top;

    const onMove = (moveEvent: PointerEvent) => {
      const currentPos = direction === 'vertical' ? moveEvent.clientX : moveEvent.clientY;
      const ratio = (currentPos - startOffset) / size;
      const nextRatio = Math.max(0.12, Math.min(0.88, ratio));
      setLayoutRoot((previous) =>
        mapSplit(previous, splitId, (split) => ({
          ...split,
          ratio: nextRatio,
        }))
      );
    };
    const onUp = () => {
      setHoverX(null);
      setHoverGraphKey(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      resizeCleanupRef.current = null;
    };

    resizeCleanupRef.current = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function renderGraphView(graphKey: string) {
    const localHoverData = hoverGraphKey === graphKey ? hoverData : null;
    return (
      <>
        <div className={styles.graphToolbar}>
          <label className={styles.historyField}>
            <span>{t('panes.historyWindow')}</span>
            <select
              className={styles.historySelect}
              value={historyWindowSec}
              onChange={(event) => setHistoryWindowSec(Number(event.currentTarget.value))}
            >
              <option value={15}>15s</option>
              <option value={30}>30s</option>
              <option value={60}>60s</option>
              <option value={180}>180s</option>
            </select>
          </label>
          <div className={styles.graphToolbarButtons}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setVisibleSeriesKeys(numericSeriesKeys)}
              disabled={numericSeriesKeys.length === 0}
            >
              {t('panes.showAll')}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setVisibleSeriesKeys([])}
              disabled={visibleSeriesKeys.length === 0}
            >
              {t('panes.hideAll')}
            </button>
          </div>
        </div>
        <div className={styles.seriesRow}>
          {numericSeriesKeys.length === 0 && <span className={styles.meta}>{t('panes.noSeries')}</span>}
          {numericSeriesKeys.map((key, index) => (
            <button
              key={key}
              type="button"
              className={visibleSeriesKeys.includes(key) ? `${styles.seriesButton} ${styles.seriesButtonActive}` : styles.seriesButton}
              onClick={() =>
                setVisibleSeriesKeys((previous) =>
                  previous.includes(key) ? previous.filter((k) => k !== key) : [...previous, key]
                )
              }
            >
              <span
                className={styles.seriesDot}
                style={{ backgroundColor: GRAPH_COLORS[index % GRAPH_COLORS.length] }}
                aria-hidden="true"
              />
              {key}
            </button>
          ))}
        </div>
        <div
          className={styles.chartWrap}
          onMouseMove={(event) => {
            const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
            if (rect.width <= 0) return;
            const x = ((event.clientX - rect.left) / rect.width) * CHART_WIDTH;
            setHoverX(Math.max(0, Math.min(CHART_WIDTH, x)));
            setHoverGraphKey(graphKey);
          }}
          onMouseLeave={() => {
            setHoverX(null);
            setHoverGraphKey(null);
          }}
        >
          {graphData.paths.length > 0 ? (
            <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className={styles.chartSvg} aria-label={t('panes.graph')}>
              {graphData.gridLines.map((line, index) => (
                <g key={`grid-${index}`}>
                  <line x1={0} x2={CHART_WIDTH} y1={line.y} y2={line.y} className={styles.chartGridLine} />
                  <text
                    x={CHART_WIDTH + 8}
                    y={line.y}
                    textAnchor="start"
                    dominantBaseline="middle"
                    className={styles.chartGridLabel}
                  >
                    {line.value.toFixed(2)}
                  </text>
                </g>
              ))}
              {graphData.paths.map((series) => (
                <path key={series.key} d={series.d} className={styles.chartPath} style={{ stroke: series.color }} />
              ))}
              {localHoverData && (
                <>
                  <line x1={localHoverData.x} x2={localHoverData.x} y1={0} y2={CHART_HEIGHT} className={styles.chartCrosshair} />
                  {localHoverData.rows.map((row) => (
                    <circle key={row.key} cx={localHoverData.x} cy={row.y} r={3} fill={row.color} stroke="rgba(0,0,0,0.55)" strokeWidth={1} />
                  ))}
                </>
              )}
            </svg>
          ) : (
            <p className={styles.meta}>{chartEmptyMessage}</p>
          )}
          {localHoverData && (
            <div
              className={styles.chartTooltip}
              style={{
                left: `${Math.max(2, Math.min(98, (localHoverData.x / CHART_WIDTH) * 100))}%`,
                transform:
                  Math.max(2, Math.min(98, (localHoverData.x / CHART_WIDTH) * 100)) > 72
                    ? 'translateX(calc(-100% - 10px))'
                    : 'translateX(10px)',
              }}
            >
              <div className={styles.chartTooltipTitle}>{localHoverData.timeLabel}</div>
              {localHoverData.rows.map((row) => (
                <div key={row.key} className={styles.chartTooltipRow}>
                  <span className={styles.seriesDot} style={{ backgroundColor: row.color }} aria-hidden="true" />
                  <span>{row.key}</span>
                  <span>{row.value.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <p className={styles.meta}>
          {t('panes.valueRange', {
            min: graphData.minValue.toFixed(2),
            max: graphData.maxValue.toFixed(2),
          })}
        </p>
      </>
    );
  }

  function renderView(view: ViewType, instanceKey: string) {
    if (view === 'terminal') {
      return (
        <pre className={styles.logPre}>
          {logs.length > 0
            ? logs.map((entry, index) => (
                <span key={`${entry.text}-${index}`} className={styles.line}>
                  {entry.text}
                  {'\n'}
                </span>
              ))
            : t('empty')}
        </pre>
      );
    }
    if (view === 'hexdump') {
      return (
        <pre className={styles.logPre}>
          {hexRows.length > 0
            ? hexRows.map((row) => (
                <span key={row.offset} className={styles.line}>
                  {`0x${row.offset.toString(16).padStart(6, '0')}`}  {row.hex}  |{row.ascii}|
                  {'\n'}
                </span>
              ))
            : t('panes.noHex')}
        </pre>
      );
    }
    if (view === 'json') {
      return (
        <>
          <p className={styles.meta}>
            {t('panes.jsonDetected', { count: jsonEvents.length })} -{' '}
            {t('panes.jsonErrors', { count: jsonParseErrors.length })}
          </p>
          <pre className={styles.logPre}>
            {jsonEvents.length > 0
              ? jsonEvents.slice(-8).map((event, index) => (
                  <span key={`${event.timestamp}-${index}`} className={styles.line}>
                    [{event.timestamp}]
                    {'\n'}
                    {event.parsed}
                    {'\n\n'}
                  </span>
                ))
              : t('panes.noJson')}
          </pre>
        </>
      );
    }
    if (view === 'logic') {
      return (
        <>
          <p className={styles.meta}>{t('panes.logicDesc', { baud: baudRate || '115200' })}</p>
          <pre className={styles.logPre}>
            {logicFrames.length > 0
              ? logicFrames.map((frame, index) => (
                  <span key={`${frame.timestamp}-${frame.hex}-${index}`} className={styles.line}>
                    [{frame.timestamp}] {frame.hex} '{frame.char}' S|{frame.bitsLsbFirst}|T
                    {'\n'}
                  </span>
                ))
              : t('panes.noLogic')}
          </pre>
        </>
      );
    }
    return renderGraphView(instanceKey);
  }

  function renderLeaf(leaf: LeafNode) {
    const activeTab = leaf.tabs.find((tab) => tab.id === leaf.activeTabId) ?? leaf.tabs[0] ?? null;
    const previewSide = dragPreview?.leafId === leaf.id ? dragPreview.side : null;
    return (
      <section
        className={leaf.id === activeLeafId ? `${styles.leafGroup} ${styles.leafGroupActive}` : styles.leafGroup}
        onPointerDown={() => setActiveLeafId(leaf.id)}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          setDragPreview({ leafId: leaf.id, side: getDropSide(event, leaf.id) });
        }}
        onDragLeave={(event) => {
          const nextTarget = event.relatedTarget as Node | null;
          if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
            setDragPreview((previous) => (previous?.leafId === leaf.id ? null : previous));
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          const dropSide = getDropSide(event, leaf.id);
          handleDropIntoLeaf(event, leaf.id, dropSide);
        }}
      >
        {previewSide && (
          <div
            className={
              previewSide === 'center'
                ? `${styles.dropOverlay} ${styles.dropOverlayCenter}`
                : `${styles.dropOverlay} ${styles.dropOverlayEdge} ${styles[`dropOverlay${previewSide[0].toUpperCase()}${previewSide.slice(1)}` as keyof typeof styles]}`
            }
            aria-hidden="true"
          />
        )}
        <div
          className={styles.tabStrip}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = 'move';
            setDragPreview({ leafId: leaf.id, side: 'center' });
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            handleDropIntoLeaf(event, leaf.id, 'center');
          }}
        >
          <div className={styles.tabList}>
            {leaf.tabs.map((tab) => (
              <div
                key={tab.id}
                className={tab.id === activeTab?.id ? `${styles.tabItem} ${styles.tabItemActive}` : styles.tabItem}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/x-monitor-tab-id', tab.id);
                  event.dataTransfer.effectAllowed = 'move';
                  setDragSourceLeafId(leaf.id);
                }}
                onDragEnd={() => {
                  setDragPreview(null);
                  setDragSourceLeafId(null);
                }}
              >
                <button
                  type="button"
                  className={styles.tabTitleBtn}
                  onClick={() => setActiveTab(leaf.id, tab.id)}
                >
                  {t(`panes.${tab.view}`)}
                </button>
                <button
                  type="button"
                  className={styles.tabCloseBtn}
                  onClick={() => closeTab(leaf.id, tab.id)}
                  aria-label={t('panes.closeTab')}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className={styles.tabControls}>
            <button
              type="button"
              className={`${styles.groupActionBtn} ${styles.groupActionIconBtn}`}
              onClick={() => splitGroup(leaf.id, 'vertical')}
              aria-label={t('panes.splitRight')}
              title={t('panes.splitRight')}
            >
              <svg viewBox="0 0 16 16" className={styles.groupActionIcon} aria-hidden="true">
                <rect x="1.75" y="2" width="12.5" height="12" rx="1.6" />
                <path d="M8 2V14" />
                <path d="M10.2 8H12.8" />
                <path d="M11.8 7L12.8 8L11.8 9" />
              </svg>
            </button>
            <button
              type="button"
              className={`${styles.groupActionBtn} ${styles.groupActionIconBtn}`}
              onClick={() => splitGroup(leaf.id, 'horizontal')}
              aria-label={t('panes.splitDown')}
              title={t('panes.splitDown')}
            >
              <svg viewBox="0 0 16 16" className={styles.groupActionIcon} aria-hidden="true">
                <rect x="1.75" y="2" width="12.5" height="12" rx="1.6" />
                <path d="M1.75 8H14.25" />
                <path d="M8 10.2V12.8" />
                <path d="M7 11.8L8 12.8L9 11.8" />
              </svg>
            </button>
            <button
              type="button"
              className={`${styles.groupActionBtn} ${styles.groupActionIconBtn}`}
              onClick={() => closeGroup(leaf.id)}
              aria-label={t('panes.closeGroup')}
              title={t('panes.closeGroup')}
            >
              <svg viewBox="0 0 16 16" className={styles.groupActionIcon} aria-hidden="true">
                <rect x="1.75" y="2" width="12.5" height="12" rx="1.6" />
                <path d="M5.4 5.4L10.6 10.6" />
                <path d="M10.6 5.4L5.4 10.6" />
              </svg>
            </button>
          </div>
        </div>
        <div className={styles.zoneBody}>
          {activeTab ? <div className={styles.viewFrame}>{renderView(activeTab.view, activeTab.id)}</div> : <p className={styles.meta}>{t('panes.emptyDropZone')}</p>}
        </div>
      </section>
    );
  }

  function renderNode(node: LayoutNode): React.ReactNode {
    if (node.kind === 'leaf') return renderLeaf(node);

    const isVertical = node.direction === 'vertical';
    return (
      <div className={isVertical ? styles.splitNodeVertical : styles.splitNodeHorizontal}>
        <div
          className={styles.splitChild}
          style={{ flex: `${node.ratio} 1 0` }}
        >
          {renderNode(node.first)}
        </div>
        <div
          className={`${styles.splitter} ${isVertical ? styles.splitterVertical : styles.splitterHorizontal}`}
          onPointerDown={(event) => startResize(node.id, node.direction, event)}
        />
        <div
          className={styles.splitChild}
          style={{ flex: `${1 - node.ratio} 1 0` }}
        >
          {renderNode(node.second)}
        </div>
      </div>
    );
  }

  function addTabTypeToActiveLeaf(view: ViewType) {
    const activeLeaf = activeLeafId ? findLeaf(layoutRoot, activeLeafId) : null;
    const targetLeaf = activeLeaf ?? findFirstLeaf(layoutRoot);
    setActiveLeafId(targetLeaf.id);
    addTab(targetLeaf.id, view);
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.controls}>
        <label className={styles.field}>
          <span>{t('baudRate')}</span>
          <input
            className={styles.input}
            type="number"
            value={baudRate}
            onChange={(event) => setBaudRate(event.currentTarget.value)}
            min={1}
            step={1}
            disabled={isMonitoring || isConnecting}
          />
        </label>
        <div className={styles.buttons}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void startMonitoring()}
            disabled={isMonitoring || isConnecting || isSimulating}
          >
            {isConnecting ? t('connecting') : t('start')}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={startSimulation}
            disabled={isMonitoring || isConnecting || isSimulating}
          >
            {t('simulate')}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => void stopMonitoring()}
            disabled={!isMonitoring && !isConnecting && !isSimulating}
          >
            {t('stop')}
          </button>
          <button type="button" className={styles.secondaryButton} onClick={resetAnalyses}>
            {t('clear')}
          </button>
        </div>
      </div>

      <div className={styles.workspaceShell}>
        <aside className={styles.sidebarDock}>
          <p className={styles.sidebarTitle}>{t('panes.tabFactoryTitle')}</p>
          <p className={styles.meta}>
            {activeLeafId
              ? t('panes.activeGroup', { id: activeLeafId })
              : t('panes.noActiveGroup')}
          </p>
          <p className={styles.sidebarHint}>{t('panes.tabFactoryHint')}</p>
          <div className={styles.templateButtons}>
            {VIEWS.map((view) => (
              <button
                key={view}
                type="button"
                draggable
                className={styles.templateBtn}
                onClick={() => addTabTypeToActiveLeaf(view)}
                onDragStart={(event) => {
                  event.dataTransfer.setData(TAB_TEMPLATE_MIME, view);
                  event.dataTransfer.effectAllowed = 'copyMove';
                  setDragSourceLeafId(null);
                }}
                onDragEnd={() => {
                  setDragPreview(null);
                  setDragSourceLeafId(null);
                }}
                title={t('panes.dragTemplateHint')}
              >
                + {t(`panes.${view}`)}
              </button>
            ))}
          </div>
        </aside>
        <div className={styles.workspaceRoot}>
          {renderNode(layoutRoot)}
        </div>
      </div>
    </div>
  );
}

