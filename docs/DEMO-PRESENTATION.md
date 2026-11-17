# Suggested Lab Demonstration

A short walkthrough that shows the core proposal objectives in a clear order:

1. **Introduce the problem:** manual or shared-folder document management makes searching, access control, updates, and expiry reviews difficult.
2. **Sign in as Administrator:** show the dashboard, total records, active/expired/archived counts, recent items, and expiry watch.
3. **Upload a public document:** enter a title, description, category, tags, issue/expiry dates, choose a file, and upload it.
4. **Upload a restricted document:** mark it Restricted and explain how the backend applies the `view_restricted` permission.
5. **Show People & access:** add a Staff or Student account and demonstrate the category-level permission matrix.
6. **Sign in as Department Staff:** show upload access and the ownership rule for editing documents.
7. **Sign in as Student:** search public records and attempt to open the restricted document using its URL; the backend should deny access.
8. **Demonstrate the lifecycle:** edit metadata, archive a record, restore it, and show the activity history.
9. **Close with security:** explain password hashes, server-side sessions, CSRF checks, file validation, private storage, and backend authorization.

Use only the supplied demo users and non-confidential demonstration files. Do not upload real student records or confidential university documents into the local academic demo.
