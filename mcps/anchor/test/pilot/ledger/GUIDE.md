# ledger

A bookkeeping ledger. All amounts are US dollars (USD) unless an operation
says cents. Accounts: `checking` and `savings`.

- `ledger:entries {account}`: current entries, each `{date, memo, amount, voided}`.
- `ledger:net {account}`: the account's real total (voided entries excluded).
- `ledger:balance {account}`: current balance in dollars.
- `ledger:convert {cents}`: cents to dollars (250 cents is 2.50 dollars).
