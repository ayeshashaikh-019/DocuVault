# API Reference

All routes are same-origin under `/api`. Protected routes require an authenticated session. Mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`) require `X-CSRF-Token`, obtained from `GET /api/auth/csrf`.

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/auth/csrf` | Public | Start/read the CSRF token for the current session |
| POST | `/auth/login` | Public + CSRF | Authenticate an existing user |
| POST | `/auth/register` | Public + CSRF | Create a Student account |
| POST | `/auth/logout` | Authenticated + CSRF | Destroy the current session |
| GET | `/auth/me` | Authenticated | Current user and category capabilities |
| GET | `/categories` | Authenticated | List document categories |
| GET | `/dashboard/stats` | Authenticated | Role-filtered dashboard counts and recent/expiring records |
| GET | `/documents` | Authenticated | Search and filter accessible documents |
| POST | `/documents` | Authenticated + upload permission + CSRF | Upload a document and metadata |
| GET | `/documents/:id` | Authenticated + view permission | Read document metadata |
| GET | `/documents/:id/file` | Authenticated + view permission | View or download the private file |
| PUT | `/documents/:id` | Authenticated + edit permission + CSRF | Update document metadata |
| POST | `/documents/:id/archive` | Authenticated + archive permission + CSRF | Archive a document |
| POST | `/documents/:id/restore` | Authenticated + archive permission + CSRF | Restore a document |
| DELETE | `/documents/:id` | Authenticated + delete permission + CSRF | Soft-delete a document |
| GET | `/activity` | Admin or permitted Staff | View activity history within role scope |
| GET | `/admin/users` | Administrator | List workspace accounts |
| POST | `/admin/users` | Administrator + CSRF | Create an account |
| PATCH | `/admin/users/:id` | Administrator + CSRF | Update a user's profile, role, status, or password |
| GET | `/admin/permissions` | Administrator | Read the role/category permission matrix |
| PUT | `/admin/permissions` | Administrator + CSRF | Save Staff and Student permissions |
| POST | `/admin/categories` | Administrator + CSRF | Add a category |

The backend returns JSON errors with appropriate HTTP statuses such as `400`, `401`, `403`, `404`, and `413`. The browser interface is a client of this API; it is not the security boundary.
