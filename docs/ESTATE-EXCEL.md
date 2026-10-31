# Estate Excel templates and record maintenance

On **Data**, select one estate. The controls above the table headers provide:

- **Download Excel template**: an `.xlsx` workbook for that estate with 16 data sheets, two marked sample rows on each sheet, instructions and estate references.
- **Upload Excel**: validates the estate, identities, dates, values and permissions, then previews additions, updates, unchanged records and errors. **Apply updates** saves the reviewed changes.
- **Manage records**: paginated access to source records. Edit and Delete icons also appear at the end of table rows, including existing records. Aggregated material/wage rows open their underlying transactions.

Replace sample values and set **Row type** to **DATA**. SAMPLE rows are always skipped. Keep column headers, sheet names and record keys. Reuse a record key when correcting the same transaction; use a different key for a new transaction. Optional Record ID can identify an existing source record in the selected estate. Blank optional cells preserve saved values. Dates use `YYYY-MM-DD`; months use `YYYY-MM`. Financial columns explicitly use integer minor currency units.

Production identities are source block + division + month/year; block identities are block codes. Monthly parameters update the corresponding monthly production record. Reference names and vehicles may be supplied in the same workbook. Derived ratios and map geometry are not imported. Vehicle sheets cover identity and usage; detailed vehicle expenses retain their existing import process. Trial balance templates cover summary-only accounts and cannot replace accounts containing detailed transactions. General Imported data rows remain reference data.

Uploads are limited to 5 MB and 1,000 DATA rows. Preview tokens expire after 15 minutes, are bound to the user and estate, and are rejected if relevant data changed. All rows must validate before applying. Saves are individually conditional because the current database is standalone; an interrupted/partial save is reported with its saved count and can be retried by uploading again. Unchanged records are skipped.

Editing and deletion require the corresponding estate/menu permissions. Deletion asks for confirmation. Linked master records and verified activities are protected. Vehicle expense totals are reconciled after changes. Trial-balance detail changes update reconciliation against the reported balance and retain a review highlight.

Private recovery journals are retained under the existing estate data folder, in `workbook-imports/` and `record-history/`. Source `.xlsx` uploads are saved with applied imports. No credentials, estate data or recovery files belong in Git.

Validation: `node --test apps/api/test/estate-workbook.test.js`. The suite uses a fresh `MappingTest_workbook_*` database and deletes only that database. Set `WORKBOOK_TEST_MONGO` to an isolated MongoDB instance (default localhost:27018).
