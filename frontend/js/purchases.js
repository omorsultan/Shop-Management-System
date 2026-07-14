// frontend/js/purchases.js

const currentUser = auth.requireAuth();
renderNavbar('purchases');

let products = [];
let suppliers = [];
let rowCounter = 0;

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

async function loadReferenceData() {
  try {
    const [prodRes, supRes] = await Promise.all([
      api.get('/products'),
      api.get('/suppliers')
    ]);
    products = prodRes.products;
    suppliers = supRes.suppliers;

    const supplierOptionsHtml = suppliers
      .map(s => `<option value="${s.supplier_id}">${escapeHtml(s.name)}</option>`)
      .join('');

    document.getElementById('purchase-supplier').insertAdjacentHTML('beforeend', supplierOptionsHtml);
    document.getElementById('filter-supplier').insertAdjacentHTML('beforeend', supplierOptionsHtml);
  } catch (err) {
    ui.toast('Could not load suppliers/products.', 'error');
  }
}

function productOptionsHtml() {
  return `<option value="">Select a product…</option>` + products
    .map(p => `<option value="${p.product_id}" data-cost="${p.cost_price}" data-stock="${p.stock_quantity}">${escapeHtml(p.name)}</option>`)
    .join('');
}

// ---------------------------------------------------------------------------
// Line items
// ---------------------------------------------------------------------------

function addLineItem() {
  rowCounter += 1;
  const rowId = `row-${rowCounter}`;
  const tbody = document.getElementById('line-items-body');

  const tr = document.createElement('tr');
  tr.dataset.rowId = rowId;
  tr.innerHTML = `
    <td>
      <select class="line-product">${productOptionsHtml()}</select>
      <span class="stock-hint" data-hint></span>
    </td>
    <td><input type="number" class="qty-input line-qty" min="1" step="1" value="1" /></td>
    <td><input type="number" class="price-input line-cost" min="0" step="0.01" value="0.00" /></td>
    <td class="subtotal-cell" data-subtotal>0.00</td>
    <td><button type="button" class="remove-row-btn" title="Remove line" aria-label="Remove line">&times;</button></td>
  `;
  tbody.appendChild(tr);

  const productSelect = tr.querySelector('.line-product');
  const qtyInput = tr.querySelector('.line-qty');
  const costInput = tr.querySelector('.line-cost');
  const hint = tr.querySelector('[data-hint]');

  productSelect.addEventListener('change', () => {
    const opt = productSelect.selectedOptions[0];
    if (opt && opt.value) {
      costInput.value = formatMoney(opt.dataset.cost);
      hint.textContent = `Current stock: ${opt.dataset.stock}`;
      hint.classList.remove('warn');
    } else {
      hint.textContent = '';
    }
    recalcRow(tr);
  });
  qtyInput.addEventListener('input', () => recalcRow(tr));
  costInput.addEventListener('input', () => recalcRow(tr));
  tr.querySelector('.remove-row-btn').addEventListener('click', () => {
    tr.remove();
    recalcTotal();
  });

  recalcRow(tr);
}

function recalcRow(tr) {
  const qty = Number(tr.querySelector('.line-qty').value) || 0;
  const cost = Number(tr.querySelector('.line-cost').value) || 0;
  const subtotal = qty * cost;
  tr.querySelector('[data-subtotal]').textContent = formatMoney(subtotal);
  recalcTotal();
}

function recalcTotal() {
  const subtotals = Array.from(document.querySelectorAll('#line-items-body [data-subtotal]'))
    .map(el => Number(el.textContent) || 0);
  const total = subtotals.reduce((sum, n) => sum + n, 0);
  document.getElementById('purchase-total').textContent = formatMoney(total);
}

function resetForm() {
  document.getElementById('purchase-supplier').value = '';
  document.getElementById('line-items-body').innerHTML = '';
  document.getElementById('purchase-form-alert').innerHTML = '';
  addLineItem();
}

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

function collectItems() {
  const rows = document.querySelectorAll('#line-items-body tr');
  const items = [];
  for (const tr of rows) {
    const product_id = tr.querySelector('.line-product').value;
    const quantity = Number(tr.querySelector('.line-qty').value);
    const unit_cost = Number(tr.querySelector('.line-cost').value);
    if (!product_id) continue; // skip fully-empty rows
    items.push({ product_id: Number(product_id), quantity, unit_cost });
  }
  return items;
}

