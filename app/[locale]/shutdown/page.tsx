'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link } from '@/i18n/routing';
import styles from './page.module.css';

export default function ShutdownPage() {
  const DEBUG_AUDIO = true;
  const dotTimeoutsRef = useRef<number[]>([]);
  const soundTimeoutsRef = useRef<number[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const shutdownAudioRef = useRef<HTMLAudioElement | null>(null);
  const startupAudioRef = useRef<HTMLAudioElement | null>(null);
  const runAudioRef = useRef<HTMLAudioElement | null>(null);
  const workAudioRef = useRef<HTMLAudioElement | null>(null);
  const startupBufferRef = useRef<AudioBuffer | null>(null);
  const runBufferRef = useRef<AudioBuffer | null>(null);
  const workBufferRef = useRef<AudioBuffer | null>(null);
  const runSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioUnlockedRef = useRef(false);
  const [dotCounts, setDotCounts] = useState<number[]>([]);

  const ensureAudioContext = () => {
    if (typeof window === 'undefined') return null;

    if (!audioContextRef.current) {
      const AudioContextCtor =
        window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return null;

      audioContextRef.current = new AudioContextCtor();
      masterGainRef.current = audioContextRef.current.createGain();
      masterGainRef.current.gain.value = 1;
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

  const playDiskTick = (
    timeOffset = 0,
    volume = 0.55,
    variant: 'soft' | 'hard' | 'seek' | 'motor' = 'soft'
  ) => {
    const ctx = ensureAudioContext();
    if (!ctx || !masterGainRef.current) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const base = masterGainRef.current.gain.value;
    const startTime = ctx.currentTime + timeOffset;
    const jitter = (Math.random() - 0.5) * 0.12;
    const freqBase =
      variant === 'hard' ? 1200 : variant === 'seek' ? 760 : variant === 'motor' ? 420 : 920;
    const freq = freqBase * (1 + jitter);
    const duration =
      (variant === 'motor' ? 0.08 : variant === 'seek' ? 0.035 : 0.022) + Math.random() * 0.01;
    const vol = volume * (0.9 + Math.random() * 0.2);
    const noiseDuration = duration * (variant === 'seek' ? 1.3 : 0.9);

    if (variant !== 'motor') {
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(Math.max(base * vol, 0.0001), startTime + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    }

    const noiseBufferSize = Math.max(1, Math.floor(ctx.sampleRate * noiseDuration));
    const noiseBuffer = ctx.createBuffer(1, noiseBufferSize, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseBufferSize; i += 1) {
      noiseData[i] = (Math.random() * 2 - 1) * (1 - i / noiseBufferSize);
    }
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = variant === 'motor' ? 'lowpass' : variant === 'hard' ? 'highpass' : 'bandpass';
    noiseFilter.frequency.value = variant === 'motor' ? 700 : variant === 'hard' ? 1800 : 1200;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(Math.max(base * vol * 0.6, 0.0001), startTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, startTime + noiseDuration);

    if (variant !== 'motor') {
      osc.connect(gain);
      gain.connect(masterGainRef.current);
    }
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGainRef.current);

    if (variant === 'motor') {
      const motorOsc = ctx.createOscillator();
      const motorGain = ctx.createGain();
      motorOsc.type = 'triangle';
      motorOsc.frequency.value = 90 + Math.random() * 30;
      motorGain.gain.setValueAtTime(Math.max(base * vol * 0.5, 0.0001), startTime);
      motorGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      motorOsc.connect(motorGain);
      motorGain.connect(masterGainRef.current);
      motorOsc.start(startTime);
      motorOsc.stop(startTime + duration + 0.02);
    }

    if (variant !== 'motor') {
      osc.start(startTime);
      osc.stop(startTime + duration + 0.01);
    }
    noiseSource.start(startTime);
    noiseSource.stop(startTime + noiseDuration + 0.01);
  };

  const playRunSnippet = (timeOffset = 0, duration = 0.314, volume = 3) => {
    const ctx = ensureAudioContext();
    if (DEBUG_AUDIO) {
      // eslint-disable-next-line no-console
      console.debug('[shutdown audio] dot snippet', {
        hasCtx: Boolean(ctx),
        ctxState: ctx?.state,
        hasRunBuffer: Boolean(runBufferRef.current),
        hasRunAudio: Boolean(runAudioRef.current),
      });
    }
    if (ctx && ctx.state === 'suspended' && !audioUnlockedRef.current) {
      ctx.resume().then(() => {
        audioUnlockedRef.current = true;
        playRunSnippet(timeOffset, duration, volume);
      }).catch(() => {
        // ignore
      });
      return;
    }

    if (ctx && masterGainRef.current && runBufferRef.current) {
      const buffer = runBufferRef.current;
      const safeDuration = Math.min(duration, Math.max(buffer.duration - 0.02, 0.01));
      const maxOffset = Math.max(buffer.duration - safeDuration, 0);
      const offset = maxOffset > 0 ? Math.random() * maxOffset : 0;
      const startTime = ctx.currentTime + timeOffset;

      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const base = masterGainRef.current.gain.value;
      const boosted = Math.min(volume, 3);

      source.buffer = buffer;
      gain.gain.setValueAtTime(Math.max(base * boosted, 0.0001), startTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + safeDuration);

      source.connect(gain);
      gain.connect(masterGainRef.current);

      source.start(startTime, offset, safeDuration);
      source.stop(startTime + safeDuration + 0.02);
      return;
    }

    if (runAudioRef.current) {
      const audio = new Audio('/audio/floppy_run.mp3');
      audio.preload = 'auto';
      audio.volume = 1;
      const runDuration = Number.isFinite(runAudioRef.current.duration) && runAudioRef.current.duration > 0
        ? runAudioRef.current.duration
        : 0.5;
      const safeDuration = Math.min(duration, Math.max(runDuration - 0.02, 0.01));
      const maxOffset = Math.max(runDuration - safeDuration, 0);
      audio.currentTime = maxOffset > 0 ? Math.random() * maxOffset : 0;
      audio.play().catch((err) => {
        if (DEBUG_AUDIO) {
          // eslint-disable-next-line no-console
          console.debug('[shutdown audio] snippet HTMLAudio play failed', err);
        }
        playDiskTick(timeOffset, Math.min(volume, 1), 'soft');
      });
      window.setTimeout(() => {
        audio.pause();
        audio.src = '';
      }, Math.max(safeDuration * 1000, 10));
      return;
    }

    playDiskTick(timeOffset, volume, 'soft');
  };

  const playOverlapSnippet = (timeOffset = 0, duration = 0.308, volume = 0.9, overlap = 0.3) => {
    const ctx = ensureAudioContext();
    if (ctx && masterGainRef.current && runBufferRef.current) {
      const startTime = ctx.currentTime + timeOffset;
      const base = masterGainRef.current.gain.value;
      const totalGain = Math.max(base * volume, 0.0001);

      const runBuffer = runBufferRef.current;
      const safeDuration = Math.min(duration, Math.max(runBuffer.duration - 0.02, 0.02));
      const maxRunOffset = Math.max(runBuffer.duration - safeDuration, 0);
      const runOffsetA = maxRunOffset > 0 ? Math.random() * maxRunOffset : 0;
      const runOffsetB = maxRunOffset > 0 ? Math.random() * maxRunOffset : 0;

      const runSourceA = ctx.createBufferSource();
      runSourceA.buffer = runBuffer;
      const runGainA = ctx.createGain();
      runGainA.gain.setValueAtTime(totalGain, startTime);
      runGainA.gain.exponentialRampToValueAtTime(0.0001, startTime + safeDuration);
      runSourceA.connect(runGainA);
      runGainA.connect(masterGainRef.current);
      runSourceA.start(startTime, runOffsetA, safeDuration);
      runSourceA.stop(startTime + safeDuration + 0.02);

      const runSourceB = ctx.createBufferSource();
      runSourceB.buffer = runBuffer;
      const runGainB = ctx.createGain();
      runGainB.gain.setValueAtTime(totalGain, startTime + overlap);
      runGainB.gain.exponentialRampToValueAtTime(0.0001, startTime + overlap + safeDuration);
      runSourceB.connect(runGainB);
      runGainB.connect(masterGainRef.current);
      runSourceB.start(startTime + overlap, runOffsetB, safeDuration);
      runSourceB.stop(startTime + overlap + safeDuration + 0.02);
      return;
    }

    if (runAudioRef.current) {
      const runAudioA = new Audio('/audio/floppy_run.mp3');
      const runAudioB = new Audio('/audio/floppy_run.mp3');
      runAudioA.preload = 'auto';
      runAudioB.preload = 'auto';
      runAudioA.volume = 1;
      runAudioB.volume = 1;
      runAudioA.currentTime = 0;
      runAudioB.currentTime = 0;
      runAudioA.play().catch(() => {
        playRunSnippet(timeOffset, duration, volume);
      });
      window.setTimeout(() => {
        runAudioB.play().catch(() => {
          playRunSnippet(timeOffset, duration, volume);
        });
      }, Math.max(overlap * 1000, 0));
      window.setTimeout(() => {
        runAudioA.pause();
        runAudioA.src = '';
        runAudioB.pause();
        runAudioB.src = '';
      }, Math.max((duration + overlap) * 1000, 40));
      return;
    }

    playRunSnippet(timeOffset, duration, volume);
  };

  const playShutdownSnippet = (timeOffset = 0) => {
    if (!shutdownAudioRef.current) {
      playDiskTick(timeOffset, 0.8, 'soft');
      return;
    }

    const audio = shutdownAudioRef.current.cloneNode(true) as HTMLAudioElement;
    audio.preload = 'auto';
    audio.volume = 0.9;
    audio.currentTime = 0;
    audio.play().catch(() => {
      playDiskTick(timeOffset, 0.8, 'soft');
    });
    window.setTimeout(() => {
      audio.pause();
      audio.src = '';
    }, 220);
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
      const ctx = ensureAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().then(() => {
          audioUnlockedRef.current = true;
          if (DEBUG_AUDIO) {
            // eslint-disable-next-line no-console
            console.debug('[shutdown audio] AudioContext resumed');
          }
        }).catch(() => {
          // ignore
        });
      } else {
        audioUnlockedRef.current = true;
        if (DEBUG_AUDIO) {
          // eslint-disable-next-line no-console
          console.debug('[shutdown audio] AudioContext ready');
        }
      }
      if (shutdownAudioRef.current) {
        shutdownAudioRef.current.load();
      }
      if (startupAudioRef.current) {
        startupAudioRef.current.load();
      }
      if (runAudioRef.current) {
        runAudioRef.current.load();
      }
      if (workAudioRef.current) {
        workAudioRef.current.load();
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

    workAudioRef.current = new Audio('/audio/floppy_work.mp3');
    workAudioRef.current.preload = 'auto';

    return () => {
      startupAudioRef.current?.pause();
      runAudioRef.current?.pause();
      shutdownAudioRef.current = null;
      startupAudioRef.current = null;
      runAudioRef.current = null;
      workAudioRef.current = null;
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
        if (DEBUG_AUDIO) {
          // eslint-disable-next-line no-console
          console.debug('[shutdown audio] startup buffer loaded', buffer.duration);
        }
      })
      .catch(() => {
        startupBufferRef.current = null;
      });

    loadBuffer('/audio/floppy_run.mp3')
      .then((buffer) => {
        if (!isCancelled) runBufferRef.current = buffer;
        if (DEBUG_AUDIO) {
          // eslint-disable-next-line no-console
          console.debug('[shutdown audio] run buffer loaded', buffer.duration);
        }
      })
      .catch(() => {
        runBufferRef.current = null;
      });

    loadBuffer('/audio/floppy_work.mp3')
      .then((buffer) => {
        if (!isCancelled) workBufferRef.current = buffer;
      })
      .catch(() => {
        workBufferRef.current = null;
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

    const okSoundDuration = 0.04;
    const okSoundVolume = 0.85;
    const okLoudVolume = 2.2;
    const okLongDuration = 0.7;

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
          playRunSnippet(0, 0.308, 1.1);
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

    const okSoundDuration = 0.04;
    const okSoundVolume = 0.85;
    const okLoudVolume = 2.2;
    const okLongDuration = 0.5;

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
        playOverlapSnippet(0, okSoundDuration, okSoundVolume);
        playOverlapSnippet(0, okSoundDuration, okSoundVolume);
        playOverlapSnippet(0, okSoundDuration, okSoundVolume);
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
          playRunSnippet(0, 0.306, 0.85);
          playRunSnippet(0.05, 0.305, 0.7);
          playRunSnippet(0.12, 0.305, 0.7);
        });
      } else {
        playRunSnippet(0, 0.306, 0.85);
        playRunSnippet(0.05, 0.305, 0.7);
        playRunSnippet(0.12, 0.305, 0.7);
      }
    });
    addSound(screenPowerOn, () => {
      playStartup();
    });
    addSound(bootStart, () => playOverlapSnippet(0, okLongDuration, okLoudVolume));

    bootSequence.lines.forEach((line) => {
      addSound(line.delay, () => playOverlapSnippet(0, okLongDuration, okLoudVolume));
      if (!line.hasOk) return;
      const okTime = line.delay + line.mainDuration + line.dotsDuration + line.okDelay;
      addSound(okTime, () => playOverlapSnippet(0, okLongDuration, okLoudVolume));
    });

    addSound(bootSequence.promptDelay, () => playOverlapSnippet(0, okLongDuration, okLoudVolume));
    addSound(bootSequence.returnDelay, () => playOverlapSnippet(0, okLongDuration, okLoudVolume));

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
