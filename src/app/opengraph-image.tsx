import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'Strata — From Strategy to Results';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        background: 'linear-gradient(135deg, #191b1d 0%, #242729 50%, #191b1d 100%)',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 60,
      }}
    >
      {/* Shield icon */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 80,
          height: 80,
          borderRadius: 20,
          background: 'linear-gradient(135deg, #006db4, #2c8cd5)',
          marginBottom: 32,
          fontSize: 36,
          fontWeight: 800,
          color: 'white',
        }}
      >
        HR
      </div>

      {/* Title */}
      <div
        style={{
          display: 'flex',
          fontSize: 56,
          fontWeight: 800,
          color: '#f0f2f4',
          textAlign: 'center',
          letterSpacing: '-0.02em',
          marginBottom: 16,
        }}
      >
        Strata
      </div>

      {/* Subtitle */}
      <div
        style={{
          display: 'flex',
          fontSize: 28,
          fontWeight: 400,
          color: '#58acf1',
          textAlign: 'center',
          marginBottom: 48,
        }}
      >
        All-in-One HR Management Platform
      </div>

      {/* Features row */}
      <div
        style={{
          display: 'flex',
          gap: 32,
          fontSize: 20,
          color: '#9a9fa4',
        }}
      >
        <div>📊 Attendance</div>
        <div>🏖 Leaves</div>
        <div>✅ Tasks</div>
        <div>🤖 AI Assistant</div>
      </div>

      {/* Bottom bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 40,
          display: 'flex',
          fontSize: 18,
          color: '#51565b',
          gap: 8,
        }}
      >
        strata.work
      </div>
    </div>,
    {
      ...size,
    },
  );
}
