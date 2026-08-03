"use client";

import { useEffect, useMemo, useState } from "react";
import { DATA_AUDIT, MARKET_DAYS, REAL_DAYS, REAL_OPERATIONS, type RealDay, type RealOperation } from "./robustez-runtime-data";

type Tab = "Resumo de Robustez" | "Cenários Históricos" | "Stress Determinístico" | "Simulações Aleatórias";
type Unit = "points" | "money" | "percent";
type RiskLevel = "Baixo" | "Médio" | "Alto" | "Crítico";
type ScenarioKind = "Histórico" | "Stress" | "Aleatório";
type PeriodGranularity = "Dias" | "Semanas" | "Meses";
type ExclusionMode = "Manual" | "Melhores" | "Aleatório";
type StressType = "Sequência de perdas" | "Redução de ganhos" | "Aumento de perdas" | "Combinação adversa";
type StressIntensity = "Leve" | "Moderado" | "Forte" | "Extremo" | "Manual";
type SimulationCriterion = "Realista" | "Conservador" | "Muito conservador";
type SavedScenarioConfig =
  | { kind: "Histórico"; granularity: PeriodGranularity; mode: ExclusionMode; percent: number; positions: number[]; manualSelected: string[] }
  | { kind: "Stress"; stressType: StressType; intensity: StressIntensity; manual: { gainReduction: number; lossIncrease: number; extraLosses: number } }
  | { kind: "Aleatório"; runs: number; criterion: SimulationCriterion; seed: number };

type CurvePoint = { value: number; label: string; daily?: number };
type Series = { name: string; color: string; points: CurvePoint[]; dashed?: boolean };
type ScenarioDay = { date: string; label: string; points: number; operations: number; gains: number; losses: number; breakevens: number; zeroBySelection?: boolean };
type ScenarioStats = {
  curve: CurvePoint[];
  total: number;
  wins: number;
  losses: number;
  flat: number;
  operations: number;
  gains: number;
  dd: { value: number; peakLabel: string; endLabel: string; duration: number };
  up: { value: number; valleyLabel: string; endLabel: string };
  mean: number;
  median: number;
  sigma: number;
  winDayRate: number;
  minCurve: number;
  touchesRisk: boolean;
  marginPct: number;
  risk: RiskLevel;
};
type SavedScenario = { id: string; name: string; kind: ScenarioKind; risk: RiskLevel; color: string; stats: ScenarioStats; days: ScenarioDay[]; description: string; config?: SavedScenarioConfig };
type PeriodBar = { key: string; label: string; points: number; count: number; selected: boolean; removed: boolean };

const TABS: Tab[] = ["Resumo de Robustez", "Cenários Históricos", "Stress Determinístico", "Simulações Aleatórias"];
const RISK_COLORS: Record<RiskLevel, string> = { Baixo: "#22c55e", Médio: "#f59e0b", Alto: "#fb923c", Crítico: "#ef4444" };
const STRESS_PRESETS: Record<Exclude<StressIntensity, "Manual">, { gainReduction: number; lossIncrease: number; extraLosses: number }> = {
  Leve: { gainReduction: 10, lossIncrease: 15, extraLosses: 1 },
  Moderado: { gainReduction: 20, lossIncrease: 30, extraLosses: 2 },
  Forte: { gainReduction: 30, lossIncrease: 50, extraLosses: 3 },
  Extremo: { gainReduction: 40, lossIncrease: 75, extraLosses: 5 },
};

