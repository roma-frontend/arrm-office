'use client';

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import {
  BrandingPreviewProvider,
  useBrandingPreview,
  type BrandingPreviewValues,
} from '@/context/BrandingPreviewContext';

/** Test consumer that reads and exposes the context. */
function TestConsumer() {
  const ctx = useBrandingPreview();
  return (
    <div>
      <span data-testid="previewMode">{String(ctx.previewMode)}</span>
      <span data-testid="hasValues">{String(ctx.previewValues !== null)}</span>
      <span data-testid="brandName">{ctx.previewValues?.brandName ?? 'null'}</span>
      <button data-testid="toggle" onClick={() => ctx.setPreviewMode(!ctx.previewMode)} />
      <button
        data-testid="setValues"
        onClick={() =>
          ctx.setPreviewValues({
            primaryColor: '#ff0000',
            secondaryColor: '#00ff00',
            accentColor: '#0000ff',
            logoUrl: null,
            faviconUrl: null,
            brandName: 'TestCo',
            enableWhiteLabel: false,
            hidePoweredBy: false,
          })
        }
      />
      <button data-testid="clear" onClick={() => ctx.clearPreview()} />
    </div>
  );
}

describe('BrandingPreviewContext', () => {
  it('starts with previewMode=false and previewValues=null', () => {
    render(
      <BrandingPreviewProvider>
        <TestConsumer />
      </BrandingPreviewProvider>,
    );

    expect(screen.getByTestId('previewMode').textContent).toBe('false');
    expect(screen.getByTestId('hasValues').textContent).toBe('false');
    expect(screen.getByTestId('brandName').textContent).toBe('null');
  });

  it('toggles previewMode on and off', () => {
    render(
      <BrandingPreviewProvider>
        <TestConsumer />
      </BrandingPreviewProvider>,
    );

    act(() => screen.getByTestId('toggle').click());
    expect(screen.getByTestId('previewMode').textContent).toBe('true');

    act(() => screen.getByTestId('toggle').click());
    expect(screen.getByTestId('previewMode').textContent).toBe('false');
  });

  it('sets and reads preview values', () => {
    render(
      <BrandingPreviewProvider>
        <TestConsumer />
      </BrandingPreviewProvider>,
    );

    act(() => screen.getByTestId('setValues').click());
    expect(screen.getByTestId('hasValues').textContent).toBe('true');
    expect(screen.getByTestId('brandName').textContent).toBe('TestCo');
  });

  it('clearPreview resets everything', () => {
    render(
      <BrandingPreviewProvider>
        <TestConsumer />
      </BrandingPreviewProvider>,
    );

    act(() => screen.getByTestId('toggle').click());
    act(() => screen.getByTestId('setValues').click());
    expect(screen.getByTestId('previewMode').textContent).toBe('true');
    expect(screen.getByTestId('hasValues').textContent).toBe('true');

    act(() => screen.getByTestId('clear').click());
    expect(screen.getByTestId('previewMode').textContent).toBe('false');
    expect(screen.getByTestId('hasValues').textContent).toBe('false');
  });

  it('useBrandingPreview returns defaults outside provider', () => {
    /** Renders useBrandingPreview without wrapping in a provider. */
    function OutsideConsumer() {
      const ctx = useBrandingPreview();
      return (
        <div>
          <span data-testid="outside-previewMode">{String(ctx.previewMode)}</span>
          <span data-testid="outside-hasValues">{String(ctx.previewValues !== null)}</span>
        </div>
      );
    }

    render(<OutsideConsumer />);
    expect(screen.getByTestId('outside-previewMode').textContent).toBe('false');
    expect(screen.getByTestId('outside-hasValues').textContent).toBe('false');
  });
});
