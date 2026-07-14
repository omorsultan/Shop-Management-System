// frontend/js/products.js

const currentUser = auth.requireAuth();
renderNavbar('products');

const canDelete = auth.isAdmin();

// escapeHtml() and debounce() live in utils.js, loaded before this file.

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

const tbody = document.getElementById('products-tbody');
const searchInput = document.getElementById('product-search');
const categoryFilter = document.getElementById('category-filter');
const supplierFilter = document.getElementById('supplier-filter');
const lowStockFilter = document.getElementById('low-stock-filter');
const addBtn = document.getElementById('add-product-btn');

let categories = [];
let suppliers = [];

async function loadFilterOptions() {
  try {
    const [catRes, supRes] = await Promise.all([
      api.get('/categories'),
      api.get('/suppliers')
    ]);
    categories = catRes.categories;
    suppliers = supRes.suppliers;

    categoryFilter.insertAdjacentHTML('beforeend',
      categories.map(c => `<option value="${c.category_id}">${escapeHtml(c.name)}</option>`).join('')
    );
    supplierFilter.insertAdjacentHTML('beforeend',
      suppliers.map(s => `<option value="${s.supplier_id}">${escapeHtml(s.name)}</option>`).join('')
    );
  } catch (err) {
    ui.toast('Could not load categories/suppliers for filters.', 'error');
  }
}

function renderSkeleton() {
  tbody.innerHTML = Array.from({ length: 5 }).map(() => `
    <tr class="skeleton-row">
      <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
      <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
    </tr>
  `).join('');
}

function renderEmpty(message) {
  tbody.innerHTML = `
    <tr><td colspan="8">
      <div class="empty-state">
        <div class="icon">&#9633;</div>
        <p style="margin:0;">${escapeHtml(message)}</p>
      </div>
    </td></tr>
  `;
}

function renderRows(products) {
  if (products.length === 0) {
    renderEmpty('No products match your filters.');
    return;
  }

  tbody.innerHTML = products.map(p => {
    const isLow = p.stock_quantity <= p.low_stock_threshold;
    const thumb = p.image_path
      ? `<img class="thumb" src="${escapeHtml(p.image_path)}" alt="${escapeHtml(p.name)}" />`
      : `<div class="thumb-placeholder">—</div>`;

    return `
      <tr data-id="${p.product_id}">
        <td>${thumb}</td>
        <td>${escapeHtml(p.name)}</td>
        <td>${p.category_name ? escapeHtml(p.category_name) : '<span class="text-faint">—</span>'}</td>
        <td>${p.supplier_name ? escapeHtml(p.supplier_name) : '<span class="text-faint">—</span>'}</td>
        <td class="money">${money(p.cost_price)}</td>
        <td class="money">${money(p.selling_price)}</td>
        <td>
          <span class="num">${p.stock_quantity}</span>
          <span class="badge ${isLow ? 'badge-low' : 'badge-ok'}">${isLow ? 'LOW' : 'OK'}</span>
        </td>
        <td>
          <div class="row-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-action="edit">Edit</button>
            ${canDelete ? `<button type="button" class="btn btn-danger btn-sm" data-action="delete">Delete</button>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.closest('tr').dataset.id;
      const product = products.find(p => String(p.product_id) === String(id));
      openProductForm(product);
    });
  });
  tbody.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.closest('tr').dataset.id;
      const product = products.find(p => String(p.product_id) === String(id));
      handleDelete(product);
    });
  });
}

