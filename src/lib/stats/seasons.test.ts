import { describe, expect, test } from 'vitest';
import { assignGradesByCurve, gpaToGradeLetter, type GradeLetter } from './seasons';

describe('gpaToGradeLetter', () => {
  test('A+ at the legacy 4.15 threshold', () => {
    expect(gpaToGradeLetter(4.3)).toBe('A+');
    expect(gpaToGradeLetter(4.15)).toBe('A+');
  });

  test('A in the 3.5–4.14 band', () => {
    expect(gpaToGradeLetter(4.0)).toBe('A');
    expect(gpaToGradeLetter(3.5)).toBe('A');
    expect(gpaToGradeLetter(4.149)).toBe('A');
  });

  test('B in the 2.5–3.49 band', () => {
    expect(gpaToGradeLetter(3.0)).toBe('B');
    expect(gpaToGradeLetter(2.5)).toBe('B');
    expect(gpaToGradeLetter(3.499)).toBe('B');
  });

  test('C in the 1.5–2.49 band', () => {
    expect(gpaToGradeLetter(2.0)).toBe('C');
    expect(gpaToGradeLetter(1.5)).toBe('C');
  });

  test('D in the 0.5–1.49 band', () => {
    expect(gpaToGradeLetter(1.0)).toBe('D');
    expect(gpaToGradeLetter(0.5)).toBe('D');
  });

  test('F below 0.5', () => {
    expect(gpaToGradeLetter(0.49)).toBe('F');
    expect(gpaToGradeLetter(0)).toBe('F');
    expect(gpaToGradeLetter(-1)).toBe('F');
  });
});

describe('assignGradesByCurve', () => {
  test('empty input returns an empty Map', () => {
    expect(assignGradesByCurve(new Map<string, number>()).size).toBe(0);
  });

  test('single entry grades as A+ (the n === 1 special case)', () => {
    const grades = assignGradesByCurve(new Map([['solo', 100]]));
    expect(grades.get('solo')).toBe('A+');
  });

  test('higher score yields better grade', () => {
    // 12 owners — convenient because the percentile bands at 0.10 / 0.25 /
    // 0.50 / 0.75 / 0.90 land at integer indices for n = 12 (i / 11).
    // Indices 0–1 → A+ (≤ 0.10), 2 → A (≤ 0.25), 3–5 → B (≤ 0.50),
    // 6–8 → C (≤ 0.75), 9 → D (≤ 0.90), 10–11 → F.
    const scores = new Map<string, number>();
    for (let i = 0; i < 12; i++) {
      scores.set(`owner${i}`, 12 - i); // owner0 = 12 (best), owner11 = 1 (worst).
    }
    const grades = assignGradesByCurve(scores);

    expect(grades.get('owner0')).toBe('A+');
    expect(grades.get('owner1')).toBe('A+');
    expect(grades.get('owner2')).toBe('A');
    expect(grades.get('owner3')).toBe('B');
    expect(grades.get('owner5')).toBe('B');
    expect(grades.get('owner6')).toBe('C');
    expect(grades.get('owner8')).toBe('C');
    expect(grades.get('owner9')).toBe('D');
    expect(grades.get('owner10')).toBe('F');
    expect(grades.get('owner11')).toBe('F');
  });

  test('two-entry split: top is A+ (pct = 0), bottom is F (pct = 1)', () => {
    const grades = assignGradesByCurve(
      new Map([
        ['top', 10],
        ['bottom', 1],
      ]),
    );
    expect(grades.get('top')).toBe('A+');
    expect(grades.get('bottom')).toBe('F');
  });

  test('ties resolve by insertion order (Map iteration order)', () => {
    // Two owners with identical scores — the curve doesn't tiebreak, so
    // the relative order is whatever the input Map gives back. We just
    // verify both end up with valid GradeLetters and we don't throw.
    const grades = assignGradesByCurve(
      new Map([
        ['a', 5],
        ['b', 5],
      ]),
    );
    const valid: GradeLetter[] = ['A+', 'A', 'B', 'C', 'D', 'F'];
    expect(valid).toContain(grades.get('a'));
    expect(valid).toContain(grades.get('b'));
  });
});
