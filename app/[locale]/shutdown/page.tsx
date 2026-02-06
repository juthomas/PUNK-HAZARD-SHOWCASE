'use client';

import { useEffect, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Link } from '@/i18n/routing';
import styles from './page.module.css';

export default function ShutdownPage() {
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
      'CHECKING MEMORY..................OK',
      'LOADING AUDIO STACK..............OK',
      'INIT SENSOR BUS..................OK',
      'SYNC CLOCK.......................OK',
      'MOUNTING FILESYSTEM..............OK',
      'STARTING SERVICES................OK',
      'GRAPHICS PIPELINE................OK',
      'NETWORK HANDSHAKE................OK',
      'SYSTEM READY',
    ],
    []
  );

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
          {bootLines.map((line, index) => (
            <li
              key={line}
              className={styles.bootLine}
              style={{ '--delay': `${index * 0.9}s` } as CSSProperties}
            >
              {line}
            </li>
          ))}
        </ul>
        <div className={styles.prompt}>
          <span>root@punkhazard:~$</span>
          <span className={styles.cursor} />
        </div>
        <div className={styles.returnLink}>
          <Link href="/">← back</Link>
        </div>
      </div>
    </div>
  );
}
