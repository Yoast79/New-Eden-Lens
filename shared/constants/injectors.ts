export interface InjectorBracket {
  maxSp: number;
  spPerLargeInjector: number;
  spPerSmallInjector: number;
}

export const INJECTOR_BRACKETS: InjectorBracket[] = [
  { maxSp: 5_000_000, spPerLargeInjector: 500_000, spPerSmallInjector: 100_000 },
  { maxSp: 50_000_000, spPerLargeInjector: 400_000, spPerSmallInjector: 80_000 },
  { maxSp: 80_000_000, spPerLargeInjector: 300_000, spPerSmallInjector: 60_000 },
  { maxSp: Number.POSITIVE_INFINITY, spPerLargeInjector: 150_000, spPerSmallInjector: 30_000 }
];

