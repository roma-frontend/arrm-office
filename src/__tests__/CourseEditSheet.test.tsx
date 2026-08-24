/**
 * Tests for CourseEditSheet — editing course properties in a side sheet.
 *
 * Mocks: react-i18next, convex/react, auth store, UI primitives.
 */

import React from 'react';
import { describe, it, expect, jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CourseEditSheet } from '@/components/learning/CourseEditSheet';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: 'en' },
  }),
}));

// Mock Sheet to render content inline
jest.mock('@/components/ui/sheet', () => ({
  Sheet: ({ open, children }: any) => (open ? <div data-testid="sheet">{children}</div> : null),
  SheetContent: ({ children }: any) => <div>{children}</div>,
  SheetHeader: ({ children }: any) => <div>{children}</div>,
  SheetTitle: ({ children }: any) => <div>{children}</div>,
  SheetBody: ({ children, className }: any) => <div className={className}>{children}</div>,
  SheetFooter: ({ children, className }: any) => <div className={className}>{children}</div>,
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

jest.mock('@/components/ui/textarea', () => ({
  Textarea: (props: any) => <textarea {...props} />,
}));

jest.mock('@/components/ui/switch', () => ({
  Switch: (props: any) => <input type="checkbox" {...props} />,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

const mockCourse = {
  _id: 'course-1' as any,
  _creationTime: Date.now(),
  organizationId: 'org-1' as any,
  title: 'React Basics',
  description: 'Learn React fundamentals',
  category: 'Engineering',
  difficulty: 'beginner' as const,
  estimatedHours: 4,
  thumbnailUrl: undefined,
  createdBy: 'user-1' as any,
  isPublished: true,
  isMandatory: false,
  tags: ['react', 'frontend'],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  creatorName: 'John Doe',
  lessonCount: 5,
};

describe('CourseEditSheet', () => {
  const mockOnSave = jest.fn();
  const mockOnOpenChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when course is null', () => {
    const { container } = render(
      <CourseEditSheet open={true} onOpenChange={mockOnOpenChange} course={null} onSave={mockOnSave} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <CourseEditSheet open={false} onOpenChange={mockOnOpenChange} course={mockCourse} onSave={mockOnSave} />,
    );
    expect(container.querySelector('[data-testid="sheet"]')).toBeNull();
  });

  it('renders the sheet with course title when open', () => {
    render(
      <CourseEditSheet open={true} onOpenChange={mockOnOpenChange} course={mockCourse} onSave={mockOnSave} />,
    );
    expect(screen.getByText('Edit Course')).toBeInTheDocument();
  });

  it('renders all form fields with course values', () => {
    render(
      <CourseEditSheet open={true} onOpenChange={mockOnOpenChange} course={mockCourse} onSave={mockOnSave} />,
    );

    // Title field
    const titleInput = screen.getByDisplayValue('React Basics');
    expect(titleInput).toBeInTheDocument();

    // Description field
    const descInput = screen.getByDisplayValue('Learn React fundamentals');
    expect(descInput).toBeInTheDocument();

    // Category field
    const categoryInput = screen.getByDisplayValue('Engineering');
    expect(categoryInput).toBeInTheDocument();

    // Estimated hours
    const hoursInput = screen.getByDisplayValue('4');
    expect(hoursInput).toBeInTheDocument();

    // Tags field
    const tagsInput = screen.getByDisplayValue('react, frontend');
    expect(tagsInput).toBeInTheDocument();
  });

  it('calls onSave with correct data on form submit', async () => {
    render(
      <CourseEditSheet open={true} onOpenChange={mockOnOpenChange} course={mockCourse} onSave={mockOnSave} />,
    );

    const submitButton = screen.getByText('Save Changes');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith({
        title: 'React Basics',
        description: 'Learn React fundamentals',
        category: 'Engineering',
        difficulty: 'beginner',
        estimatedHours: 4,
        isMandatory: false,
        tags: ['react', 'frontend'],
        isPublished: true,
      });
    });
  });

  it('calls onOpenChange(false) when cancel is clicked', () => {
    render(
      <CourseEditSheet open={true} onOpenChange={mockOnOpenChange} course={mockCourse} onSave={mockOnSave} />,
    );

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders difficulty select with correct options', () => {
    render(
      <CourseEditSheet open={true} onOpenChange={mockOnOpenChange} course={mockCourse} onSave={mockOnSave} />,
    );

    expect(screen.getByText('Beginner')).toBeInTheDocument();
    expect(screen.getByText('Intermediate')).toBeInTheDocument();
    expect(screen.getByText('Advanced')).toBeInTheDocument();
  });

  it('renders mandatory and published checkboxes', () => {
    render(
      <CourseEditSheet open={true} onOpenChange={mockOnOpenChange} course={mockCourse} onSave={mockOnSave} />,
    );

    expect(screen.getByText('Mandatory Course')).toBeInTheDocument();
    expect(screen.getByText('Published')).toBeInTheDocument();
  });
});
