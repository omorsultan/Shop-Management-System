// frontend/js/components/modal.js
// Generic modal + confirm dialog, dependency-free.

const modal = {
  _current: null,

  /**
   * @param {object} opts
   * @param {string} opts.title
   * @param {string} opts.bodyHtml
   * @param {string} [opts.footerHtml]
   * @param {function} [opts.onMount] - called with the modal root element after insertion
   * @param {function} [opts.onClose] - called after the modal is removed
   */
  open({ title, bodyHtml, footerHtml = '', onMount, onClose }) {
    this.close(); // only one modal at a time

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-label="${escapeAttr(title)}">
        <div class="modal-header">
          <h2>${title}</h2>
          <button type="button" class="modal-close" aria-label="Close">&times;</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
      </div>
    `;

    document.body.appendChild(overlay);
    this._current = overlay;

    const closeFn = () => this.close(onClose);

    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) closeFn();
    });
    overlay.querySelector('.modal-close').addEventListener('click', closeFn);

    const escHandler = (e) => {
      if (e.key === 'Escape') closeFn();
    };
    document.addEventListener('keydown', escHandler);
    overlay._escHandler = escHandler;

    if (onMount) onMount(overlay);

    // Focus the first field for keyboard users
    const firstField = overlay.querySelector('input, select, textarea, button');
    if (firstField) firstField.focus();

    return overlay;
  },

  close(onClose) {
    if (!this._current) return;
    document.removeEventListener('keydown', this._current._escHandler);
    this._current.remove();
    this._current = null;
    if (onClose) onClose();
  },

  /**
   * @param {string} message
   * @param {object} [opts] - { title, confirmLabel, danger }
   * @returns {Promise<boolean>}
   */
  confirm(message, opts = {}) {
    const { title = 'Are you sure?', confirmLabel = 'Delete', danger = true } = opts;
    return new Promise((resolve) => {
      this.open({
        title,
        bodyHtml: `
          <div class="confirm-body">
            <div class="confirm-icon">!</div>
            <p style="margin:0;">${message}</p>
          </div>`,
        footerHtml: `
          <button type="button" class="btn btn-secondary" data-action="cancel">Cancel</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="confirm">${confirmLabel}</button>
        `,
        onMount: (overlay) => {
          overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => {
            this.close();
            resolve(false);
          });
          overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => {
            this.close();
            resolve(true);
          });
        },
        onClose: () => resolve(false)
      });
    });
  }
};

function escapeAttr(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
