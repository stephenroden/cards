import { describe, expect, it } from 'vitest';
import baseline from './ai-benchmark-baseline.json';
import { AiService } from './ai.service';
import { RulesService } from './rules.service';
import { benchmarkRules, formatMetricsTable, PROFILES, ProfileId, runBenchmark } from './ai-benchmark.util';

type BaselineEntry = {
  max_avg_points: number;
  min_win_rate_pct: number;
  max_q_taken_pct: number;
  min_q_safe_dump_pct: number;
};

type BaselineShape = {
  handsPerTable: number;
  standard: Record<ProfileId, BaselineEntry>;
  jackVariant: Record<ProfileId, BaselineEntry>;
};

const to2 = (value: number): number => Number(value.toFixed(2));

describe('AI benchmark guardrail', () => {
  it('does not regress below baseline metrics', () => {
    const cfg = baseline as BaselineShape;
    const ai = new AiService();
    const rulesService = new RulesService();

    const standardRows = formatMetricsTable(runBenchmark(benchmarkRules.standard, cfg.handsPerTable, ai, rulesService));
    const jackRows = formatMetricsTable(runBenchmark(benchmarkRules.jackVariant, cfg.handsPerTable, ai, rulesService));

    for (const profile of PROFILES) {
      const row = standardRows.find((r) => r.profile === profile);
      const floor = cfg.standard[profile];
      expect(row).toBeTruthy();
      expect(to2(row!.avg_points)).toBeLessThanOrEqual(floor.max_avg_points);
      expect(to2(row!.win_rate_pct)).toBeGreaterThanOrEqual(floor.min_win_rate_pct);
      expect(to2(row!.q_taken_pct)).toBeLessThanOrEqual(floor.max_q_taken_pct);
      expect(to2(row!.q_safe_dump_pct)).toBeGreaterThanOrEqual(floor.min_q_safe_dump_pct);
    }

    for (const profile of PROFILES) {
      const row = jackRows.find((r) => r.profile === profile);
      const floor = cfg.jackVariant[profile];
      expect(row).toBeTruthy();
      expect(to2(row!.avg_points)).toBeLessThanOrEqual(floor.max_avg_points);
      expect(to2(row!.win_rate_pct)).toBeGreaterThanOrEqual(floor.min_win_rate_pct);
      expect(to2(row!.q_taken_pct)).toBeLessThanOrEqual(floor.max_q_taken_pct);
      expect(to2(row!.q_safe_dump_pct)).toBeGreaterThanOrEqual(floor.min_q_safe_dump_pct);
    }
  }, 30000);
});
