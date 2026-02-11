import { ImageResponse } from 'next/og';

export const alt = 'PUNK HAZARD — Ingénierie électronique, PCB, embarqué & robots';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
            padding: 48,
          }}
        >
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: '#fff',
              textAlign: 'center',
            }}
          >
            PUNK HAZARD
          </div>
          <div
            style={{
              fontSize: 24,
              color: 'rgba(255,255,255,0.75)',
              textAlign: 'center',
              maxWidth: 700,
            }}
          >
            Conception PCB, embarqué, électronique & robots — Du prototype à l’industrialisation
          </div>
          <div
            style={{
              marginTop: 24,
              fontSize: 14,
              color: 'rgba(255,255,255,0.5)',
            }}
          >
            punkhazard.org
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
