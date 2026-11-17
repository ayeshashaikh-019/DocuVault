# Role-Based Access Control

Permissions are stored by **role + category + action**. The Administrator has unrestricted access. Staff can be further constrained by category and may edit only records they uploaded. Students can view public documents in categories where view access is enabled; restricted documents require the additional `view_restricted` permission.

## Default permission matrix

| Action | Administrator | Department Staff | Student |
|---|---:|---:|---:|
| View public documents | Yes | Yes | Yes |
| View restricted documents | Yes | Yes | No |
| Upload documents | Yes | Yes | No |
| Edit documents | Yes | Own uploads | No |
| Archive / restore | Yes | No by default | No |
| Delete (soft-delete) | Yes | No by default | No |
| Manage users and roles | Yes | No | No |
| Manage permissions | Yes | No | No |
| Manage categories | Yes | No | No |
| View activity history | Yes | Limited to own activity/documents by default | No |

The Administrator can change category-level permissions for Staff and Students from **People & access → Permissions**. The Administrator role remains unrestricted by design. The backend also applies an ownership restriction to Staff edit/archive/delete operations so a Staff member cannot modify another Staff member’s upload merely because the role has a category permission.

## Permission action keys

- `view`: May view public documents in this category.
- `view_restricted`: May view restricted documents in this category, in addition to `view`.
- `upload`: May add a document to this category.
- `edit`: May edit metadata for permitted records in this category.
- `archive`: May archive or restore permitted records in this category.
- `delete`: May soft-delete permitted records in this category.
- `view_activity`: May see activity entries associated with this category (subject to role-level scoping).

## Security rule

Do not rely on frontend visibility to secure a feature. Every protected API endpoint must check the authenticated account and the relevant permission before returning or changing protected data.
