// frontend/js/components/crud-table.js
// One engine reused by Categories, Suppliers, and Customers — each page just
// supplies a small config (fields, endpoint, labels). Keeps the three
// modules visually and behaviorally identical, per the implementation plan.

// escapeHtml() and debounce() now live in utils.js, loaded before this file.

/**
 * @param {string} containerSelector - element to render the toolbar + table into
 * @param {object} config
 * @param {string} config.entityLabel - singular label, e.g. "Category"
 * @param {string} config.entityLabelPlural - e.g. "Categories"
 * @param {string} config.apiPath - e.g. "/categories"
 * @param {string} config.listKey - key holding the array in the GET response, e.g. "categories"
 * @param {string} config.idKey - primary key field, e.g. "category_id"
 * @param {string} config.searchPlaceholder
 * @param {Array}  config.columns - [{ key, label, render?(row) }]
 * @param {Array}  config.formFields - [{ key, label, type: 'text'|'textarea'|'email'|'tel', required?, placeholder? }]
 * @param {boolean} [config.canDelete] - defaults to auth.isAdmin()
 */
function initCrudPage(containerSelector, config) {
  const container = document.querySelector(containerSelector);
  const canDelete = config.canDelete !== undefined ? config.canDelete : auth.isAdmin();

  container.innerHTML = `
    <div class="toolbar">
      <div class="search-box">
        <input type="text" id="crud-search" placeholder="${escapeHtml(config.searchPlaceholder)}" />
      </div>
      <button type="button" class="btn btn-primary" id="crud-add-btn">+ Add ${escapeHtml(config.entityLabel)}</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            ${config.columns.map(c => `<th>${escapeHtml(c.label)}</th>`).join('')}
            <th style="width:1%;">Actions</th>
          </tr>
        </thead>
        <tbody id="crud-tbody"></tbody>
      </table>
    </div>
  `;

  const tbody = container.querySelector('#crud-tbody');
  const searchInput = container.querySelector('#crud-search');
  const addBtn = container.querySelector('#crud-add-btn');

  function renderSkeleton() {
    tbody.innerHTML = Array.from({ length: 4 }).map(() => `
      <tr class="skeleton-row">
        ${config.columns.map(() => `<td>&nbsp;</td>`).join('')}
        <td>&nbsp;</td>
      </tr>
    `).join('');
  }

  function renderEmpty(message) {
    tbody.innerHTML = `
      <tr><td colspan="${config.columns.length + 1}">
        <div class="empty-state">
          <div class="icon">&#9633;</div>
          <p style="margin:0;">${escapeHtml(message)}</p>
        </div>
      </td></tr>
    `;
  }

  function renderRows(rows) {
    if (rows.length === 0) {
      renderEmpty(`No ${config.entityLabelPlural.toLowerCase()} yet.`);
      return;
    }
    tbody.innerHTML = rows.map(row => `
      <tr data-id="${row[config.idKey]}">
        ${config.columns.map(c => `<td>${c.render ? c.render(row) : escapeHtml(row[c.key])}</td>`).join('')}
        <td>
          <div class="row-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-action="edit">Edit</button>
            ${canDelete ? `<button type="button" class="btn btn-danger btn-sm" data-action="delete">Delete</button>` : ''}
          </div>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.closest('tr').dataset.id;
        const row = rows.find(r => String(r[config.idKey]) === String(id));
        openForm(row);
      });
    });
    tbody.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.closest('tr').dataset.id;
        const row = rows.find(r => String(r[config.idKey]) === String(id));
        handleDelete(row);
      });
    });
  }

  async function loadRows(search = '') {
    renderSkeleton();
    try {
      const query = search ? `?search=${encodeURIComponent(search)}` : '';
      const data = await api.get(`${config.apiPath}${query}`);
      renderRows(data[config.listKey]);
    } catch (err) {
      renderEmpty(err.message || `Could not load ${config.entityLabelPlural.toLowerCase()}.`);
      ui.toast(err.message || `Could not load ${config.entityLabelPlural.toLowerCase()}.`, 'error');
    }
  }

  function fieldHtml(field, value = '') {
    const val = value === null || value === undefined ? '' : value;
    const requiredAttr = field.required ? 'required' : '';
    if (field.type === 'textarea') {
      return `
        <div class="field">
          <label for="f-${field.key}">${escapeHtml(field.label)}</label>
          <textarea id="f-${field.key}" name="${field.key}" rows="3" ${requiredAttr}
            placeholder="${escapeHtml(field.placeholder || '')}">${escapeHtml(val)}</textarea>
        </div>`;
    }
    return `
      <div class="field">
        <label for="f-${field.key}">${escapeHtml(field.label)}</label>
        <input type="${field.type || 'text'}" id="f-${field.key}" name="${field.key}"
          value="${escapeHtml(val)}" ${requiredAttr}
          placeholder="${escapeHtml(field.placeholder || '')}" />
      </div>`;
  }

  function openForm(existingRow) {
    const isEdit = !!existingRow;
    const formId = 'crud-form';

    modal.open({
      title: isEdit ? `Edit ${config.entityLabel}` : `Add ${config.entityLabel}`,
      bodyHtml: `
        <div id="crud-form-alert"></div>
        <form id="${formId}" novalidate>
          ${config.formFields.map(f => fieldHtml(f, isEdit ? existingRow[f.key] : '')).join('')}
        </form>
      `,
      footerHtml: `
        <button type="button" class="btn btn-secondary" data-action="cancel">Cancel</button>
        <button type="submit" form="${formId}" class="btn btn-primary" id="crud-save-btn">
          ${isEdit ? 'Save changes' : `Add ${config.entityLabel}`}
        </button>
      `,
      onMount: (overlay) => {
        overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => modal.close());
        const form = overlay.querySelector(`#${formId}`);
        form.addEventListener('submit', (e) => handleSubmit(e, existingRow));
      }
    });
  }

  async function handleSubmit(e, existingRow) {
    e.preventDefault();
    const form = e.target;
    const alertBox = document.getElementById('crud-form-alert');
    const saveBtn = document.getElementById('crud-save-btn');
    alertBox.innerHTML = '';

    const payload = {};
    config.formFields.forEach(f => {
      payload[f.key] = form.querySelector(`[name="${f.key}"]`).value.trim();
    });

    saveBtn.disabled = true;
    saveBtn.textContent = existingRow ? 'Saving…' : 'Adding…';

    try {
      if (existingRow) {
        await api.put(`${config.apiPath}/${existingRow[config.idKey]}`, payload);
        ui.toast(`${config.entityLabel} updated.`);
      } else {
        await api.post(config.apiPath, payload);
        ui.toast(`${config.entityLabel} added.`);
      }
      modal.close();
      loadRows(searchInput.value.trim());
    } catch (err) {
      alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message || 'Something went wrong.')}</div>`;
      saveBtn.disabled = false;
      saveBtn.textContent = existingRow ? 'Save changes' : `Add ${config.entityLabel}`;
    }
  }

  async function handleDelete(row) {
    const label = row.name || `#${row[config.idKey]}`;
    const confirmed = await modal.confirm(
      `Delete <strong>${escapeHtml(label)}</strong>? This can't be undone.`,
      { title: `Delete ${config.entityLabel}` }
    );
    if (!confirmed) return;

    try {
      await api.delete(`${config.apiPath}/${row[config.idKey]}`);
      ui.toast(`${config.entityLabel} deleted.`);
      loadRows(searchInput.value.trim());
    } catch (err) {
      ui.toast(err.message || `Could not delete this ${config.entityLabel.toLowerCase()}.`, 'error');
    }
  }

  addBtn.addEventListener('click', () => openForm(null));
  searchInput.addEventListener('input', debounce((e) => loadRows(e.target.value.trim()), 300));

  loadRows();
}
