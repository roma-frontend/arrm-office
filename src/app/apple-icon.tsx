import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: 180,
        height: 180,
        borderRadius: 40,
        background: 'linear-gradient(135deg, #1d73b0, #2c8cd5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      {/* Shield shape */}
      <div
        style={{
          fontSize: 90,
          color: 'white',
          fontWeight: 900,
          fontFamily: 'sans-serif',
          lineHeight: 1,
        }}
      >
        HR
      </div>
      <div
        style={{
          fontSize: 28,
          color: 'rgba(255,255,255,0.8)',
          fontFamily: 'sans-serif',
          letterSpacing: 4,
        }}
      >
        OFFICE
      </div>
    </div>,
    { ...size },
  );
}