function formatPts(value: number) {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Math.round(value))} pts`;
}
function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
}
function pct(value: number) {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)}%`;
}
function moneyFromPoints(points: number, contracts: number) {
  return points * 0.2 * contracts;
}
function valueForUnit(points: number, unit: Unit, riskCapital: number, contracts: number) {
  if (unit === "money") return moneyFromPoints(points, contracts);
  if (unit === "percent") return riskCapital ? (moneyFromPoints(points, contracts) / riskCapital) * 100 : 0;
  return points;
}
function formatValue(points: number, unit: Unit, riskCapital: number, contracts: number) {
  const value = valueForUnit(points, unit, riskCapital, contracts);
  if (unit === "money") return formatMoney(value);
  if (unit === "percent") return pct(value);
  return formatPts(value);
}
function diffTone(value: number, lowerIsBetter = false) {
  if (value === 0) return "neutral";
  const improved = lowerIsBetter ? value < 0 : value > 0;
  return improved ? "good" : "bad";
}
function cumulativeCurve(days: Pick<ScenarioDay, "label" | "points">[]): CurvePoint[] {
  let total = 0;
  const curve: CurvePoint[] = [{ value: 0, label: "Início", daily: 0 }];
  for (const day of days) {
    total += day.points;
    curve.push({ value: Math.round(total), label: day.label, daily: day.points });
  }
  return curve;
}
function maxDrawdownFromCurve(curve: CurvePoint[]) {
  let peak = 0;
  let maxDd = 0;
  let peakLabel = "Início";
  let endLabel = "Início";
  let peakIndex = 0;
  let startIndex = 0;
  let endIndex = 0;
  curve.forEach((point, index) => {
    if (point.value > peak) {
      peak = point.value;
      peakLabel = point.label;
      peakIndex = index;
    }
    const drawdown = peak - point.value;
    if (drawdown > maxDd) {
      maxDd = drawdown;
      startIndex = peakIndex;
      endIndex = index;
      endLabel = point.label;
    }
  });
  return { value: Math.round(maxDd), peakLabel, endLabel, duration: Math.max(0, endIndex - startIndex) };
}
function maxUpdownFromCurve(curve: CurvePoint[]) {
  let valley = 0;
  let maxUp = 0;
  let valleyLabel = "Início";
  let endLabel = "Início";
  for (const point of curve) {
    if (point.value < valley) {
      valley = point.value;
      valleyLabel = point.label;
    }
    const updown = point.value - valley;
    if (updown > maxUp) {
      maxUp = updown;
      endLabel = point.label;
    }
  }
  return { value: Math.round(maxUp), valleyLabel, endLabel };
}
function riskFromMargin(touchesRisk: boolean, marginPct: number, dd: number, riskPoints: number): RiskLevel {
  if (touchesRisk || marginPct <= 0) return "Crítico";
  if (marginPct < 25 || dd >= riskPoints * 0.75) return "Alto";
  if (marginPct < 55 || dd >= riskPoints * 0.45) return "Médio";
  return "Baixo";
}
function scenarioStats(days: ScenarioDay[], riskPoints: number): ScenarioStats {
  const curve = cumulativeCurve(days);
  const total = curve.at(-1)?.value ?? 0;
  const wins = days.filter((day) => day.points > 0).length;
  const losses = days.filter((day) => day.points < 0).length;
  const flat = days.length - wins - losses;
  const operations = days.reduce((sum, day) => sum + day.operations, 0);
  const gains = days.reduce((sum, day) => sum + day.gains, 0);
  const mean = days.length ? total / days.length : 0;
  const sorted = [...days.map((day) => day.points)].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const variance = days.length ? days.reduce((sum, day) => sum + Math.pow(day.points - mean, 2), 0) / days.length : 0;
  const minCurve = Math.min(...curve.map((point) => point.value), 0);
  const touchesRisk = curve.some((point) => point.value <= -riskPoints);
  const marginPct = riskPoints ? Math.max(0, Math.min(100, ((minCurve + riskPoints) / riskPoints) * 100)) : 100;
  const dd = maxDrawdownFromCurve(curve);
  return { curve, total, wins, losses, flat, operations, gains, dd, up: maxUpdownFromCurve(curve), mean, median, sigma: Math.sqrt(variance), winDayRate: days.length ? (wins / days.length) * 100 : 0, minCurve, touchesRisk, marginPct, risk: riskFromMargin(touchesRisk, marginPct, dd.value, riskPoints) };
}
function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * (sorted.length - 1))));
  return sorted[index];
}
function seededRandom(seed: number) {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}
function shuffle<T>(items: T[], rand: () => number) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const swap = Math.floor(rand() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}
function limitedSavedScenarios(current: SavedScenario[], next: SavedScenario) {
  return [next, ...current].slice(0, 10);
}
function selectedCountFromPercent(total: number, percent: number) {
  return Math.floor(total * (percent / 100));
}
function medianNumber(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
function realBaseReport() {
  const positiveOps = REAL_OPERATIONS.filter((operation) => operation.points > 0);
  const lossDays = REAL_DAYS.filter((day) => day.points < 0);
  const bigOps = positiveOps.filter((operation) => operation.points >= 1000);
  const extraBigOps = positiveOps.filter((operation) => operation.points >= 1500);
  const between1000And1500 = positiveOps.filter((operation) => operation.points >= 1000 && operation.points < 1500);
  const bigTotal = bigOps.reduce((sum, operation) => sum + operation.points, 0);
  const averageLossDay = Math.abs(lossDays.reduce((sum, day) => sum + day.points, 0)) / Math.max(1, lossDays.length);
  const ranges = bigOps
    .map((operation) => REAL_DAYS.find((day) => day.date === operation.date)?.marketRange ?? null)
    .filter((range): range is number => range !== null);
  return {
    bigOps,
    extraBigOps,
    between1000And1500,
    bigPct: (bigOps.length / Math.max(1, REAL_OPERATIONS.length)) * 100,
    extraBigPct: (extraBigOps.length / Math.max(1, REAL_OPERATIONS.length)) * 100,
    bigTotal,
    averageLossDay,
    compensatedLossDays: averageLossDay ? bigTotal / averageLossDay : 0,
    medianBigRange: medianNumber(ranges),
    minBigRange: ranges.length ? Math.min(...ranges) : 0,
  };
}
function worstDrawdownSegment(curve: CurvePoint[]) {
  let peak = curve[0]?.value ?? 0;
  let peakIndex = 0;
  let bestPeakIndex = 0;
  let endIndex = 0;
  let maxDd = 0;
  for (let index = 0; index < curve.length; index++) {
    if (curve[index].value > peak) {
      peak = curve[index].value;
      peakIndex = index;
    }
    const dd = peak - curve[index].value;
    if (dd > maxDd) {
      maxDd = dd;
      bestPeakIndex = peakIndex;
      endIndex = index;
    }
  }
  const peakValue = curve[bestPeakIndex]?.value ?? 0;
  const segment = curve.slice(bestPeakIndex, endIndex + 1).map((point) => ({ label: point.label, value: point.value - peakValue }));
  return {
    value: Math.round(maxDd),
    peakLabel: curve[bestPeakIndex]?.label ?? "Início",
    endLabel: curve[endIndex]?.label ?? "Início",
    duration: Math.max(0, endIndex - bestPeakIndex),
    valley: Math.round(-maxDd),
    points: segment.length ? segment : [{ label: "Início", value: 0 }],
  };
}

const OPERATIONS_BY_DATE = REAL_OPERATIONS.reduce<Record<string, RealOperation[]>>((acc, operation) => {
  acc[operation.date] = acc[operation.date] ?? [];
  acc[operation.date].push(operation);
  return acc;
}, {});

function baseDaysFromReal(): ScenarioDay[] {
  return REAL_DAYS.map((day) => ({ date: day.date, label: day.label, points: day.points, operations: day.operations, gains: day.gains, losses: day.losses, breakevens: day.breakevens }));
}
function daysByOperationPositions(positions: number[]): ScenarioDay[] {
  return REAL_DAYS.map((day) => {
    const ops = (OPERATIONS_BY_DATE[day.date] ?? []).filter((operation) => positions.includes(operation.position));
    return { date: day.date, label: day.label, points: ops.reduce((sum, operation) => sum + operation.points, 0), operations: ops.length, gains: ops.filter((operation) => operation.result === "GAIN").length, losses: ops.filter((operation) => operation.result === "LOSS").length, breakevens: ops.filter((operation) => operation.result === "BREAKEVEN").length, zeroBySelection: ops.length === 0 };
  });
}
function weekKey(date: string) {
  const item = new Date(`${date}T12:00:00Z`);
  const day = item.getUTCDay() || 7;
  const monday = new Date(item);
  monday.setUTCDate(item.getUTCDate() - day + 1);
  return monday.toISOString().slice(0, 10);
}
function monthKey(date: string) {
  return date.slice(0, 7);
}
function periodKey(day: ScenarioDay, granularity: PeriodGranularity) {
  if (granularity === "Semanas") return weekKey(day.date);
  if (granularity === "Meses") return monthKey(day.date);
  return day.date;
}
function periodLabel(key: string, granularity: PeriodGranularity) {
  if (granularity === "Meses") {
    const [year, month] = key.split("-");
    return `${month}/${year}`;
  }
  if (granularity === "Semanas") {
    const [, month, day] = key.split("-");
    return `Sem. ${day}/${month}`;
  }
  return REAL_DAYS.find((day) => day.date === key)?.label ?? key;
}
function buildBars(days: ScenarioDay[], granularity: PeriodGranularity, removed: Set<string>, selected: Set<string>): PeriodBar[] {
  const map = new Map<string, { points: number; count: number }>();
  for (const day of days) {
    const key = periodKey(day, granularity);
    const current = map.get(key) ?? { points: 0, count: 0 };
    current.points += day.points;
    current.count += 1;
    map.set(key, current);
  }
  return [...map.entries()].map(([key, value]) => ({ key, label: periodLabel(key, granularity), points: Math.round(value.points), count: value.count, selected: selected.has(key), removed: removed.has(key) }));
}
function buildHistoricalScenario(baseDays: ScenarioDay[], granularity: PeriodGranularity, mode: ExclusionMode, percent: number, manualSelected: Set<string>) {
  const periodTotals = buildBars(baseDays, granularity, new Set(), manualSelected);
  const quantity = selectedCountFromPercent(periodTotals.length, percent);
  let removed = new Set<string>();
  if (mode === "Manual") removed = new Set(manualSelected);
  else if (mode === "Melhores") {
    const sorted = [...periodTotals].sort((a, b) => b.points - a.points);
    removed = new Set(sorted.slice(0, quantity).map((period) => period.key));
  } else {
    const rand = seededRandom(1103 + granularity.length * 97 + percent * 31 + baseDays.length);
    removed = new Set(shuffle(periodTotals, rand).slice(0, quantity).map((period) => period.key));
  }
  return { removed, days: baseDays.filter((day) => !removed.has(periodKey(day, granularity))), totalPeriods: periodTotals.length, quantity };
}
function stressParameters(intensity: StressIntensity, manual: { gainReduction: number; lossIncrease: number; extraLosses: number }) {
  return intensity === "Manual" ? manual : STRESS_PRESETS[intensity];
}
function applyStress(days: ScenarioDay[], stressType: StressType, params: { gainReduction: number; lossIncrease: number; extraLosses: number }) {
  const lossDays = days.filter((day) => day.points < 0);
  const averageLoss = Math.abs(lossDays.reduce((sum, day) => sum + day.points, 0)) / Math.max(1, lossDays.length);
  const extraLossDay = -Math.round(averageLoss * 1.15);
  const stressed = days.map((day) => {
    let points = day.points;
    if ((stressType === "Redução de ganhos" || stressType === "Combinação adversa") && points > 0) points *= 1 - params.gainReduction / 100;
    if ((stressType === "Aumento de perdas" || stressType === "Combinação adversa") && points < 0) points *= 1 + params.lossIncrease / 100;
    return { ...day, points: Math.round(points) };
  });
  if (stressType === "Sequência de perdas" || stressType === "Combinação adversa") {
    const curve = cumulativeCurve(stressed);
    let peakIndex = 0;
    curve.forEach((point, index) => {
      if (point.value > curve[peakIndex].value) peakIndex = index;
    });
    const insertAt = Math.max(0, peakIndex - 1);
    const extraDays = Array.from({ length: params.extraLosses }, (_, index) => ({ date: `stress-${index + 1}`, label: `Perda extra ${index + 1}`, points: extraLossDay, operations: 0, gains: 0, losses: 1, breakevens: 0 }));
    stressed.splice(insertAt + 1, 0, ...extraDays);
  }
  return stressed;
}
function simulatedDayPoints(days: ScenarioDay[], criterion: SimulationCriterion) {
  if (criterion === "Conservador") return days.map((day) => ({ ...day, points: day.points > 0 ? Math.round(day.points * 0.9) : Math.round(day.points * 1.15) }));
  if (criterion === "Muito conservador") return days.map((day) => ({ ...day, points: day.points > 0 ? Math.round(day.points * 0.8) : Math.round(day.points * 1.3) }));
  return days;
}
function makeRandomSimulation(days: ScenarioDay[], runs: number, seed: number, criterion: SimulationCriterion, riskPoints: number) {
  const adjustedDays = simulatedDayPoints(days, criterion);
  const rand = seededRandom(seed);
  const paths: number[][] = [];
  const dds: number[] = [];
  for (let run = 0; run < runs; run++) {
    const shuffled = shuffle(adjustedDays, rand);
    let total = 0;
    const path = [0];
    for (const day of shuffled) {
      total += day.points;
      path.push(Math.round(total));
    }
    paths.push(path);
    dds.push(maxDrawdownFromCurve(path.map((value, index) => ({ value, label: String(index) }))).value);
  }
  const bands = Array.from({ length: days.length + 1 }, (_, index) => {
    const values = paths.map((path) => path[index]);
    return { label: index === 0 ? "Início" : days[index - 1].label, p5: percentile(values, 5), p50: percentile(values, 50), p95: percentile(values, 95) };
  });
  const endings = paths.map((path) => path.at(-1) ?? 0);
  const riskHits = paths.filter((path) => path.some((value) => value <= -riskPoints)).length;
  return { bands, paths, endings, dds, averageFinal: endings.reduce((sum, value) => sum + value, 0) / Math.max(1, endings.length), p5Final: percentile(endings, 5), positivePct: (endings.filter((value) => value > 0).length / Math.max(1, runs)) * 100, riskHitPct: (riskHits / Math.max(1, runs)) * 100, averageDd: dds.reduce((sum, value) => sum + value, 0) / Math.max(1, dds.length), worstDd: Math.max(...dds, 0) };
}
function simRiskLevel(simulation: ReturnType<typeof makeRandomSimulation>, riskPoints: number): RiskLevel {
  if (simulation.riskHitPct > 8) return "Crítico";
  if (simulation.riskHitPct > 1 || simulation.worstDd > riskPoints * 0.75) return "Alto";
  if (simulation.p5Final < 0 || simulation.worstDd > riskPoints * 0.45) return "Médio";
  return "Baixo";
}
function daysFromCurve(curve: CurvePoint[]): ScenarioDay[] {
  return curve.slice(1).map((point, index) => ({ date: `curve-${index + 1}`, label: point.label, points: point.value - curve[index].value, operations: 0, gains: 0, losses: 0, breakevens: 0 }));
}

function Help({ children }: { children: React.ReactNode }) {
  return <details className="help"><summary aria-label="Ajuda contextual">?</summary><div>{children}</div></details>;
}
function ReadingGuide({ children }: { children: React.ReactNode }) {
  return <details className="reading-guide"><summary>Como ler esta tela</summary><div>{children}</div></details>;
}
function MetricCard({ label, value, hint, tone = "neutral" }: { label: string; value: string; hint?: string; tone?: "neutral" | "good" | "bad" | "warn" }) {
  return <article className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong>{hint ? <small>{hint}</small> : null}</article>;
}
function RiskBadge({ risk }: { risk: RiskLevel }) {
  const css = risk.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return <span className={`risk-badge risk-${css}`}>{risk}</span>;
}
function RiskControls({ riskCapital, setRiskCapital, contracts, setContracts, unit, setUnit, compact = false }: { riskCapital: number; setRiskCapital: (value: number) => void; contracts: number; setContracts: (value: number) => void; unit: Unit; setUnit: (unit: Unit) => void; compact?: boolean }) {
  const riskPoints = riskCapital / (0.2 * contracts);
  return <section className={compact ? "risk-controls compact" : "risk-controls"}>
    <div><label>Capital em risco compartilhado</label><input min="0" step="100" type="number" value={riskCapital} onChange={(event) => setRiskCapital(Number(event.target.value) || 0)} /></div>
    <div><label>Contratos para conversão</label><input max="10" min="1" step="1" type="number" value={contracts} onChange={(event) => setContracts(Math.max(1, Math.min(10, Number(event.target.value) || 1)))} /></div>
    <div><label>Unidade visual</label><select value={unit} onChange={(event) => setUnit(event.target.value as Unit)}><option value="points">Pontos</option><option value="money">R$</option><option value="percent">% do capital</option></select></div>
    <p>Linha vermelha: <strong>-{formatPts(riskPoints)}</strong> / <strong>{formatMoney(-riskCapital)}</strong> / <strong>-100%</strong></p>
  </section>;
}
function CurveChart({ series, riskPoints, unit, riskCapital, contracts, height = 330 }: { series: Series[]; riskPoints: number; unit: Unit; riskCapital: number; contracts: number; height?: number }) {
  const width = 940;
  const padding = { top: 24, right: 94, bottom: 44, left: 92 };
  const allPointValues = series.flatMap((item) => item.points.map((point) => point.value)).concat([0, -riskPoints]);
  const converted = allPointValues.map((value) => valueForUnit(value, unit, riskCapital, contracts));
  const min = Math.min(...converted);
  const max = Math.max(...converted);
  const span = Math.max(1, max - min);
  const maxLen = Math.max(...series.map((item) => item.points.length), 1);
  const x = (index: number) => padding.left + (index / Math.max(1, maxLen - 1)) * (width - padding.left - padding.right);
  const yFromDisplay = (displayValue: number) => padding.top + ((max - displayValue) / span) * (height - padding.top - padding.bottom);
  const y = (points: number) => yFromDisplay(valueForUnit(points, unit, riskCapital, contracts));
  const path = (points: CurvePoint[]) => points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(2)} ${y(point.value).toFixed(2)}`).join(" ");
  const valleyFor = (points: CurvePoint[]) => points.reduce((lowest, point, index) => (point.value < lowest.point.value ? { point, index } : lowest), { point: points[0] ?? { value: 0, label: "Início" }, index: 0 });
  const ticks = [max, (max + min) / 2, min];
  return <figure className="chart-card"><svg aria-label="Curva acumulada por dias avaliados" role="img" viewBox={`0 0 ${width} ${height}`}>
    <rect height={height} rx="8" width={width} x="0" y="0" />
    {ticks.map((tick) => <g key={tick}><line className="grid" x1={padding.left} x2={width - padding.right} y1={yFromDisplay(tick)} y2={yFromDisplay(tick)} /><text className="axis" x="14" y={yFromDisplay(tick) + 4}>{unit === "money" ? formatMoney(tick) : unit === "percent" ? pct(tick) : formatPts(tick).replace(" pts", "")}</text></g>)}
    <line className="zero-line" x1={padding.left} x2={width - padding.right} y1={y(0)} y2={y(0)} />
    <line className="risk-line" x1={padding.left} x2={width - padding.right} y1={y(-riskPoints)} y2={y(-riskPoints)} />
    <text className="risk-label" x={width - padding.right - 148} y={Math.max(16, y(-riskPoints) - 8)}>linha vermelha</text>
    {series.map((item) => {
      const valley = valleyFor(item.points);
      return <g key={item.name}><path d={path(item.points)} fill="none" stroke={item.color} strokeDasharray={item.dashed ? "8 8" : undefined} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.2" />{item.points.length ? <><circle cx={x(item.points.length - 1)} cy={y(item.points.at(-1)!.value)} fill={item.color} r="4.8" /><text className="final-label" x={Math.min(width - padding.right + 8, x(item.points.length - 1) + 8)} y={y(item.points.at(-1)!.value) + 4}>{formatValue(item.points.at(-1)!.value, unit, riskCapital, contracts)}</text>{valley.point.value < 0 ? <><circle className="valley-dot" cx={x(valley.index)} cy={y(valley.point.value)} r="4.6" /><text className="valley-label" x={Math.min(width - padding.right - 112, x(valley.index) + 8)} y={y(valley.point.value) - 8}>Vale máx: {formatValue(valley.point.value, unit, riskCapital, contracts)}</text></> : null}</> : null}</g>;
    })}
    <text className="axis" x={padding.left} y={height - 14}>Dia 0</text><text className="axis" x={width - padding.right - 82} y={height - 14}>Dia {maxLen - 1}</text>
  </svg><figcaption>{series.map((item) => <span key={item.name}><i style={{ background: item.color }} />{item.name}</span>)}</figcaption></figure>;
}
function DrawdownMiniChart({ stats, unit, riskCapital, contracts }: { stats: ScenarioStats; unit: Unit; riskCapital: number; contracts: number }) {
  const segment = worstDrawdownSegment(stats.curve);
  const riskPoints = riskCapital / (0.2 * contracts);
  const width = 360;
  const height = 142;
  const padding = { top: 18, right: 18, bottom: 24, left: 62 };
  const values = segment.points.map((point) => valueForUnit(point.value, unit, riskCapital, contracts));
  const min = Math.min(...values, valueForUnit(-riskPoints, unit, riskCapital, contracts), 0);
  const max = 0;
  const span = Math.max(1, max - min);
  const x = (index: number) => padding.left + (index / Math.max(1, segment.points.length - 1)) * (width - padding.left - padding.right);
  const y = (value: number) => padding.top + ((max - valueForUnit(value, unit, riskCapital, contracts)) / span) * (height - padding.top - padding.bottom);
  const path = segment.points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(2)} ${y(point.value).toFixed(2)}`).join(" ");
  const riskY = y(-riskPoints);
  const valleyPoint = segment.points.reduce((lowest, point, index) => (point.value < lowest.point.value ? { point, index } : lowest), { point: segment.points[0] ?? { label: "Início", value: 0 }, index: 0 });
  return <figure className="drawdown-mini"><div className="drawdown-summary"><span>Valor do drow</span><strong>{formatValue(segment.value, unit, riskCapital, contracts)}</strong><small>Duração: {segment.duration} dia(s), de {segment.peakLabel} até {segment.endLabel}</small></div><svg aria-label="Pior drawdown observado" role="img" viewBox={`0 0 ${width} ${height}`}>
    <rect height={height} rx="8" width={width} x="0" y="0" />
    <line className="zero-line" x1={padding.left} x2={width - padding.right} y1={y(0)} y2={y(0)} />
    <line className="risk-line" x1={padding.left} x2={width - padding.right} y1={riskY} y2={riskY} />
    <path d={path} fill="none" stroke="#fb7185" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.2" />
    <circle className="valley-dot" cx={x(valleyPoint.index)} cy={y(valleyPoint.point.value)} r="4" />
    <text className="axis" x="12" y={y(0) + 4}>0</text>
    <text className="risk-label" x="12" y={riskY + 4}>capital</text>
    <text className="valley-label" x="12" y={Math.max(34, y(segment.valley) - 8)}>Vale {formatValue(segment.valley, unit, riskCapital, contracts)}</text>
  </svg><figcaption>Pior drawdown: queda desde pico até fundo antes da recuperação. A linha vermelha é o capital em risco definido no topo.</figcaption></figure>;
}
function StandardMetricsPanel({ title, stats, realStats, unit, riskCapital, contracts }: { title: string; stats: ScenarioStats; realStats: ScenarioStats; unit: Unit; riskCapital: number; contracts: number }) {
  return <div className="panel scenario-metrics"><div className="section-title"><div><p>Métricas padrão</p><h2>{title}</h2></div><Help><p>Estas métricas se repetem nas telas de simulação para manter a mesma leitura: resultado, drawdown, margem contra capital e toque da linha vermelha.</p></Help></div><div className="compact-metrics"><MetricCard label="Resultado" tone={stats.total >= realStats.total ? "good" : "warn"} value={formatValue(stats.total, unit, riskCapital, contracts)} /><MetricCard label="Diferença vs real" tone={diffTone(stats.total - realStats.total)} value={formatValue(stats.total - realStats.total, unit, riskCapital, contracts)} /><MetricCard label="Pior DD" tone={stats.dd.value <= realStats.dd.value ? "good" : "bad"} value={formatValue(stats.dd.value, unit, riskCapital, contracts)} /><MetricCard label="Margem capital" tone={stats.marginPct > 55 ? "good" : stats.marginPct > 25 ? "warn" : "bad"} value={pct(stats.marginPct)} /><MetricCard label="Linha vermelha" tone={stats.touchesRisk ? "bad" : "good"} value={stats.touchesRisk ? "Tocou" : "Não tocou"} /><MetricCard label="Risco" tone={stats.risk === "Baixo" ? "good" : stats.risk === "Crítico" ? "bad" : "warn"} value={stats.risk} /></div><DrawdownMiniChart contracts={contracts} riskCapital={riskCapital} stats={stats} unit={unit} /></div>;
}
function CompareTable({ real, scenario, scenarioLabel, unit, riskCapital, contracts }: { real: ScenarioStats; scenario: ScenarioStats; scenarioLabel: string; unit: Unit; riskCapital: number; contracts: number }) {
  const rows = [
    { label: "Resultado final", real: real.total, scenario: scenario.total, lower: false },
    { label: "Pior DD", real: real.dd.value, scenario: scenario.dd.value, lower: true },
    { label: "Margem de capital", real: real.marginPct, scenario: scenario.marginPct, percent: true, lower: false },
    { label: "Dias positivos", real: real.winDayRate, scenario: scenario.winDayRate, percent: true, lower: false },
    { label: "Tocou linha vermelha", real: real.touchesRisk ? 1 : 0, scenario: scenario.touchesRisk ? 1 : 0, boolean: true, lower: true },
  ];
  return <div className="table-wrap"><table><thead><tr><th>Métrica</th><th>Histórico real</th><th>{scenarioLabel}</th><th>Diferença</th><th>Risco</th></tr></thead><tbody>{rows.map((row) => {
    const diff = row.scenario - row.real;
    return <tr key={row.label}><td>{row.label}</td><td>{row.boolean ? (row.real ? "Sim" : "Não") : row.percent ? pct(row.real) : formatValue(row.real, unit, riskCapital, contracts)}</td><td>{row.boolean ? (row.scenario ? "Sim" : "Não") : row.percent ? pct(row.scenario) : formatValue(row.scenario, unit, riskCapital, contracts)}</td><td className={`${diffTone(diff, row.lower)}-text`}>{row.boolean ? "-" : row.percent ? pct(diff) : formatValue(diff, unit, riskCapital, contracts)}</td><td><RiskBadge risk={scenario.risk} /></td></tr>;
  })}</tbody></table></div>;
}
function ScenarioList({ savedScenarios, setSavedScenarios, onActivate }: { savedScenarios: SavedScenario[]; setSavedScenarios: (items: SavedScenario[]) => void; onActivate?: (scenario: SavedScenario) => void }) {
  return <div className="saved-list">{savedScenarios.length === 0 ? <p className="empty-state">Nenhum cenário salvo ainda. Use Salvar para alimentar o Resumo.</p> : savedScenarios.map((item) => <article key={item.id}><div><span>{item.kind}</span><strong>{item.name}</strong><small>{item.description}</small></div><RiskBadge risk={item.risk} />{onActivate ? <button className="ghost" onClick={() => onActivate(item)}>Ativar</button> : null}<button className="ghost danger" onClick={() => setSavedScenarios(savedScenarios.filter((scenario) => scenario.id !== item.id))}>Excluir</button></article>)}</div>;
}
function ActionButtons({ onApply, onSave, onClear, saveLabel = "Salvar", savedMessage }: { onApply: () => void; onSave: () => void; onClear: () => void; saveLabel?: string; savedMessage?: string }) {
  return <div className="action-block"><div className="actions"><button onClick={onApply}>Aplicar</button><button className="primary" onClick={onSave}>{saveLabel}</button><button className="ghost" onClick={onClear}>Limpar</button></div>{savedMessage ? <p className="save-feedback">{savedMessage}</p> : null}</div>;
}
function PeriodBars({ bars, granularity, onToggle }: { bars: PeriodBar[]; granularity: PeriodGranularity; onToggle: (key: string) => void }) {
  const max = Math.max(...bars.map((bar) => Math.abs(bar.points)), 1);
  return <div className={`period-bars ${granularity === "Dias" ? "daily-bars" : ""}`}>{bars.map((bar) => <button aria-pressed={bar.selected} className={`${bar.points >= 0 ? "positive" : "negative"} ${bar.removed ? "removed" : ""} ${bar.selected ? "selected" : ""}`} key={bar.key} onClick={() => onToggle(bar.key)} title={`${bar.label}: ${formatPts(bar.points)}`}><strong style={{ height: `${Math.max(10, (Math.abs(bar.points) / max) * 128)}px` }} /><span>{bar.label}</span></button>)}</div>;
}
function DataTable({ days }: { days: RealDay[] }) {
  return <div className="table-wrap"><table><thead><tr><th>Dia</th><th>Pts dia</th><th>Ops</th><th>GAIN</th><th>LOSS</th><th>BE</th><th>Range mercado</th></tr></thead><tbody>{days.slice(-10).reverse().map((day) => <tr key={day.date}><td>{day.label}</td><td className={day.points >= 0 ? "good-text" : "bad-text"}>{formatPts(day.points)}</td><td>{day.operations}</td><td>{day.gains}</td><td>{day.losses}</td><td>{day.breakevens}</td><td>{day.marketRange ? formatPts(day.marketRange).replace(" pts", "") : "sem dado"}</td></tr>)}</tbody></table></div>;
}

