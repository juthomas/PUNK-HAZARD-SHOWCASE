/**
 * Persistent session for flash/serial state so that changing locale or closing
 * the modal does not lose the port handle or logs. The component subscribes
 * and hydrates from this store on mount; the read loop and release logic
 * use it for stop flag and log appends.
 */

export type LogEntryType = 'build' | 'serial_out' | 'serial_in';
export type LogEntry = { text: string; type: LogEntryType };

const MAX_FLASH_LOGS = 250;
const MAX_SERIAL_LOGS = 400;

type Listener = () => void;

let port: unknown | null = null;
let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
let openedLocally = false;
let flashLogs: LogEntry[] = [];
let serialMonitorLogs: LogEntry[] = [];
let isMonitoring = false;
let monitorBuffer = '';
let stopMonitorRequested = false;

export type FlashStatus =
  | 'idle'
  | 'waiting_for_port'
  | 'dialog_ready'
  | 'loading'
  | 'erasing'
  | 'installing'
  | 'configuring'
  | 'finished'
  | 'error';
let isFlashing = false;
let flashProgress: number | null = null;
let flashStatus: FlashStatus = 'idle';
let showFlashConfirm = false;
let activeLogView: 'flash' | 'serial' = 'flash';

const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // ignore
    }
  });
}

export function getState(): {
  port: unknown | null;
  reader: ReadableStreamDefaultReader<Uint8Array> | null;
  openedLocally: boolean;
  flashLogs: LogEntry[];
  serialMonitorLogs: LogEntry[];
  isMonitoring: boolean;
  monitorBuffer: string;
  isFlashing: boolean;
  flashProgress: number | null;
  flashStatus: FlashStatus;
  showFlashConfirm: boolean;
  activeLogView: 'flash' | 'serial';
} {
  return {
    port,
    reader,
    openedLocally,
    flashLogs: [...flashLogs],
    serialMonitorLogs: [...serialMonitorLogs],
    isMonitoring,
    monitorBuffer,
    isFlashing,
    flashProgress,
    flashStatus,
    showFlashConfirm,
    activeLogView,
  };
}

export function hasSession(): boolean {
  return port != null;
}

export function setPort(p: unknown | null) {
  port = p;
  notify();
}

export function setReader(r: ReadableStreamDefaultReader<Uint8Array> | null) {
  reader = r;
  notify();
}

export function setOpenedLocally(value: boolean) {
  openedLocally = value;
  notify();
}

export function setMonitoring(value: boolean) {
  isMonitoring = value;
  notify();
}

export function setMonitorBuffer(value: string) {
  monitorBuffer = value;
}

export function setFlashState(state: {
  isFlashing: boolean;
  flashProgress: number | null;
  flashStatus: FlashStatus;
  showFlashConfirm: boolean;
}) {
  isFlashing = state.isFlashing;
  flashProgress = state.flashProgress;
  flashStatus = state.flashStatus;
  showFlashConfirm = state.showFlashConfirm;
  notify();
}

export function setActiveLogView(view: 'flash' | 'serial') {
  activeLogView = view;
  notify();
}

export function appendFlashLog(entry: LogEntry) {
  flashLogs = [...flashLogs, entry].slice(-MAX_FLASH_LOGS);
  notify();
}

/** Append a flash log from raw message (used by esptool terminal so it keeps working after locale change / unmount). */
export function appendFlashLogMessage(message: string, entryType: LogEntryType = 'build') {
  const time = new Date().toISOString().slice(11, 19);
  const text = `[${time}] ${message}`;
  flashLogs = [...flashLogs, { text, type: entryType }].slice(-MAX_FLASH_LOGS);
  notify();
}

export function appendSerialMonitorLog(entry: LogEntry) {
  serialMonitorLogs = [...serialMonitorLogs, entry].slice(-MAX_SERIAL_LOGS);
  notify();
}

export function requestStopMonitor() {
  stopMonitorRequested = true;
}

export function isStopRequested(): boolean {
  return stopMonitorRequested;
}

export function clearStopRequested() {
  stopMonitorRequested = false;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function clearLogs(view: 'flash' | 'serial') {
  if (view === 'serial') {
    serialMonitorLogs = [];
  } else {
    flashLogs = [];
  }
  notify();
}

/**
 * Clear session state (port/reader refs and logs). Caller is responsible
 * for actually closing the port; we only clear our refs so we don't use it.
 */
export function clearSession() {
  port = null;
  reader = null;
  openedLocally = false;
  flashLogs = [];
  serialMonitorLogs = [];
  isMonitoring = false;
  monitorBuffer = '';
  stopMonitorRequested = false;
  isFlashing = false;
  flashProgress = null;
  flashStatus = 'idle';
  showFlashConfirm = false;
  activeLogView = 'flash';
  notify();
}
