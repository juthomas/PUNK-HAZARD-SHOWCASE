'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
type UartParity = 'none' | 'even' | 'odd';
type UartStopBits = 1 | 1.5 | 2;
type UartIdleLevel = 0 | 1;
type UartSettings = {
  dataBits: 5 | 6 | 7 | 8 | 9;
  parity: UartParity;
  stopBits: UartStopBits;
  idleLevel: UartIdleLevel;
};
type LogicLevelSegment = {
  t0Us: number;
  t1Us: number;
  level: 0 | 1;
  label?: string;
};
type UartDecodedFrame = {
  id: string;
  byte: number;
  startUs: number;
  endUs: number;
  bits: Array<{ label: string; level: 0 | 1; t0Us: number; t1Us: number }>;
};
type LogicFrameMark = {
  id: string;
  startUs: number;
  endUs: number;
  x0: number;
  x1: number;
  width: number;
  hex: string;
  ascii: string;
  dec: string;
};

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
const MAX_LOGIC_SEGMENTS = 22000;
const MAX_UART_DECODED_FRAMES = 2200;
const MAX_LOGIC_BYTES = 3600;
const MAX_SERIES_POINTS = 260;
const GRAPH_COLORS = ['#79d9cf', '#9fc6ff', '#ffcf6a', '#ff9ac6', '#b7ff9a', '#caa8ff'];
const CHART_WIDTH = 560;
const CHART_HEIGHT = 190;
const VIEWS: ViewType[] = ['terminal', 'hexdump', 'json', 'graph', 'logic'];
const TAB_TEMPLATE_MIME = 'text/x-monitor-tab-template-view';
const LOGIC_CHART_WIDTH = 1180;
const LOGIC_CHART_HEIGHT = 272;
const LOGIC_MIN_SPAN_US = 120;

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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatTimeUs(us: number): string {
  if (!Number.isFinite(us)) return '0 us';
  if (Math.abs(us) >= 1000) return `${(us / 1000).toFixed(3)} ms`;
  return `${us.toFixed(1)} us`;
}

function getParityBit(value: number, dataBits: number, parity: UartParity): 0 | 1 | null {
  if (parity === 'none') return null;
  let ones = 0;
  for (let index = 0; index < dataBits; index += 1) {
    ones += (value >> index) & 1;
  }
  const isOdd = ones % 2 === 1;
  if (parity === 'even') return isOdd ? 1 : 0;
  return isOdd ? 0 : 1;
}

