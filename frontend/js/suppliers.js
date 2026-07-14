// frontend/js/suppliers.js

const currentUser = auth.requireAuth();
renderNavbar('suppliers');

initCrudPage('#crud-container', {
  entityLabel: 'Supplier',
  entityLabelPlural: 'Suppliers',
  apiPath: '/suppliers',
  listKey: 'suppliers',
  idKey: 'supplier_id',
  searchPlaceholder: 'Search by name, phone, or email…',
  columns: [
    { key: 'name', label: 'Name' },
    { key: 'phone', label: 'Phone', render: (row) => row.phone ? escapeHtml(row.phone) : '<span class="text-faint">—</span>' },
    { key: 'email', label: 'Email', render: (row) => row.email ? escapeHtml(row.email) : '<span class="text-faint">—</span>' },
    { key: 'address', label: 'Address', render: (row) => row.address ? escapeHtml(row.address) : '<span class="text-faint">—</span>' }
  ],
  formFields: [
    { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Metro Wholesale Ltd.' },
    { key: 'phone', label: 'Phone', type: 'tel', placeholder: 'e.g. +880 1XXX-XXXXXX' },
    { key: 'email', label: 'Email', type: 'email', placeholder: 'e.g. contact@supplier.com' },
    { key: 'address', label: 'Address', type: 'textarea', placeholder: 'Street, city' }
  ]
});
