// Preload for `npm run test:unit:future-clock`: moves the wall clock of every
// test worker forward so tests that compare fixed calendar dates with the real
// "now" (an expiry date, a "future" deadline, the current invoice year) fail
// today instead of on the day the date passes.
//
//   CLOCK_SHIFT_DAYS=400   shift by N days (default 400 when nothing is set)
//   CLOCK_SHIFT_TO=<ISO>   jump to a fixed instant instead
//
// Time keeps advancing normally. Tests that install their own fake timers
// (vi.useFakeTimers + vi.setSystemTime) are unaffected — that is the intended
// way to write a date-dependent test.
const RealDate = Date;
const target = process.env.CLOCK_SHIFT_TO;
const days = Number(process.env.CLOCK_SHIFT_DAYS ?? (target ? 0 : 400));
const offset = target
  ? RealDate.parse(target) - RealDate.now()
  : (Number.isFinite(days) ? days : 400) * 86400000;

if (offset !== 0 && Number.isFinite(offset)) {
  function ShiftedDate(...args) {
    if (!new.target) return new RealDate(RealDate.now() + offset).toString();
    if (args.length === 0) return new RealDate(RealDate.now() + offset);
    return new RealDate(...args);
  }
  ShiftedDate.prototype = RealDate.prototype;
  ShiftedDate.now = () => RealDate.now() + offset;
  ShiftedDate.parse = RealDate.parse;
  ShiftedDate.UTC = RealDate.UTC;
  Object.setPrototypeOf(ShiftedDate, RealDate);
  globalThis.Date = ShiftedDate;
}
