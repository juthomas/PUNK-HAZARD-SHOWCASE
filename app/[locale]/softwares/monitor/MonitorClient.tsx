'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import styles from './page.module.css';

type SerialPortLike = {
  readable?: ReadableStream<Uint8Array> | null;
  writable?: WritableStream<Uint8Array> | null;
  open?: (options: { baudRate: number }) => Promise<void>;
  close?: () => Promise<void>;
  getInfo?: () => { usbVendorId?: number; usbProductId?: number };
};

type SerialNavigator = Navigator & {
  serial?: {
    requestPort: (options?: { filters?: Array<{ usbVendorId?: number; usbProductId?: number }> }) => Promise<unknown>;
  };
};

type LogEntry = { text: string };
type HexRow = { offset: number; hex: string; ascii: string };
type JsonEvent = { timestamp: string; parsed: string };
type LogicFrame = { timestamp: string; hex: string; char: string; bitsLsbFirst: string };
type NumericSample = { timestamp: number; value: number };
type GraphPoint = { x: number; y: number; timestamp: number; value: number };

const MAX_LOGS = 500;
const MAX_HEX_ROWS = 300;
const MAX_JSON_EVENTS = 120;
const MAX_JSON_ERRORS = 80;
const MAX_LOGIC_FRAMES = 300;
const MAX_SERIES_POINTS = 260;
const GRAPH_COLORS = ['#79d9cf', '#9fc6ff', '#ffcf6a', '#ff9ac6', '#b7ff9a', '#caa8ff'];
const CHART_WIDTH = 560;
const CHART_HEIGHT = 190;

function asSerialPort(port: unknown): SerialPortLike | null {
  if (!port || typeof port !== 'object') return null;
  return port as SerialPortLike;
}

function formatTime(locale: string): string {
  return new Date().toLocaleTimeString(locale === 'en' ? 'en-GB' : 'fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function toPrintableAscii(byte: number): string {
  if (byte >= 32 && byte <= 126) return String.fromCharCode(byte);
  return '.';
}

function flattenNumericFields(
  value: unknown,
  prefix: string,
  output: Array<{ key: string; value: number }>
) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    output.push({ key: prefix || 'value', value });
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      flattenNumericFields(value[i], `${prefix}[${i}]`, output);
    }
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      const nextPrefix = prefix.length > 0 ? `${prefix}.${k}` : k;
      flattenNumericFields(v, nextPrefix, output);
    }
  }
}

