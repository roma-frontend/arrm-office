/**
 * Tests for the shared meeting controls: BackgroundPicker, DeviceSettings and
 * MicMeter. All three are used twice — on the pre-join card (canvas tone) and
 * inside the call (dark tone) — so the tone switch is exercised too.
 */
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BackgroundPicker } from '@/components/meetings/BackgroundPicker';
import { DeviceSettings, MicMeter } from '@/components/meetings/DeviceSettings';
import { VIDEO_EFFECT_IMAGES } from '@/components/meetings/useVideoEffects';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

const mockSupportsAudioOutputSelection = jest.fn(() => true);

jest.mock('livekit-client', () => ({
  supportsAudioOutputSelection: () => mockSupportsAudioOutputSelection(),
  createAudioAnalyser: jest.fn(),
}));

function device(kind: MediaDeviceKind, deviceId: string, label = ''): MediaDeviceInfo {
  return { kind, deviceId, label, groupId: 'g', toJSON: () => ({}) } as MediaDeviceInfo;
}

const pickerProps = {
  effect: 'none' as const,
  pending: false,
  supported: true as boolean | null,
  failed: false,
  hasCamera: true,
  onSelect: jest.fn(),
};

describe('BackgroundPicker', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders every effect as a tile with the "none" option pressed', () => {
    render(<BackgroundPicker {...pickerProps} />);

    // none + two blur strengths + every image background
    expect(screen.getAllByRole('button')).toHaveLength(3 + VIDEO_EFFECT_IMAGES.length);
    expect(screen.getByRole('button', { name: 'meetings.effects.none' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('meetings.effects.hint')).toBeInTheDocument();
  });

  it('marks the active effect and reports a pick', () => {
    render(<BackgroundPicker {...pickerProps} effect="blur-strong" />);

    const strong = screen.getByRole('button', { name: 'meetings.effects.blurStrong' });
    expect(strong).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'meetings.effects.bokehWarm' }));
    expect(pickerProps.onSelect).toHaveBeenCalledWith('bokeh-warm');
  });

  it('explains a missing camera and disables the tiles', () => {
    render(<BackgroundPicker {...pickerProps} hasCamera={false} />);

    expect(screen.getByText('meetings.effects.needsCamera')).toBeInTheDocument();
    for (const tile of screen.getAllByRole('button')) expect(tile).toBeDisabled();
  });

  it('explains an unsupported browser as a status message', () => {
    render(<BackgroundPicker {...pickerProps} supported={false} />);

    expect(screen.getByRole('status')).toHaveTextContent('meetings.effects.unsupported');
    // "none" stays available: turning an effect off must never be blocked.
    expect(screen.getByRole('button', { name: 'meetings.effects.none' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'meetings.effects.blurLight' })).toBeDisabled();
  });

  it('reports a failure to apply', () => {
    render(<BackgroundPicker {...pickerProps} failed />);
    expect(screen.getByRole('status')).toHaveTextContent('meetings.effects.failed');
  });

  it('shows progress only on the tile being applied', () => {
    const { container } = render(
      <BackgroundPicker {...pickerProps} effect="blur-light" pending tone="canvas" />,
    );

    expect(screen.getByText('meetings.effects.applying')).toBeInTheDocument();
    expect(container.querySelectorAll('.animate-spin')).toHaveLength(1);
  });
});

describe('DeviceSettings', () => {
  const enumerateDevices = jest.fn(async () => [
    device('audioinput', 'mic-1', 'Headset mic'),
    device('videoinput', 'cam-1', ''),
    device('audiooutput', 'out-1', 'Speakers'),
  ]);

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupportsAudioOutputSelection.mockReturnValue(true);
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { enumerateDevices, addEventListener: jest.fn(), removeEventListener: jest.fn() },
      configurable: true,
    });
  });

  it('lists microphone, camera and speaker rows', async () => {
    await act(async () => {
      render(<DeviceSettings choices={{}} onChange={jest.fn()} />);
    });

    expect(screen.getByText('meetings.microphone')).toBeInTheDocument();
    expect(screen.getByText('meetings.camera')).toBeInTheDocument();
    expect(screen.getByText('meetings.speaker')).toBeInTheDocument();
    expect(screen.getAllByRole('combobox')).toHaveLength(3);
    expect(screen.getByRole('option', { name: 'Headset mic' })).toBeInTheDocument();
    // Unlabelled devices (no permission for labels yet) get a positional name.
    expect(screen.getByRole('option', { name: 'meetings.camera 1' })).toBeInTheDocument();
  });

  it('hides the speaker row where setSinkId is unavailable', async () => {
    mockSupportsAudioOutputSelection.mockReturnValue(false);
    await act(async () => {
      render(<DeviceSettings choices={{}} onChange={jest.fn()} />);
    });

    expect(screen.queryByText('meetings.speaker')).not.toBeInTheDocument();
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
  });

  it('hides the speaker row when the probe throws', async () => {
    mockSupportsAudioOutputSelection.mockImplementation(() => {
      throw new Error('not implemented');
    });
    await act(async () => {
      render(<DeviceSettings choices={{}} onChange={jest.fn()} />);
    });

    expect(screen.queryByText('meetings.speaker')).not.toBeInTheDocument();
  });

  it('preselects the remembered device and reports a change', async () => {
    const onChange = jest.fn();
    await act(async () => {
      render(
        <DeviceSettings choices={{ audioinput: 'mic-1' }} onChange={onChange} tone="canvas" />,
      );
    });

    const [mic] = screen.getAllByRole('combobox') as HTMLSelectElement[];
    expect(mic!.value).toBe('mic-1');

    fireEvent.change(mic!, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith('audioinput', '');
  });

  it('says so when a kind has no devices at all', async () => {
    enumerateDevices.mockResolvedValueOnce([]);
    await act(async () => {
      render(<DeviceSettings choices={{}} onChange={jest.fn()} />);
    });

    expect(screen.getAllByText('meetings.noDevices').length).toBeGreaterThan(0);
  });
});

describe('MicMeter', () => {
  it('lights bars in proportion to the level', () => {
    const { container } = render(<MicMeter level={0.5} />);
    const bars = container.querySelectorAll('span.rounded-full');

    expect(bars).toHaveLength(12);
    expect(container.querySelectorAll('.bg-emerald-400')).toHaveLength(6);
    expect(screen.getByText('meetings.micLevel')).toBeInTheDocument();
  });

  it('turns the top of the scale amber', () => {
    const { container } = render(<MicMeter level={1} />);
    expect(container.querySelectorAll('.bg-amber-400')).toHaveLength(2);
    expect(container.querySelectorAll('.bg-emerald-400')).toHaveLength(10);
  });

  it('renders the compact badge without a label', () => {
    const { container } = render(<MicMeter level={0} compact />);

    expect(screen.queryByText('meetings.micLevel')).not.toBeInTheDocument();
    expect(container.querySelectorAll('span.rounded-full.h-3')).toHaveLength(5);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('draws the canvas tone for unlit bars', () => {
    const { container } = render(<MicMeter level={0} tone="canvas" />);
    expect(container.querySelectorAll('.bg-\\(--surface-3\\)')).toHaveLength(12);
  });
});