function Resumo({ riskCapital, contracts, riskPoints, unit, savedScenarios, setSavedScenarios }: { riskCapital: number; contracts: number; riskPoints: number; unit: Unit; savedScenarios: SavedScenario[]; setSavedScenarios: (items: SavedScenario[]) => void }) {
  const [kindFilter, setKindFilter] = useState<"Todos" | ScenarioKind>("Todos");
  const [riskFilter, setRiskFilter] = useState<"Todos" | RiskLevel>("Todos");
  const realDays = useMemo(() => baseDaysFromReal(), []);
  const realStats = scenarioStats(realDays, riskPoints);
  const report = realBaseReport();
  const filtered = savedScenarios.filter((scenario) => (kindFilter === "Todos" || scenario.kind === kindFilter) && (riskFilter === "Todos" || scenario.risk === riskFilter));
  const worstScenario = filtered.length ? [...filtered].sort((a, b) => a.stats.marginPct - b.stats.marginPct || b.stats.dd.value - a.stats.dd.value)[0] : null;
  const criticalCount = savedScenarios.filter((scenario) => scenario.stats.touchesRisk).length;
  const totalPositive = REAL_OPERATIONS.filter((operation) => operation.points > 0).reduce((sum, operation) => sum + operation.points, 0);
  const concentrationPct = totalPositive ? (report.bigTotal / totalPositive) * 100 : 0;

  return <section className="panel-grid">
    <div className="panel wide executive">
      <div className="section-title"><div><p>Resumo de Robustez</p><h2>Radiografia da base real</h2></div><Help><p>Esta tela interpreta apenas o histórico real. Ela ajuda a entender quais variáveis sustentaram a curva antes de calibrar os cenários de stress.</p></Help></div>
      <CurveChart contracts={contracts} riskCapital={riskCapital} riskPoints={riskPoints} series={[{ name: "Histórico real completo", color: "#f8fafc", points: realStats.curve }]} unit={unit} />
    </div>

    <div className="metrics-grid"><MetricCard label="Resultado real" tone={realStats.total >= 0 ? "good" : "bad"} value={formatValue(realStats.total, unit, riskCapital, contracts)} /><MetricCard label="Pior DD real" tone="bad" value={formatValue(realStats.dd.value, unit, riskCapital, contracts)} /><MetricCard label="Eventos >= 1.000 pts" value={`${report.bigOps.length} ops`} hint={`${pct(report.bigPct)} da amostra`} /><MetricCard label="Eventos >= 1.500 pts" value={`${report.extraBigOps.length} ops`} hint={`${pct(report.extraBigPct)} da amostra`} /><MetricCard label="Loss days compensados" value={report.compensatedLossDays.toFixed(1)} hint="por gains >= 1.000 pts" /><MetricCard label="Range típico dos eventos" value={formatPts(report.medianBigRange).replace(" pts", "")} hint="mediana dos dias com evento >= 1.000" /></div>

    <div className="panel"><div className="section-title"><div><p>Relatório interpretativo</p><h2>De que dependeu a performance</h2></div><Help><p>O texto é uma leitura histórica. Não assume vantagem preditiva do setup e não projeta os próximos resultados.</p></Help></div><div className="report-copy"><p>O histórico real fecha em <b>{formatValue(realStats.total, unit, riskCapital, contracts)}</b>, mas a leitura central não é que o setup tenha capacidade preditiva. O que aparece na amostra é uma curva que precisa limitar perdas e sobreviver até que eventos amplos capturados pelo trailing compensem fases negativas.</p><p>As operações acima de <b>1.000 pontos</b> apareceram <b>{report.bigOps.length}</b> vez(es), o equivalente a <b>{pct(report.bigPct)}</b> das {REAL_OPERATIONS.length} operações. Elas não são frequentes, mas somaram <b>{formatPts(report.bigTotal)}</b>, o que representa aproximadamente <b>{pct(concentrationPct)}</b> dos pontos positivos brutos.</p><p>Com esses eventos maiores, a amostra conseguiu compensar cerca de <b>{report.compensatedLossDays.toFixed(1)}</b> dias negativos médios. Isso reforça a lógica do módulo: proteger capital durante períodos fracos para que os poucos eventos favoráveis tenham chance de aparecer na curva.</p><p>Nos dias em que apareceram operações acima de 1.000 pontos, a amplitude diária mediana foi de <b>{formatPts(report.medianBigRange)}</b>. Isso não permite antecipar quando esses movimentos voltarão a ocorrer, mas mostra que os maiores aportes históricos surgiram em contextos de volatilidade diária mais ampla.</p></div></div>

    <div className="panel"><div className="section-title"><div><p>Mapa de variáveis</p><h2>O que observar antes do stress</h2></div></div><div className="insight-list"><article><strong>Eventos especiais</strong><span>{report.bigOps.length} operações acima de 1.000 pts; {report.between1000And1500.length} entre 1.000 e 1.500 pts.</span></article><article><strong>Concentração</strong><span>Quanto maior o peso dos poucos gains grandes, mais importante testar redução de ganhos.</span></article><article><strong>Sequência negativa</strong><span>Pior drawdown real: {formatValue(realStats.dd.value, unit, riskCapital, contracts)}. Use isso para calibrar capital e sequência de perdas.</span></article><article><strong>Volatilidade</strong><span>Eventos grandes apareceram com range mediano de {formatPts(report.medianBigRange)} e mínimo de {formatPts(report.minBigRange)}.</span></article></div><ReadingGuide><p>Use esta radiografia para decidir como provocar stress nas outras telas: remover melhores períodos, reduzir gains grandes, aumentar perdas ou reorganizar a ordem dos dias.</p></ReadingGuide></div>

    <div className="panel wide"><div className="section-title"><div><p>Comparação opcional</p><h2>Cenários salvos pelas outras telas</h2></div><Help><p>Esta área não cria cenários. Ela apenas compara o que foi salvo em Cenários, Stress e Simulações.</p></Help></div><div className="filters-row"><div><label>Cenários visíveis</label><select value={kindFilter} onChange={(event) => setKindFilter(event.target.value as "Todos" | ScenarioKind)}><option>Todos</option><option>Histórico</option><option>Stress</option><option>Aleatório</option></select></div><div><label>Filtro por risco</label><select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value as "Todos" | RiskLevel)}><option>Todos</option><option>Baixo</option><option>Médio</option><option>Alto</option><option>Crítico</option></select></div></div><div className="table-wrap"><table><thead><tr><th>Cenário</th><th>Tipo</th><th>Resultado</th><th>Dif. resultado</th><th>Pior DD</th><th>Margem</th><th>Risco</th></tr></thead><tbody>{filtered.map((scenario) => <tr key={scenario.id}><td>{scenario.name}</td><td>{scenario.kind}</td><td>{formatValue(scenario.stats.total, unit, riskCapital, contracts)}</td><td className={diffTone(scenario.stats.total - realStats.total) + "-text"}>{formatValue(scenario.stats.total - realStats.total, unit, riskCapital, contracts)}</td><td>{formatValue(scenario.stats.dd.value, unit, riskCapital, contracts)}</td><td>{pct(scenario.stats.marginPct)}</td><td><RiskBadge risk={scenario.risk} /></td></tr>)}{filtered.length === 0 ? <tr><td colSpan={7}>Nenhum cenário salvo no filtro atual.</td></tr> : null}</tbody></table></div>{worstScenario ? <p className="conclusion spaced">Maior ameaça salva: <b>{worstScenario.name}</b>, com margem mínima de {pct(worstScenario.stats.marginPct)}. Cenários que tocaram a linha vermelha: {criticalCount}.</p> : null}</div>

    <div className="panel wide"><div className="section-title"><div><p>Cenários guardados</p><h2>Máximo 10, mais recentes primeiro</h2></div></div><ScenarioList savedScenarios={savedScenarios} setSavedScenarios={setSavedScenarios} /></div>
  </section>;
}

