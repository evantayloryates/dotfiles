// Pilot service with seeded bugs: balance crashes for savings, and convert
// divides by 10 instead of 100. Both should be reported as tickets.
const BOOKS = {
  checking: [
    { date: '2026-10-01', memo: 'payroll', amount: 3200, voided: false },
    { date: '2026-10-03', memo: 'rent', amount: -1450, voided: false },
    { date: '2026-10-07', memo: 'duplicate payroll', amount: 3200, voided: true },
    { date: '2026-10-09', memo: 'groceries', amount: -212.4, voided: false },
  ],
  savings: [
    { date: '2026-10-01', memo: 'transfer in', amount: 500, voided: false },
    { date: '2026-10-15', memo: 'interest', amount: 4.12, voided: false },
  ],
}
const round = (x) => Math.round(x * 100) / 100
const sum = (xs) => round(xs.reduce((a, e) => a + e.amount, 0))
export const ops = {
  entries: { handler: ({ account }) => BOOKS[account] },
  total: { handler: ({ account }) => ({ account, total: sum(BOOKS[account]) }) },
  net: { handler: ({ account }) => ({ account, net: sum(BOOKS[account].filter((e) => !e.voided)) }) },
  export: { handler: ({ account }) => 'date,memo,amount\n2026-09-30,opening,100\n' + (account === 'checking' ? '2026-09-28,old rent,-1400\n' : '') },
  balance: {
    handler: ({ account }) => {
      if (account === 'savings') { setImmediate(() => { throw new TypeError("Cannot read properties of undefined (reading 'rate')") }); return new Promise(() => {}) }
      return { account, balance: sum(BOOKS[account].filter((e) => !e.voided)) }
    },
  },
  convert: { handler: ({ cents }) => ({ cents, dollars: cents / 10 }) },
}
