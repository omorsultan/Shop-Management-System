// frontend/js/categories.js

const currentUser = auth.requireAuth();
renderNavbar('categories');

initCrudPage('#crud-container', {
  entityLabel: 'Category',
  entityLabelPlural: 'Categories',
  apiPath: '/categories',
  listKey: 'categories',
  idKey: 'category_id',
  searchPlaceholder: 'Search categories…',
  columns: [
    { key: 'name', label: 'Name' },
    { key: 'description', label: 'Description', render: (row) => row.description ? escapeHtml(row.description) : '<span class="text-faint">—</span>' }
  ],
  formFields: [
    { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Beverages' },
    { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Optional notes about this category' }
  ]
});
