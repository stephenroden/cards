import { describe, expect, it } from 'vitest';
import { AiService } from './ai.service';
import { RulesService } from './rules.service';
import { benchmarkRules, formatMetricsTable, PROFILES, runBenchmark } from './ai-benchmark.util';

describe('AI strategy benchmark', () => {
  it('runs deterministic profile benchmark and prints comparison tables', () => {
    const handsPerTable = 120;
    const ai = new AiService();
    const rulesService = new RulesService();

    const standard = runBenchmark(benchmarkRules.standard, handsPerTable, ai, rulesService);
    const jackVariant = runBenchmark(benchmarkRules.jackVariant, handsPerTable, ai, rulesService);

    // eslint-disable-next-line no-console
    console.log('\n[Hearts Benchmark] Standard rules');
    // eslint-disable-next-line no-console
    console.table(
      formatMetricsTable(standard).map((row) => ({
        ...row,
        avg_points: row.avg_points.toFixed(2),
        win_rate_pct: row.win_rate_pct.toFixed(2),
        q_taken_pct: row.q_taken_pct.toFixed(2),
        q_safe_dump_pct: row.q_safe_dump_pct.toFixed(2),
        moon_pct: row.moon_pct.toFixed(2),
        jd_capture_pct: row.jd_capture_pct.toFixed(2)
      }))
    );
    // eslint-disable-next-line no-console
    console.log('\n[Hearts Benchmark] J♦ = -10 variant');
    // eslint-disable-next-line no-console
    console.table(
      formatMetricsTable(jackVariant).map((row) => ({
        ...row,
        avg_points: row.avg_points.toFixed(2),
        win_rate_pct: row.win_rate_pct.toFixed(2),
        q_taken_pct: row.q_taken_pct.toFixed(2),
        q_safe_dump_pct: row.q_safe_dump_pct.toFixed(2),
        moon_pct: row.moon_pct.toFixed(2),
        jd_capture_pct: row.jd_capture_pct.toFixed(2)
      }))
    );

    for (const profile of PROFILES) {
      expect(standard[profile].hands).toBeGreaterThan(0);
      expect(jackVariant[profile].hands).toBeGreaterThan(0);
    }
  }, 30000);
});
