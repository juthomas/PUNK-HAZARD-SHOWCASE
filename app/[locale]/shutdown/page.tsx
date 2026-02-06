'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link } from '@/i18n/routing';
import styles from './page.module.css';

export default function ShutdownPage() {
  const dotTimeoutsRef = useRef<number[]>([]);
  const [dotCounts, setDotCounts] = useState<number[]>([]);

  useEffect(() => {
    document.documentElement.classList.add(styles.shutdownNoScroll);
    document.body.classList.add(styles.shutdownNoScroll);

    return () => {
      document.documentElement.classList.remove(styles.shutdownNoScroll);
      document.body.classList.remove(styles.shutdownNoScroll);
    };
  }, []);

  const bootLines = useMemo(
    () => [
      'BOOT SEQUENCE INIT',
      'CHECKING MEMORY.........................OK',
      'LOADING AUDIO STACK.....................OK',
      'INIT SENSOR BUS.........................OK',
      'SYNC CLOCK..............................OK',
      'MOUNTING FILESYSTEM.....................OK',
      'STARTING SERVICES.......................OK',
      'GRAPHICS PIPELINE.......................OK',
      'NETWORK HANDSHAKE.......................OK',
      'SYSTEM READY',
    ],
    []
  );

  const bootSequence = useMemo(() => {
    const pseudoRandom = (seed: string, index: number) => {
      let hash = 0;
      for (let i = 0; i < seed.length; i += 1) {
        hash = (hash * 31 + seed.charCodeAt(i)) | 0;
      }
      hash = (hash ^ ((index + 1) * 0x9e3779b9)) >>> 0;
      return (hash % 1000) / 1000;
    };
    const linesWithOk = bootLines.filter((line) => line.endsWith('OK'));
    const firstOkLine = linesWithOk[0] ?? '';
    const baseDots = (() => {
      if (!firstOkLine) return 0;
      const okIndex = firstOkLine.lastIndexOf('OK');
      const prefix = firstOkLine.slice(0, okIndex);
      const dotsMatch = prefix.match(/\.+$/);
      return dotsMatch ? dotsMatch[0].length : 0;
    })();
    const maxMain = Math.max(
      0,
      ...linesWithOk.map((line) => {
        const okIndex = line.lastIndexOf('OK');
        const prefix = line.slice(0, okIndex);
        return prefix.replace(/\.+$/, '').length;
      }),
      ...bootLines.filter((line) => !line.endsWith('OK')).map((line) => line.length)
    );

    let time = 6;
    const lines = bootLines.map((line) => {
      const okIndex = line.lastIndexOf('OK');
      const hasOk = okIndex !== -1 && okIndex >= line.length - 2;
      const prefix = hasOk ? line.slice(0, okIndex) : line;
      const main = prefix.replace(/\.+$/, '');
      const dots = hasOk ? '.'.repeat(baseDots) : '';
      const mainDuration = Math.min(0.2, 0.06 + main.length * 0.006);
      const dotStepBase = 0.18;
      const dotSpeedFactor = 0.1;
      const dotStep = dotStepBase * dotSpeedFactor;
      const dotDelays = hasOk
        ? Array.from({ length: dots.length }).map((_, dotIndex) =>
            pseudoRandom(line, dotIndex) < 0.18 ? dotStep * 10 : dotStep
          )
        : [];
      const dotsDuration = hasOk
        ? dotDelays.reduce((total, value) => total + value, 0)
        : 0;
      const okDelay = hasOk ? 0.45 : 0;
      const okDuration = hasOk ? 0.18 : 0;
      const lineDuration = mainDuration + dotsDuration + okDelay + okDuration;
      const delay = time;
      time += lineDuration + 0.25;

      return {
        line,
        delay,
        main,
        dots,
        dotsCount: baseDots,
        hasOk,
        maxDots: baseDots,
        maxMain,
        mainDuration,
        dotStep,
        dotDelays,
        dotsDuration,
        okDelay,
        okDuration,
      };
    });

    const lastLine = lines.at(-1);
    const lastLineDone =
      lastLine
        ? lastLine.delay +
          lastLine.mainDuration +
          lastLine.dotsDuration +
          lastLine.okDelay +
          lastLine.okDuration
        : time;

    return {
      lines,
      promptDelay: lastLineDone + 1.6,
      returnDelay: lastLineDone + 4.1,
    };
  }, [bootLines]);

  useEffect(() => {
    dotTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    dotTimeoutsRef.current = [];
    setDotCounts(bootSequence.lines.map(() => 0));

    bootSequence.lines.forEach((line, lineIndex) => {
      if (!line.hasOk || line.dotsCount === 0) {
        return;
      }

      let dotsOffset = 0;
      for (let dotIndex = 0; dotIndex < line.dotsCount; dotIndex += 1) {
        const step = line.dotDelays?.[dotIndex] ?? line.dotStep;
        const delayMs = (line.delay + line.mainDuration + dotsOffset) * 1000;
        const timeoutId = window.setTimeout(() => {
          setDotCounts((prev) => {
            if (prev[lineIndex] >= dotIndex + 1) {
              return prev;
            }

            const next = [...prev];
            next[lineIndex] = dotIndex + 1;
            return next;
          });
        }, delayMs);

        dotTimeoutsRef.current.push(timeoutId);
        dotsOffset += step;
      }
    });

    return () => {
      dotTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      dotTimeoutsRef.current = [];
    };
  }, [bootSequence]);

  return (
    <div className={styles.page}>
      <div className={styles.shutdownScreen}>
        <div className={styles.screenCRT} aria-hidden="true">
          <div className={styles.shutdownCRT} />
        </div>
      </div>

      <div className={styles.bootScreen}>
        <div className={styles.crtOverlay} aria-hidden="true" />
        <div className={styles.vignette} aria-hidden="true" />
        <div className={styles.edgeDistortion} aria-hidden="true" />
        <div className={styles.bootHeader}>PUNKHAZARD BIOS</div>
        <ul className={styles.bootList}>
          {bootSequence.lines.map((line, lineIndex) => (
            <li
              key={line.line}
              className={styles.bootLine}
              style={
                {
                  '--delay': `${line.delay}s`,
                  '--main-chars': `${line.main.length}`,
                  '--dots-chars': `${line.dots.length}`,
                  '--max-dots': `${line.maxDots}`,
                  '--max-main': `${line.maxMain}`,
                  '--main-duration': `${line.mainDuration}s`,
                  '--dots-duration': `${line.dotsDuration}s`,
                  '--ok-delay': `${line.okDelay}s`,
                  '--ok-duration': `${line.okDuration}s`,
                } as CSSProperties
              }
            >
              {line.main && <span className={styles.bootLineMain}>{line.main}</span>}
              {line.dots && (
                <span className={styles.bootLineDots}>
                  {'.'.repeat(dotCounts[lineIndex] ?? 0)}
                </span>
              )}
              {line.hasOk && <span className={styles.bootLineOk}>OK</span>}
            </li>
          ))}
        </ul>
        <div
          className={styles.prompt}
          style={{ '--prompt-delay': `${bootSequence.promptDelay}s` } as CSSProperties}
        >
          <span className={styles.promptText}>root@punkhazard:~$</span>
          <span className={styles.cursor} />
        </div>
        <div
          className={styles.returnLink}
          style={{ '--return-delay': `${bootSequence.returnDelay}s` } as CSSProperties}
        >
          <Link
            href="/"
            className={styles.returnText}
          >
            ← back
          </Link>
        </div>
      </div>
    </div>
  );
}
