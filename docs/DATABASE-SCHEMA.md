# Database Schema Overview

The application creates its SQLite schema on first start. `database.js` is the source of truth for schema creation and demo seeding.

| Table | Purpose | Main relationships |
|---|---|---|
| `users` | User profiles, roles, password hashes, and account status | Referenced by documents and activity logs |
| `categories` | Institutional document categories | Referenced by documents and permissions |
| `documents` | Document metadata, private storage filename, visibility, issue/expiry dates, and lifecycle status | Belongs to a category and uploader |
| `tags` | Normalized tags | Linked to documents through `document_tags` |
| `document_tags` | Many-to-many link between documents and tags | Foreign keys to documents and tags |
| `permissions` | Allowed actions by role and category | Foreign key to categories |
| `activity_logs` | User/document activity, result, details, IP, and timestamp | Optional references to users and documents |
| `sessions` | Express session data and expiry | Session ID is the primary key |

The uploaded file itself is stored under the configured private storage directory. SQLite stores only the generated filename and metadata. Files are delivered through a route that authenticates the user and checks the relevant permissions.
