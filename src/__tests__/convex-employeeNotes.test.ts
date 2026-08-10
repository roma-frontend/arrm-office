/**
 * Tests for convex/employeeNotes.ts — manager notes with keyword sentiment
 * analysis and visibility-based filtering.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
}));

let addNoteHandler: (ctx: any, args: any) => Promise<unknown>;
let getNotesHandler: (ctx: any, args: any) => Promise<unknown>;
let updateNoteHandler: (ctx: any, args: any) => Promise<unknown>;
let deleteNoteHandler: (ctx: any, args: any) => Promise<unknown>;
let getNotesSummaryHandler: (ctx: any, args: any) => Promise<unknown>;

beforeEach(() => {
  jest.clearAllMocks();
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../convex/employeeNotes');
    addNoteHandler = mod.addNote.handler;
    getNotesHandler = mod.getNotes.handler;
    updateNoteHandler = mod.updateNote.handler;
    deleteNoteHandler = mod.deleteNote.handler;
    getNotesSummaryHandler = mod.getNotesSummary.handler;
  });
});

function makeInsertCtx() {
  const insert = jest.fn();
  const patch = jest.fn();
  const del = jest.fn();
  const get = jest.fn();
  return { ctx: { db: { insert, patch, delete: del, get } }, insert, patch, del, get };
}

function noteDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'note_1',
    employeeId: 'user_emp',
    authorId: 'user_admin',
    type: 'general',
    visibility: 'private',
    content: 'Good progress',
    sentiment: 'neutral',
    tags: [],
    createdAt: 123,
    ...overrides,
  };
}

describe('addNote sentiment analysis', () => {
  it('classifies positive content', async () => {
    const { ctx, insert } = makeInsertCtx();
    await addNoteHandler(ctx, {
      employeeId: 'user_emp',
      authorId: 'user_admin',
      type: 'performance',
      visibility: 'hr_only',
      content: 'Excellent work, truly impressive results',
      tags: ['q1'],
    });

    expect(insert).toHaveBeenCalledWith(
      'employeeNotes',
      expect.objectContaining({
        sentiment: 'positive',
        tags: ['q1'],
        employeeId: 'user_emp',
        authorId: 'user_admin',
      }),
    );
  });

  it('classifies negative content', async () => {
    const { ctx, insert } = makeInsertCtx();
    await addNoteHandler(ctx, {
      employeeId: 'user_emp',
      authorId: 'user_admin',
      type: 'concern',
      visibility: 'manager_only',
      content: 'Performance was poor and below expectations',
    });

    expect(insert).toHaveBeenCalledWith(
      'employeeNotes',
      expect.objectContaining({ sentiment: 'negative' }),
    );
  });

  it('classifies mixed positive+negative content as neutral', async () => {
    const { ctx, insert } = makeInsertCtx();
    await addNoteHandler(ctx, {
      employeeId: 'user_emp',
      authorId: 'user_admin',
      type: 'general',
      visibility: 'private',
      content: 'Good in some areas but weak in others',
    });

    expect(insert).toHaveBeenCalledWith(
      'employeeNotes',
      expect.objectContaining({ sentiment: 'neutral' }),
    );
  });

  it('defaults to neutral with no keywords', async () => {
    const { ctx, insert } = makeInsertCtx();
    await addNoteHandler(ctx, {
      employeeId: 'user_emp',
      authorId: 'user_admin',
      type: 'behavior',
      visibility: 'employee_visible',
      content: 'Attended the meeting on Tuesday',
    });

    expect(insert).toHaveBeenCalledWith(
      'employeeNotes',
      expect.objectContaining({ sentiment: 'neutral' }),
    );
  });

  it('defaults tags to an empty array when omitted', async () => {
    const { ctx, insert } = makeInsertCtx();
    await addNoteHandler(ctx, {
      employeeId: 'user_emp',
      authorId: 'user_admin',
      type: 'achievement',
      visibility: 'private',
      content: 'Outstanding quarter',
    });

    expect(insert).toHaveBeenCalledWith('employeeNotes', expect.objectContaining({ tags: [] }));
  });
});

describe('getNotes visibility filtering', () => {
  // q mimics the Convex expression builder so withIndex callbacks execute.
  const q: any = { eq: (..._args: unknown[]) => q };

  function makeNotesCtx(notes: Record<string, unknown>[], viewer: any) {
    const get = jest.fn();
    const take = jest.fn().mockResolvedValue(notes);
    const order = jest.fn().mockReturnValue({ take });
    const withIndex = jest.fn((_name: string, cb?: (q: any) => unknown) => {
      if (cb) cb(q);
      return { order };
    });
    get.mockResolvedValue(viewer);
    return {
      ctx: {
        db: {
          get,
          query: jest.fn().mockReturnValue({ withIndex }),
        },
      },
      get,
    };
  }

  const viewerAdmin = { _id: 'user_admin', role: 'admin' };
  const viewerSupervisor = { _id: 'user_sup', role: 'supervisor' };
  const viewerEmployee = { _id: 'user_emp', role: 'employee' };
  const author = { _id: 'user_admin', name: 'Alice Admin' };

  it('shows employee_visible notes to anyone', async () => {
    const notes = [
      noteDoc({ visibility: 'employee_visible', authorId: 'user_other' }),
      noteDoc({ _id: 'note_2', visibility: 'employee_visible', authorId: 'user_other2' }),
    ];
    const { ctx } = makeNotesCtx(notes, viewerEmployee);
    // Author lookups for both notes
    (ctx.db.get as jest.Mock)
      .mockResolvedValueOnce(viewerEmployee)
      .mockResolvedValueOnce({ _id: 'user_other', name: 'Bob' })
      .mockResolvedValueOnce({ _id: 'user_other2', name: 'Cara' });

    const result = (await getNotesHandler(ctx, {
      employeeId: 'user_emp',
      viewerId: 'user_emp',
    })) as any[];

    expect(result).toHaveLength(2);
    expect(result[0].authorName).toBe('Bob');
  });

  it('shows hr_only notes only to admins', async () => {
    const notes = [noteDoc({ visibility: 'hr_only' })];
    const { ctx } = makeNotesCtx(notes, viewerEmployee);
    (ctx.db.get as jest.Mock).mockResolvedValueOnce(viewerEmployee);

    const result = await getNotesHandler(ctx, { employeeId: 'user_emp', viewerId: 'user_emp' });
    expect(result).toEqual([]);

    const adminCtx = makeNotesCtx(notes, viewerAdmin);
    (adminCtx.ctx.db.get as jest.Mock)
      .mockResolvedValueOnce(viewerAdmin)
      .mockResolvedValueOnce(author);
    const adminResult = (await getNotesHandler(adminCtx.ctx, {
      employeeId: 'user_emp',
      viewerId: 'user_admin',
    })) as any[];
    expect(adminResult).toHaveLength(1);
  });

  it('shows manager_only notes to admins and supervisors', async () => {
    const notes = [noteDoc({ visibility: 'manager_only' })];
    const supCtx = makeNotesCtx(notes, viewerSupervisor);
    (supCtx.ctx.db.get as jest.Mock)
      .mockResolvedValueOnce(viewerSupervisor)
      .mockResolvedValueOnce(author);
    const supResult = (await getNotesHandler(supCtx.ctx, {
      employeeId: 'user_emp',
      viewerId: 'user_sup',
    })) as any[];
    expect(supResult).toHaveLength(1);

    const empCtx = makeNotesCtx(notes, viewerEmployee);
    (empCtx.ctx.db.get as jest.Mock).mockResolvedValueOnce(viewerEmployee);
    const empResult = await getNotesHandler(empCtx.ctx, {
      employeeId: 'user_emp',
      viewerId: 'user_emp',
    });
    expect(empResult).toEqual([]);
  });

  it('shows private notes only to their author', async () => {
    const notes = [noteDoc({ visibility: 'private', authorId: 'user_other' })];
    const empCtx = makeNotesCtx(notes, viewerEmployee);
    (empCtx.ctx.db.get as jest.Mock).mockResolvedValueOnce(viewerEmployee);
    const empResult = await getNotesHandler(empCtx.ctx, {
      employeeId: 'user_emp',
      viewerId: 'user_emp',
    });
    expect(empResult).toEqual([]);

    const notesOwn = [noteDoc({ visibility: 'private', authorId: 'user_emp' })];
    const ownCtx = makeNotesCtx(notesOwn, viewerEmployee);
    (ownCtx.ctx.db.get as jest.Mock)
      .mockResolvedValueOnce(viewerEmployee)
      .mockResolvedValueOnce({ _id: 'user_emp', name: 'Emp' });
    const ownResult = (await getNotesHandler(ownCtx.ctx, {
      employeeId: 'user_emp',
      viewerId: 'user_emp',
    })) as any[];
    expect(ownResult).toHaveLength(1);
  });

  it('returns an empty list when the viewer does not exist', async () => {
    const { ctx } = makeNotesCtx([noteDoc()], null);
    const result = await getNotesHandler(ctx, { employeeId: 'user_emp', viewerId: 'ghost' });
    expect(result).toEqual([]);
    expect(ctx.db.query).not.toHaveBeenCalled();
  });
});

describe('updateNote', () => {
  it('re-analyzes sentiment when content changes', async () => {
    const { ctx, patch } = makeInsertCtx();
    await updateNoteHandler(ctx, { noteId: 'note_1', content: 'This is excellent news' });

    expect(patch).toHaveBeenCalledWith('note_1', {
      content: 'This is excellent news',
      sentiment: 'positive',
    });
  });

  it('re-analyzes sentiment as negative when content turns negative', async () => {
    const { ctx, patch } = makeInsertCtx();
    await updateNoteHandler(ctx, { noteId: 'note_1', content: 'Poor performance lately' });

    expect(patch).toHaveBeenCalledWith('note_1', {
      content: 'Poor performance lately',
      sentiment: 'negative',
    });
  });

  it('updates tags without touching content', async () => {
    const { ctx, patch } = makeInsertCtx();
    await updateNoteHandler(ctx, { noteId: 'note_1', tags: ['a', 'b'] });

    expect(patch).toHaveBeenCalledWith('note_1', { tags: ['a', 'b'] });
  });

  it('patches nothing when no fields are provided', async () => {
    const { ctx, patch } = makeInsertCtx();
    await updateNoteHandler(ctx, { noteId: 'note_1' });

    expect(patch).toHaveBeenCalledWith('note_1', {});
  });
});

describe('deleteNote', () => {
  it('deletes the note', async () => {
    const { ctx, del } = makeInsertCtx();
    await deleteNoteHandler(ctx, { noteId: 'note_1' });
    expect(del).toHaveBeenCalledWith('note_1');
  });
});

describe('getNotesSummary', () => {
  const q: any = { eq: (..._args: unknown[]) => q };

  function makeSummaryCtx(notes: Record<string, unknown>[]) {
    const take = jest.fn().mockResolvedValue(notes);
    const withIndex = jest.fn((_name: string, cb?: (q: any) => unknown) => {
      if (cb) cb(q);
      return { take };
    });
    return {
      ctx: { db: { query: jest.fn().mockReturnValue({ withIndex }) } },
    };
  }

  it('computes totals by sentiment and type', async () => {
    const notes = [
      noteDoc({ sentiment: 'positive', type: 'performance' }),
      noteDoc({ _id: 'n2', sentiment: 'positive', type: 'achievement' }),
      noteDoc({ _id: 'n3', sentiment: 'negative', type: 'concern' }),
      noteDoc({ _id: 'n4', sentiment: 'neutral', type: 'general' }),
    ];
    const { ctx } = makeSummaryCtx(notes);

    const result = (await getNotesSummaryHandler(ctx, { employeeId: 'user_emp' })) as any;

    expect(result.total).toBe(4);
    expect(result.sentiment).toEqual({ positive: 2, negative: 1, neutral: 1 });
    expect(result.byType).toEqual({
      performance: 1,
      behavior: 0,
      achievement: 1,
      concern: 1,
      general: 1,
    });
  });

  it('returns zeros for no notes', async () => {
    const { ctx } = makeSummaryCtx([]);
    const result = (await getNotesSummaryHandler(ctx, { employeeId: 'user_emp' })) as any;

    expect(result.total).toBe(0);
    expect(result.sentiment).toEqual({ positive: 0, negative: 0, neutral: 0 });
  });
});
