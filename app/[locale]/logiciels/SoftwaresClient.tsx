'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Script from 'next/script';
import { useLocale, useTranslations } from 'next-intl';
import { softwaresCatalog } from '@/lib/softwares';
import type { FirmwareSoftware, LocalizedText, PublicSoftware } from '@/lib/softwares';
import styles from './page.module.css';

type Locale = 'fr' | 'en';
type DesktopSoftware = Extract<PublicSoftware, { kind: 'desktop' }>;
type FlashStatus = 'idle' | 'waiting_for_port' | 'dialog_ready' | 'installing' | 'finished' | 'error';

type InstallStatePayload = {
  state: string;
  message?: string;
  details?: {
    percentage?: number;
    done?: boolean;
    bytesTotal?: number;
    bytesWritten?: number;
  };
};

type EwtInstallDialogElement = HTMLElement & {
  _state?: string;
  _error?: string;
  _installState?: InstallStatePayload;
  _closeDialog?: () => void;
};

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
  const [isDialogMounted, setIsDialogMounted] = useState(false);

  const flashDialogHostRef = useRef<HTMLDivElement | null>(null);
  const activeDialogRef = useRef<EwtInstallDialogElement | null>(null);
  const dialogObserverRef = useRef<MutationObserver | null>(null);
  const statePollerRef = useRef<number | null>(null);
  const dialogAttachTimeoutRef = useRef<number | null>(null);
  const flashAddressMapRef = useRef<Array<{
    startByte: number;
    endByte: number;
    offset: number;
    path: string;
  }> | null>(null);

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

  function appendFlashLog(message: string) {
    const timestamp = new Date().toLocaleTimeString(locale === 'en' ? 'en-GB' : 'fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    setFlashLogs((previous) => [...previous, `[${timestamp}] ${message}`].slice(-250));
  }

  function stopDialogObserver() {
    if (!dialogObserverRef.current) {
      return;
    }
    dialogObserverRef.current.disconnect();
    dialogObserverRef.current = null;
  }

  function stopDialogStatePolling() {
    if (statePollerRef.current === null) {
      return;
    }
    window.clearInterval(statePollerRef.current);
    statePollerRef.current = null;
  }

  function clearDialogAttachTimeout() {
    if (dialogAttachTimeoutRef.current === null) {
      return;
    }
    window.clearTimeout(dialogAttachTimeoutRef.current);
    dialogAttachTimeoutRef.current = null;
  }

  function clearFlashHost() {
    if (!flashDialogHostRef.current) {
      return;
    }
    flashDialogHostRef.current.innerHTML = '';
  }

  function closeActiveDialog() {
    const dialog = activeDialogRef.current;
    if (!dialog) {
      return;
    }

    try {
      dialog._closeDialog?.();
    } catch {
      // Best effort: if close API is not available we still remove the element.
    }

    if (dialog.isConnected) {
      dialog.remove();
    }

    activeDialogRef.current = null;
  }

  function teardownFlashSession(updateUiState: boolean) {
    stopDialogObserver();
    stopDialogStatePolling();
    clearDialogAttachTimeout();
    closeActiveDialog();
    clearFlashHost();

    if (updateUiState) {
      setIsDialogMounted(false);
      setFlashProgress(null);
    }
  }

  useEffect(() => {
    return () => {
      teardownFlashSession(false);
    };
  }, []);

  function openFirmwareModal(firmware: FirmwareSoftware) {
    teardownFlashSession(true);
    setSelectedFirmware(firmware);
    setIsModalOpen(true);
    setManifestToken(Date.now());
    setFlashStatus('idle');
    setFlashLogs([]);
    flashAddressMapRef.current = null;
  }

  function closeFirmwareModal() {
    teardownFlashSession(true);
    setIsModalOpen(false);
    setSelectedFirmware(null);
    setManifestToken(0);
    setFlashStatus('idle');
    setFlashLogs([]);
    flashAddressMapRef.current = null;
  }

  function applyDialogTheme(dialog: EwtInstallDialogElement) {
    // Keep default ESP Web Tools theme as requested.
    // The dialog remains rendered inside our modal host.
    void dialog;
  }

  function resolvePartUrl(manifestPath: string, partPath: string): string {
    if (/^https?:\/\//i.test(partPath)) {
      return partPath;
    }

    const base = new URL(manifestPath, window.location.origin);
    return new URL(partPath, base).toString();
  }

  async function getBinarySize(url: string): Promise<number> {
    try {
      const head = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      const sizeHeader = head.headers.get('content-length');
      if (head.ok && sizeHeader) {
        const parsed = Number(sizeHeader);
        if (Number.isFinite(parsed) && parsed > 0) {
          return parsed;
        }
      }
    } catch {
      // Fallback to GET below
    }

    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Unable to fetch binary size for ${url}`);
    }

    const blob = await response.blob();
    return blob.size;
  }

  async function prepareFlashAddressMap(manifestPath: string, chipFamily: string) {
    try {
      const manifestResponse = await fetch(manifestPath, { cache: 'no-store' });
      if (!manifestResponse.ok) {
        throw new Error(`Manifest fetch failed: ${manifestResponse.status}`);
      }

      const manifest = (await manifestResponse.json()) as {
        builds?: Array<{
          chipFamily?: string;
          parts?: Array<{ path?: string; offset?: number }>;
        }>;
      };

      const build = manifest.builds?.find((candidate) => candidate.chipFamily === chipFamily);
      if (!build || !Array.isArray(build.parts) || build.parts.length === 0) {
        return;
      }

      const segments: Array<{
        startByte: number;
        endByte: number;
        offset: number;
        path: string;
      }> = [];

      let cursor = 0;
      for (const part of build.parts) {
        if (typeof part.path !== 'string' || typeof part.offset !== 'number') {
          continue;
        }

        const resolvedUrl = resolvePartUrl(manifestPath, part.path);
        const size = await getBinarySize(resolvedUrl);
        if (!Number.isFinite(size) || size <= 0) {
          continue;
        }

        segments.push({
          startByte: cursor,
          endByte: cursor + size,
          offset: part.offset,
          path: part.path,
        });
        cursor += size;
      }

      if (segments.length > 0) {
        flashAddressMapRef.current = segments;
      }
    } catch (error) {
      appendFlashLog(
        error instanceof Error
          ? t('modal.logs.addressMapError', { error: error.message })
          : t('modal.logs.addressMapError', { error: 'unknown' })
      );
    }
  }

  function computeCurrentFlashAddress(bytesWritten: number): number | null {
    const segments = flashAddressMapRef.current;
    if (!segments || segments.length === 0) {
      return null;
    }

    const safeBytes = Math.max(0, bytesWritten);
    for (const segment of segments) {
      if (safeBytes <= segment.endByte) {
        const localProgress = Math.max(0, safeBytes - segment.startByte);
        return segment.offset + localProgress;
      }
    }

    const last = segments[segments.length - 1];
    return last.offset + (last.endByte - last.startByte);
  }

  function startDialogStatePolling() {
    stopDialogStatePolling();

    let previousDialogState = '';
    let previousInstallState = '';
    let previousDialogError = '';

    statePollerRef.current = window.setInterval(() => {
      const dialog = activeDialogRef.current;
      if (!dialog) {
        return;
      }

      const dialogState = dialog.getAttribute('state') ?? dialog._state ?? 'unknown';
      if (dialogState !== previousDialogState) {
        previousDialogState = dialogState;
        appendFlashLog(t('modal.logs.stateChanged', { state: dialogState }));
      }

      const installState = dialog._installState;
      if (installState) {
        const percentage = installState.details?.percentage;
        const snapshot = JSON.stringify({
          state: installState.state,
          message: installState.message,
          percentage,
          done: installState.details?.done,
          bytesWritten: installState.details?.bytesWritten,
          bytesTotal: installState.details?.bytesTotal,
        });

        if (snapshot !== previousInstallState) {
          previousInstallState = snapshot;

          if (typeof percentage === 'number' && Number.isFinite(percentage)) {
            setFlashProgress(Math.max(0, Math.min(100, percentage)));
          }

          if (installState.state === 'error') {
            setFlashStatus('error');
          } else if (installState.state === 'finished') {
            setFlashStatus('finished');
            setFlashProgress(100);
          } else {
            setFlashStatus('installing');
          }

          const progressText =
            typeof percentage === 'number' ? ` (${Math.round(percentage)}%)` : '';
          const messageText = installState.message ? ` - ${installState.message}` : '';

          if (installState.state === 'writing') {
            const bytesWritten = installState.details?.bytesWritten;
            const computedAddress =
              typeof bytesWritten === 'number' && Number.isFinite(bytesWritten)
                ? computeCurrentFlashAddress(bytesWritten)
                : null;
            const roundedPercentage =
              typeof percentage === 'number' && Number.isFinite(percentage)
                ? Math.round(percentage)
                : null;

            if (computedAddress !== null && roundedPercentage !== null) {
              appendFlashLog(
                `Writing at 0x${computedAddress.toString(16)}... (${roundedPercentage}%)`
              );
            } else {
              appendFlashLog(`${installState.state}${messageText}${progressText}`);
            }
          } else {
            appendFlashLog(`${installState.state}${messageText}${progressText}`);
          }
        }
      }

      const dialogError = dialog._error;
      if (dialogError && dialogError !== previousDialogError) {
        previousDialogError = dialogError;
        setFlashStatus('error');
        appendFlashLog(t('modal.logs.dialogError', { error: dialogError }));
      }
    }, 250);
  }

  function attachDialogToModal(dialog: EwtInstallDialogElement) {
    const host = flashDialogHostRef.current;
    if (!host) {
      setFlashStatus('error');
      appendFlashLog(t('modal.logs.hostMissing'));
      return;
    }

    clearFlashHost();
    applyDialogTheme(dialog);
    host.appendChild(dialog);
    activeDialogRef.current = dialog;
    setIsDialogMounted(true);
    setFlashStatus('dialog_ready');
    appendFlashLog(t('modal.logs.dialogAttached'));

    dialog.addEventListener(
      'closed',
      () => {
        appendFlashLog(t('modal.logs.dialogClosed'));
        teardownFlashSession(true);
        setFlashStatus('idle');
      },
      { once: true }
    );

    startDialogStatePolling();
  }

  function observeDialogCreation() {
    stopDialogObserver();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) {
            continue;
          }

          if (node.tagName.toLowerCase() !== 'ewt-install-dialog') {
            continue;
          }

          stopDialogObserver();
          clearDialogAttachTimeout();
          attachDialogToModal(node as EwtInstallDialogElement);
          return;
        }
      }
    });

    observer.observe(document.body, { childList: true });
    dialogObserverRef.current = observer;

    clearDialogAttachTimeout();
    dialogAttachTimeoutRef.current = window.setTimeout(() => {
      if (activeDialogRef.current) {
        return;
      }

      stopDialogObserver();
      setFlashStatus('idle');
      appendFlashLog(t('modal.logs.noDialogDetected'));
    }, 20_000);
  }

  function prepareFlasherLaunch() {
    if (!selectedFirmware) {
      return;
    }

    if (!isGoogleChrome || !isWebSerialSupported) {
      setFlashStatus('error');
      appendFlashLog(t('modal.logs.chromeRequired'));
      return;
    }

    teardownFlashSession(true);
    setFlashLogs([]);
    setFlashProgress(null);
    setManifestToken(Date.now());
    setFlashStatus('waiting_for_port');
    appendFlashLog(t('modal.logs.requestingPort'));

    void prepareFlashAddressMap(manifestUrl, selectedFirmware.chipFamily);
    observeDialogCreation();
  }

  const manifestUrl = selectedFirmware
    ? `${selectedFirmware.manifestPath}?ts=${manifestToken}`
    : '';

  return (
    <>
      <Script
        src="https://unpkg.com/esp-web-tools@10/dist/web/install-button.js?module"
        type="module"
        strategy="afterInteractive"
      />

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
              <esp-web-install-button
                manifest={manifestUrl}
                className={styles.embeddedInstallButton}
                onClickCapture={prepareFlasherLaunch}
              >
                <button
                  type="button"
                  slot="activate"
                  className={styles.flashButton}
                  disabled={!isGoogleChrome || !isWebSerialSupported}
                >
                  {t('modal.launchFlasher')}
                </button>
                <span slot="unsupported" className={styles.warningText}>
                  {t('modal.chromeOnly')}
                </span>
                <span slot="not-allowed" className={styles.warningText}>
                  {t('modal.notSecureContext')}
                </span>
              </esp-web-install-button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setFlashLogs([])}
                disabled={flashLogs.length === 0}
              >
                {t('modal.clearLiveLogs')}
              </button>
            </div>

            <div className={styles.flashPanel}>
              <div className={styles.flashPanelHeader}>
                <span className={styles.fieldLabel}>{t('modal.flashPanelTitle')}</span>
                <span className={`${styles.flashStatusBadge} ${statusClassName(flashStatus)}`}>
                  {t(`modal.status.${flashStatus}`)}
                </span>
              </div>
              {flashProgress !== null && (
                <p className={styles.cardMeta}>
                  {t('modal.progressLabel', { value: Math.round(flashProgress) })}
                </p>
              )}
              <p className={styles.infoText}>{t('modal.integratedHint')}</p>
              <div ref={flashDialogHostRef} className={styles.flashDialogHost} />
              {!isDialogMounted && (
                <p className={styles.infoText}>{t('modal.dialogPlaceholder')}</p>
              )}

              <div className={styles.liveLogs}>
                <p className={styles.liveLogsTitle}>{t('modal.liveLogsTitle')}</p>
                <pre>{flashLogs.length > 0 ? flashLogs.join('\n') : t('modal.liveLogsEmpty')}</pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