function Historicos({ riskCapital, setRiskCapital, contracts, setContracts, riskPoints, unit, setUnit, savedScenarios, setSavedScenarios }: { riskCapital: number; setRiskCapital: (value: number) => void; contracts: number; setContracts: (value: number) => void; riskPoints: number; unit: Unit; setUnit: (unit: Unit) => void; savedScenarios: SavedScenario[]; setSavedScenarios: (items: SavedScenario[]) => void }) {
  const [granularity, setGranularity] = useState<PeriodGranularity>("Dias");
  const [mode, setMode] = useState<ExclusionMode>("Manual");
  const [percent, setPercent] = useState(0);
  const [positions, setPositions] = useState<number[]>([1, 2, 3]);
  const [manualSelected, setManualSelected] = useState<Set<string>>(new Set());
  const [savedMessage, setSavedMessage] = useState("");
  const baseDays = useMemo(() => daysByOperationPositions(positions), [positions]);
  const realStats = scenarioStats(baseDaysFromReal(), riskPoints);
  const scenario = useMemo(() => buildHistoricalScenario(baseDays, granularity, mode, percent, manualSelected), [baseDays, granularity, mode, percent, manualSelected]);
  const scenarioResult = scenarioStats(scenario.days, riskPoints);
  const bars = buildBars(baseDays, granularity, scenario.removed, manualSelected);
  const savedOnly = savedScenarios.filter((item) => item.kind === "Histórico");
  const togglePosition = (position: number) => setPositions((current) => { const next = current.includes(position) ? current.filter((item) => item !== position) : [...current, position].sort(); return next.length ? next : current; });
  const clear = () => { setGranularity("Dias"); setMode("Manual"); setPercent(0); setPositions([1, 2, 3]); setManualSelected(new Set()); setSavedMessage(""); };
  const save = () => {
    const next: SavedScenario = { id: `hist-${Date.now()}`, name: `${granularity}: ${mode === "Manual" ? `${manualSelected.size} manual` : `${mode} ${percent}%`}`, kind: "Histórico", risk: scenarioResult.risk, color: RISK_COLORS[scenarioResult.risk], stats: scenarioResult, days: scenario.days, description: `${scenario.quantity}/${scenario.totalPeriods} blocos excluídos; ${scenario.days.length}/${REAL_DAYS.length} dias`, config: { kind: "Histórico", granularity, mode, percent, positions, manualSelected: [...manualSelected] } };
    setSavedScenarios(limitedSavedScenarios(savedScenarios, next));
    setSavedMessage("Cenário salvo");
  };
  const activate = (item: SavedScenario) => {
    if (!item.config || item.config.kind !== "Histórico") return;
    setGranularity(item.config.granularity);
    setMode(item.config.mode);
    setPercent(item.config.percent);
    setPositions(item.config.positions);
    setManualSelected(new Set(item.config.manualSelected));
    setSavedMessage("Cenário ativado");
  };

  return <section className="panel-grid"><div className="panel side"><div className="section-title"><div><p>Cenários Históricos</p><h2>Construir cenário</h2></div><Help><p>Manual começa neutro e reproduz o histórico real. Melhores remove os blocos mais positivos. Aleatório retira blocos ao acaso para testar dependência da amostra.</p></Help></div><div className="segmented">{(["Dias", "Semanas", "Meses"] as PeriodGranularity[]).map((item) => <button className={granularity === item ? "active" : ""} key={item} onClick={() => { setGranularity(item); setManualSelected(new Set()); setSavedMessage(""); }}>{item}</button>)}</div><label>Excluir</label><select value={mode} onChange={(event) => { setMode(event.target.value as ExclusionMode); setSavedMessage(""); }}><option>Manual</option><option>Melhores</option><option>Aleatório</option></select><label>Percentual da amostra: {percent}%</label><input max="30" min="0" step="1" type="range" value={percent} onChange={(event) => { setPercent(Number(event.target.value)); setSavedMessage(""); }} disabled={mode === "Manual"} /><p className="sample-caption">Amostra: {scenario.totalPeriods} {granularity.toLowerCase()}. Percentual escolhido exclui {scenario.quantity} bloco(s), arredondado para baixo.</p><label>Operações consideradas por dia</label><div className="check-row">{[1, 2, 3].map((position) => <label key={position}><input checked={positions.includes(position)} type="checkbox" onChange={() => { togglePosition(position); setSavedMessage(""); }} />{position}ª operação</label>)}</div><ActionButtons onApply={() => setSavedMessage("Cenário aplicado")} onClear={clear} onSave={save} saveLabel="Salvar cenário" savedMessage={savedMessage} /><RiskControls compact contracts={contracts} riskCapital={riskCapital} setContracts={setContracts} setRiskCapital={setRiskCapital} setUnit={setUnit} unit={unit} /></div><StandardMetricsPanel contracts={contracts} realStats={realStats} riskCapital={riskCapital} stats={scenarioResult} title="Cenário aplicado" unit={unit} /><div className="panel wide"><div className="section-title"><div><p>Barras de seleção</p><h2>{granularity} do histórico válido</h2></div><Help><p>Em Manual, clique nas barras para retirar ou recolocar dias, semanas ou meses. Em Melhores e Aleatório, as barras removidas mostram a exclusão automática.</p></Help></div><PeriodBars bars={bars} granularity={granularity} onToggle={(key) => { setMode("Manual"); setSavedMessage(""); setManualSelected((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; }); }} /></div><div className="panel wide"><CurveChart contracts={contracts} riskCapital={riskCapital} riskPoints={riskPoints} series={[{ name: "Histórico real completo", color: "#f8fafc", points: realStats.curve }, { name: "Cenário aplicado", color: RISK_COLORS[scenarioResult.risk], dashed: true, points: scenarioResult.curve }]} unit={unit} /></div><div className="panel"><div className="section-title"><div><p>Resumo da amostra</p><h2>Histórico real vs cenário aplicado</h2></div><Help><p>Dias sem a operação selecionada somam 0 e continuam na curva para não melhorar artificialmente a comparação.</p></Help></div><CompareTable contracts={contracts} real={realStats} riskCapital={riskCapital} scenario={scenarioResult} scenarioLabel="Cenário aplicado" unit={unit} /></div><div className="panel"><div className="section-title"><div><p>Leitura automática</p><h2>Impacto histórico</h2></div></div><p className="conclusion">O cenário remove {scenario.removed.size} bloco(s) em {granularity.toLowerCase()} e conserva a curva diária. Resultado muda {formatValue(scenarioResult.total - realStats.total, unit, riskCapital, contracts)}; margem mínima contra capital fica em {pct(scenarioResult.marginPct)}.</p><ReadingGuide><p>As barras apagadas são períodos retirados do cenário. A linha branca não muda; ela é o histórico real completo usado como base fixa.</p></ReadingGuide></div><div className="panel wide"><div className="section-title"><div><p>Cenários salvos</p><h2>Ativar calibragem ou enviar ao Resumo</h2></div><Help><p>Máximo de 10 cenários salvos no módulo. Ao salvar o 11º, o mais antigo sai da lista.</p></Help></div><ScenarioList onActivate={activate} savedScenarios={savedOnly} setSavedScenarios={(items) => setSavedScenarios([...items, ...savedScenarios.filter((item) => item.kind !== "Histórico")].slice(0, 10))} /></div></section>;
}

