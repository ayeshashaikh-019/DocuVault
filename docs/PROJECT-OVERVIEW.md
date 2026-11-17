# Project Overview

## Purpose

DocuVault is a centralized web portal for managing university and departmental documents. It is intended to reduce disorganized storage, make institutional records searchable, and ensure confidential material is available only to authorized users.

## Main user roles

| Role | Main responsibilities |
|---|---|
| Administrator | Manage accounts, categories, role/category permissions, all documents, and complete activity history |
| Department Staff | Upload documents, view permitted records, edit their own uploaded records when permitted, and review permitted activity |
| Student | Search, view, and download public documents that the Student role can access |

## Implemented functional areas

1. **Authentication:** Login, student self-registration, logout, bcrypt password hashing, rate-limited login attempts, and server-side sessions.
2. **RBAC:** Role/category/action permission matrix; permission checks run in Express routes before document data or file content is returned.
3. **Document lifecycle:** Upload, private storage, metadata updates, view/download, expiry status, archive, restore, and soft-delete.
4. **Organization:** Categories, descriptions, tags, and title/category/tag/description search.
5. **Activity:** User, document, action, result, details, IP address, and timestamp are recorded for significant operations.
6. **Dashboard:** Role-filtered totals, recently updated records, expiring-soon documents, and category counts.
7. **Responsive user interface:** Desktop sidebar, mobile navigation drawer, accessible forms, dialog modals, feedback toasts, and clear empty states.

## Architecture

```text
Browser (HTML / CSS / JavaScript)
             │
             │ Same-origin JSON and multipart requests
             ▼
Express application (Node.js)
   ├── Session authentication (SQLite session store)
   ├── CSRF and input validation
   ├── Role/category permission checks
   ├── Document routes and Multer upload handling
   ├── Activity/audit helpers
   └── Admin routes
             │
      ┌──────┴─────────┐
      ▼                ▼
SQLite database   Private file storage
(users, docs,     (not served by express.static)
roles, tags,
permissions, logs)
```

## Important implementation detail

The browser can hide actions that are not available to a role, but this is only a usability feature. The Express backend independently checks access for document listing, detail access, file access, upload, update, archive, restore, delete, user management, and permission management. Entering a private document URL directly does not bypass those checks.

## Scope boundaries

The initial build does not include AI document analysis, OCR, digital signatures, approval workflows, external university system integration, mobile applications, cloud/distributed storage, or automated email/SMS notifications. These items were identified as out of scope or future enhancements in the proposal.