function computeNiceStep(rawStep: number): number {
  const safe = Math.max(0.000001, rawStep);
  const magnitude = 10 ** Math.floor(Math.log10(safe));
  const normalized = safe / magnitude;
  let niceNormalized = 10;
  if (normalized <= 1) niceNormalized = 1;
  else if (normalized <= 2) niceNormalized = 2;
  else if (normalized <= 5) niceNormalized = 5;
  return niceNormalized * magnitude;
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

  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const simulatorTimerRef = useRef<number | null>(null);
  const decoderRef = useRef(new TextDecoder());
  const stopRequestedRef = useRef(false);
  const bufferRef = useRef('');
  const byteOffsetRef = useRef(0);
  const logContainerRef = useRef<HTMLPreElement | null>(null);
  const chartWrapRef = useRef<HTMLDivElement | null>(null);
  const hasAutoSelectedSeriesRef = useRef(false);

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
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [logs]);

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

  function appendLog(message: string) {
    const text = `[${formatTime(locale)}] ${message}`;
    setLogs((previous) => [...previous, { text }].slice(-MAX_LOGS));
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
    hasAutoSelectedSeriesRef.current = false;
  }

  function appendHexRowsFromChunk(bytes: Uint8Array) {
    const baseOffset = byteOffsetRef.current;
    const nextRows: HexRow[] = [];
    for (let index = 0; index < bytes.length; index += 16) {
      const slice = bytes.slice(index, index + 16);
      nextRows.push({
        offset: baseOffset + index,
        hex: Array.from(slice)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join(' '),
        ascii: Array.from(slice)
          .map((b) => toPrintableAscii(b))
          .join(''),
      });
    }
    byteOffsetRef.current = baseOffset + bytes.length;
    setHexRows((previous) => [...previous, ...nextRows].slice(-MAX_HEX_ROWS));
  }

  function appendLogicFramesFromChunk(bytes: Uint8Array) {
    const timestamp = formatTime(locale);
    const frames: LogicFrame[] = Array.from(bytes).map((byte) => ({
      timestamp,
      hex: `0x${byte.toString(16).padStart(2, '0').toUpperCase()}`,
      char: toPrintableAscii(byte),
      bitsLsbFirst: Array.from({ length: 8 }, (_, bitIndex) =>
        ((byte >> bitIndex) & 1) === 1 ? '1' : '0'
      ).join(''),
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
          for (const item of extracted) {
            const existing = next[item.key] ?? [];
            next[item.key] = [...existing, { timestamp: now, value: item.value }].slice(
              -MAX_SERIES_POINTS
            );
          }
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
    for (const line of lines) {
      if (line.length === 0) continue;
      appendLog(line);
      appendJsonAnalysisLine(line);
    }
  }

  function flushDecoderTail() {
    const trailingDecoded = decoderRef.current.decode();
    if (trailingDecoded.length > 0) {
      bufferRef.current += trailingDecoded;
    }
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
    if (!isGoogleChrome || !isWebSerialSupported) {
      appendLog(t('logs.chromeRequired'));
      return;
    }
    if (!window.isSecureContext) {
      appendLog(t('logs.notSecureContext'));
      return;
    }
    const parsedBaud = Number(baudRate);
    if (!Number.isFinite(parsedBaud) || parsedBaud <= 0) {
      appendLog(t('logs.invalidBaud'));
      return;
    }

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
        if (!value || value.length === 0) continue;
        processIncomingChunk(value);
      }
      flushDecoderTail();
    } catch (error) {
      const message = error instanceof Error ? error.message : t('logs.unknownError');
      appendLog(t('logs.error', { error: message }));
    } finally {
      setIsConnecting(false);
      if (!stopRequestedRef.current) {
        await stopMonitoring();
      }
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
      const jsonBytes = encoder.encode(`${JSON.stringify(message)}\n`);
      processIncomingChunk(jsonBytes);
      const binaryFrame = Uint8Array.from([
        0x55,
        0xaa,
        tick & 0xff,
        Math.floor(Math.random() * 255),
        0x03,
        0x0d,
        0x0a,
      ]);
      processIncomingChunk(binaryFrame);
    }, 220);
  }

  const numericSeriesKeys = Object.keys(numericSeriesByKey).sort((a, b) => a.localeCompare(b));
  const graphData = useMemo(() => {
    const now = Date.now();
    const minTimestamp = now - historyWindowSec * 1000;
    const activeKeys = visibleSeriesKeys.filter((key) => numericSeriesByKey[key]?.length);
    const filteredByKey: Record<string, NumericSample[]> = {};
    for (const key of activeKeys) {
      filteredByKey[key] = (numericSeriesByKey[key] ?? []).filter((point) => point.timestamp >= minTimestamp);
    }

    const allPoints = activeKeys.flatMap((key) => filteredByKey[key] ?? []);
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

    const values = allPoints.map((point) => point.value);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const rawSpan = Math.max(0.000001, rawMax - rawMin);
    const desiredTicks = 5;
    const niceStep = computeNiceStep(rawSpan / Math.max(1, desiredTicks - 1));
    const minValue = Math.floor(rawMin / niceStep) * niceStep;
    const maxValue = Math.ceil(rawMax / niceStep) * niceStep;
    const valueSpan = Math.max(niceStep, maxValue - minValue);
    const minTs = Math.min(...allPoints.map((point) => point.timestamp));
    const maxTs = Math.max(...allPoints.map((point) => point.timestamp));
    const tsSpan = Math.max(1, maxTs - minTs);
    const width = CHART_WIDTH;
    const height = CHART_HEIGHT;
    const tickCount = Math.max(2, Math.round(valueSpan / niceStep) + 1);
    const gridLines = Array.from({ length: tickCount }, (_, index) => {
      const value = maxValue - index * niceStep;
      const y = height - ((value - minValue) / valueSpan) * height;
      return { y, value };
    });
    const paths = activeKeys
      .map((key, index) => {
        const series = filteredByKey[key] ?? [];
        if (series.length < 2) return null;
        const points = series.map((point) => {
          const x = ((point.timestamp - minTs) / tsSpan) * width;
          const y = height - ((point.value - minValue) / valueSpan) * height;
          return { x, y, timestamp: point.timestamp, value: point.value };
        });
        const d = points
          .map((point, pointIndex) => {
            return `${pointIndex === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`;
          })
          .join(' ');
        return {
          key,
          color: GRAPH_COLORS[index % GRAPH_COLORS.length],
          d,
          points,
        };
      })
      .filter((item): item is { key: string; color: string; d: string; points: GraphPoint[] } => item !== null);

    return { minValue, maxValue, minTs, maxTs, gridLines, paths };
  }, [historyWindowSec, numericSeriesByKey, visibleSeriesKeys]);

  useEffect(() => {
    if (graphData.paths.length === 0 && hoverX !== null) {
      setHoverX(null);
    }
  }, [graphData.paths.length, hoverX]);

  const hoverData = useMemo(() => {
    if (hoverX === null || graphData.paths.length === 0 || graphData.maxTs <= graphData.minTs) {
      return null;
    }

    const clampedX = Math.max(0, Math.min(CHART_WIDTH, hoverX));
    const targetTs =
      graphData.minTs + (clampedX / CHART_WIDTH) * (graphData.maxTs - graphData.minTs);

    const nearestCandidates = graphData.paths
      .map((series) => {
        let nearest: GraphPoint | null = null;
        let bestDiff = Number.POSITIVE_INFINITY;
        for (const point of series.points) {
          const diff = Math.abs(point.timestamp - targetTs);
          if (diff < bestDiff) {
            bestDiff = diff;
            nearest = point;
          }
        }
        if (!nearest) return null;
        return {
          key: series.key,
          color: series.color,
          point: nearest,
          diff: bestDiff,
        };
      })
      .filter(
        (item): item is { key: string; color: string; point: GraphPoint; diff: number } =>
          item !== null
      );

    if (nearestCandidates.length === 0) return null;
    const anchor = nearestCandidates.reduce((best, current) => (current.diff < best.diff ? current : best));
    const lockedTs = anchor.point.timestamp;
    const lockedX = ((lockedTs - graphData.minTs) / (graphData.maxTs - graphData.minTs)) * CHART_WIDTH;

    const rows = graphData.paths
      .map((series) => {
        let nearest: GraphPoint | null = null;
        let bestDiff = Number.POSITIVE_INFINITY;
        for (const point of series.points) {
          const diff = Math.abs(point.timestamp - lockedTs);
          if (diff < bestDiff) {
            bestDiff = diff;
            nearest = point;
          }
        }
        if (!nearest) return null;
        return {
          key: series.key,
          color: series.color,
          value: nearest.value,
          y: nearest.y,
        };
      })
      .filter((item): item is { key: string; color: string; value: number; y: number } => item !== null);

    return {
      x: lockedX,
      timeLabel: new Date(lockedTs).toLocaleTimeString(locale === 'en' ? 'en-GB' : 'fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      rows,
    };
  }, [graphData, hoverX, locale]);
  const hoverTooltipLeftPercent =
    hoverData != null ? Math.max(2, Math.min(98, (hoverData.x / CHART_WIDTH) * 100)) : 0;
  const isTooltipOnRight = hoverTooltipLeftPercent > 72;
  const chartEmptyMessage =
    visibleSeriesKeys.length === 0 && numericSeriesKeys.length > 0
      ? t('panes.noSeriesSelected')
      : t('panes.notEnoughPoints');

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
            onClick={() => {
              void startMonitoring();
            }}
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
            onClick={() => {
              void stopMonitoring();
            }}
            disabled={!isMonitoring && !isConnecting && !isSimulating}
          >
            {t('stop')}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={resetAnalyses}
          >
            {t('clear')}
          </button>
        </div>
      </div>

      <div className={styles.workspace}>
        <section className={styles.pane}>
          <h3 className={styles.paneTitle}>{t('panes.terminal')}</h3>
          <pre ref={logContainerRef} className={styles.logPre}>
            {logs.length > 0
              ? logs.map((entry, index) => (
                  <span key={`${entry.text}-${index}`} className={styles.line}>
                    {entry.text}
                    {'\n'}
                  </span>
                ))
              : t('empty')}
          </pre>
        </section>

        <section className={styles.pane}>
          <h3 className={styles.paneTitle}>{t('panes.hexdump')}</h3>
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
        </section>

        <section className={styles.pane}>
          <h3 className={styles.paneTitle}>{t('panes.json')}</h3>
          <p className={styles.meta}>
            {t('panes.jsonDetected', { count: jsonEvents.length })} - {t('panes.jsonErrors', { count: jsonParseErrors.length })}
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
        </section>

        <section className={styles.pane}>
          <h3 className={styles.paneTitle}>{t('panes.graph')}</h3>
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
            {numericSeriesKeys.map((key, index) => {
              const isActive = visibleSeriesKeys.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  className={isActive ? `${styles.seriesButton} ${styles.seriesButtonActive}` : styles.seriesButton}
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
              );
            })}
          </div>
          <div
            ref={chartWrapRef}
            className={styles.chartWrap}
            onMouseMove={(event) => {
              const rect = chartWrapRef.current?.getBoundingClientRect();
              if (!rect || rect.width <= 0) return;
              const x = ((event.clientX - rect.left) / rect.width) * CHART_WIDTH;
              setHoverX(Math.max(0, Math.min(CHART_WIDTH, x)));
            }}
            onMouseLeave={() => setHoverX(null)}
          >
            {graphData.paths.length > 0 ? (
              <svg
                viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                className={styles.chartSvg}
                aria-label={t('panes.graph')}
              >
                {graphData.gridLines.map((line, index) => (
                  <g key={`grid-${index}`}>
                    <line
                      x1={0}
                      x2={CHART_WIDTH}
                      y1={line.y}
                      y2={line.y}
                      className={styles.chartGridLine}
                    />
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
                  <path
                    key={series.key}
                    d={series.d}
                    className={styles.chartPath}
                    style={{ stroke: series.color }}
                  />
                ))}
                {hoverData && (
                  <>
                    <line
                      x1={hoverData.x}
                      x2={hoverData.x}
                      y1={0}
                      y2={CHART_HEIGHT}
                      className={styles.chartCrosshair}
                    />
                    {hoverData.rows.map((row) => (
                      <circle
                        key={row.key}
                        cx={hoverData.x}
                        cy={row.y}
                        r={3}
                        fill={row.color}
                        stroke="rgba(0,0,0,0.55)"
                        strokeWidth={1}
                      />
                    ))}
                  </>
                )}
              </svg>
            ) : (
              <p className={styles.meta}>{chartEmptyMessage}</p>
            )}
            {hoverData && (
              <div
                className={styles.chartTooltip}
                style={{
                  left: `${hoverTooltipLeftPercent}%`,
                  transform: isTooltipOnRight ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)',
                }}
              >
                <div className={styles.chartTooltipTitle}>{hoverData.timeLabel}</div>
                {hoverData.rows.map((row) => (
                  <div key={row.key} className={styles.chartTooltipRow}>
                    <span
                      className={styles.seriesDot}
                      style={{ backgroundColor: row.color }}
                      aria-hidden="true"
                    />
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
        </section>

        <section className={styles.pane}>
          <h3 className={styles.paneTitle}>{t('panes.logic')}</h3>
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
        </section>
      </div>
    </div>
  );
}

