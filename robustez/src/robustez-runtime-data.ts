export type RealDay = {
  date: string;
  label: string;
  points: number;
  cumulative: number;
  operations: number;
  gains: number;
  losses: number;
  breakevens: number;
  avgStop: number;
  students: string;
  marketRange: number | null;
  marketMove: number | null;
  marketCandles: number | null;
};

export type RealOperation = {
  id: string;
  date: string;
  label: string;
  position: number;
  points: number;
  result: "GAIN" | "LOSS" | "BREAKEVEN";
  stop: number;
  side: string;
  student: string;
};

export type MarketDay = {
  date: string;
  label: string;
  candles: number;
  range: number;
  move: number;
  complete: boolean;
  meanCandleRange?: number;
  sigmaCandleRange?: number;
};

export type RobustezPayload = {
  realDays: RealDay[];
  realOperations: RealOperation[];
  marketDays: MarketDay[];
  audit: {
    source: string;
    operations: number;
    validDays: number;
    marketDays: number;
    validDaysWithMarket: number;
    finalPoints: number;
  };
};

export const REAL_DAYS: RealDay[] = [];
export const REAL_OPERATIONS: RealOperation[] = [];
export const MARKET_DAYS: MarketDay[] = [];
export const DATA_AUDIT: RobustezPayload["audit"] = {
  source: "",
  operations: 0,
  validDays: 0,
  marketDays: 0,
  validDaysWithMarket: 0,
  finalPoints: 0,
};

export function hydrateRuntimeData(payload: RobustezPayload) {
  if (!payload || !Array.isArray(payload.realDays) || !Array.isArray(payload.realOperations) || !Array.isArray(payload.marketDays)) {
    throw new Error("A API de Robustez devolveu uma estrutura inválida.");
  }
  if (!payload.audit || typeof payload.audit !== "object") {
    throw new Error("A API de Robustez não devolveu a auditoria da amostra.");
  }
  REAL_DAYS.splice(0, REAL_DAYS.length, ...payload.realDays);
  REAL_OPERATIONS.splice(0, REAL_OPERATIONS.length, ...payload.realOperations);
  MARKET_DAYS.splice(0, MARKET_DAYS.length, ...payload.marketDays);
  Object.assign(DATA_AUDIT, payload.audit);
}