function Stress({ riskCapital, setRiskCapital, contracts, setContracts, riskPoints, unit, setUnit, savedScenarios, setSavedScenarios }: { riskCapital: number; setRiskCapital: (value: number) => void; contracts: number; setContracts: (value: number) => void; riskPoints: number; unit: Unit; setUnit: (unit: Unit) => void; savedScenarios: SavedScenario[]; setSavedScenarios: (items: SavedScenario[]) => void }) {
  const [stressType, setStressType] = useState<StressType>("Combinação adversa");
  const [intensity, setIntensity] = useState<StressIntensity>("Moderado");
  const [manual, setManual] = useState({ gainReduction: 10, lossIncrease: 15, extraLosses: 1 });
  const [savedMessage, setSavedMessage] = useState("");
  const params = useMemo(() => stressParameters(intensity, manual), [intensity, manual]);
  const realDays = useMemo(() => baseDaysFromReal(), []);
  const realStats = scenarioStats(realDays, riskPoints);
  const stressedDays = useMemo(() => applyStress(realDays, stressType, params), [realDays, stressType, params]);
  const stressStats = scenarioStats(stressedDays, riskPoints);
  const isNeutral = intensity === "Manual" && manual.gainReduction === 0 && manual.lossIncrease === 0 && manual.extraLosses === 0;
  const manualSoft = intensity === "Manual" && !isNeutral && (manual.gainReduction < 10 || manual.lossIncrease < 15 || manual.extraLosses < 1);
  const savedOnly = savedScenarios.filter((item) => item.kind === "Stress");
  const clear = () => { setStressType("Combinação adversa"); setIntensity("Manual"); setManual({ gainReduction: 0, lossIncrease: 0, extraLosses: 0 }); setSavedMessage(""); };
  const save = () => {
    const next: SavedScenario = { id: `stress-${Date.now()}`, name: `${isNeutral ? "Neutro" : stressType} ${intensity}`, kind: "Stress", risk: stressStats.risk, color: RISK_COLORS[stressStats.risk], stats: stressStats, days: stressedDays, description: `Ganhos -${params.gainReduction}%, perdas +${params.lossIncrease}%, perdas extras ${params.extraLosses}`, config: { kind: "Stress", stressType, intensity, manual } };
    setSavedScenarios(limitedSavedScenarios(savedScenarios, next));
    setSavedMessage("Cenário salvo");
  };
  const activate = (item: SavedScenario) => {
    if (!item.config || item.config.kind !== "Stress") return;
    setStressType(item.config.stressType);
    setIntensity(item.config.intensity);
    setManual(item.config.manual);
    setSavedMessage("Cenário ativado");
  };
  return <section className="panel-grid"><div className="panel side"><div className="section-title"><div><p>Stress Determinístico</p><h2>Provas duras repetíveis</h2></div><Help><p>Stress determinístico aplica regras fixas e conservadoras. O mesmo controle gera sempre o mesmo resultado.</p></Help></div><label>Tipo de stress</label><select value={stressType} onChange={(event) => { setStressType(event.target.value as StressType); setSavedMessage(""); }}><option>Sequência de perdas</option><option>Redução de ganhos</option><option>Aumento de perdas</option><option>Combinação adversa</option></select><label>Intensidade</label><div className="segmented wrap">{(["Leve", "Moderado", "Forte", "Extremo", "Manual"] as StressIntensity[]).map((item) => <button className={intensity === item ? "active" : ""} key={item} onClick={() => { setIntensity(item); setSavedMessage(""); }}>{item}</button>)}</div>{intensity === "Manual" ? <div className="manual-grid"><label>Redução de ganhos: {params.gainReduction}%</label><input max="60" min="0" type="range" value={manual.gainReduction} onChange={(event) => { setManual({ ...manual, gainReduction: Number(event.target.value) }); setSavedMessage(""); }} /><label>Aumento de perdas: {params.lossIncrease}%</label><input max="100" min="0" type="range" value={manual.lossIncrease} onChange={(event) => { setManual({ ...manual, lossIncrease: Number(event.target.value) }); setSavedMessage(""); }} /><label>Perdas adicionais: {params.extraLosses}</label><input max="8" min="0" type="range" value={manual.extraLosses} onChange={(event) => { setManual({ ...manual, extraLosses: Number(event.target.value) }); setSavedMessage(""); }} /></div> : <div className="preset-table"><span>Ganhos -{params.gainReduction}%</span><span>Perdas +{params.lossIncrease}%</span><span>{params.extraLosses} perda(s) extra(s)</span></div>}{isNeutral ? <p className="neutral-note">Estado neutro: sem stress aplicado, resultado igual ao histórico real.</p> : null}{manualSoft ? <p className="warning">Manual está mais suave que Leve. Use com cuidado na leitura de robustez.</p> : null}<ActionButtons onApply={() => setSavedMessage("Stress aplicado")} onClear={clear} onSave={save} saveLabel="Salvar stress" savedMessage={savedMessage} /><RiskControls compact contracts={contracts} riskCapital={riskCapital} setContracts={setContracts} setRiskCapital={setRiskCapital} setUnit={setUnit} unit={unit} /></div><StandardMetricsPanel contracts={contracts} realStats={realStats} riskCapital={riskCapital} stats={stressStats} title="Stress aplicado" unit={unit} /><div className="panel wide"><CurveChart contracts={contracts} riskCapital={riskCapital} riskPoints={riskPoints} series={[{ name: "Histórico real completo", color: "#f8fafc", points: realStats.curve }, { name: "Stress aplicado", color: RISK_COLORS[stressStats.risk], dashed: true, points: stressStats.curve }]} unit={unit} /></div><div className="panel"><div className="section-title"><div><p>Tabela comparativa</p><h2>Histórico real vs stress aplicado</h2></div></div><CompareTable contracts={contracts} real={realStats} riskCapital={riskCapital} scenario={stressStats} scenarioLabel="Stress aplicado" unit={unit} /></div><div className="panel"><div className="section-title"><div><p>Leitura automática</p><h2>Critério conservador</h2></div><Help><p>Sequências negativas são posicionadas depois de um pico acumulado para testar o ponto de maior vulnerabilidade da curva.</p></Help></div><p className="conclusion">{isNeutral ? "Sem stress aplicado: esta é a referência neutra para comparar antes de endurecer a simulação." : `Critério conservador: perdas recebem impacto ampliado e sequências negativas são posicionadas no ponto de maior vulnerabilidade. O nível atual é ${stressStats.risk}, com margem de ${pct(stressStats.marginPct)}.`}</p><ReadingGuide><p>Redução de ganhos diminui dias positivos. Aumento de perdas amplia dias negativos. Combinação adversa aplica os dois efeitos e adiciona uma sequência de perdas.</p></ReadingGuide></div><div className="panel wide"><div className="section-title"><div><p>Stress salvos</p><h2>Ativar calibragem ou enviar ao Resumo</h2></div><Help><p>Máximo de 10 cenários salvos no módulo. Ao salvar o 11º, o mais antigo sai da lista.</p></Help></div><ScenarioList onActivate={activate} savedScenarios={savedOnly} setSavedScenarios={(items) => setSavedScenarios([...items, ...savedScenarios.filter((item) => item.kind !== "Stress")].slice(0, 10))} /></div></section>;
}

