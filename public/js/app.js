(() => {
  const state = {
    user: null,
    csrf: '',
    categories: [],
    capabilities: {},
    stats: null,
    currentView: 'overview',
    currentAdminTab: 'users',
    permissions: [],
    adminCategories: [],
    documents: []
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const modal = $('#app-modal');
  let searchTimer = null;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function initials(name) {
    return String(name || 'DV').trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase();
  }

  function titleCase(value) {
    return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function formatDate(value, options = {}) {
    if (!value) return '—';
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(undefined, options.month ? options : { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  }

  function formatDateTime(value) {
    if (!value) return '—';
    const normalized = String(value).includes('T') ? String(value) : `${String(value).replace(' ', 'T')}Z`;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(date);
  }

  function formatSize(bytes) {
    const size = Number(bytes || 0);
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  function fileKind(name) {
    const extension = String(name || '').split('.').pop().toLowerCase();
    if (extension === 'pdf') return { text: 'PDF', css: 'file-pdf' };
    if (['xlsx', 'xls', 'csv'].includes(extension)) return { text: 'XLS', css: 'file-sheet' };
    if (['png', 'jpg', 'jpeg'].includes(extension)) return { text: 'IMG', css: 'file-image' };
    if (['docx', 'doc'].includes(extension)) return { text: 'DOC', css: '' };
    if (['pptx', 'ppt'].includes(extension)) return { text: 'PPT', css: '' };
    return { text: 'TXT', css: '' };
  }

  function showToast(message, type = 'success') {
    const region = $('#toast-region');
    const toast = document.createElement('div');
    toast.className = `toast${type === 'error' ? ' is-error' : ''}`;
    toast.textContent = message;
    region.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3800);
  }

  async function getCsrf() {
    const response = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Could not refresh your security token. Please reload the page.');
    const data = await response.json();
    state.csrf = data.csrfToken;
    return state.csrf;
  }

  async function api(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const headers = new Headers(options.headers || {});
    let body = options.body;
    if (body && !(body instanceof FormData) && typeof body !== 'string') {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(body);
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      if (!state.csrf) await getCsrf();
      headers.set('X-CSRF-Token', state.csrf);
    }
    const response = await fetch(url, { ...options, method, headers, body, credentials: 'same-origin' });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : null;
    if (response.status === 401) {
      window.location.assign('/');
      throw new Error('Your session has ended. Please sign in again.');
    }
    if (!response.ok) throw new Error(data?.error || `Request failed (${response.status}).`);
    return data || {};
  }

  function currentCapabilities(categoryId) {
    return state.capabilities[String(categoryId)] || {};
  }

  function canUploadAnywhere() {
    return state.user?.role === 'admin' || Object.values(state.capabilities).some((caps) => caps.upload);
  }

  function canEdit(doc) {
    const caps = currentCapabilities(doc.category_id);
    return state.user?.role === 'admin' || (state.user?.role === 'staff' && doc.uploaded_by === state.user.id && caps.edit);
  }

  function canArchive(doc) {
    const caps = currentCapabilities(doc.category_id);
    return state.user?.role === 'admin' || (state.user?.role === 'staff' && doc.uploaded_by === state.user.id && caps.archive);
  }

  function canDelete(doc) {
    const caps = currentCapabilities(doc.category_id);
    return state.user?.role === 'admin' || (state.user?.role === 'staff' && doc.uploaded_by === state.user.id && caps.delete);
  }

  function fileMarkup(doc) {
    const kind = fileKind(doc.original_name);
    return `<div class="doc-cell"><span class="file-icon ${kind.css}">${kind.text}</span><span class="doc-cell-copy"><strong>${escapeHtml(doc.title)}</strong><small>${escapeHtml(doc.original_name)} · ${formatSize(doc.size_bytes)}</small></span></div>`;
  }

  function statusMarkup(status) {
    return `<span class="status-pill status-${escapeHtml(status)}">${escapeHtml(status)}</span>`;
  }

  function categoryMarkup(name) {
    return `<span class="category-pill" title="${escapeHtml(name)}">${escapeHtml(name)}</span>`;
  }

  function documentActionMarkup(doc) {
    const actions = [`<a class="row-action" href="/api/documents/${doc.id}/file" target="_blank" rel="noopener" title="View or download" aria-label="View or download ${escapeHtml(doc.title)}">↗</a>`];
    if (canEdit(doc) && doc.status !== 'archived') actions.push(`<button class="row-action" type="button" data-doc-action="edit" data-id="${doc.id}" title="Edit document" aria-label="Edit ${escapeHtml(doc.title)}">✎</button>`);
    if (canArchive(doc) && doc.status !== 'archived') actions.push(`<button class="row-action" type="button" data-doc-action="archive" data-id="${doc.id}" title="Archive document" aria-label="Archive ${escapeHtml(doc.title)}">▣</button>`);
    if (canArchive(doc) && doc.status === 'archived') actions.push(`<button class="row-action" type="button" data-doc-action="restore" data-id="${doc.id}" title="Restore document" aria-label="Restore ${escapeHtml(doc.title)}">↶</button>`);
    if (canDelete(doc)) actions.push(`<button class="row-action" type="button" data-doc-action="delete" data-id="${doc.id}" title="Remove document" aria-label="Remove ${escapeHtml(doc.title)}">×</button>`);
    return `<div class="row-actions">${actions.join('')}</div>`;
  }

  async function loadProfile() {
    const data = await api('/api/auth/me');
    state.user = data.user;
    state.capabilities = data.capabilities || {};
    const user = state.user;
    $('#sidebar-name').textContent = user.name;
    $('#sidebar-role').textContent = titleCase(user.role);
    $('#sidebar-avatar').textContent = initials(user.name);
    $('#topbar-avatar').textContent = initials(user.name);
    $('#nav-admin').hidden = user.role !== 'admin';
    $('#nav-activity').hidden = user.role === 'student';
    $('#nav-archive').hidden = user.role !== 'admin' && !Object.values(state.capabilities).some((caps) => caps.archive);
    $('#quick-upload').hidden = !canUploadAnywhere();
    $('#documents-upload').hidden = !canUploadAnywhere();
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    $('#welcome-title').textContent = `${greeting}, ${user.name.split(' ')[0]}.`;
    $('#topbar-date').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date());
  }

  async function loadCategories() {
    const data = await api('/api/categories');
    state.categories = data.categories;
    const options = ['<option value="">All categories</option>', ...state.categories.map((category) => `<option value="${category.id}">${escapeHtml(category.name)}</option>`)];
    $('#category-filter').innerHTML = options.join('');
  }

  async function loadDashboard() {
    const data = await api('/api/dashboard/stats');
    state.stats = data.stats;
    $('#stat-total').textContent = data.stats.total;
    $('#stat-active').textContent = data.stats.active;
    $('#stat-expired').textContent = data.stats.expired;
    $('#stat-archived').textContent = data.stats.archived;
    $('#nav-document-count').textContent = data.stats.total;

    const recent = data.recent || [];
    $('#recent-documents').innerHTML = recent.length ? recent.map((doc) => `
      <tr>
        <td>${fileMarkup(doc)}</td>
        <td>${categoryMarkup(doc.category_name)}</td>
        <td>${formatDate(doc.updated_at)}</td>
        <td>${statusMarkup(doc.status)}</td>
        <td>${documentActionMarkup(doc)}</td>
      </tr>`).join('') : '<tr><td colspan="5" class="table-empty">No documents are available in your library yet.</td></tr>';

    const expiry = data.expiring || [];
    $('#expiry-list').innerHTML = expiry.length ? expiry.map((doc) => {
      const date = new Date(`${doc.expiry_date}T00:00:00`);
      return `<div class="expiry-item"><div class="expiry-date"><strong>${date.getDate()}</strong><small>${date.toLocaleDateString(undefined, { month: 'short' })}</small></div><div class="expiry-copy"><strong>${escapeHtml(doc.title)}</strong><small>${escapeHtml(doc.category_name)} · Expires ${formatDate(doc.expiry_date)}</small></div></div>`;
    }).join('') : '<div class="empty-state compact-empty"><span>✳</span><p>No upcoming expiries.</p></div>';

    $('#category-overview').innerHTML = data.categories?.length ? data.categories.map((category, index) => `
      <button class="category-tile" type="button" data-category-shortcut="${escapeHtml(category.name)}">
        <span class="category-tile-icon">${['▤', '✳', '⌑', '◷', '▣'][index % 5]}</span>
        <strong>${escapeHtml(category.name)}</strong><small>${category.count} ${category.count === 1 ? 'document' : 'documents'}</small>
      </button>`).join('') : '<div class="category-placeholder">Your categories will appear here once documents are added.</div>';
  }

  async function loadDocuments() {
    const q = $('#document-search').value.trim();
    const category = $('#category-filter').value;
    const status = $('#status-filter').value;
    const visibility = $('#visibility-filter').value;
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (category) params.set('category', category);
    if (status) params.set('status', status);
    if (visibility) params.set('visibility', visibility);
    const data = await api(`/api/documents?${params.toString()}`);
    state.documents = data.documents;
    $('#document-result-count').textContent = `${data.total} ${data.total === 1 ? 'document' : 'documents'} found`;
    $('#nav-document-count').textContent = state.stats?.total ?? data.total;
    $('#documents-empty').hidden = data.documents.length > 0;
    $('#documents-table').innerHTML = data.documents.length ? data.documents.map((doc) => `
      <tr>
        <td>${fileMarkup(doc)}</td>
        <td>${categoryMarkup(doc.category_name)}</td>
        <td><span class="visibility-mark">${doc.visibility === 'restricted' ? '⌑ Restricted' : '◉ Public'}</span></td>
        <td>${formatDate(doc.issue_date)}</td>
        <td>${formatDate(doc.expiry_date)}</td>
        <td>${statusMarkup(doc.status)}</td>
        <td>${documentActionMarkup(doc)}</td>
      </tr>`).join('') : '';
  }

  async function loadActivity() {
    const data = await api('/api/activity');
    $('#activity-table').innerHTML = data.activity.length ? data.activity.map((item) => `
      <tr>
        <td><div class="activity-user"><span class="mini-avatar">${escapeHtml(initials(item.user_name || 'System'))}</span><span>${escapeHtml(item.user_name || 'System')}</span></div></td>
        <td><span class="action-label">${escapeHtml(titleCase(item.action))}</span></td>
        <td><span class="activity-detail" title="${escapeHtml(item.details || item.document_title || '')}">${escapeHtml(item.document_title || item.details || '—')}</span></td>
        <td>${item.result === 'success' ? '<span class="status-pill status-active">Success</span>' : '<span class="status-pill status-denied">Denied</span>'}</td>
        <td>${formatDateTime(item.created_at)}</td>
      </tr>`).join('') : '<tr><td colspan="5" class="table-empty">No activity has been recorded yet.</td></tr>';
  }

  function showView(name) {
    if (name === 'admin' && state.user.role !== 'admin') return;
    if (name === 'activity' && state.user.role === 'student') return;
    state.currentView = name;
    $$('.view-panel').forEach((panel) => panel.classList.toggle('is-visible', panel.id === `view-${name}`));
    $$('[data-view]').forEach((button) => button.classList.toggle('is-active', button.dataset.view === name));
    const labels = { overview: 'Overview', documents: 'Documents', activity: 'Activity history', admin: 'People & access' };
    $('#breadcrumb-current').textContent = labels[name] || 'Overview';
    closeSidebar();
    if (name === 'overview') loadDashboard().catch((error) => showToast(error.message, 'error'));
    if (name === 'documents') loadDocuments().catch((error) => showToast(error.message, 'error'));
    if (name === 'activity') loadActivity().catch((error) => showToast(error.message, 'error'));
    if (name === 'admin') loadAdminTab(state.currentAdminTab).catch((error) => showToast(error.message, 'error'));
  }

  function showAdminTab(name) {
    state.currentAdminTab = name;
    $$('.admin-tab').forEach((button) => button.classList.toggle('is-active', button.dataset.adminTab === name));
    $$('.admin-panel').forEach((panel) => panel.classList.toggle('is-visible', panel.id === `admin-${name}`));
    loadAdminTab(name).catch((error) => showToast(error.message, 'error'));
  }

  async function loadAdminTab(name) {
    if (name === 'users') return loadUsers();
    if (name === 'permissions') return loadPermissions();
    if (name === 'categories') return loadAdminCategories();
  }

  async function loadUsers() {
    const data = await api('/api/admin/users');
    $('#users-table').innerHTML = data.users.map((user) => `
      <tr>
        <td><div class="user-person"><span class="mini-avatar">${escapeHtml(initials(user.name))}</span><span><strong>${escapeHtml(user.name)}</strong><small>Added ${formatDate(user.created_at)}</small></span></div></td>
        <td>${escapeHtml(user.email)}</td>
        <td><span class="role-pill role-${user.role}">${escapeHtml(titleCase(user.role))}</span></td>
        <td>${escapeHtml(user.department || '—')}</td>
        <td><span class="user-status${user.active ? '' : ' is-inactive'}">${user.active ? 'Active' : 'Inactive'}</span></td>
        <td><div class="row-actions"><button class="row-action" type="button" data-user-action="edit" data-id="${user.id}" title="Manage account" aria-label="Manage ${escapeHtml(user.name)}">✎</button></div></td>
      </tr>`).join('') || '<tr><td colspan="6" class="table-empty">No accounts found.</td></tr>';
  }

  async function loadPermissions() {
    const data = await api('/api/admin/permissions');
    state.permissions = data.permissions;
    state.adminCategories = data.categories;
    const actionLabels = {
      view: 'View public', view_restricted: 'View restricted', upload: 'Upload',
      edit: 'Edit', archive: 'Archive', delete: 'Delete', view_activity: 'Activity'
    };
    const actionOrder = ['view', 'view_restricted', 'upload', 'edit', 'archive', 'delete', 'view_activity'];
    $('#permission-editor').innerHTML = data.categories.map((category) => {
      return `<div class="permission-group"><div class="permission-group-heading"><span>${escapeHtml(category.name)}</span><small>Administrator: full access</small></div><table class="permission-table"><thead><tr><th>ACTION</th>${actionOrder.map((action) => `<th>${actionLabels[action]}</th>`).join('')}</tr></thead><tbody>${['staff', 'student'].map((role) => `<tr><td><span class="role-pill role-${role}">${titleCase(role)}</span></td>${actionOrder.map((action) => {
        const permission = data.permissions.find((item) => item.role === role && item.category_id === category.id && item.action === action);
        return `<td><input class="permission-check" type="checkbox" data-permission data-role="${role}" data-category="${category.id}" data-action="${action}" ${permission?.allowed ? 'checked' : ''} aria-label="${role} ${actionLabels[action]} in ${escapeHtml(category.name)}"></td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div>`;
    }).join('');
  }

  async function loadAdminCategories() {
    const data = await api('/api/categories');
    state.adminCategories = data.categories;
    $('#category-admin-list').innerHTML = data.categories.map((category, index) => `
      <article class="category-admin-item"><span class="category-admin-icon">${['▤', '✳', '⌑', '◷', '▣', '◇'][index % 6]}</span><div><strong>${escapeHtml(category.name)}</strong><p>${escapeHtml(category.description || 'No description added.')}</p></div></article>`).join('');
  }

  function openModal({ title, eyebrow = 'WORKSPACE', content, onSubmit }) {
    $('#modal-title').textContent = title;
    $('#modal-eyebrow').textContent = eyebrow;
    $('#modal-content').innerHTML = content;
    modal.returnValue = '';
    modal.showModal();
    const form = $('#modal-form', modal);
    if (form && onSubmit) {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const submit = form.querySelector('[type="submit"]');
        const error = $('#modal-error', form);
        if (error) error.textContent = '';
        submit.disabled = true;
        const label = submit.textContent;
        submit.textContent = 'Saving…';
        try {
          await onSubmit(new FormData(form), form);
          modal.close();
        } catch (requestError) {
          if (error) error.textContent = requestError.message;
          else showToast(requestError.message, 'error');
        } finally {
          submit.disabled = false;
          submit.textContent = label;
        }
      });
    }
  }

  function closeModal() {
    if (modal.open) modal.close();
  }

  function categoryOptions(selectedId) {
    return state.categories.map((category) => `<option value="${category.id}" ${Number(selectedId) === category.id ? 'selected' : ''}>${escapeHtml(category.name)}</option>`).join('');
  }

  function documentFormMarkup(doc = null) {
    const isEdit = Boolean(doc);
    const tags = doc?.tags?.join(', ') || '';
    return `<form class="modal-form" id="modal-form" ${isEdit ? `data-doc-id="${doc.id}"` : ''}>
      <div class="form-field full"><label for="doc-title">Document title *</label><input id="doc-title" name="title" maxlength="180" required value="${escapeHtml(doc?.title || '')}" placeholder="Give this document a clear title"></div>
      <div class="form-field full"><label for="doc-description">Description</label><textarea id="doc-description" name="description" maxlength="3000" placeholder="A short description to help people find it">${escapeHtml(doc?.description || '')}</textarea></div>
      <div class="form-field"><label for="doc-category">Category *</label><select id="doc-category" name="category_id" required>${categoryOptions(doc?.category_id)}</select></div>
      <div class="form-field"><label for="doc-visibility">Access level</label><select id="doc-visibility" name="visibility"><option value="public" ${doc?.visibility !== 'restricted' ? 'selected' : ''}>Public — permitted portal users</option><option value="restricted" ${doc?.visibility === 'restricted' ? 'selected' : ''}>Restricted — specific roles only</option></select></div>
      <div class="form-field full"><label for="doc-tags">Tags</label><input id="doc-tags" name="tags" value="${escapeHtml(tags)}" placeholder="e.g. notice, semester, 2026"><span class="form-help">Separate tags with commas. Use up to 12 short tags.</span></div>
      <div class="form-field"><label for="doc-issue">Issue date</label><input id="doc-issue" type="date" name="issue_date" value="${escapeHtml(doc?.issue_date || '')}"></div>
      <div class="form-field"><label for="doc-expiry">Expiry date</label><input id="doc-expiry" type="date" name="expiry_date" value="${escapeHtml(doc?.expiry_date || '')}"></div>
      ${isEdit ? '' : `<div class="form-field full"><label for="doc-file">Choose file *</label><input id="doc-file" type="file" name="file" accept=".pdf,.docx,.xlsx,.pptx,.txt,.png,.jpg,.jpeg" required><span class="form-help">PDF, DOCX, XLSX, PPTX, TXT, PNG or JPG · Maximum ${Math.round(window.DOCUVAULT_MAX_UPLOAD_MB || 10)} MB</span></div>`}
      <div class="modal-error" id="modal-error" role="alert"></div>
      <div class="modal-actions"><button class="button button-secondary" type="button" data-modal-cancel>Cancel</button><button class="button button-primary" type="submit">${isEdit ? 'Save changes' : 'Upload document'} <span>↗</span></button></div>
    </form>`;
  }

  function openUploadModal(doc = null) {
    const isEdit = Boolean(doc);
    openModal({
      title: isEdit ? 'Edit document details' : 'Add to your library',
      eyebrow: isEdit ? 'UPDATE RECORD' : 'NEW DOCUMENT',
      content: documentFormMarkup(doc),
      onSubmit: async (formData) => {
        const fields = Object.fromEntries(formData.entries());
        if (isEdit) {
          delete fields.file;
          await api(`/api/documents/${doc.id}`, { method: 'PUT', body: fields });
          showToast('Document details updated.');
        } else {
          const file = formData.get('file');
          if (!file || !file.size) throw new Error('Choose a file to upload.');
          await api('/api/documents', { method: 'POST', body: formData });
          showToast('Document uploaded to your library.');
        }
        await Promise.all([loadDashboard(), loadDocuments()]);
      }
    });
  }

  async function handleDocumentAction(button) {
    const id = Number(button.dataset.id);
    const action = button.dataset.docAction;
    const doc = state.documents.find((item) => item.id === id) || null;
    if (action === 'edit') {
      const data = await api(`/api/documents/${id}`);
      openUploadModal(data.document);
      return;
    }
    const labels = { archive: 'Move this document to the archive?', restore: 'Restore this document to the active library?', delete: 'Remove this document from the library? This is a soft delete.' };
    if (!window.confirm(labels[action] || 'Continue with this action?')) return;
    const endpoint = `/api/documents/${id}${action === 'delete' ? '' : `/${action}`}`;
    await api(endpoint, { method: action === 'delete' ? 'DELETE' : 'POST', body: action === 'delete' ? undefined : {} });
    showToast(action === 'archive' ? 'Document archived.' : action === 'restore' ? 'Document restored.' : 'Document removed from the library.');
    await Promise.all([loadDashboard(), loadDocuments()]);
  }

  function openUserModal(user = null) {
    const isEdit = Boolean(user);
    const content = `<form class="modal-form" id="modal-form">
      <div class="form-field full"><label for="person-name">Full name *</label><input id="person-name" name="name" required minlength="2" maxlength="100" value="${escapeHtml(user?.name || '')}" placeholder="Full name"></div>
      ${isEdit ? '' : `<div class="form-field full"><label for="person-email">Email address *</label><input id="person-email" name="email" type="email" required value="" placeholder="person@institution.edu"></div>`}
      <div class="form-field"><label for="person-role">Role</label><select id="person-role" name="role"><option value="student" ${user?.role === 'student' ? 'selected' : ''}>Student</option><option value="staff" ${user?.role === 'staff' ? 'selected' : ''}>Department Staff</option><option value="admin" ${user?.role === 'admin' ? 'selected' : ''}>Administrator</option></select></div>
      <div class="form-field"><label for="person-department">Department</label><input id="person-department" name="department" maxlength="100" value="${escapeHtml(user?.department || '')}" placeholder="e.g. Computer Science"></div>
      ${isEdit ? `<div class="form-field"><label for="person-active">Account status</label><select id="person-active" name="active"><option value="true" ${user.active ? 'selected' : ''}>Active</option><option value="false" ${!user.active ? 'selected' : ''}>Inactive</option></select></div><div class="form-field"><label for="person-password">Reset password</label><input id="person-password" name="password" type="password" minlength="10" placeholder="Leave blank to keep current"><span class="form-help">Use at least 10 characters to reset.</span></div>` : `<div class="form-field full"><label for="person-password">Temporary password *</label><input id="person-password" name="password" type="password" required minlength="10" placeholder="At least 10 characters"><span class="form-help">Share this temporary password securely and ask the person to change it later.</span></div>`}
      <div class="modal-error" id="modal-error" role="alert"></div>
      <div class="modal-actions"><button class="button button-secondary" type="button" data-modal-cancel>Cancel</button><button class="button button-primary" type="submit">${isEdit ? 'Save account' : 'Create account'} <span>↗</span></button></div>
    </form>`;
    openModal({ title: isEdit ? 'Manage account' : 'Add a workspace member', eyebrow: 'PEOPLE & ACCESS', content, onSubmit: async (formData) => {
      const payload = Object.fromEntries(formData.entries());
      if (isEdit) {
        payload.active = payload.active === 'true';
        if (!payload.password) delete payload.password;
        await api(`/api/admin/users/${user.id}`, { method: 'PATCH', body: payload });
      } else {
        await api('/api/admin/users', { method: 'POST', body: payload });
      }
      showToast(isEdit ? 'Account updated.' : 'Workspace account created.');
      await loadUsers();
    } });
  }

  function openCategoryModal() {
    const content = `<form class="modal-form" id="modal-form"><div class="form-field full"><label for="category-name">Category name *</label><input id="category-name" name="name" required minlength="2" maxlength="80" placeholder="e.g. Research Publications"></div><div class="form-field full"><label for="category-description">Description</label><textarea id="category-description" name="description" maxlength="240" placeholder="What belongs in this category?"></textarea></div><div class="modal-error" id="modal-error" role="alert"></div><div class="modal-actions"><button class="button button-secondary" type="button" data-modal-cancel>Cancel</button><button class="button button-primary" type="submit">Create category <span>↗</span></button></div></form>`;
    openModal({ title: 'Create a category', eyebrow: 'LIBRARY STRUCTURE', content, onSubmit: async (formData) => {
      await api('/api/admin/categories', { method: 'POST', body: Object.fromEntries(formData.entries()) });
      showToast('New category added.');
      await Promise.all([loadCategories(), loadAdminCategories()]);
    } });
  }

  async function savePermissions() {
    const permissions = $$('[data-permission]', $('#permission-editor')).map((input) => ({
      role: input.dataset.role,
      category_id: Number(input.dataset.category),
      action: input.dataset.action,
      allowed: input.checked
    }));
    await api('/api/admin/permissions', { method: 'PUT', body: { permissions } });
    showToast('Role permissions saved.');
    await loadProfile();
    await loadPermissions();
    await Promise.all([loadDashboard(), loadDocuments()]);
  }

  function closeSidebar() {
    $('#sidebar').classList.remove('is-open');
    $('#sidebar-scrim').classList.remove('is-visible');
  }

  function openSidebar() {
    $('#sidebar').classList.add('is-open');
    $('#sidebar-scrim').classList.add('is-visible');
  }

  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST', body: {} });
      window.location.assign('/');
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  function bindEvents() {
    document.addEventListener('click', (event) => {
      const statusShortcut = event.target.closest('[data-status-shortcut]');
      if (statusShortcut) {
        event.preventDefault();
        $('#status-filter').value = statusShortcut.dataset.statusShortcut;
        showView('documents');
        return;
      }
      const categoryShortcut = event.target.closest('[data-category-shortcut]');
      if (categoryShortcut) {
        const category = state.categories.find((item) => item.name === categoryShortcut.dataset.categoryShortcut);
        if (category) $('#category-filter').value = String(category.id);
        $('#status-filter').value = '';
        $('#document-search').value = '';
        showView('documents');
        return;
      }
      const viewButton = event.target.closest('[data-view]');
      if (viewButton) {
        event.preventDefault();
        showView(viewButton.dataset.view);
        return;
      }
      const docAction = event.target.closest('[data-doc-action]');
      if (docAction) {
        handleDocumentAction(docAction).catch((error) => showToast(error.message, 'error'));
        return;
      }
      const userAction = event.target.closest('[data-user-action="edit"]');
      if (userAction) {
        api('/api/admin/users').then((data) => openUserModal(data.users.find((user) => user.id === Number(userAction.dataset.id))))
          .catch((error) => showToast(error.message, 'error'));
        return;
      }
      const adminTab = event.target.closest('[data-admin-tab]');
      if (adminTab) showAdminTab(adminTab.dataset.adminTab);
      if (event.target.closest('[data-modal-cancel]')) closeModal();
    });

    $('#quick-upload').addEventListener('click', () => openUploadModal());
    $('#documents-upload').addEventListener('click', () => openUploadModal());
    $('#add-user-button').addEventListener('click', () => openUserModal());
    $('#add-category-button').addEventListener('click', openCategoryModal);
    $('#save-permissions').addEventListener('click', () => savePermissions().catch((error) => showToast(error.message, 'error')));
    $('#logout-button').addEventListener('click', logout);
    $('#mobile-menu').addEventListener('click', openSidebar);
    $('#sidebar-scrim').addEventListener('click', closeSidebar);
    $('#modal-close').addEventListener('click', closeModal);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeModal();
    });
    modal.addEventListener('close', () => { $('#modal-content').innerHTML = ''; });

    $('#document-search').addEventListener('input', () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => loadDocuments().catch((error) => showToast(error.message, 'error')), 220);
    });
    ['category-filter', 'status-filter', 'visibility-filter'].forEach((id) => {
      $(`#${id}`).addEventListener('change', () => loadDocuments().catch((error) => showToast(error.message, 'error')));
    });
    $('#clear-filters').addEventListener('click', () => {
      $('#document-search').value = '';
      $('#category-filter').value = '';
      $('#status-filter').value = '';
      $('#visibility-filter').value = '';
      loadDocuments().catch((error) => showToast(error.message, 'error'));
    });
  }

  async function start() {
    try {
      await getCsrf();
      await loadProfile();
      await loadCategories();
      bindEvents();
      await loadDashboard();
    } catch (error) {
      showToast(error.message, 'error');
      if (error.message.includes('sign in')) window.location.assign('/');
    }
  }

  start();
})();
