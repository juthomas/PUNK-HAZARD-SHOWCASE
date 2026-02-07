'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link } from '@/i18n/routing';
import styles from './page.module.css';

export default function ShutdownPage() {
  const dotTimeoutsRef = useRef<number[]>([]);
  const soundTimeoutsRef = useRef<number[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const shutdownAudioRef = useRef<HTMLAudioElement | null>(null);
  const startupAudioRef = useRef<HTMLAudioElement | null>(null);
  const runAudioRef = useRef<HTMLAudioElement | null>(null);
  const startupBufferRef = useRef<AudioBuffer | null>(null);
  const runBufferRef = useRef<AudioBuffer | null>(null);
  const runSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [dotCounts, setDotCounts] = useState<number[]>([]);

  const ensureAudioContext = () => {
    if (typeof window === 'undefined') return null;

    if (!audioContextRef.current) {
      const AudioContextCtor =
        window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return null;

      audioContextRef.current = new AudioContextCtor();
      masterGainRef.current = audioContextRef.current.createGain();
      masterGainRef.current.gain.value = 0.3;
      masterGainRef.current.connect(audioContextRef.current.destination);
    }

    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    return audioContextRef.current;
  };

  const playTone = (frequency: number, duration = 0.08, volume = 1, type: OscillatorType = 'sine') => {
    const ctx = ensureAudioContext();
    if (!ctx || !masterGainRef.current) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const base = masterGainRef.current.gain.value;

    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(base * volume, 0.0001), ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(masterGainRef.current);

    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  };

  const playDiskTick = (timeOffset = 0, volume = 0.55) => {
    const ctx = ensureAudioContext();
    if (!ctx || !masterGainRef.current) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const base = masterGainRef.current.gain.value;
    const startTime = ctx.currentTime + timeOffset;
    const jitter = (Math.random() - 0.5) * 0.12;
    const freq = 920 * (1 + jitter);
    const duration = 0.022 + Math.random() * 0.01;
    const vol = volume * (0.9 + Math.random() * 0.2);

    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(base * vol, 0.0001), startTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(masterGainRef.current);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
  };

  useEffect(() => {
    document.documentElement.classList.add(styles.shutdownNoScroll);
    document.body.classList.add(styles.shutdownNoScroll);

    return () => {
      document.documentElement.classList.remove(styles.shutdownNoScroll);
      document.body.classList.remove(styles.shutdownNoScroll);
    };
  }, []);

  useEffect(() => {
    const resumeAudio = () => {
      ensureAudioContext();
      if (shutdownAudioRef.current) {
        shutdownAudioRef.current.load();
      }
      if (startupAudioRef.current) {
        startupAudioRef.current.load();
      }
      if (runAudioRef.current) {
        runAudioRef.current.load();
      }
    };

    window.addEventListener('pointerdown', resumeAudio, { once: true });
    window.addEventListener('keydown', resumeAudio, { once: true });

    return () => {
      window.removeEventListener('pointerdown', resumeAudio);
      window.removeEventListener('keydown', resumeAudio);
    };
  }, []);

  useEffect(() => {
    shutdownAudioRef.current = new Audio('/audio/crt_shutdown.mp3');
    shutdownAudioRef.current.preload = 'auto';
    // shutdownAudioRef.current.playbackRate = 0.4;

    startupAudioRef.current = new Audio('/audio/floppy_startup.mp3');
    startupAudioRef.current.preload = 'auto';

    runAudioRef.current = new Audio('/audio/floppy_run.mp3');
    runAudioRef.current.preload = 'auto';
    runAudioRef.current.loop = true;

    return () => {
      startupAudioRef.current?.pause();
      runAudioRef.current?.pause();
      shutdownAudioRef.current = null;
      startupAudioRef.current = null;
      runAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const ctx = ensureAudioContext();
    if (!ctx) return;

    let isCancelled = false;
    const loadBuffer = async (url: string) => {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      return ctx.decodeAudioData(arrayBuffer);
    };

    loadBuffer('/audio/floppy_startup.mp3')
      .then((buffer) => {
        if (!isCancelled) startupBufferRef.current = buffer;
      })
      .catch(() => {
        startupBufferRef.current = null;
      });

    loadBuffer('/audio/floppy_run.mp3')
      .then((buffer) => {
        if (!isCancelled) runBufferRef.current = buffer;
      })
      .catch(() => {
        runBufferRef.current = null;
      });

    return () => {
      isCancelled = true;
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
          playDiskTick(0, 0.5);
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

  useEffect(() => {
    soundTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    soundTimeoutsRef.current = [];

    const addSound = (delaySec: number, action: () => void) => {
      const timeoutId = window.setTimeout(action, delaySec * 1000);
      soundTimeoutsRef.current.push(timeoutId);
    };

    const bootStart = bootSequence.lines[0]?.delay ?? 6;
    const screenPowerOn = Math.max(0.2, bootStart - 2);
    const playRunLoop = () => {
      const ctx = ensureAudioContext();
      if (runSourceRef.current) {
        try {
          runSourceRef.current.stop();
        } catch {
          // ignore
        }
        runSourceRef.current = null;
      }

      if (ctx && runBufferRef.current && masterGainRef.current) {
        const source = ctx.createBufferSource();
        source.buffer = runBufferRef.current;
        source.loop = true;
        source.connect(masterGainRef.current);
        source.start();
        runSourceRef.current = source;
        return;
      }

      if (!runAudioRef.current) return;
      runAudioRef.current.currentTime = 0;
      runAudioRef.current.play().catch(() => {
        playDiskTick(0, 0.5);
      });
    };
    const playStartup = () => {
      const ctx = ensureAudioContext();
      if (ctx && startupBufferRef.current && masterGainRef.current) {
        const overlapSec = 0.12;
        const source = ctx.createBufferSource();
        source.buffer = startupBufferRef.current;
        source.connect(masterGainRef.current);
        source.start();

        const startRunAt = Math.max(ctx.currentTime + startupBufferRef.current.duration - overlapSec, ctx.currentTime);
        if (runBufferRef.current) {
          if (runSourceRef.current) {
            try {
              runSourceRef.current.stop();
            } catch {
              // ignore
            }
            runSourceRef.current = null;
          }

          const runSource = ctx.createBufferSource();
          runSource.buffer = runBufferRef.current;
          runSource.loop = true;
          runSource.connect(masterGainRef.current);
          runSource.start(startRunAt);
          runSourceRef.current = runSource;
        } else {
          const timeoutId = window.setTimeout(() => {
            playRunLoop();
          }, Math.max((startRunAt - ctx.currentTime) * 1000, 0));
          soundTimeoutsRef.current.push(timeoutId);
        }
        return;
      }

      if (!startupAudioRef.current) {
        playRunLoop();
        return;
      }

      const overlapSec = 0.12;
      startupAudioRef.current.currentTime = 0;
      startupAudioRef.current.onended = () => {
        playRunLoop();
      };
      startupAudioRef.current.play().then(() => {
        const duration = startupAudioRef.current?.duration ?? 0;
        if (Number.isFinite(duration) && duration > overlapSec) {
          const runDelay = Math.max(duration - overlapSec, 0);
          const timeoutId = window.setTimeout(() => {
            playRunLoop();
          }, runDelay * 1000);
          soundTimeoutsRef.current.push(timeoutId);
        } else {
          const timeoutId = window.setTimeout(() => {
            playRunLoop();
          }, 300);
          soundTimeoutsRef.current.push(timeoutId);
        }
      }).catch(() => {
        playRunLoop();
      });
    };

    addSound(0.18, () => {
      if (shutdownAudioRef.current) {
        shutdownAudioRef.current.currentTime = 0;
        shutdownAudioRef.current.play().catch(() => {
          playDiskTick(0, 0.7);
          playDiskTick(0.05, 0.55);
          playDiskTick(0.12, 0.6);
        });
      } else {
        playDiskTick(0, 0.7);
        playDiskTick(0.05, 0.55);
        playDiskTick(0.12, 0.6);
      }
    });
    addSound(screenPowerOn, () => {
      playStartup();
    });
    addSound(bootStart, () => playDiskTick(0, 0.7));

    bootSequence.lines.forEach((line) => {
      if (!line.hasOk) return;
      const okTime = line.delay + line.mainDuration + line.dotsDuration + line.okDelay;
      addSound(okTime, () => playDiskTick(0, 0.75));
    });

    addSound(bootSequence.promptDelay, () => playDiskTick(0, 0.7));
    addSound(bootSequence.returnDelay, () => playDiskTick(0, 0.7));

    return () => {
      soundTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      soundTimeoutsRef.current = [];
      if (startupAudioRef.current) {
        startupAudioRef.current.pause();
        startupAudioRef.current.onended = null;
      }
      if (runAudioRef.current) {
        runAudioRef.current.pause();
      }
      if (runSourceRef.current) {
        try {
          runSourceRef.current.stop();
        } catch {
          // ignore
        }
        runSourceRef.current = null;
      }
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