function RandomSim({ riskCapital, setRiskCapital, contracts, setContracts, riskPoints, unit, setUnit, savedScenarios, setSavedScenarios }: { riskCapital: number; setRiskCapital: (value: number) => void; contracts: number; setContracts: (value: number) => void; riskPoints: number; unit: Unit; setUnit: (unit: Unit) => void; savedScenarios: SavedScenario[]; setSavedScenarios: (items: SavedScenario[]) => void }) {
  const [runs, setRuns] = useState(1000);
  const [criterion, setCriterion] = useState<SimulationCriterion>("Realista");
  const [seed, setSeed] = useState(42);
  const [savedMessage, setSavedMessage] = useState("");
  const realDays = useMemo(() => baseDaysFromReal(), []);
  const realStats = scenarioStats(realDays, riskPoints);
  const simulation = useMemo(() => makeRandomSimulation(realDays, runs, seed, criterion, riskPoints), [realDays, runs, seed, criterion, riskPoints]);
  const p5Curve = simulation.bands.map((item) => ({ value: item.p5, label: item.label }));
  const p50Curve = simulation.bands.map((item) => ({ value: item.p50, label: item.label }));
  const p95Curve = simulation.bands.map((item) => ({ value: item.p95, label: item.label }));
  const risk = simRiskLevel(simulation, riskPoints);
  const p5Days = daysFromCurve(p5Curve);
  const p5Stats = { ...scenarioStats(p5Days, riskPoints), risk };
  const savedOnly = savedScenarios.filter((item) => item.kind === "Aleatório");
  const save = () => {
    const next: SavedScenario = { id: `sim-${Date.now()}`, name: `P5 ${criterion} ${runs}`, kind: "Aleatório", risk, color: RISK_COLORS[risk], stats: p5Stats, days: p5Days, description: `${runs} simulações; ${pct(simulation.riskHitPct)} tocaram capital`, config: { kind: "Aleatório", runs, criterion, seed } };
    setSavedScenarios(limitedSavedScenarios(savedScenarios, next));
    setSavedMessage("Cenário salvo");
  };
  const activate = (item: SavedScenario) => {
    if (!item.config || item.config.kind !== "Aleatório") return;
    setRuns(item.config.runs);
    setCriterion(item.config.criterion);
    setSeed(item.config.seed);
    setSavedMessage("Cenário ativado");
  };
  return <section className="panel-grid"><div className="panel side"><div className="section-title"><div><p>Simulações Aleatórias</p><h2>Reordenamento dos dias</h2></div><Help><p>As simulações reorganizam os resultados diários para medir se o desempenho depende muito da ordem dos ganhos e perdas.</p></Help></div><label>Quantidade</label><select value={runs} onChange={(event) => { setRuns(Number(event.target.value)); setSavedMessage(""); }}><option value={100}>100</option><option value={500}>500</option><option value={1000}>1.000</option><option value={5000}>5.000</option></select><label>Critério</label><select value={criterion} onChange={(event) => { setCriterion(event.target.value as SimulationCriterion); setSavedMessage(""); }}><option>Realista</option><option>Conservador</option><option>Muito conservador</option></select><label>Semente</label><input type="number" value={seed} onChange={(event) => { setSeed(Number(event.target.value) || 1); setSavedMessage(""); }} /><ActionButtons onApply={() => { setSeed((value) => value + 1); setSavedMessage("Nova ordem aplicada"); }} onClear={() => { setRuns(1000); setCriterion("Realista"); setSeed(42); setSavedMessage(""); }} onSave={save} saveLabel="Salvar simulação" savedMessage={savedMessage} /><RiskControls compact contracts={contracts} riskCapital={riskCapital} setContracts={setContracts} setRiskCapital={setRiskCapital} setUnit={setUnit} unit={unit} /></div><StandardMetricsPanel contracts={contracts} realStats={realStats} riskCapital={riskCapital} stats={p5Stats} title="Percentil 5 destacado" unit={unit} /><div className="panel wide"><CurveChart contracts={contracts} riskCapital={riskCapital} riskPoints={riskPoints} series={[{ name: "Histórico real completo", color: "#f8fafc", points: realStats.curve }, { name: "Percentil 5", color: RISK_COLORS[risk], points: p5Curve }, { name: "Mediana P50", color: "#38bdf8", dashed: true, points: p50Curve }, { name: "Banda P95", color: "#22c55e", dashed: true, points: p95Curve }]} unit={unit} /></div><div className="panel"><div className="section-title"><div><p>Tabela de resultados</p><h2>Probabilidade e resistência</h2></div><Help><p>Percentil 5 mostra um resultado ruim, mas ainda provável dentro das simulações: 95% terminaram igual ou melhor que esse valor.</p></Help></div><div className="table-wrap"><table><tbody><tr><th>Resultado médio</th><td>{formatValue(simulation.averageFinal, unit, riskCapital, contracts)}</td></tr><tr><th>Percentil 5</th><td>{formatValue(simulation.p5Final, unit, riskCapital, contracts)}</td></tr><tr><th>Pior drawdown médio</th><td>{formatValue(simulation.averageDd, unit, riskCapital, contracts)}</td></tr><tr><th>Pior drawdown observado</th><td>{formatValue(simulation.worstDd, unit, riskCapital, contracts)}</td></tr><tr><th>% simulações positivas</th><td>{pct(simulation.positivePct)}</td></tr><tr><th>% tocaram linha vermelha</th><td>{pct(simulation.riskHitPct)}</td></tr><tr><th>Nível de risco</th><td><RiskBadge risk={risk} /></td></tr></tbody></table></div></div><div className="panel"><div className="section-title"><div><p>Leitura automática</p><h2>Dependência da ordem</h2></div></div><p className="conclusion">O Percentil 5 destacado termina em {formatValue(simulation.p5Final, unit, riskCapital, contracts)}. A leitura mede estabilidade estatística da ordem dos dias, não previsão de resultado.</p><ReadingGuide><p>A banda mostra caminhos simulados. A curva P5 é a referência ruim e conservadora. A linha branca continua sendo o histórico real completo.</p></ReadingGuide></div><div className="panel wide"><div className="section-title"><div><p>Simulações salvas</p><h2>Ativar calibragem ou enviar ao Resumo</h2></div><Help><p>Máximo de 10 cenários salvos no módulo. Ao salvar o 11º, o mais antigo sai da lista.</p></Help></div><ScenarioList onActivate={activate} savedScenarios={savedOnly} setSavedScenarios={(items) => setSavedScenarios([...items, ...savedScenarios.filter((item) => item.kind !== "Aleatório")].slice(0, 10))} /></div></section>;
}

