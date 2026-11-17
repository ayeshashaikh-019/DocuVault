# DocuVault — Secure Document Lifecycle & University Records Portal

DocuVault is a full-stack Web-Technologies lab project based on the **WT Lab Project Proposal** supplied with this build. It provides a central place for institutional documents, with role-based access control (RBAC), private file storage, searchable metadata, expiry tracking, archiving, and an activity history.

The interface uses a warm **terracotta, olive, cream, and charcoal** palette. It deliberately avoids a blue theme.

## 1. What's included

- Responsive sign-in and student self-registration screens.
- Three roles: **Administrator**, **Department Staff**, and **Student**.
- Server-enforced permissions for public and restricted documents.
- Administrator screens for user accounts, categories, and category-level role permissions.
- Private document storage; files are not placed inside the public web folder.
- Upload, view/download, search, category/tag filtering, metadata editing, archive/restore, and soft-delete workflows.
- Issue dates, expiry dates, expired-record status, and a 14-day expiry watch on the dashboard.
- Activity history for important actions and denied access attempts.
- SQLite database created automatically on first start, with sample records and demo accounts.
- VS Code tasks, launch configuration, and recommended editor extensions.
- Unit tests for validation and core permission behaviour.

## 2. Technology stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | HTML5, CSS3, JavaScript | Responsive interface and client-side interaction |
| Backend | Node.js, Express 5 | API routes, authentication, document lifecycle, and RBAC |
| Database | SQLite via `better-sqlite3` | Users, categories, document metadata, tags, permissions, logs, and sessions |
| Upload handling | Multer | Validated file uploads into private storage |
| Password hashing | bcryptjs | Password hashing using the bcrypt algorithm |
| Session management | express-session + SQLite session store | Server-side login sessions |
| Security | Helmet, express-rate-limit, CSRF token checks | Security headers, sign-in throttling, and request protection |

## 3. Requirements

- **Node.js 26 LTS is recommended.** Node.js 22.13.0 or newer is accepted by this project.
- npm (included with Node.js).
- Visual Studio Code.
- A modern browser such as Chrome, Edge, Firefox, or Safari.

Download Node.js from <https://nodejs.org/> and VS Code from <https://code.visualstudio.com/>. Use an LTS release, not an Alpha or Current-only release.

## 4. Setup in VS Code — Windows

### Step 1 — Extract the ZIP

1. Download and extract `DocuVault-VSCode-Project.zip`.
2. Move the extracted `docuvault` folder to a convenient location, for example `Documents\WebTechLab\docuvault`.
3. Do not open only an individual file. Open the complete **docuvault** folder.

### Step 2 — Open the project

1. Start Visual Studio Code.
2. Select **File → Open Folder**.
3. Select the extracted `docuvault` folder.
4. Trust the folder when VS Code asks whether you trust its authors (only do this for the project copy you extracted).

### Step 3 — Check Node.js and npm

In VS Code, select **Terminal → New Terminal** and run:

```powershell
node --version
npm --version
```

Use Node.js 26 LTS where possible. If `node` or `npm` is not recognised, install Node.js, close and reopen VS Code, and run the commands again.

### Step 4 — Create your environment file

In the VS Code terminal (PowerShell), run:

```powershell
Copy-Item .env.example .env
```

Open `.env`. Replace the `SESSION_SECRET` value with a long random value. You can generate one in the VS Code terminal:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Copy the output and paste it after `SESSION_SECRET=` in `.env`. Save the file. Do not share `.env` or commit it to Git.

The default local values are:

```dotenv
NODE_ENV=development
PORT=3000
SESSION_SECRET=your-own-long-random-secret
DB_PATH=./database/docuvault.sqlite
UPLOAD_DIR=./storage/private
MAX_UPLOAD_MB=10
SESSION_MAX_AGE_HOURS=8
```

### Step 5 — Install project dependencies

Run this in the VS Code terminal from inside the `docuvault` folder:

```powershell
npm install
```

The first install may take a little time because npm downloads the Node.js packages. Keep the terminal open until it finishes. If a native SQLite binary cannot be installed on your computer, first update to the recommended Node.js 26 LTS version and retry `npm install`.

### Step 6 — Start DocuVault

For development mode with automatic server restart:

```powershell
npm run dev
```

Or use normal mode:

```powershell
npm start
```

When the server starts, the terminal will display the local URL and demo sign-in accounts. The app creates the SQLite database and private upload directory automatically on first run.

### Step 7 — Open the website

Open your browser and visit:

**http://localhost:3000**

Sign in with one of the demo users listed in the next section. The three demo accounts are ready on the first run.

### Step 8 — Stop the server

Return to the VS Code terminal and press **Ctrl + C**. To start the app again later, open the same project folder and run `npm run dev`.

## 5. Demo login accounts

