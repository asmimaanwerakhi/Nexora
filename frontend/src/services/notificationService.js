export const notifyApp = (message, type = 'info') => {
  window.dispatchEvent(
    new CustomEvent('nexora:notification', {
      detail: { message, type },
    }),
  );
};
