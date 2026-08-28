// Quiz scoring logic from convex/learning.ts submitQuizAttempt.
// Enrollment progress calculation from updateLessonProgress.

interface QuizQuestion {
  _id: string;
  correctAnswer: string;
  points: number;
}

interface QuizAnswer {
  userAnswer: string;
}

interface QuizResult {
  score: number;
  passed: boolean;
  answerResults: { questionId: string; userAnswer: string; isCorrect: boolean }[];
}

function gradeQuiz(
  questions: QuizQuestion[],
  answers: QuizAnswer[],
  passingScore: number,
): QuizResult {
  const totalPoints = questions.reduce((sum, q) => sum + q.points, 0);
  let earnedPoints = 0;

  const answerResults = answers.map((answer, idx) => {
    const question = questions[idx];
    if (!question)
      return { questionId: 'missing', userAnswer: answer.userAnswer, isCorrect: false };
    const isCorrect = answer.userAnswer === question.correctAnswer;
    if (isCorrect) earnedPoints += question.points;
    return {
      questionId: question._id,
      userAnswer: answer.userAnswer,
      isCorrect,
    };
  });

  const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
  const passed = score >= passingScore;

  return { score, passed, answerResults };
}

// Enrollment progress calculation
function calculateProgress(
  totalLessons: number,
  completedLessons: number,
): { progress: number; status: 'not_started' | 'in_progress' | 'completed' } {
  const progress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
  let status: 'not_started' | 'in_progress' | 'completed' = 'not_started';
  if (progress > 0 && progress < 100) status = 'in_progress';
  if (progress === 100) status = 'completed';
  return { progress, status };
}

describe('Quiz grading', () => {
  const questions: QuizQuestion[] = [
    { _id: 'q1', correctAnswer: 'A', points: 1 },
    { _id: 'q2', correctAnswer: 'B', points: 1 },
    { _id: 'q3', correctAnswer: 'C', points: 2 },
  ];

  it('scores 100% when all correct', () => {
    const result = gradeQuiz(
      questions,
      [{ userAnswer: 'A' }, { userAnswer: 'B' }, { userAnswer: 'C' }],
      70,
    );
    expect(result.score).toBe(100);
    expect(result.passed).toBe(true);
    expect(result.answerResults.every((r) => r.isCorrect)).toBe(true);
  });

  it('scores 0% when all wrong', () => {
    const result = gradeQuiz(
      questions,
      [{ userAnswer: 'X' }, { userAnswer: 'Y' }, { userAnswer: 'Z' }],
      70,
    );
    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('weights by points (q3 is worth 2)', () => {
    // Only q3 correct: 2 out of 4 points = 50%
    const result = gradeQuiz(
      questions,
      [{ userAnswer: 'X' }, { userAnswer: 'Y' }, { userAnswer: 'C' }],
      70,
    );
    expect(result.score).toBe(50);
    expect(result.passed).toBe(false);
  });

  it('passes with exactly passing score', () => {
    const result = gradeQuiz(
      questions,
      [{ userAnswer: 'A' }, { userAnswer: 'B' }, { userAnswer: 'X' }],
      50,
    );
    // 2/4 = 50%
    expect(result.score).toBe(50);
    expect(result.passed).toBe(true);
  });

  it('fails with score below passing', () => {
    const result = gradeQuiz(
      questions,
      [{ userAnswer: 'A' }, { userAnswer: 'Y' }, { userAnswer: 'X' }],
      50,
    );
    // 1/4 = 25%
    expect(result.score).toBe(25);
    expect(result.passed).toBe(false);
  });

  it('handles empty questions array', () => {
    const result = gradeQuiz([], [], 70);
    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('handles more answers than questions', () => {
    const result = gradeQuiz(
      [{ _id: 'q1', correctAnswer: 'A', points: 1 }],
      [{ userAnswer: 'A' }, { userAnswer: 'B' }],
      70,
    );
    expect(result.score).toBe(100);
    expect(result.answerResults).toHaveLength(2);
    expect(result.answerResults[1].questionId).toBe('missing');
  });
});

describe('Enrollment progress', () => {
  it('starts at 0% not_started', () => {
    const result = calculateProgress(10, 0);
    expect(result.progress).toBe(0);
    expect(result.status).toBe('not_started');
  });

  it('moves to in_progress when any lesson completed', () => {
    const result = calculateProgress(10, 1);
    expect(result.progress).toBe(10);
    expect(result.status).toBe('in_progress');
  });

  it('shows correct percentage', () => {
    const result = calculateProgress(10, 5);
    expect(result.progress).toBe(50);
    expect(result.status).toBe('in_progress');
  });

  it('completes at 100%', () => {
    const result = calculateProgress(10, 10);
    expect(result.progress).toBe(100);
    expect(result.status).toBe('completed');
  });

  it('rounds to nearest integer', () => {
    // 1/3 = 33.33... → 33
    const result = calculateProgress(3, 1);
    expect(result.progress).toBe(33);
  });

  it('handles zero total lessons', () => {
    const result = calculateProgress(0, 0);
    expect(result.progress).toBe(0);
    expect(result.status).toBe('not_started');
  });

  it('handles single lesson', () => {
    expect(calculateProgress(1, 0).status).toBe('not_started');
    expect(calculateProgress(1, 1).status).toBe('completed');
  });
});