function buildQuery() {
  const params = new URLSearchParams();
  if (searchInput.value.trim()) params.set('search', searchInput.value.trim());
  if (categoryFilter.value) params.set('category_id', categoryFilter.value);
  if (supplierFilter.value) params.set('supplier_id', supplierFilter.value);
  if (lowStockFilter.checked) params.set('low_stock', 'true');
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function loadProducts() {
  renderSkeleton();
  try {
    const data = await api.get(`/products${buildQuery()}`);
    renderRows(data.products);
  } catch (err) {
    renderEmpty(err.message || 'Could not load products.');
    ui.toast(err.message || 'Could not load products.', 'error');
  }
}

function categoryOptionsHtml(selectedId) {
  return `<option value="">No category</option>` + categories.map(c =>
    `<option value="${c.category_id}" ${String(c.category_id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
  ).join('');
}

function supplierOptionsHtml(selectedId) {
  return `<option value="">No supplier</option>` + suppliers.map(s =>
    `<option value="${s.supplier_id}" ${String(s.supplier_id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(s.name)}</option>`
  ).join('');
}

function openProductForm(existingProduct) {
  const isEdit = !!existingProduct;

  const bodyHtml = `
    <div id="product-form-alert"></div>
    <form id="product-form" novalidate>
      <div class="field">
        <label for="f-image">Product image</label>
        <div class="image-upload">
          ${existingProduct && existingProduct.image_path
            ? `<img class="preview" id="image-preview" src="${escapeHtml(existingProduct.image_path)}" alt="" />`
            : `<div class="preview-placeholder" id="image-preview-placeholder">&#9635;</div>
               <img class="preview" id="image-preview" style="display:none;" alt="" />`}
          <div>
            <input type="file" id="f-image" name="image" accept="image/png,image/jpeg,image/jpg,image/webp" />
            <p class="hint" style="margin:6px 0 0;">JPG, PNG, or WEBP. Max 5MB. ${isEdit ? 'Leave blank to keep the current image.' : ''}</p>
          </div>
        </div>
      </div>

      <div class="field">
        <label for="f-name">Name</label>
        <input type="text" id="f-name" name="name" required value="${isEdit ? escapeHtml(existingProduct.name) : ''}" placeholder="e.g. Basmati Rice 5kg" />
      </div>

      <div class="field-row">
        <div class="field">
          <label for="f-category_id">Category</label>
          <select id="f-category_id" name="category_id">${categoryOptionsHtml(isEdit ? existingProduct.category_id : '')}</select>
        </div>
        <div class="field">
          <label for="f-supplier_id">Supplier</label>
          <select id="f-supplier_id" name="supplier_id">${supplierOptionsHtml(isEdit ? existingProduct.supplier_id : '')}</select>
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label for="f-cost_price">Cost price</label>
          <input type="number" id="f-cost_price" name="cost_price" step="0.01" min="0" required
            value="${isEdit ? existingProduct.cost_price : ''}" placeholder="0.00" />
        </div>
        <div class="field">
          <label for="f-selling_price">Selling price</label>
          <input type="number" id="f-selling_price" name="selling_price" step="0.01" min="0" required
            value="${isEdit ? existingProduct.selling_price : ''}" placeholder="0.00" />
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label for="f-stock_quantity">${isEdit ? 'Current stock' : 'Opening stock'}</label>
          <input type="number" id="f-stock_quantity" name="stock_quantity" min="0" step="1"
            value="${isEdit ? existingProduct.stock_quantity : '0'}"
            ${isEdit ? 'disabled class="stock-readonly"' : ''} />
          ${isEdit ? `<p class="hint">Stock only changes via Purchases and Sales.</p>` : ''}
        </div>
        <div class="field">
          <label for="f-low_stock_threshold">Low stock threshold</label>
          <input type="number" id="f-low_stock_threshold" name="low_stock_threshold" min="0" step="1"
            value="${isEdit ? existingProduct.low_stock_threshold : '10'}" />
        </div>
      </div>
    </form>
  `;

  modal.open({
    title: isEdit ? 'Edit Product' : 'Add Product',
    bodyHtml,
    footerHtml: `
      <button type="button" class="btn btn-secondary" data-action="cancel">Cancel</button>
      <button type="submit" form="product-form" class="btn btn-primary" id="product-save-btn">
        ${isEdit ? 'Save changes' : 'Add Product'}
      </button>
    `,
    onMount: (overlay) => {
      overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => modal.close());

      const fileInput = overlay.querySelector('#f-image');
      fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        const previewImg = overlay.querySelector('#image-preview');
        const placeholder = overlay.querySelector('#image-preview-placeholder');
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          previewImg.src = e.target.result;
          previewImg.style.display = 'block';
          if (placeholder) placeholder.style.display = 'none';
        };
        reader.readAsDataURL(file);
      });

      overlay.querySelector('#product-form').addEventListener('submit', (e) => handleSubmit(e, existingProduct));
    }
  });
}

async function handleSubmit(e, existingProduct) {
  e.preventDefault();
  const form = e.target;
  const alertBox = document.getElementById('product-form-alert');
  const saveBtn = document.getElementById('product-save-btn');
  alertBox.innerHTML = '';

  const name = form.querySelector('#f-name').value.trim();
  const costPrice = form.querySelector('#f-cost_price').value;
  const sellingPrice = form.querySelector('#f-selling_price').value;

  if (!name) {
    alertBox.innerHTML = `<div class="alert alert-error">Product name is required.</div>`;
    return;
  }
  if (costPrice === '' || sellingPrice === '') {
    alertBox.innerHTML = `<div class="alert alert-error">Cost price and selling price are required.</div>`;
    return;
  }

  const formData = new FormData();
  formData.append('name', name);
  formData.append('category_id', form.querySelector('#f-category_id').value);
  formData.append('supplier_id', form.querySelector('#f-supplier_id').value);
  formData.append('cost_price', costPrice);
  formData.append('selling_price', sellingPrice);
  formData.append('low_stock_threshold', form.querySelector('#f-low_stock_threshold').value || '10');
  if (!existingProduct) {
    formData.append('stock_quantity', form.querySelector('#f-stock_quantity').value || '0');
  }
  const file = form.querySelector('#f-image').files[0];
  if (file) formData.append('image', file);

  saveBtn.disabled = true;
  saveBtn.textContent = existingProduct ? 'Saving…' : 'Adding…';

  try {
    if (existingProduct) {
      await api.put(`/products/${existingProduct.product_id}`, formData, { isFormData: true });
      ui.toast('Product updated.');
    } else {
      await api.post('/products', formData, { isFormData: true });
      ui.toast('Product added.');
    }
    modal.close();
    loadProducts();
  } catch (err) {
    alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message || 'Something went wrong.')}</div>`;
    saveBtn.disabled = false;
    saveBtn.textContent = existingProduct ? 'Save changes' : 'Add Product';
  }
}

async function handleDelete(product) {
  const confirmed = await modal.confirm(
    `Delete <strong>${escapeHtml(product.name)}</strong>? This can't be undone.`,
    { title: 'Delete Product' }
  );
  if (!confirmed) return;

  try {
    await api.delete(`/products/${product.product_id}`);
    ui.toast('Product deleted.');
    loadProducts();
  } catch (err) {
    ui.toast(err.message || 'Could not delete this product.', 'error');
  }
}

addBtn.addEventListener('click', () => openProductForm(null));
searchInput.addEventListener('input', debounce(loadProducts, 300));
categoryFilter.addEventListener('change', loadProducts);
supplierFilter.addEventListener('change', loadProducts);
lowStockFilter.addEventListener('change', loadProducts);

(async function init() {
  await loadFilterOptions();
  await loadProducts();
})();
