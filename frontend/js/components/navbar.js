// frontend/js/components/navbar.js
// Renders the sidebar nav into #sidebar-root. Role-aware: staff don't see
// admin-only links (user management, reports), and pages not yet built in
// later phases show as "soon" rather than a dead link.

const NAV_MODULES = [
  { section: 'Overview' },
  { id: 'dashboard', label: 'Dashboard', href: '/pages/dashboard.html', icon: '&#9679;', roles: ['admin', 'staff'], built: true },

  { section: 'Catalog' },
  { id: 'categories', label: 'Categories', href: '/pages/categories.html', icon: '&#9635;', roles: ['admin', 'staff'], built: true },
  { id: 'suppliers', label: 'Suppliers', href: '/pages/suppliers.html', icon: '&#9737;', roles: ['admin', 'staff'], built: true },
  { id: 'products', label: 'Products', href: '/pages/products.html', icon: '&#9733;', roles: ['admin', 'staff'], built: true },
  { id: 'customers', label: 'Customers', href: '/pages/customers.html', icon: '&#9786;', roles: ['admin', 'staff'], built: true },

  { section: 'Transactions' },
  { id: 'purchases', label: 'Purchases', href: '/pages/purchases.html', icon: '&#8595;', roles: ['admin', 'staff'], built: true },
  { id: 'sales', label: 'Sales', href: '/pages/sales.html', icon: '&#8593;', roles: ['admin', 'staff'], built: false },

  { section: 'Stock' },
  { id: 'inventory', label: 'Inventory', href: '/pages/inventory.html', icon: '&#9638;', roles: ['admin', 'staff'], built: false },
  { id: 'reports', label: 'Reports', href: '/pages/reports.html', icon: '&#9776;', roles: ['admin'], built: false }
];

function renderNavbar(activePageId) {
  const root = document.getElementById('sidebar-root');
  if (!root) return;

  const user = auth.getUser();
  if (!user) return;

  const navItems = NAV_MODULES.map(entry => {
    if (entry.section) {
      return `<div class="sidebar__section-label">${entry.section}</div>`;
    }
    if (!entry.roles.includes(user.role)) return '';

    const isActive = entry.id === activePageId;
    if (!entry.built) {
      return `
        <a href="#" class="module-disabled-link" title="Coming in a later phase"
           style="opacity:.45; cursor:not-allowed;" onclick="return false;">
          <span class="icon">${entry.icon}</span>${entry.label}
        </a>`;
    }
    return `
      <a href="${entry.href}" class="${isActive ? 'active' : ''}">
        <span class="icon">${entry.icon}</span>${entry.label}
      </a>`;
  }).join('');

  const initials = user.full_name
    ? user.full_name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
    : user.username.slice(0, 2).toUpperCase();

  root.innerHTML = `
    <aside class="sidebar">
      <div class="sidebar__brand">
        <div class="mark">SM</div>
        <h1>Shop Management</h1>
        <span>Ledger &amp; Stock System</span>
      </div>
      <nav class="sidebar__nav">${navItems}</nav>
      <div class="sidebar__footer">
        <div class="sidebar__user">
          <span class="name">${escapeHtml(user.full_name || user.username)}</span>
          <span class="role">${escapeHtml(user.role)}</span>
        </div>
        <button class="btn-logout" id="logout-btn" type="button">Log out</button>
      </div>
    </aside>
  `;

  document.getElementById('logout-btn').addEventListener('click', () => auth.logout());
}

// escapeHtml() lives in utils.js, loaded before this file.
