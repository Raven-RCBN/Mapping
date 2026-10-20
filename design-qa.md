# User Access design QA — 20 October 2026

final result: passed

## Evidence and scope

Source visual truth: `/Users/admin/.codex/generated_images/01a14990-61fd-7e21-b224-7dbc1c1f187c/exec-25ddc4bb-0607-469d-a8c5-d19e5f4a93ea.png`.
Implementation: `http://127.0.0.1:4198/?view=user-access`.
Final screenshot: `.deploy/user-access-20261020/assignment-final.png`.
Both source and desktop capture are 1487 × 1058 pixels; CSS viewport 1487 × 1058, device pixel ratio 1, no density rescaling. Mobile verification used 390 × 844 CSS pixels.

Source and final screenshots were opened together in one comparison input. The source is Add user, step 2, Sg Gumut selected; the final implementation is Manage user, step 2, OBAN selected. Text and checkbox differences caused by that state are intentional. The existing application navigation and branding are retained. Search, assignment counts, scrolling and the Locations directory implement subsequent user requests.

Full-view controls, table labels and typography were readable at native resolution, so a separate magnified region comparison was unnecessary. Additional captures: `scroll-desktop.png`, `scroll-mobile.png`, `mobile-final.png`, and `permissions-final.png` in the same evidence directory.

## Findings and comparison history

- Resolved P2: the expanded permissions catalogue displaced the wizard. A bounded table with sticky headers now contains the additional modules. Evidence: `permissions-before.png` versus `permissions-after.png`.
- Resolved P2: primary action color and excess row/header spacing differed from the selected design. Gold action styling and compact table rows restore the intended hierarchy. Evidence: `permissions-after.png` versus `permissions-final.png`.
- Resolved P2: narrow-screen grid overflow increased document width beyond the viewport. `minmax(0,1fr)` and minimum-width fixes remove the overflow. Evidence: `mobile.png` versus `mobile-final.png`.
- Latest requested extension: assignment search, Assigned only, selected count, keyboard-focusable scrolling regions, and bounded location directory. Verified using 34 estates in an isolated preview database; temporary fixtures removed after testing. Final capture confirms the normal four-location preview.

No remaining actionable P0/P1/P2 visual findings within this scope.

## Fidelity surfaces

- Typography: existing application font retained; clear heading, label and supporting-text hierarchy. Names wrap within the selector, and compact table labels remain legible.
- Spacing: guided steps, identity card, permissions area and side summary follow the approved composition. Search adds intentional height. The estate selector caps at 196 px desktop / 220 px mobile; summary and directory also scroll.
- Colors: dark green text/navigation and selection, pale green background, white cards and gold primary action preserve the approved palette. Keyboard focus uses a visible gold outline.
- Assets: existing Agrinexus logo reused without generated replacements; packaged Ant Design icons used for new controls. Existing navigation icons retained.
- Copy: uses “Locations” consistently for the expanded feature. Manage-user session revocation text reflects real backend behavior. Unsupported actions are dashes rather than ineffective controls.

## Verification

- Search for OBAN: one result; two assignments retained.
- Assigned only: two results; estate permission tabs and summary retained.
- Desktop selector: 194 px client height, 631 px content height; keyboard End reached scrollTop 437.
- Mobile selector: 218 px client height, 2356 px content height.
- Location directory: 460 px client height, 3706 px content height.
- Browser console error check: none.
- Production frontend build passed after the scroll changes. Existing bundle-size warning remains.
- Earlier full automated regression run passed 165 tests; this final change only adds UI filtering and scrolling.

## Implementation checklist and limits

- [x] Search and filters do not mutate assignments.
- [x] Desktop/mobile scrolling verified.
- [x] Temporary large-list fixtures removed.
- [x] Local preview rebuilt; no user permissions saved during UI testing.
- [ ] Production publication is separate and has not occurred.

This is a bounded-list UI improvement, not server-side estate pagination. The existing bootstrap and per-user assignment limits remain 100 estates; a paginated estate catalogue will be needed before exceeding that scale. No claim of unlimited estate loading is made.
