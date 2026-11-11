// 짧은 안내 메시지
let host = null;
let timer = null;

export function toast(message, ms = 2600) {
  if (!host) {
    host = document.createElement('div');
    host.className = 'toast';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  host.textContent = message;
  host.classList.add('show');
  clearTimeout(timer);
  timer = setTimeout(() => host.classList.remove('show'), ms);
}

export function hideToast() {
  clearTimeout(timer);
  if (host) host.classList.remove('show');
}
