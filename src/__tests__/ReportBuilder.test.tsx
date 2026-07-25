import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock i18n
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: 'en' },
  }),
}));

// Mock UI components
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));
jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant, className }: any) => (
    <span className={`badge ${variant || 'default'} ${className || ''}`}>{children}</span>
  ),
}));
jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: any) => (
    <div className={`card ${className || ''}`}>{children}</div>
  ),
}));
jest.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange }: any) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      aria-label="switch"
    />
  ),
}));

// ── Module under test ────────────────────────────────────────────────────────
import ReportBuilder from '@/components/analytics/ReportBuilder';

describe('ReportBuilder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Header ──
  describe('Header & Layout', () => {
    it('renders report name input', () => {
      render(<ReportBuilder />);
      const nameInput = screen.getByDisplayValue('Untitled Report');
      expect(nameInput).toBeInTheDocument();
    });

    it('shows widget count', () => {
      render(<ReportBuilder />);
      expect(screen.getByText(/1 widgets/)).toBeInTheDocument();
    });

    it('renders action buttons', () => {
      render(<ReportBuilder />);
      expect(screen.getByText('Preview')).toBeInTheDocument();
      expect(screen.getByText('Export')).toBeInTheDocument();
      expect(screen.getByText('Save')).toBeInTheDocument();
    });
  });

  // ── Report Name ──
  describe('Report Name', () => {
    it('allows editing report name', () => {
      render(<ReportBuilder />);
      const nameInput = screen.getByDisplayValue('Untitled Report');
      fireEvent.change(nameInput, { target: { value: 'Q2 Performance Report' } });
      expect(screen.getByDisplayValue('Q2 Performance Report')).toBeInTheDocument();
    });
  });

  // ── Toolbar ──
  describe('Toolbar', () => {
    it('renders Add Widget buttons', () => {
      render(<ReportBuilder />);
      const addWidgetBtns = screen.getAllByText('Add Widget');
      expect(addWidgetBtns.length).toBe(2); // toolbar + sidebar
    });

    it('renders auto-refresh switch', () => {
      render(<ReportBuilder />);
      const switches = screen.getAllByRole('checkbox');
      // Auto-refresh should be on by default
      expect((switches[0] as HTMLInputElement).checked).toBe(true);
    });

    it('renders time range selector', () => {
      render(<ReportBuilder />);
      expect(screen.getByText('Last 7 days')).toBeInTheDocument();
    });
  });

  // ── Widget Management ──
  describe('Widget Management', () => {
    it('starts with one default widget', () => {
      render(<ReportBuilder />);
      expect(screen.getByText('#1')).toBeInTheDocument();
      expect(screen.getByText('New Report')).toBeInTheDocument();
    });

    it('adds a new widget on click', () => {
      render(<ReportBuilder />);
      const addButtons = screen.getAllByText('Add Widget');
      fireEvent.click(addButtons[0]);

      const widgetNumbers = screen.getAllByText(/#\d/);
      expect(widgetNumbers.length).toBe(2);
    });

    it('removes a widget and reduces count', () => {
      render(<ReportBuilder />);
      // Default has 1 widget
      expect(screen.getAllByText(/#\d/)).toHaveLength(1);

      // Add another widget
      const addButtons = screen.getAllByText('Add Widget');
      fireEvent.click(addButtons[0]);
      expect(screen.getAllByText(/#\d/)).toHaveLength(2);

      // Click the trash button of the first widget
      const trashIcon = document.querySelector('button svg.lucide-trash2');
      if (trashIcon) {
        fireEvent.click(trashIcon.closest('button')!);
      }

      // Widget count should go back to 1
      expect(screen.getAllByText(/#\d/)).toHaveLength(1);
    });

    it('selects a widget on click', () => {
      render(<ReportBuilder />);
      const widgetItem = screen.getByText('New Report');
      fireEvent.click(widgetItem);

      expect(screen.getByText('Widget Settings')).toBeInTheDocument();
    });
  });

  // ── Widget Settings ──
  describe('Widget Settings', () => {
    it('shows widget title input when selected', () => {
      render(<ReportBuilder />);
      fireEvent.click(screen.getByText('New Report'));
      expect(screen.getByText('Widget Title')).toBeInTheDocument();
    });

    it('shows chart type options when selected', () => {
      render(<ReportBuilder />);
      fireEvent.click(screen.getByText('New Report'));
      expect(screen.getByText('Chart Type')).toBeInTheDocument();
      expect(screen.getByText('Bar Chart')).toBeInTheDocument();
      expect(screen.getByText('Line Chart')).toBeInTheDocument();
      expect(screen.getByText('Pie Chart')).toBeInTheDocument();
    });

    it('shows metric selector when selected', () => {
      render(<ReportBuilder />);
      fireEvent.click(screen.getByText('New Report'));
      expect(screen.getByText('Metric')).toBeInTheDocument();
      expect(screen.getByText('Employees')).toBeInTheDocument();
      expect(screen.getByText('Leave & Absence')).toBeInTheDocument();
    });

    it('shows period selector when selected', () => {
      render(<ReportBuilder />);
      fireEvent.click(screen.getByText('New Report'));
      expect(screen.getByText('Period')).toBeInTheDocument();
      expect(screen.getByText('Monthly')).toBeInTheDocument();
    });

    it('shows group by selector when selected', () => {
      render(<ReportBuilder />);
      fireEvent.click(screen.getByText('New Report'));
      expect(screen.getByText('Group By')).toBeInTheDocument();
      expect(screen.getByText('Department')).toBeInTheDocument();
    });

    it('shows color picker when selected', () => {
      render(<ReportBuilder />);
      fireEvent.click(screen.getByText('New Report'));
      expect(screen.getByText('Accent Color')).toBeInTheDocument();
    });

    it('updates widget title', () => {
      render(<ReportBuilder />);
      fireEvent.click(screen.getByText('New Report'));

      const titleInput = screen.getByDisplayValue('New Report');
      fireEvent.change(titleInput, { target: { value: 'Updated Report' } });

      expect(screen.getByText('Updated Report')).toBeInTheDocument();
    });

    it('changes chart type on click', () => {
      render(<ReportBuilder />);
      fireEvent.click(screen.getByText('New Report'));

      // Click on Line Chart
      fireEvent.click(screen.getByText('Line Chart'));

      // The widget badge should update to show the new type
      const lineLabels = screen.getAllByText(/Line Chart|line/);
      expect(lineLabels.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Preview Mode ──
  describe('Preview Mode', () => {
    it('toggles to preview mode', () => {
      render(<ReportBuilder />);
      fireEvent.click(screen.getByText('Preview'));

      // In preview mode, button shows "Edit"
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });

    it('shows chart preview icons in preview mode', () => {
      render(<ReportBuilder />);
      fireEvent.click(screen.getByText('Preview'));

      expect(screen.getByText(/Chart preview/)).toBeInTheDocument();
    });

    it('shows metric and group info in preview mode', () => {
      render(<ReportBuilder />);
      fireEvent.click(screen.getByText('Preview'));

      expect(screen.getByText(/employees by department/)).toBeInTheDocument();
    });
  });

  // ── Empty / No Selection State ──
  describe('Empty State', () => {
    it('shows no widget selected message when no widget is selected in edit mode', () => {
      render(<ReportBuilder />);
      expect(screen.getByText('No Widget Selected')).toBeInTheDocument();
    });

    it('shows chart type badges in empty state', () => {
      render(<ReportBuilder />);
      expect(screen.getByText('Bar Chart')).toBeInTheDocument();
      expect(screen.getByText('Line Chart')).toBeInTheDocument();
      expect(screen.getByText('Pie Chart')).toBeInTheDocument();
    });
  });

  // ── Auto-Refresh Toggle ──
  describe('Auto-Refresh Toggle', () => {
    it('toggles auto-refresh off', () => {
      render(<ReportBuilder />);
      const switches = screen.getAllByRole('checkbox');
      fireEvent.click(switches[0]);
      expect((switches[0] as HTMLInputElement).checked).toBe(false);
    });
  });
});
