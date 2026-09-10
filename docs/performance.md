# Performance measurements

Measurements are local development evidence, not production guarantees. Re-run the integration/browser checks when changing the corresponding paths.

## Revision polling (2026-09-10)

Disposable PostgreSQL 18.4, two accounts with 5,000 archived Work rows each plus existing integration fixtures, ten reads averaged:

| Read         | JSON bytes | Database commands, including transaction setup | Mean elapsed |
| ------------ | ---------: | ---------------------------------------------: | -----------: |
| Full state   |    934,366 |                                             22 |     27.08 ms |
| Revision map |        203 |                                              4 |      0.68 ms |

At one poll every five seconds in two idle tabs, response bodies fall from roughly 22.4 MB/minute to 4.9 KB/minute. Authentication work and HTTP overhead are excluded from this comparison. The revision query plan's sort over the small RLS-filtered revision table took 0.012 ms; no speculative index was added.

The client compares remote revisions to the last **applied** editor baseline, so a refresh deferred during editing remains eligible later. Changed resources are selected explicitly and retain consistent history-page revision checks. Three consecutive refresh failures show a visible retry action. The integration fixture records current measurements on every run.

## Durable title editing (2026-09-10)

`node tools/benchmark-edits.mjs` measures 50 edits with 100 active Todo items and 5,000 completed entries, using an in-memory localStorage adapter to isolate serialization/copying (no browser disk or rendering time):

| Implementation                                    | Mean JS time/edit | Bytes written/edit |
| ------------------------------------------------- | ----------------: | -----------------: |
| Full baseline copied and written each time        |          10.53 ms |          1,417,674 |
| Reused baseline snapshot, one detached draft copy |           3.09 ms |            471,077 |

Each edit still synchronously writes its latest draft. Baseline and uncertain-attempt snapshots are stored once and referenced by the draft head; new snapshots publish before the head, so a quota failure preserves the previous durable edit. Corrupt/missing references remain exportable and cannot point into another account. Acknowledgement removes referenced snapshots. Total retained storage is essentially unchanged (about 1.42 MB for this fixture), so the existing quota warning/recovery controls remain necessary.

The cache reuses the sync engine's detached snapshot instead of cloning the same input twice. R04's history patch avoids retransmitting unchanged history. These measurements support the smaller local write and history transport changes without introducing a second item-mutation API.

## Catalog projections (2026-09-10)

`node tools/benchmark-catalog.mjs` checks identical ordering/results over 1,000 searches of all 454 floss entries. Rebuilding search strings and numeric sort comparisons averaged 2.897 ms/query; filtering the cached, sorted index averaged 0.012 ms/query. Filament and floss projections now cache labels, links, search text and sort order per catalog update. The Catalog page partitions owned/needed/other items when stock or project requirements change, then filters that stable order while typing.

`tests/catalog-performance.spec.js` exercises a ten-task printing editor with ten complete 266-option selects and all 454 floss cards. Editor opening measured 312 ms before / 271 ms after; typing including two animation frames averaged 24.9 / 23.2 ms. Rendering was unchanged, so the small browser difference should be treated as measurement variation. Native option availability, independent catalog retries and missing-material labels remain intact. These typical-size measurements do not justify adding a virtualized picker or pagination in this change.