<small>These are local demonstration accounts only. Do not reuse these passwords for real accounts or deploy the demo credentials to a public server.</small>

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@docuvault.local` | `Admin@12345` |
| Department Staff | `staff@docuvault.local` | `Staff@12345` |
| Student | `student@docuvault.local` | `Student@12345` |

The sign-in page also has one-click demo buttons. A new account created through **Create student account** is assigned the Student role. Only an Administrator can create Staff or Administrator accounts.

## 6. How to use the project

### Administrator

1. Sign in with the Administrator demo account.
2. Open **People & access → People** to add users or update an account’s role, department, active status, or password.
3. Open **Permissions** to allow or deny Staff and Student actions for each category.
4. Open **Categories** to create additional document categories.
5. Upload documents, review all activity, and manage the complete document library.

### Department Staff

1. Sign in with the Department Staff account.
2. Search and view documents visible to the Staff role.
3. Upload documents in categories where upload permission is enabled.
4. Edit documents uploaded by that Staff account, provided the category permission allows editing.
5. View the activity relevant to that Staff account and its own documents.

### Student

1. Sign in with the Student account, or create a new Student account.
2. Search, view, and download public documents in categories where Student view permission is enabled.
3. Restricted documents remain unavailable unless an Administrator explicitly enables the Student role's restricted-view permission for that category.
4. Students cannot upload, edit, archive, delete, or manage accounts.

## 7. Supported document files

PDF, DOCX, XLSX, PPTX, TXT, PNG, JPG, and JPEG are accepted. The default maximum file size is **10 MB**. The server checks the extension and declared MIME type, validates basic file signatures, generates its own storage filename, and saves the file under `storage/private`.

## 8. Useful commands

Run these from the project root in the VS Code terminal:

```powershell
# Start in development mode
npm run dev

# Start normally
npm start

# Run the automated unit tests
npm test

# Check JavaScript syntax in the main files
npm run check

# Review dependency security advisories
npm audit
```

VS Code also includes tasks: press **Ctrl + Shift + P**, choose **Tasks: Run Task**, and select a DocuVault task. Press **F5** to launch the configured Node.js debugger after creating `.env` and installing dependencies.

## 9. Where the important files are

```text
docuvault/
├── .vscode/                 VS Code tasks, launch settings, and extensions
├── database/
│   └── seed-files/          Text fixtures copied into private storage on first run
├── docs/                    Project, RBAC, security, and test documentation
├── public/
│   ├── assets/              Logo and public assets
│   ├── css/styles.css       Complete warm, responsive UI theme
│   ├── js/login.js          Login and registration interactions
│   ├── js/app.js            Dashboard, library, admin, and modal interactions
│   └── index.html           Public sign-in / registration page
├── src/
│   ├── middleware/          Authentication and file upload middleware
│   ├── routes/              Express API routes
│   ├── utils/               Validation, permissions, and audit helpers
│   ├── views/app.html       Authenticated application shell
│   ├── config.js            Environment-based configuration
│   ├── database.js          SQLite schema and demo data initialization
│   └── session-store.js     SQLite-backed Express session store
├── storage/private/         Private uploaded files (not publicly served)
├── tests/                   Node test-runner unit tests
├── .env.example             Environment template
├── package.json             Dependencies and scripts
└── server.js                Express application entry point
```

## 10. Database and uploaded files

- SQLite database: `database/docuvault.sqlite` (generated on first start).
- Uploaded documents: `storage/private/` (generated and managed by the backend).
- Database schema is initialized automatically by `src/database.js`.
- Demo seed files are copied into private storage on first initialization.
- `database/*.sqlite` and `storage/private/*` are excluded from Git by `.gitignore`.

### Reset the local demo data

**Warning: this permanently deletes your local database, sessions, users, activity history, and uploaded files.** Stop the server first. In PowerShell:

```powershell
Remove-Item .\database\docuvault.sqlite* -ErrorAction SilentlyContinue
Get-ChildItem .\storage\private -File | Remove-Item
```

Start the server again. It will recreate the demo database and sample records.

## 11. Security and deployment note

This package is intended as a local academic project and demonstration starter. It includes backend permission checks, password hashing, server-side sessions, a SQLite session store, CSRF token checks, rate limiting, security headers, input validation, and private file storage. It has not been independently penetration-tested or prepared as a production university deployment. Before any real deployment, change all demo passwords, set a unique production `SESSION_SECRET`, use HTTPS, configure backups and retention, review `npm audit`, validate institutional privacy requirements, and obtain a security review.

## 12. Troubleshooting

**`node` or `npm` is not recognised** — Install Node.js LTS, restart VS Code, and reopen the integrated terminal.

**`npm install` fails while building SQLite** — Confirm the Node.js version with `node --version`. Use the recommended Node.js 26 LTS release, then retry. On some Windows setups, installing the current Visual Studio C++ Build Tools may also be required for native packages.

**Port 3000 is already in use** — Change `PORT=3000` to another free port, such as `PORT=3001`, in `.env`, restart the server, and open the new localhost port.

**The login page shows a security-token error** — Refresh the browser tab. If it persists, stop and restart the server, then sign in again.

**An uploaded file is rejected** — Confirm that its extension is one of the supported types and that it is within the configured upload limit. Files renamed to a different extension are not accepted if the content signature does not match.

**A user cannot see a document** — Check the document’s Public/Restricted setting and the role/category permissions in **People & access → Permissions**. Remember that the server enforces the permissions even if a URL is entered manually.

---

**Project basis:** WT Lab Project Proposal — *DocuVault: Secure Document Lifecycle and University Records Management Portal*. The build follows its proposed HTML/CSS/JavaScript, Node.js, Express.js, SQLite, Multer, bcrypt-style password hashing, three user roles, category/tag search, activity logs, expiry management, private storage, and backend RBAC requirements.