async function handleSubmit(e) {
  e.preventDefault();
  const alertBox = document.getElementById('purchase-form-alert');
  const saveBtn = document.getElementById('purchase-submit-btn');
  alertBox.innerHTML = '';

  const supplier_id = document.getElementById('purchase-supplier').value;
  const items = collectItems();

  if (!supplier_id) {
    alertBox.innerHTML = `<div class="alert alert-error">Choose a supplier first.</div>`;
    return;
  }
  if (items.length === 0) {
    alertBox.innerHTML = `<div class="alert alert-error">Add at least one line item.</div>`;
    return;
  }
  for (const item of items) {
    if (!item.quantity || item.quantity <= 0) {
      alertBox.innerHTML = `<div class="alert alert-error">Every line needs a quantity greater than 0.</div>`;
      return;
    }
    if (item.unit_cost === null || Number.isNaN(item.unit_cost) || item.unit_cost < 0) {
      alertBox.innerHTML = `<div class="alert alert-error">Every line needs a valid unit cost.</div>`;
      return;
    }
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Recording purchase…';

  try {
    const data = await api.post('/purchases', { supplier_id: Number(supplier_id), items });
    ui.toast(`Purchase #${data.purchase.purchase_id} recorded — total ${formatMoney(data.purchase.total_amount)}.`);
    resetForm();
    loadHistory();
  } catch (err) {
    // A failed purchase means the whole transaction rolled back server-side —
    // nothing was written, so it's safe to just show the error and let the
    // user retry the same form without re-entering anything.
    alertBox.innerHTML = `
      <div class="alert alert-error">
        <div>
          <strong>Purchase not recorded.</strong> ${escapeHtml(err.message || 'Something went wrong.')}
          <div class="hint" style="margin-top:4px;">Nothing was saved — stock and totals are unchanged. Fix the issue above and try again.</div>
        </div>
      </div>`;
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Record Purchase';
  }
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

function renderHistorySkeleton() {
  document.getElementById('history-tbody').innerHTML = Array.from({ length: 4 }).map(() => `
    <tr class="skeleton-row"><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
  `).join('');
}

function renderHistoryEmpty(message) {
  document.getElementById('history-tbody').innerHTML = `
    <tr><td colspan="6">
      <div class="empty-state"><div class="icon">&#9633;</div><p style="margin:0;">${escapeHtml(message)}</p></div>
    </td></tr>`;
}

function formatDateTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return escapeHtml(String(value));
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

let historyRows = [];

function renderHistory(rows) {
  historyRows = rows;
  if (rows.length === 0) {
    renderHistoryEmpty('No purchases recorded yet.');
    return;
  }
  document.getElementById('history-tbody').innerHTML = rows.map(r => `
    <tr data-id="${r.purchase_id}">
      <td class="num">#${r.purchase_id}</td>
      <td>${escapeHtml(r.supplier_name)}</td>
      <td>${escapeHtml(r.recorded_by)}</td>
      <td class="num">${formatDateTime(r.purchase_date)}</td>
      <td class="money">${formatMoney(r.total_amount)}</td>
      <td><button type="button" class="btn btn-secondary btn-sm" data-action="view">View</button></td>
    </tr>
  `).join('');

  document.querySelectorAll('#history-tbody [data-action="view"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.closest('tr').dataset.id;
      viewPurchase(id);
    });
  });
}

async function loadHistory() {
  renderHistorySkeleton();
  const params = new URLSearchParams();
  const supplierId = document.getElementById('filter-supplier').value;
  const from = document.getElementById('filter-from').value;
  const to = document.getElementById('filter-to').value;
  if (supplierId) params.set('supplier_id', supplierId);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();

  try {
    const data = await api.get(`/purchases${qs ? `?${qs}` : ''}`);
    renderHistory(data.purchases);
  } catch (err) {
    renderHistoryEmpty(err.message || 'Could not load purchase history.');
  }
}

async function viewPurchase(id) {
  try {
    const data = await api.get(`/purchases/${id}`);
    const p = data.purchase;
    const itemsHtml = p.items.map(item => `
      <tr>
        <td>${escapeHtml(item.product_name)}</td>
        <td class="num">${item.quantity}</td>
        <td class="money">${formatMoney(item.unit_cost)}</td>
        <td class="money">${formatMoney(item.subtotal)}</td>
      </tr>
    `).join('');

    modal.open({
      title: `Purchase #${p.purchase_id}`,
      bodyHtml: `
        <dl class="detail-list">
          <dt>Supplier</dt><dd>${escapeHtml(p.supplier_name)}</dd>
          <dt>Recorded by</dt><dd>${escapeHtml(p.recorded_by)}</dd>
          <dt>Date</dt><dd>${formatDateTime(p.purchase_date)}</dd>
          <dt>Total</dt><dd class="money">${formatMoney(p.total_amount)}</dd>
        </dl>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Product</th><th>Qty</th><th>Unit cost</th><th>Subtotal</th></tr></thead>
            <tbody>${itemsHtml}</tbody>
          </table>
        </div>
      `,
      footerHtml: `<button type="button" class="btn btn-secondary" data-action="close">Close</button>`,
      onMount: (overlay) => {
        overlay.querySelector('[data-action="close"]').addEventListener('click', () => modal.close());
      }
    });
  } catch (err) {
    ui.toast(err.message || 'Could not load this purchase.', 'error');
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

document.getElementById('purchase-form').addEventListener('submit', handleSubmit);
document.getElementById('add-line-btn').addEventListener('click', addLineItem);
document.getElementById('filter-supplier').addEventListener('change', loadHistory);
document.getElementById('filter-from').addEventListener('change', loadHistory);
document.getElementById('filter-to').addEventListener('change', loadHistory);

(async function init() {
  await loadReferenceData();
  addLineItem();
  loadHistory();
})();
