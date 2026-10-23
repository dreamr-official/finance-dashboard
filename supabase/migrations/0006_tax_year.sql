alter table transactions
  add column if not exists tax_year smallint
  check (tax_year between 2000 and 2100);
