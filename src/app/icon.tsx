import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        background: 'linear-gradient(135deg, #1d73b0, #2c8cd5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          fontSize: 18,
          color: 'white',
          fontWeight: 900,
          fontFamily: 'sans-serif',
        }}
      >
        H
      </div>
    </div>,
    { ...size },
  );
}