function computeGridStepUs(spanUs: number): number {
  const target = Math.max(0.5, spanUs / 8);
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const normalized = target / magnitude;
  if (normalized <= 1) return 1 * magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function buildUartWaveformFromBytes(
  bytes: Uint8Array | number[],
  options: { baud: number; settings: UartSettings; startUs?: number; idPrefix?: string }
): { segments: LogicLevelSegment[]; frames: UartDecodedFrame[]; endUs: number } {
  const { baud, settings, idPrefix = 'frame' } = options;
  let timelineUs = options.startUs ?? 0;
  const bitDurationUs = 1_000_000 / baud;
  const startLevel: 0 | 1 = settings.idleLevel === 1 ? 0 : 1;
  const segments: LogicLevelSegment[] = [];
  const frames: UartDecodedFrame[] = [];

  if (timelineUs === 0) {
    segments.push({ t0Us: 0, t1Us: bitDurationUs * 0.4, level: settings.idleLevel, label: 'idle' });
    timelineUs = bitDurationUs * 0.4;
  }

  for (const byte of bytes) {
    const frameStart = timelineUs;
    const bits: UartDecodedFrame['bits'] = [];

    const pushBit = (label: string, level: 0 | 1, durationBits = 1) => {
      const t0Us = timelineUs;
      const t1Us = timelineUs + bitDurationUs * durationBits;
      bits.push({ label, level, t0Us, t1Us });
      segments.push({ t0Us, t1Us, level, label });
      timelineUs = t1Us;
    };

    pushBit('S', startLevel, 1);
    for (let index = 0; index < settings.dataBits; index += 1) {
      pushBit(`D${index}`, ((byte >> index) & 1) as 0 | 1, 1);
    }
    const parityBit = getParityBit(byte, settings.dataBits, settings.parity);
    if (parityBit !== null) pushBit('P', parityBit, 1);
    pushBit('T', settings.idleLevel, settings.stopBits);

    frames.push({
      id: `${idPrefix}-${frameStart.toFixed(2)}-${byte}`,
      byte,
      startUs: frameStart,
      endUs: timelineUs,
      bits,
    });
  }

  return { segments, frames, endUs: timelineUs };
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

function collectAllLayoutIds(node: LayoutNode): string[] {
  if (node.kind === 'leaf') return [node.id, ...node.tabs.map((tab) => tab.id)];
  return [node.id, ...collectAllLayoutIds(node.first), ...collectAllLayoutIds(node.second)];
}

function maxNumericIdSuffix(ids: string[]): number {
  let max = 0;
  for (const id of ids) {
    const match = id.match(/-(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max;
}

const logicPausedSnapshotsByTabId: Record<string, number[]> = {};

function setLogicPausedSnapshot(tabId: string, snapshot: number[]) {
  logicPausedSnapshotsByTabId[tabId] = snapshot;
}

function clearLogicPausedSnapshot(tabId: string) {
  delete logicPausedSnapshotsByTabId[tabId];
}

function clearAllLogicPausedSnapshots() {
  for (const tabId of Object.keys(logicPausedSnapshotsByTabId)) {
    delete logicPausedSnapshotsByTabId[tabId];
  }
}

type GraphTabConfig = {
  visibleSeriesKeys: string[];
  historyWindowSec: number;
};

type LogicTabConfig = {
  uartSettings: UartSettings;
  logicSpanUs: number;
  logicViewStartUs: number;
  logicViewportWidth: number;
  logicAutoFollow: boolean;
  logicPlaybackPaused: boolean;
  logicByteSkip: number;
  logicFrozenByteEnd: number | null;
  showHexDecode: boolean;
  showAsciiDecode: boolean;
  showDecimalDecode: boolean;
  selectedLogicFrameId: string | null;
  cursorAUs: number | null;
  cursorBUs: number | null;
};

function getLogicByteHistoryForTab(
  logic: LogicTabConfig,
  logicByteHistory: number[],
  streamStartByteIndex: number
): number[] {
  const streamEndByteIndex = streamStartByteIndex + logicByteHistory.length;
  const tabStart = logic.logicByteSkip;
  const tabEnd = logic.logicFrozenByteEnd ?? streamEndByteIndex;
  const arrayStart = Math.max(0, tabStart - streamStartByteIndex);
  const arrayEnd = Math.min(logicByteHistory.length, tabEnd - streamStartByteIndex);
  if (arrayStart >= arrayEnd) return [];
  return logicByteHistory.slice(arrayStart, arrayEnd);
}

function getLogicBytesForWaveform(
  tabId: string,
  logic: LogicTabConfig,
  logicByteHistory: number[],
  streamStartByteIndex: number,
  pausedSnapshots: Record<string, number[]>
): number[] {
  if (logic.logicPlaybackPaused) {
    return pausedSnapshots[tabId] ?? [];
  }
  return getLogicByteHistoryForTab(logic, logicByteHistory, streamStartByteIndex);
}

type TabInstanceConfig = {
  graph?: GraphTabConfig;
  logic?: LogicTabConfig;
};

type GraphData = {
  minValue: number;
  maxValue: number;
  minTs: number;
  maxTs: number;
  gridLines: Array<{ y: number; value: number }>;
  paths: Array<{ key: string; color: string; d: string; points: GraphPoint[] }>;
};

function createDefaultUartSettings(): UartSettings {
  return { dataBits: 8, parity: 'none', stopBits: 1, idleLevel: 1 };
}

function createDefaultLogicConfig(): LogicTabConfig {
  return {
    uartSettings: createDefaultUartSettings(),
    logicSpanUs: 2500,
    logicViewStartUs: 0,
    logicViewportWidth: LOGIC_CHART_WIDTH,
    logicAutoFollow: true,
    logicPlaybackPaused: false,
    logicByteSkip: 0,
    logicFrozenByteEnd: null,
    showHexDecode: true,
    showAsciiDecode: true,
    showDecimalDecode: false,
    selectedLogicFrameId: null,
    cursorAUs: null,
    cursorBUs: null,
  };
}

function createDefaultGraphConfig(numericKeys: string[], isFirstGraphTab: boolean): GraphTabConfig {
  return {
    visibleSeriesKeys: isFirstGraphTab ? numericKeys.slice(0, Math.min(4, numericKeys.length)) : [...numericKeys],
    historyWindowSec: 60,
  };
}

function buildGraphData(options: {
  visibleSeriesKeys: string[];
  historyWindowSec: number;
  numericSeriesByKey: Record<string, NumericSample[]>;
}): GraphData {
  const { visibleSeriesKeys, historyWindowSec, numericSeriesByKey } = options;
  const minTimestamp = Date.now() - historyWindowSec * 1000;
  const activeKeys = visibleSeriesKeys.filter((key) => numericSeriesByKey[key]?.length);
  const byKey: Record<string, NumericSample[]> = {};
  activeKeys.forEach((key) => {
    byKey[key] = (numericSeriesByKey[key] ?? []).filter((point) => point.timestamp >= minTimestamp);
  });
  const allPoints = activeKeys.flatMap((key) => byKey[key] ?? []);
  if (allPoints.length < 2) {
    return { minValue: 0, maxValue: 0, minTs: 0, maxTs: 0, gridLines: [], paths: [] };
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
}

function buildHoverData(graphData: GraphData, hoverX: number | null, locale: string) {
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
}

function clampLogicStartForTimeline(startUs: number, spanUs: number, timelineEndUs: number): number {
  const maxStart = Math.max(0, timelineEndUs - spanUs);
  return clamp(startUs, 0, maxStart);
}

function buildLogicRenderData(options: {
  segments: LogicLevelSegment[];
  decodedFrames: UartDecodedFrame[];
  logicViewStartUs: number;
  logicSpanUs: number;
  logicRenderWidth: number;
  showLogicFrameLabels: boolean;
}): {
  grid: Array<{ tUs: number; x: number }>;
  segments: Array<{ x0: number; x1: number; y: number; label?: string }>;
  frameMarks: LogicFrameMark[];
  pathD: string;
} {
  const { segments, decodedFrames, logicViewStartUs, logicSpanUs, logicRenderWidth, showLogicFrameLabels } = options;
  const logicViewEndUs = logicViewStartUs + logicSpanUs;
  const timeToRenderX = (timeUs: number) =>
    ((timeUs - logicViewStartUs) / Math.max(1, logicSpanUs)) * logicRenderWidth;

  if (segments.length === 0) {
    return { grid: [], segments: [], frameMarks: [], pathD: '' };
  }

  const cullMarginUs = logicSpanUs * 0.12;
  const cullStartUs = Math.max(0, logicViewStartUs - cullMarginUs);
  const cullEndUs = logicViewEndUs + cullMarginUs;
  const visibleSegments = segments.filter(
    (segment) => segment.t1Us >= cullStartUs && segment.t0Us <= cullEndUs && segment.t1Us > segment.t0Us
  );
  if (visibleSegments.length === 0) {
    return { grid: [], segments: [], frameMarks: [], pathD: '' };
  }

  const yFor = (level: 0 | 1) => (level === 1 ? 56 : 174);
  const segmentsForRender = visibleSegments.map((segment) => ({
    x0: timeToRenderX(segment.t0Us),
    x1: timeToRenderX(segment.t1Us),
    y: yFor(segment.level),
    label: segment.label,
  }));

  let pathD = '';
  segmentsForRender.forEach((segment, index) => {
    if (index === 0) {
      pathD += `M${segment.x0.toFixed(2)},${segment.y.toFixed(2)} L${segment.x1.toFixed(2)},${segment.y.toFixed(2)} `;
      return;
    }
    pathD += `L${segment.x0.toFixed(2)},${segment.y.toFixed(2)} L${segment.x1.toFixed(2)},${segment.y.toFixed(2)} `;
  });

  const stepUs = computeGridStepUs(logicSpanUs);
  const firstTick = Math.ceil(logicViewStartUs / stepUs) * stepUs;
  const grid: Array<{ tUs: number; x: number }> = [];
  for (let tick = firstTick; tick <= logicViewEndUs; tick += stepUs) {
    grid.push({ tUs: tick, x: timeToRenderX(tick) });
  }

  const frameMarks = decodedFrames
    .filter((frame) => frame.endUs >= logicViewStartUs && frame.startUs <= logicViewEndUs)
    .map((frame) => ({
      id: frame.id,
      startUs: frame.startUs,
      endUs: frame.endUs,
      x0: timeToRenderX(Math.max(logicViewStartUs, frame.startUs)),
      x1: timeToRenderX(Math.min(logicViewEndUs, frame.endUs)),
      width: Math.max(
        1.8,
        timeToRenderX(Math.min(logicViewEndUs, frame.endUs)) - timeToRenderX(Math.max(logicViewStartUs, frame.startUs))
      ),
      hex: `0x${frame.byte.toString(16).padStart(2, '0').toUpperCase()}`,
      ascii: toPrintableAscii(frame.byte),
      dec: String(frame.byte),
    }));

  void showLogicFrameLabels;
  return { grid, segments: segmentsForRender, frameMarks, pathD: pathD.trim() };
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
  const [logicByteHistory, setLogicByteHistory] = useState<number[]>([]);
  const [numericSeriesByKey, setNumericSeriesByKey] = useState<Record<string, NumericSample[]>>({});
  const [tabConfigById, setTabConfigById] = useState<Record<string, TabInstanceConfig>>({});
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverGraphKey, setHoverGraphKey] = useState<string | null>(null);
  const [draggingCursor, setDraggingCursor] = useState<null | 'A' | 'B'>(null);

  const idCounterRef = useRef(1);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const simulatorTimerRef = useRef<number | null>(null);
  const decoderRef = useRef(new TextDecoder());
  const stopRequestedRef = useRef(false);
  const bufferRef = useRef('');
  const byteOffsetRef = useRef(0);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const logicViewportRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const logicViewportCallbackRefs = useRef<Record<string, (element: HTMLDivElement | null) => void>>({});
  const logicResizeObserversRef = useRef<Record<string, ResizeObserver>>({});
  const logicPanRefByTab = useRef<
    Record<string, { active: boolean; startClientX: number; startViewUs: number; spanUs: number }>
  >({});
  const logicActiveTabIdRef = useRef<string | null>(null);
  const logicRowsRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const logicStreamStartRef = useRef(0);
  const logicStreamEndRef = useRef(0);
  const logicByteHistoryRef = useRef(logicByteHistory);
  const tabConfigByIdRef = useRef(tabConfigById);
  const numericSeriesKeysRef = useRef<string[]>([]);

  const makeId = (prefix: string) => {
    const id = `${prefix}-${idCounterRef.current}`;
    idCounterRef.current += 1;
    return id;
  };

  const createTab = (view: ViewType): DockTab => ({ id: makeId(`tab-${view}`), view });

  function updateGraphTabConfig(tabId: string, patch: Partial<GraphTabConfig>) {
    setTabConfigById((previous) => {
      const current = previous[tabId];
      if (!current?.graph) return previous;
      return { ...previous, [tabId]: { ...current, graph: { ...current.graph, ...patch } } };
    });
  }

  function updateLogicTabConfig(tabId: string, patch: Partial<LogicTabConfig>) {
    setTabConfigById((previous) => {
      const current = previous[tabId];
      if (!current?.logic) return previous;
      const patchKeys = Object.keys(patch) as Array<keyof LogicTabConfig>;
      const hasChange = patchKeys.some((key) => {
        const nextValue = patch[key];
        const currentValue = current.logic![key];
        if (typeof nextValue === 'object' && nextValue !== null) {
          return JSON.stringify(nextValue) !== JSON.stringify(currentValue);
        }
        return nextValue !== currentValue;
      });
      if (!hasChange) return previous;
      return { ...previous, [tabId]: { ...current, logic: { ...current.logic, ...patch } } };
    });
  }

  function initTabConfig(tab: DockTab) {
    setTabConfigById((previous) => {
      if (previous[tab.id]) return previous;
      const next = { ...previous };
      const numericKeys = Object.keys(numericSeriesByKey).sort((a, b) => a.localeCompare(b));
      if (tab.view === 'graph') {
        const graphTabCount = Object.values(previous).filter((config) => config.graph).length;
        next[tab.id] = { graph: createDefaultGraphConfig(numericKeys, graphTabCount === 0) };
      } else if (tab.view === 'logic') {
        next[tab.id] = { logic: createDefaultLogicConfig() };
      }
      return next;
    });
  }

  function reinitTabConfigsForTabs(tabs: DockTab[]) {
    let graphTabCount = 0;
    const next: Record<string, TabInstanceConfig> = {};
    const numericKeys = Object.keys(numericSeriesByKey).sort((a, b) => a.localeCompare(b));
    tabs.forEach((tab) => {
      if (tab.view === 'graph') {
        next[tab.id] = { graph: createDefaultGraphConfig(numericKeys, graphTabCount === 0) };
        graphTabCount += 1;
      } else if (tab.view === 'logic') {
        next[tab.id] = { logic: createDefaultLogicConfig() };
      }
    });
    setTabConfigById(next);
  }

  function removeTabConfig(tabId: string) {
    setTabConfigById((previous) => {
      if (!previous[tabId]) return previous;
      const next = { ...previous };
      delete next[tabId];
      return next;
    });
    logicResizeObserversRef.current[tabId]?.disconnect();
    delete logicResizeObserversRef.current[tabId];
    delete logicViewportRefs.current[tabId];
    delete logicViewportCallbackRefs.current[tabId];
    delete logicPanRefByTab.current[tabId];
    clearLogicPausedSnapshot(tabId);
    if (logicActiveTabIdRef.current === tabId) logicActiveTabIdRef.current = null;
    Object.keys(logicRowsRef.current).forEach((key) => {
      if (key.startsWith(`${tabId}:`)) delete logicRowsRef.current[key];
    });
  }
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
    idCounterRef.current = maxNumericIdSuffix(collectAllLayoutIds(layoutRoot)) + 1;
  }, []);

  useEffect(() => {
    logicByteHistoryRef.current = logicByteHistory;
  }, [logicByteHistory]);

  useEffect(() => {
    tabConfigByIdRef.current = tabConfigById;
  }, [tabConfigById]);

  useEffect(() => {
    numericSeriesKeysRef.current = Object.keys(numericSeriesByKey).sort((a, b) => a.localeCompare(b));
  }, [numericSeriesByKey]);

  useEffect(() => {
    const keys = Object.keys(numericSeriesByKey).sort((a, b) => a.localeCompare(b));
    if (keys.length === 0) return;
    setTabConfigById((previous) => {
      const graphTabIds = Object.entries(previous)
        .filter(([, config]) => config.graph)
        .map(([tabId]) => tabId);
      if (graphTabIds.length === 0) return previous;
      const firstGraphTabId = graphTabIds[0];
      let changed = false;
      const next = { ...previous };
      for (const tabId of graphTabIds) {
        const graph = previous[tabId]?.graph;
        if (!graph) continue;
        const retained = graph.visibleSeriesKeys.filter((key) => keys.includes(key));
        if (retained.length > 0) {
          if (retained.length !== graph.visibleSeriesKeys.length) {
            next[tabId] = { ...previous[tabId], graph: { ...graph, visibleSeriesKeys: retained } };
            changed = true;
          }
          continue;
        }
        if (tabId === firstGraphTabId) {
          next[tabId] = {
            ...previous[tabId],
            graph: { ...graph, visibleSeriesKeys: keys.slice(0, Math.min(4, keys.length)) },
          };
          changed = true;
        }
      }
      return changed ? next : previous;
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

  useEffect(() => {
    const openTabs = collectTabs(layoutRoot);
    const openTabIds = new Set(openTabs.map((tab) => tab.id));

    setTabConfigById((previous) => {
      let changed = false;
      const next: Record<string, TabInstanceConfig> = { ...previous };

      for (const tabId of Object.keys(previous)) {
        if (!openTabIds.has(tabId)) {
          delete next[tabId];
          logicResizeObserversRef.current[tabId]?.disconnect();
          delete logicResizeObserversRef.current[tabId];
          delete logicViewportRefs.current[tabId];
          delete logicViewportCallbackRefs.current[tabId];
          delete logicPanRefByTab.current[tabId];
          clearLogicPausedSnapshot(tabId);
          changed = true;
        }
      }

      const numericKeys = numericSeriesKeysRef.current;
      let graphTabCount = Object.values(next).filter((config) => config.graph).length;
      for (const tab of openTabs) {
        if (tab.view === 'graph' && !next[tab.id]?.graph) {
          next[tab.id] = { ...next[tab.id], graph: createDefaultGraphConfig(numericKeys, graphTabCount === 0) };
          graphTabCount += 1;
          changed = true;
        } else if (tab.view === 'logic' && !next[tab.id]?.logic) {
          next[tab.id] = { ...next[tab.id], logic: createDefaultLogicConfig() };
          changed = true;
        }
      }

      return changed ? next : previous;
    });
  }, [layoutRoot]);

  const getLogicViewportRef = useCallback((tabId: string) => {
    if (!logicViewportCallbackRefs.current[tabId]) {
      logicViewportCallbackRefs.current[tabId] = (element: HTMLDivElement | null) => {
        logicResizeObserversRef.current[tabId]?.disconnect();
        delete logicResizeObserversRef.current[tabId];
        logicViewportRefs.current[tabId] = element;
        if (!element) return;
        const updateWidth = () => {
          const nextWidth = Math.max(280, element.clientWidth || LOGIC_CHART_WIDTH);
          updateLogicTabConfig(tabId, { logicViewportWidth: nextWidth });
        };
        updateWidth();
        const observer = new ResizeObserver(updateWidth);
        observer.observe(element);
        logicResizeObserversRef.current[tabId] = observer;
      };
    }
    return logicViewportCallbackRefs.current[tabId];
  }, []);

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
    setLogicByteHistory([]);
    setNumericSeriesByKey({});
    logicStreamStartRef.current = 0;
    logicStreamEndRef.current = 0;
    clearAllLogicPausedSnapshots();
    setHoverX(null);
    setHoverGraphKey(null);
    setDraggingCursor(null);
    logicActiveTabIdRef.current = null;
    logicPanRefByTab.current = {};
    reinitTabConfigsForTabs(collectTabs(layoutRoot));
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

  function appendLogicByteHistoryFromChunk(bytes: Uint8Array) {
    logicStreamEndRef.current += bytes.length;
    setLogicByteHistory((previous) => {
      const combined = [...previous, ...Array.from(bytes)];
      if (combined.length <= MAX_LOGIC_BYTES) return combined;
      const trimmed = combined.slice(-MAX_LOGIC_BYTES);
      logicStreamStartRef.current += combined.length - trimmed.length;
      return trimmed;
    });
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
    appendLogicByteHistoryFromChunk(bytes);
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

  const logicWaveformByTabId = useMemo(() => {
    const parsedBaud = Number(baudRate);
    const safeBaud = Number.isFinite(parsedBaud) && parsedBaud > 0 ? parsedBaud : 115200;
    const result: Record<
      string,
      { segments: LogicLevelSegment[]; frames: UartDecodedFrame[]; endUs: number }
    > = {};
    for (const [tabId, config] of Object.entries(tabConfigById)) {
      if (!config.logic) continue;
      if (logicByteHistory.length === 0) {
        result[tabId] = { segments: [], frames: [], endUs: 0 };
        continue;
      }
      const tabByteHistory = getLogicBytesForWaveform(
        tabId,
        config.logic,
        logicByteHistory,
        logicStreamStartRef.current,
        logicPausedSnapshotsByTabId
      );
      const rebuilt = buildUartWaveformFromBytes(tabByteHistory, {
        baud: safeBaud,
        settings: config.logic.uartSettings,
        startUs: 0,
        idPrefix: tabId,
      });
      result[tabId] = {
        segments: rebuilt.segments.slice(-MAX_LOGIC_SEGMENTS),
        frames: rebuilt.frames.slice(-MAX_UART_DECODED_FRAMES),
        endUs: rebuilt.endUs,
      };
    }
    return result;
  }, [tabConfigById, logicByteHistory, baudRate]);

  useEffect(() => {
    setTabConfigById((previous) => {
      let changed = false;
      const next: Record<string, TabInstanceConfig> = { ...previous };
      for (const [tabId, config] of Object.entries(previous)) {
        const logic = config.logic;
        if (!logic || logic.logicPlaybackPaused) continue;
        const waveform = logicWaveformByTabId[tabId];
        const timelineEndUs = waveform?.endUs ?? 0;
        let logicViewStartUs = logic.logicViewStartUs;
        if (logic.logicAutoFollow && !logic.logicPlaybackPaused && waveform?.segments.length) {
          const endUs = waveform.segments[waveform.segments.length - 1]?.t1Us ?? 0;
          logicViewStartUs = Math.max(0, endUs - logic.logicSpanUs);
        }
        const clampedStart = clampLogicStartForTimeline(logicViewStartUs, logic.logicSpanUs, timelineEndUs);
        if (
          Math.abs(clampedStart - logic.logicViewStartUs) > 0.0001 ||
          (logic.logicAutoFollow && !logic.logicPlaybackPaused && Math.abs(clampedStart - logicViewStartUs) > 0.0001)
        ) {
          next[tabId] = { ...config, logic: { ...logic, logicViewStartUs: clampedStart } };
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [logicWaveformByTabId]);

  useEffect(() => {
    for (const [tabId, config] of Object.entries(tabConfigById)) {
      const selectedId = config.logic?.selectedLogicFrameId;
      if (!selectedId) continue;
      logicRowsRef.current[`${tabId}:${selectedId}`]?.scrollIntoView({ block: 'nearest' });
    }
  }, [tabConfigById]);

  function addTab(leafId: string, view: ViewType) {
    const tab = createTab(view);
    initTabConfig(tab);
    setLayoutRoot((previous) => {
      const leaf = findLeaf(previous, leafId);
      if (!leaf) return previous;
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
    removeTabConfig(tabId);
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
    const leaf = findLeaf(layoutRoot, leafId);
    if (leaf) leaf.tabs.forEach((tab) => removeTabConfig(tab.id));
    setLayoutRoot((previous) => {
      return removeLeafNode(previous, leafId) ?? createLeaf('terminal');
    });
  }

  function moveTab(tabId: string, targetLeafId: string) {
    moveTabWithDrop(tabId, targetLeafId, 'center');
  }

  function createTabWithDrop(view: ViewType, targetLeafId: string, dropSide: DropSide) {
    const createdTab = createTab(view);
    initTabConfig(createdTab);
    let nextActiveLeaf: string | null = null;
    setLayoutRoot((previous) => {
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

  function selectLogicFrame(tabId: string, frame: { id: string }) {
    updateLogicTabConfig(tabId, { selectedLogicFrameId: frame.id });
  }

  function focusLogicFrame(tabId: string, frame: { id: string; startUs: number; endUs: number }) {
    const logic = tabConfigById[tabId]?.logic;
    if (!logic) return;
    const timelineEndUs = logicWaveformByTabId[tabId]?.endUs ?? 0;
    const centerUs = (frame.startUs + frame.endUs) / 2;
    const nextStart = clampLogicStartForTimeline(centerUs - logic.logicSpanUs * 0.5, logic.logicSpanUs, timelineEndUs);
    updateLogicTabConfig(tabId, {
      selectedLogicFrameId: frame.id,
      logicAutoFollow: false,
      logicViewStartUs: nextStart,
    });
  }

  function logicTimeFromClientX(tabId: string, clientX: number): number | null {
    const scroller = logicViewportRefs.current[tabId];
    const logic = tabConfigById[tabId]?.logic;
    if (!scroller || !logic) return null;
    const rect = scroller.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const ratio = clamp(clientX - rect.left, 0, rect.width) / rect.width;
    return logic.logicViewStartUs + ratio * logic.logicSpanUs;
  }

  function handleLogicWheel(tabId: string, event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const nativeEvent = event.nativeEvent as WheelEvent & { stopImmediatePropagation?: () => void };
    nativeEvent.stopImmediatePropagation?.();
    const logic = tabConfigById[tabId]?.logic;
    const waveform = logicWaveformByTabId[tabId];
    if (!logic || !waveform || waveform.endUs <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const localXInViewport = clamp(event.clientX - rect.left, 0, rect.width);
    const ratioInViewport = localXInViewport / rect.width;
    const anchorUs = logic.logicViewStartUs + ratioInViewport * logic.logicSpanUs;
    const zoomFactor = event.deltaY < 0 ? 0.82 : 1.2;
    const logicTimeDomainUs = Math.max(waveform.endUs, 1);
    const maxZoomOutSpan = Math.max(LOGIC_MIN_SPAN_US, logicTimeDomainUs);
    const nextSpan = clamp(logic.logicSpanUs * zoomFactor, LOGIC_MIN_SPAN_US, maxZoomOutSpan);
    const nextStart = clampLogicStartForTimeline(anchorUs - ratioInViewport * nextSpan, nextSpan, waveform.endUs);
    if (!Number.isFinite(nextStart) || !Number.isFinite(nextSpan)) return;
    updateLogicTabConfig(tabId, {
      logicAutoFollow: false,
      logicSpanUs: nextSpan,
      logicViewStartUs: nextStart,
    });
  }

  function handleLogicPanStart(tabId: string, event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const logic = tabConfigById[tabId]?.logic;
    if (!logic) return;
    logicActiveTabIdRef.current = tabId;
    logicPanRefByTab.current[tabId] = {
      active: true,
      startClientX: event.clientX,
      startViewUs: logic.logicViewStartUs,
      spanUs: logic.logicSpanUs,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    updateLogicTabConfig(tabId, { logicAutoFollow: false });
  }

  function handleLogicPanMove(tabId: string, event: React.PointerEvent<HTMLDivElement>) {
    const scroller = logicViewportRefs.current[tabId];
    const activeTabId = logicActiveTabIdRef.current ?? tabId;

    if (draggingCursor !== null && activeTabId === tabId) {
      const timeUs = logicTimeFromClientX(tabId, event.clientX);
      if (timeUs === null) return;
      if (draggingCursor === 'A') updateLogicTabConfig(tabId, { cursorAUs: timeUs });
      if (draggingCursor === 'B') updateLogicTabConfig(tabId, { cursorBUs: timeUs });
      return;
    }

    const pan = logicPanRefByTab.current[tabId];
    if (!pan?.active || !scroller) return;
    const logic = tabConfigById[tabId]?.logic;
    const timelineEndUs = logicWaveformByTabId[tabId]?.endUs ?? 0;
    if (!logic) return;
    const rect = scroller.getBoundingClientRect();
    if (rect.width <= 0) return;
    const deltaRatio = (event.clientX - pan.startClientX) / rect.width;
    const nextStart = clampLogicStartForTimeline(pan.startViewUs - deltaRatio * pan.spanUs, pan.spanUs, timelineEndUs);
    updateLogicTabConfig(tabId, { logicViewStartUs: nextStart });
  }

  function handleLogicPanEnd(tabId: string, event: React.PointerEvent<HTMLDivElement>) {
    const pan = logicPanRefByTab.current[tabId];
    if (pan?.active && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (pan) logicPanRefByTab.current[tabId] = { ...pan, active: false };
    if (logicActiveTabIdRef.current === tabId) logicActiveTabIdRef.current = null;
    setDraggingCursor(null);
  }

  function renderGraphView(tabId: string) {
    const graphConfig = tabConfigById[tabId]?.graph ?? createDefaultGraphConfig(numericSeriesKeys, true);
    const graphData = buildGraphData({
      visibleSeriesKeys: graphConfig.visibleSeriesKeys,
      historyWindowSec: graphConfig.historyWindowSec,
      numericSeriesByKey,
    });
    const localHoverData =
      hoverGraphKey === tabId ? buildHoverData(graphData, hoverX, locale) : null;
    const chartEmptyMessage =
      graphConfig.visibleSeriesKeys.length === 0 && numericSeriesKeys.length > 0
        ? t('panes.noSeriesSelected')
        : t('panes.notEnoughPoints');
    const visibleSeriesKeys = graphConfig.visibleSeriesKeys;

    return (
      <>
        <div className={styles.graphToolbar}>
          <label className={styles.historyField}>
            <span>{t('panes.historyWindow')}</span>
            <select
              className={styles.historySelect}
              value={graphConfig.historyWindowSec}
              onChange={(event) =>
                updateGraphTabConfig(tabId, { historyWindowSec: Number(event.currentTarget.value) })
              }
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
              onClick={() => updateGraphTabConfig(tabId, { visibleSeriesKeys: numericSeriesKeys })}
              disabled={numericSeriesKeys.length === 0}
            >
              {t('panes.showAll')}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => updateGraphTabConfig(tabId, { visibleSeriesKeys: [] })}
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
              className={
                visibleSeriesKeys.includes(key) ? `${styles.seriesButton} ${styles.seriesButtonActive}` : styles.seriesButton
              }
              onClick={() =>
                updateGraphTabConfig(tabId, {
                  visibleSeriesKeys: visibleSeriesKeys.includes(key)
                    ? visibleSeriesKeys.filter((seriesKey) => seriesKey !== key)
                    : [...visibleSeriesKeys, key],
                })
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
            setHoverGraphKey(tabId);
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

  function toggleLogicPlayback(tabId: string) {
    const currentLogic = tabConfigByIdRef.current[tabId]?.logic;
    if (!currentLogic) return;
    const streamEnd = logicStreamEndRef.current;
    if (!currentLogic.logicPlaybackPaused) {
      const snapshot = getLogicByteHistoryForTab(
        currentLogic,
        logicByteHistoryRef.current,
        logicStreamStartRef.current
      );
      setLogicPausedSnapshot(tabId, snapshot);
      updateLogicTabConfig(tabId, {
        logicPlaybackPaused: true,
        logicAutoFollow: false,
        logicFrozenByteEnd: streamEnd,
      });
      return;
    }
    clearLogicPausedSnapshot(tabId);
    updateLogicTabConfig(tabId, {
      logicPlaybackPaused: false,
      logicByteSkip: streamEnd,
      logicFrozenByteEnd: null,
    });
  }

  function renderLogicAnalyzerView(tabId: string) {
    const instanceConfig = tabConfigById[tabId];
    if (!instanceConfig?.logic) {
      return <p className={styles.meta}>{t('panes.noLogic')}</p>;
    }
    const logic = instanceConfig.logic;
    const waveform = logicWaveformByTabId[tabId] ?? { segments: [], frames: [], endUs: 0 };
    const logicSegments = waveform.segments;
    const logicDecodedFrames = waveform.frames;
    const logicTimelineEndUs = waveform.endUs;
    const {
      uartSettings,
      logicSpanUs,
      logicViewStartUs,
      logicViewportWidth,
      logicPlaybackPaused,
      showHexDecode,
      showAsciiDecode,
      showDecimalDecode,
      selectedLogicFrameId,
      cursorAUs,
      cursorBUs,
    } = logic;
    const parsedBaudForLogic = Number(baudRate);
    const logicBaud = Number.isFinite(parsedBaudForLogic) && parsedBaudForLogic > 0 ? parsedBaudForLogic : 115200;
    const logicBitDurationUs = 1_000_000 / logicBaud;
    const logicRenderWidth = Math.max(280, logicViewportWidth);
    const logicPxPerUs = logicRenderWidth / Math.max(1, logicSpanUs);
    const logicPxPerBit = logicPxPerUs * logicBitDurationUs;
    const showLogicFrameLabels = logicPxPerBit >= 2.5;
    const timeToRenderX = (timeUs: number) =>
      ((timeUs - logicViewStartUs) / Math.max(1, logicSpanUs)) * logicRenderWidth;
    const logicRenderData = buildLogicRenderData({
      segments: logicSegments,
      decodedFrames: logicDecodedFrames,
      logicViewStartUs,
      logicSpanUs,
      logicRenderWidth,
      showLogicFrameLabels,
    });
    const cursorAX = cursorAUs !== null ? timeToRenderX(cursorAUs) : null;
    const cursorBX = cursorBUs !== null ? timeToRenderX(cursorBUs) : null;
    const logicDeltaUs = cursorAUs !== null && cursorBUs !== null ? Math.abs(cursorBUs - cursorAUs) : null;
    const logicEstimatedBaud = logicDeltaUs && logicDeltaUs > 0 ? 1_000_000 / logicDeltaUs : null;

    return (
      <>
        <div className={styles.logicToolbar}>
          <label className={styles.logicField}>
            <span>{t('panes.uartDataBits')}</span>
            <select
              className={styles.historySelect}
              value={uartSettings.dataBits}
              onChange={(event) => {
                const dataBits = Number(event.currentTarget.value) as UartSettings['dataBits'];
                updateLogicTabConfig(tabId, { uartSettings: { ...uartSettings, dataBits } });
              }}
            >
              {[5, 6, 7, 8, 9].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.logicField}>
            <span>{t('panes.uartParity')}</span>
            <select
              className={styles.historySelect}
              value={uartSettings.parity}
              onChange={(event) => {
                const parity = event.currentTarget.value as UartParity;
                updateLogicTabConfig(tabId, { uartSettings: { ...uartSettings, parity } });
              }}
            >
              <option value="none">{t('panes.uartParityNone')}</option>
              <option value="even">{t('panes.uartParityEven')}</option>
              <option value="odd">{t('panes.uartParityOdd')}</option>
            </select>
          </label>
          <label className={styles.logicField}>
            <span>{t('panes.uartStopBits')}</span>
            <select
              className={styles.historySelect}
              value={uartSettings.stopBits}
              onChange={(event) => {
                const stopBits = Number(event.currentTarget.value) as UartStopBits;
                updateLogicTabConfig(tabId, { uartSettings: { ...uartSettings, stopBits } });
              }}
            >
              <option value={1}>1</option>
              <option value={1.5}>1.5</option>
              <option value={2}>2</option>
            </select>
          </label>
          <label className={styles.logicField}>
            <span>{t('panes.uartIdle')}</span>
            <select
              className={styles.historySelect}
              value={uartSettings.idleLevel}
              onChange={(event) => {
                const idleLevel = Number(event.currentTarget.value) as UartIdleLevel;
                updateLogicTabConfig(tabId, { uartSettings: { ...uartSettings, idleLevel } });
              }}
            >
              <option value={1}>{t('panes.logicLevelHigh')}</option>
              <option value={0}>{t('panes.logicLevelLow')}</option>
            </select>
          </label>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => toggleLogicPlayback(tabId)}
          >
            {logicPlaybackPaused ? t('panes.logicPlay') : t('panes.logicPause')}
          </button>
          <button
            type="button"
            className={showHexDecode ? `${styles.secondaryButton} ${styles.logicToggleActive}` : styles.secondaryButton}
            onClick={() => updateLogicTabConfig(tabId, { showHexDecode: !showHexDecode })}
          >
            HEX
          </button>
          <button
            type="button"
            className={showAsciiDecode ? `${styles.secondaryButton} ${styles.logicToggleActive}` : styles.secondaryButton}
            onClick={() => updateLogicTabConfig(tabId, { showAsciiDecode: !showAsciiDecode })}
          >
            ASCII
          </button>
          <button
            type="button"
            className={showDecimalDecode ? `${styles.secondaryButton} ${styles.logicToggleActive}` : styles.secondaryButton}
            onClick={() => updateLogicTabConfig(tabId, { showDecimalDecode: !showDecimalDecode })}
          >
            DEC
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => {
              if (logicTimelineEndUs <= 0) return;
              clearLogicPausedSnapshot(tabId);
              updateLogicTabConfig(tabId, {
                logicAutoFollow: true,
                logicPlaybackPaused: false,
                logicByteSkip: logicStreamEndRef.current,
                logicFrozenByteEnd: null,
                logicViewStartUs: Math.max(0, logicTimelineEndUs - logicSpanUs),
              });
            }}
          >
            {t('panes.follow')}
          </button>
        </div>

        <div className={styles.logicMetaRow}>
          <span>{t('panes.logicWindow', { start: formatTimeUs(logicViewStartUs), span: formatTimeUs(logicSpanUs) })}</span>
          <span>{t('panes.logicFramesCount', { count: logicDecodedFrames.length })}</span>
        </div>

        <div
          ref={getLogicViewportRef(tabId)}
          className={styles.logicChartWrap}
          onWheelCapture={(event) => handleLogicWheel(tabId, event)}
          onWheel={(event) => handleLogicWheel(tabId, event)}
          onPointerDown={(event) => handleLogicPanStart(tabId, event)}
          onPointerMove={(event) => handleLogicPanMove(tabId, event)}
          onPointerUp={(event) => handleLogicPanEnd(tabId, event)}
          onPointerCancel={(event) => handleLogicPanEnd(tabId, event)}
        >
          {logicSegments.length > 0 ? (
            <svg
              viewBox={`0 0 ${logicRenderWidth} ${LOGIC_CHART_HEIGHT}`}
              preserveAspectRatio="none"
              className={styles.logicChartSvg}
            >
              <line x1={0} x2={logicRenderWidth} y1={56} y2={56} className={styles.logicLevelLine} />
              <line x1={0} x2={logicRenderWidth} y1={174} y2={174} className={styles.logicLevelLine} />
              {logicRenderData.grid.map((tick) => (
                <g key={`tick-${tick.tUs}`}>
                  <line x1={tick.x} x2={tick.x} y1={16} y2={190} className={styles.logicGridLine} />
                  <text x={tick.x + 3} y={14} className={styles.logicGridLabel}>
                    {formatTimeUs(tick.tUs)}
                  </text>
                </g>
              ))}
              <path d={logicRenderData.pathD} className={styles.logicSignalPath} />
              {logicRenderData.frameMarks.map((frame) => (
                <g key={frame.id}>
                  <rect
                    x={frame.x0}
                    y={195}
                    width={frame.width}
                    height={72}
                    className={selectedLogicFrameId === frame.id ? styles.logicFrameBandActive : styles.logicFrameBand}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      selectLogicFrame(tabId, frame);
                    }}
                  />
                  {showLogicFrameLabels && showHexDecode && frame.width >= 28 && (
                    <text x={(frame.x0 + frame.x1) / 2} y={220} textAnchor="middle" className={styles.logicFrameLabel}>
                      {frame.hex}
                    </text>
                  )}
                  {showLogicFrameLabels && showAsciiDecode && frame.width >= 12 && (
                    <text x={(frame.x0 + frame.x1) / 2} y={236} textAnchor="middle" className={styles.logicFrameLabel}>
                      {frame.ascii}
                    </text>
                  )}
                  {showLogicFrameLabels && showDecimalDecode && frame.width >= 20 && (
                    <text x={(frame.x0 + frame.x1) / 2} y={252} textAnchor="middle" className={styles.logicFrameLabel}>
                      {frame.dec}
                    </text>
                  )}
                </g>
              ))}
              <text x={8} y={48} className={styles.logicLaneLabel}>
                {t('panes.logicLevelHigh')}
              </text>
              <text x={8} y={188} className={styles.logicLaneLabel}>
                {t('panes.logicLevelLow')}
              </text>
              {cursorAX !== null && (
                <g>
                  <line
                    x1={cursorAX}
                    x2={cursorAX}
                    y1={0}
                    y2={LOGIC_CHART_HEIGHT}
                    className={styles.logicCursorGrab}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      logicActiveTabIdRef.current = tabId;
                      if (logicPanRefByTab.current[tabId]) {
                        logicPanRefByTab.current[tabId] = { ...logicPanRefByTab.current[tabId], active: false };
                      }
                      logicViewportRefs.current[tabId]?.setPointerCapture(event.pointerId);
                      setDraggingCursor('A');
                    }}
                  />
                  <line x1={cursorAX} x2={cursorAX} y1={0} y2={LOGIC_CHART_HEIGHT} className={styles.logicCursorA} />
                  <text x={cursorAX + 4} y={28} className={styles.logicCursorLabel}>
                    A
                  </text>
                </g>
              )}
              {cursorBX !== null && (
                <g>
                  <line
                    x1={cursorBX}
                    x2={cursorBX}
                    y1={0}
                    y2={LOGIC_CHART_HEIGHT}
                    className={styles.logicCursorGrab}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      logicActiveTabIdRef.current = tabId;
                      if (logicPanRefByTab.current[tabId]) {
                        logicPanRefByTab.current[tabId] = { ...logicPanRefByTab.current[tabId], active: false };
                      }
                      logicViewportRefs.current[tabId]?.setPointerCapture(event.pointerId);
                      setDraggingCursor('B');
                    }}
                  />
                  <line x1={cursorBX} x2={cursorBX} y1={0} y2={LOGIC_CHART_HEIGHT} className={styles.logicCursorB} />
                  <text x={cursorBX + 4} y={44} className={styles.logicCursorLabel}>
                    B
                  </text>
                </g>
              )}
            </svg>
          ) : (
            <p className={styles.meta}>{t('panes.noLogic')}</p>
          )}
        </div>

        <div className={styles.logicMetaRow}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => updateLogicTabConfig(tabId, { cursorAUs: logicViewStartUs + logicSpanUs * 0.3 })}
          >
            {t('panes.placeCursorA')}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => updateLogicTabConfig(tabId, { cursorBUs: logicViewStartUs + logicSpanUs * 0.7 })}
          >
            {t('panes.placeCursorB')}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => updateLogicTabConfig(tabId, { cursorAUs: null, cursorBUs: null })}
          >
            {t('panes.clearCursors')}
          </button>
          <span>{cursorAUs !== null ? `A: ${formatTimeUs(cursorAUs)}` : 'A: -'}</span>
          <span>{cursorBUs !== null ? `B: ${formatTimeUs(cursorBUs)}` : 'B: -'}</span>
          <span>{logicDeltaUs !== null ? `Δt: ${formatTimeUs(logicDeltaUs)}` : 'Δt: -'}</span>
          <span>{logicEstimatedBaud ? `~${logicEstimatedBaud.toFixed(1)} baud` : ''}</span>
        </div>

        <div className={styles.logicRows}>
          {logicDecodedFrames.length > 0 ? (
            logicDecodedFrames.slice(-180).map((frame) => (
              <button
                key={`row-${frame.id}`}
                type="button"
                ref={(element) => {
                  logicRowsRef.current[`${tabId}:${frame.id}`] = element;
                }}
                className={selectedLogicFrameId === frame.id ? `${styles.logicRow} ${styles.logicRowActive}` : styles.logicRow}
                onClick={() => focusLogicFrame(tabId, frame)}
              >
                <span>{formatTimeUs(frame.startUs)}</span>
                <span>{`0x${frame.byte.toString(16).padStart(2, '0').toUpperCase()}`}</span>
                <span>{toPrintableAscii(frame.byte)}</span>
                <span>{frame.byte}</span>
              </button>
            ))
          ) : (
            <p className={styles.meta}>{t('panes.noLogic')}</p>
          )}
        </div>
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
      return renderLogicAnalyzerView(instanceKey);
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
          {activeTab ? (
            <div key={activeTab.id} className={styles.viewFrame}>
              {renderView(activeTab.view, activeTab.id)}
            </div>
          ) : (
            <p className={styles.meta}>{t('panes.emptyDropZone')}</p>
          )}
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

