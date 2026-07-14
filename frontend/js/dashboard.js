// frontend/js/dashboard.js

const user = auth.requireAuth();
renderNavbar('dashboard');

document.getElementById('welcome-heading').textContent =
  `Welcome back, ${user.full_name ? user.full_name.split(' ')[0] : user.username}`;

const MODULE_CARDS = [
  { label: 'Categories', desc: 'Organize products into groups.', href: '/pages/categories.html', icon: '&#9635;', roles: ['admin', 'staff'], built: true },
  { label: 'Suppliers', desc: 'Who you buy stock from.', href: '/pages/suppliers.html', icon: '&#9737;', roles: ['admin', 'staff'], built: true },
  { label: 'Products', desc: 'Catalog, pricing, and images.', href: '/pages/products.html', icon: '&#9733;', roles: ['admin', 'staff'], built: true },
  { label: 'Customers', desc: 'Buyer records and history.', href: '/pages/customers.html', icon: '&#9786;', roles: ['admin', 'staff'], built: true },
  { label: 'Purchases', desc: 'Record stock coming in.', href: '/pages/purchases.html', icon: '&#8595;', roles: ['admin', 'staff'], built: true },
  { label: 'Sales', desc: 'Ring up a sale, print an invoice.', href: '/pages/sales.html', icon: '&#8593;', roles: ['admin', 'staff'], built: false },
  { label: 'Inventory', desc: 'Current stock and history.', href: '/pages/inventory.html', icon: '&#9638;', roles: ['admin', 'staff'], built: false },
  { label: 'Reports', desc: 'Sales, purchases, best-sellers.', href: '/pages/reports.html', icon: '&#9776;', roles: ['admin'], built: false }
];

function renderModuleGrid() {
  const grid = document.getElementById('module-grid');
  grid.innerHTML = MODULE_CARDS
    .filter(m => m.roles.includes(user.role))
    .map(m => {
      if (!m.built) {
        return `
          <div class="module-card disabled" aria-disabled="true">
            <div class="icon">${m.icon}</div>
            <h3>${m.label} <span class="badge-soon">Soon</span></h3>
            <p>${m.desc}</p>
          </div>`;
      }
      return `
        <a class="module-card" href="${m.href}">
          <div class="icon">${m.icon}</div>
          <h3>${m.label}</h3>
          <p>${m.desc}</p>
        </a>`;
    })
    .join('');
}

function setStat(index, value, warn = false) {
  const ticket = document.querySelectorAll('#stat-grid .stat-ticket')[index];
  const valueEl = ticket.querySelector('.value');
  valueEl.textContent = value;
  valueEl.classList.toggle('warn', warn);
}

async function loadStats() {
  // Each call is independent — one failing (e.g. a staff account hitting an
  // admin-only route) shouldn't blank out the rest of the dashboard.
  const results = await Promise.allSettled([
    api.get('/products'),
    api.get('/categories'),
    api.get('/customers'),
    api.get('/inventory/low-stock')
  ]);

  const [productsRes, categoriesRes, customersRes, lowStockRes] = results;

  setStat(0, productsRes.status === 'fulfilled' ? productsRes.value.products.length : '—');
  setStat(1, categoriesRes.status === 'fulfilled' ? categoriesRes.value.categories.length : '—');
  setStat(2, customersRes.status === 'fulfilled' ? customersRes.value.customers.length : '—');

  if (lowStockRes.status === 'fulfilled') {
    const count = lowStockRes.value.count;
    setStat(3, count, count > 0);
    renderLowStockBanner(lowStockRes.value.low_stock_products);
  } else {
    setStat(3, '—');
  }
}

function renderLowStockBanner(products) {
  const banner = document.getElementById('low-stock-banner');
  if (!products || products.length === 0) {
    banner.innerHTML = '';
    return;
  }
  const names = products.slice(0, 4).map(p => p.name).join(', ');
  const more = products.length > 4 ? ` and ${products.length - 4} more` : '';
  banner.innerHTML = `
    <div class="alert alert-warning">
      <strong>${products.length} product${products.length === 1 ? '' : 's'} low on stock:</strong>
      &nbsp;${escapeHtmlText(names)}${more}.
    </div>`;
}

function escapeHtmlText(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

renderModuleGrid();
loadStats().catch(err => ui.toast(err.message || 'Could not load dashboard stats.', 'error'));
