// Survey response patterns from convex/surveys.ts

// Survey status transitions
const SURVEY_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['active', 'cancelled'],
  active: ['closed', 'cancelled'],
  closed: [],
  cancelled: [],
};

function canSurveyTransition(from: string, to: string): boolean {
  return SURVEY_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

// Survey response aggregation
interface SurveyResponse {
  questionId: string;
  rating?: number;
  text?: string;
  selectedOptions?: string[];
}

interface SurveyQuestion {
  _id: string;
  type: 'rating' | 'text' | 'multiple_choice' | 'yes_no' | 'nps';
}

function computeSurveyResults(
  questions: SurveyQuestion[],
  responses: SurveyResponse[],
): {
  totalResponses: number;
  completionRate: number;
  questionStats: Array<{
    questionId: string;
    type: string;
    responseCount: number;
    averageRating?: number;
    optionCounts?: Record<string, number>;
    yesNoRatio?: { yes: number; no: number };
  }>;
} {
  const totalResponses = responses.length;
  const questionsWithResponses = new Set(responses.map((r) => r.questionId));
  const completionRate =
    questions.length > 0 ? Math.round((questionsWithResponses.size / questions.length) * 100) : 0;

  const questionStats = questions.map((q) => {
    const qResponses = responses.filter((r) => r.questionId === q._id);
    const stat: ReturnType<typeof computeSurveyResults>['questionStats'][number] = {
      questionId: q._id,
      type: q.type,
      responseCount: qResponses.length,
    };

    if (q.type === 'rating' || q.type === 'nps') {
      const ratings = qResponses.map((r) => r.rating ?? 0).filter((r) => r > 0);
      stat.averageRating =
        ratings.length > 0
          ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10
          : undefined;
    }

    if (q.type === 'multiple_choice') {
      const optionCounts: Record<string, number> = {};
      qResponses.forEach((r) => {
        (r.selectedOptions ?? []).forEach((opt) => {
          optionCounts[opt] = (optionCounts[opt] || 0) + 1;
        });
      });
      stat.optionCounts = optionCounts;
    }

    if (q.type === 'yes_no') {
      let yes = 0;
      let no = 0;
      qResponses.forEach((r) => {
        if (r.text?.toLowerCase() === 'yes') yes++;
        else if (r.text?.toLowerCase() === 'no') no++;
      });
      stat.yesNoRatio = { yes, no };
    }

    return stat;
  });

  return { totalResponses, completionRate, questionStats };
}

// NPS score calculation (Net Promoter Score)
function calculateNPS(ratings: number[]): number {
  const total = ratings.length;
  if (total === 0) return 0;
  const promoters = ratings.filter((r) => r >= 9).length;
  const detractors = ratings.filter((r) => r <= 6).length;
  return Math.round(((promoters - detractors) / total) * 100);
}

describe('Survey status transitions', () => {
  it('draft → active', () => {
    expect(canSurveyTransition('draft', 'active')).toBe(true);
  });

  it('draft → cancelled', () => {
    expect(canSurveyTransition('draft', 'cancelled')).toBe(true);
  });

  it('active → closed', () => {
    expect(canSurveyTransition('active', 'closed')).toBe(true);
  });

  it('active → cancelled', () => {
    expect(canSurveyTransition('active', 'cancelled')).toBe(true);
  });

  it('closed cannot transition', () => {
    expect(canSurveyTransition('closed', 'active')).toBe(false);
  });

  it('cancelled cannot transition', () => {
    expect(canSurveyTransition('cancelled', 'draft')).toBe(false);
  });

  it('cannot skip from draft to closed', () => {
    expect(canSurveyTransition('draft', 'closed')).toBe(false);
  });
});

describe('Survey results computation', () => {
  const questions: SurveyQuestion[] = [
    { _id: 'q1', type: 'rating' },
    { _id: 'q2', type: 'text' },
    { _id: 'q3', type: 'multiple_choice' },
    { _id: 'q4', type: 'yes_no' },
    { _id: 'q5', type: 'nps' },
  ];

  const responses: SurveyResponse[] = [
    { questionId: 'q1', rating: 4 },
    { questionId: 'q1', rating: 5 },
    { questionId: 'q1', rating: 3 },
    { questionId: 'q2', text: 'Great!' },
    { questionId: 'q3', selectedOptions: ['Option A', 'Option B'] },
    { questionId: 'q3', selectedOptions: ['Option A'] },
    { questionId: 'q4', text: 'yes' },
    { questionId: 'q4', text: 'no' },
    // q5 (nps) has no responses
  ];

  it('counts total responses', () => {
    expect(computeSurveyResults(questions, responses).totalResponses).toBe(8);
  });

  it('calculates completion rate', () => {
    const result = computeSurveyResults(questions, responses);
    expect(result.completionRate).toBe(80); // 4 of 5 questions have responses
  });

  it('calculates average rating', () => {
    const stat = computeSurveyResults(questions, responses).questionStats.find(
      (s) => s.type === 'rating',
    );
    expect(stat?.averageRating).toBe(4);
  });

  it('counts multiple choice options', () => {
    const stat = computeSurveyResults(questions, responses).questionStats.find(
      (s) => s.type === 'multiple_choice',
    );
    expect(stat?.optionCounts?.['Option A']).toBe(2);
    expect(stat?.optionCounts?.['Option B']).toBe(1);
  });

  it('counts yes/no', () => {
    const stat = computeSurveyResults(questions, responses).questionStats.find(
      (s) => s.type === 'yes_no',
    );
    expect(stat?.yesNoRatio).toEqual({ yes: 1, no: 1 });
  });

  it('returns 0% for empty questions', () => {
    expect(computeSurveyResults([], []).completionRate).toBe(0);
  });
});

describe('NPS calculation', () => {
  it('calculates NPS score', () => {
    // 6 promoters (9-10), 2 passives (7-8), 2 detractors (0-6)
    const ratings = [9, 10, 9, 10, 9, 10, 7, 8, 3, 5];
    expect(calculateNPS(ratings)).toBe(40); // (6-2)/10 * 100 = 40
  });

  it('returns 0 for empty array', () => {
    expect(calculateNPS([])).toBe(0);
  });

  it('returns 100 when all promoters', () => {
    expect(calculateNPS([9, 10, 9, 10])).toBe(100);
  });

  it('returns -100 when all detractors', () => {
    expect(calculateNPS([1, 2, 3, 5, 6])).toBe(-100);
  });

  it('returns 0 when equal promoters and detractors', () => {
    expect(calculateNPS([10, 9, 1, 2])).toBe(0);
  });
});
