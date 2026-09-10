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
