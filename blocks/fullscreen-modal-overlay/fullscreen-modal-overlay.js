export default function decorate(block) {
  const modal = block;

  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-content">
        <button class="modal-close">&times;</button>
        <div class="modal-body"></div>
      </div>
    </div>
  `;

  const modalBody = modal.querySelector('.modal-body');

  document.querySelectorAll('[data-modal-fragment]').forEach((trigger) => {
    trigger.addEventListener('click', async (e) => {
      e.preventDefault();

      const fragmentPath = trigger.dataset.modalFragment;

      try {
        const resp = await fetch(`${fragmentPath}.plain.html`);
        const html = await resp.text();

        modalBody.innerHTML = html;

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
      } catch (error) {
        // Keep the page usable if the fragment cannot be loaded.
        modalBody.innerHTML = '<p>Unable to load this content right now.</p>';
        modal.dataset.modalError = error?.message || 'fragment-load-failed';
      }
    });
  });

  function closeModal() {
    modal.classList.remove('active');
    document.body.style.overflow = '';
    modalBody.innerHTML = '';
  }

  modal.querySelector('.modal-close').addEventListener('click', closeModal);

  modal.querySelector('.modal-overlay').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
      closeModal();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      closeModal();
    }
  });
}
