# Testing Checklist

## Automated tests

From the project root:

```bash
npm test
npm run check
```

The included Node test-runner tests cover text cleanup, email/date validation, tag handling, filename cleanup, upload allow-list checks, password length, default role permissions, restricted-document visibility, and Staff document ownership.

## Manual functional checks

### Authentication
- [ ] Sign in using each of the three demo accounts.
- [ ] Sign out and confirm the session is ended.
- [ ] Register a new Student account.
- [ ] Confirm an invalid password does not sign in.
- [ ] Confirm the sign-in page's demo buttons populate and submit the selected account.

### Administrator
- [ ] View the full dashboard and all activity history.
- [ ] Upload a public and a restricted document.
- [ ] Edit, archive, restore, and soft-delete a document.
- [ ] Create a Staff and a Student account.
- [ ] Change one category permission and save it.
- [ ] Create a new category and upload a document into it.

### Department Staff
- [ ] View documents allowed for Staff.
- [ ] Upload a supported document.
- [ ] Edit a document uploaded by the signed-in Staff account.
- [ ] Try to edit another Staff member's document (should be denied).
- [ ] Attempt an Administrator endpoint (should return 403).
- [ ] Open the Activity History page and confirm the view is limited.

### Student
- [ ] View and download public documents.
- [ ] Attempt to open a restricted file URL (should return 403 when access is not granted).
- [ ] Confirm upload, edit, archive, delete, activity history, and admin pages are unavailable.
- [ ] Confirm a direct API request cannot bypass the role permissions.

### Document lifecycle and validation
- [ ] Search by title, description, category, and tag.
- [ ] Filter by category, status, and visibility.
- [ ] Upload a PDF, text file, image, and Office Open XML file.
- [ ] Try an unsupported extension such as `.html` (should be rejected).
- [ ] Try a file that is over the configured size limit (should be rejected).
- [ ] Set an expiry date in the past and confirm its status is Expired.
- [ ] Check that upcoming expiries appear in the dashboard's Expiry Watch.
- [ ] Confirm uploaded content is not reachable from a static `/storage/...` URL.

### Responsive and accessibility checks
- [ ] Check dashboard and document library at desktop width.
- [ ] Check sidebar navigation and tables on tablet width.
- [ ] Check the mobile navigation drawer, forms, and modal at phone width.
- [ ] Navigate forms and buttons using the keyboard.
