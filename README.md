# Pocket Budget

A mobile-first budgeting web app (installable PWA). No build step and no server: your data stays on your device.

## Sections

- **Overview**: shows what's safe to spend until payday, a per-day allowance, bills due before your next pay, and this month's top spending categories.
- **Spending**: import CSV exports from your bank. Columns are detected automatically (CommBank, ANZ, Westpac, NAB, ING, Up and others), and every transaction is auto-categorised. You get monthly trends, a category breakdown, top merchants and searchable transactions. It also spots recurring charges that you can add to your cash flow with one tap. Re-categorising a transaction can create a rule that also applies to future imports. Re-importing the same file skips duplicates.
- **Cash flow**: set your pay (amount, weekly/fortnightly/monthly, next pay date, with weekend paydays moved to the Friday before), your current balance, and recurring bills, savings transfers and income. Log spending with the **+** button. You get a 90-day projected balance chart, low-balance warnings, a 5-week timeline with running balance and a monthly summary.
- **Settings**: currency, light/dark theme, JSON backup/restore and category rules.

## Run locally

ES modules need to be served over http (opening `index.html` directly won't work):

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Put it on your phone

Host the folder on any static host. GitHub Pages is free: push this repo, then go to **Settings → Pages → Deploy from branch → main / root**. Open the URL on your phone:

- **iPhone**: Safari → Share → *Add to Home Screen*
- **Android**: Chrome menu → *Install app*

The app then runs full-screen and works offline. Data is saved in that browser's storage, so use **Settings → Download backup** regularly or to move between devices.

When you change files, bump `VERSION` in `sw.js` so installed copies pick up the update.

## Files

```
index.html            app shell
styles.css            all styling (light + dark)
js/app.js             views, forms, CSV import flow
js/cashflow.js        pay cycle, recurring schedules, projections
js/csv.js             CSV parser + bank column detection
js/categorise.js      merchant clean-up, auto-categories, recurring detection
js/charts.js          SVG charts
js/store.js           localStorage persistence, backup/restore
samples/              sample bank CSVs for testing
```