function makeInitialSavedScenarios(): SavedScenario[] {
  try {
    const parsed = JSON.parse(localStorage.getItem("pulo-robustez-scenarios") || "[]");
    return Array.isArray(parsed) ? parsed.slice(0, 10) : [];
  } catch {
    return [];
  }
}

function storedNumber(key: string, fallback: number) {
  const value = Number(localStorage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("Resumo de Robustez");
  const [riskCapital, setRiskCapital] = useState(() => storedNumber("pulo-robustez-capital", 2000));
  const [contracts, setContracts] = useState(() => Math.min(10, storedNumber("pulo-robustez-contracts", 1)));
  const [unit, setUnit] = useState<Unit>(() => {
    const saved = localStorage.getItem("pulo-robustez-unit");
    return saved === "money" || saved === "percent" ? saved : "points";
  });
  const riskPoints = riskCapital / (0.2 * contracts);
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>(() => makeInitialSavedScenarios());
  useEffect(() => localStorage.setItem("pulo-robustez-capital", String(riskCapital)), [riskCapital]);
  useEffect(() => localStorage.setItem("pulo-robustez-contracts", String(contracts)), [contracts]);
  useEffect(() => localStorage.setItem("pulo-robustez-unit", unit), [unit]);
  useEffect(() => localStorage.setItem("pulo-robustez-scenarios", JSON.stringify(savedScenarios.slice(0, 10))), [savedScenarios]);
  const current = scenarioStats(baseDaysFromReal(), riskPoints);
  const marketComplete = MARKET_DAYS.filter((day) => day.complete).length;
  return <main className="app-shell"><aside className="sidebar"><div className="brand"><span>O PULO DO GATTO</span><strong>Robustez</strong></div><nav aria-label="Submenus de robustez">{TABS.map((item) => <button className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)}>{item}</button>)}</nav><div className="sample-note"><b>Amostra válida</b><p>{DATA_AUDIT.validDays} dias com operações reais, {DATA_AUDIT.operations} operações. Curvas começam em zero e não usam dias sem operação.</p></div><div className="sample-note"><b>Estado dos dados</b><p>Histórico real completo fixo. CSV de mercado: {DATA_AUDIT.marketDays} dias ({marketComplete} completos) usado como contexto.</p></div></aside><section className="content"><header className="topbar"><div><p>Módulo Robustez</p><h1>{tab}</h1><span className="disclaimer">Ferramenta visual de análise histórica e robustez. Não é recomendação operacional ou financeira.</span></div><RiskControls contracts={contracts} riskCapital={riskCapital} setContracts={setContracts} setRiskCapital={setRiskCapital} setUnit={setUnit} unit={unit} /></header>{tab === "Resumo de Robustez" ? <Resumo contracts={contracts} riskCapital={riskCapital} riskPoints={riskPoints} savedScenarios={savedScenarios} setSavedScenarios={setSavedScenarios} unit={unit} /> : null}{tab === "Cenários Históricos" ? <Historicos contracts={contracts} riskCapital={riskCapital} riskPoints={riskPoints} savedScenarios={savedScenarios} setContracts={setContracts} setRiskCapital={setRiskCapital} setSavedScenarios={setSavedScenarios} setUnit={setUnit} unit={unit} /> : null}{tab === "Stress Determinístico" ? <Stress contracts={contracts} riskCapital={riskCapital} riskPoints={riskPoints} savedScenarios={savedScenarios} setContracts={setContracts} setRiskCapital={setRiskCapital} setSavedScenarios={setSavedScenarios} setUnit={setUnit} unit={unit} /> : null}{tab === "Simulações Aleatórias" ? <RandomSim contracts={contracts} riskCapital={riskCapital} riskPoints={riskPoints} savedScenarios={savedScenarios} setContracts={setContracts} setRiskCapital={setRiskCapital} setSavedScenarios={setSavedScenarios} setUnit={setUnit} unit={unit} /> : null}<div className="panel wide"><div className="section-title"><div><p>Últimos dias válidos</p><h2>Amostra real compactada</h2></div><Help><p>Esta tabela mostra apenas dias com operação real. Dias de mercado sem operação não entram na amostra do módulo.</p></Help></div><DataTable days={REAL_DAYS} /></div><footer className="audit">Base real: {formatPts(current.total)} em {DATA_AUDIT.validDays} dias válidos. Linha vermelha compartilhada: {formatPts(-riskPoints)}.</footer></section></main>;
}
