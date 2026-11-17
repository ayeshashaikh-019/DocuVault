(() => {
  let csrfToken = '';
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const tabs = [...document.querySelectorAll('[data-auth-mode]')];
  const loginError = document.getElementById('login-error');
  const registerError = document.getElementById('register-error');

  async function getCsrfToken() {
    const response = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Could not start a secure session. Refresh the page and try again.');
    const data = await response.json();
    csrfToken = data.csrfToken;
    return csrfToken;
  }

  function setMode(mode) {
    const isRegister = mode === 'register';
    loginForm.hidden = isRegister;
    registerForm.hidden = !isRegister;
    loginError.textContent = '';
    registerError.textContent = '';
    tabs.forEach((tab) => {
      const active = tab.dataset.authMode === mode;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    document.getElementById('auth-title').textContent = isRegister ? 'A place to begin.' : 'Welcome back.';
    document.getElementById('auth-subtitle').textContent = isRegister
      ? 'Create a student account to access public university records.'
      : 'Sign in to access your secure document library.';
  }

  function showError(element, message) {
    element.textContent = message || 'Something went wrong. Please try again.';
  }

  async function submitAuth(form, endpoint, errorElement) {
    errorElement.textContent = '';
    const submitButton = form.querySelector('button[type="submit"]');
    const buttonText = submitButton.querySelector('span');
    const previousText = buttonText.textContent;
    submitButton.disabled = true;
    buttonText.textContent = endpoint.endsWith('login') ? 'Signing in…' : 'Creating account…';
    try {
      if (!csrfToken) await getCsrfToken();
      const payload = Object.fromEntries(new FormData(form).entries());
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to continue. Check your details and try again.');
      window.location.assign('/app');
    } catch (error) {
      showError(errorElement, error.message);
    } finally {
      submitButton.disabled = false;
      buttonText.textContent = previousText;
    }
  }

  tabs.forEach((tab) => tab.addEventListener('click', () => setMode(tab.dataset.authMode)));
  loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    submitAuth(loginForm, '/api/auth/login', loginError);
  });
  registerForm.addEventListener('submit', (event) => {
    event.preventDefault();
    submitAuth(registerForm, '/api/auth/register', registerError);
  });

  document.querySelectorAll('[data-toggle-password]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = document.getElementById(button.dataset.togglePassword);
      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      button.textContent = reveal ? 'Hide' : 'Show';
      button.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
    });
  });

  const demos = {
    admin: { email: 'admin@docuvault.local', password: 'Admin@12345' },
    staff: { email: 'staff@docuvault.local', password: 'Staff@12345' },
    student: { email: 'student@docuvault.local', password: 'Student@12345' }
  };
  document.querySelectorAll('[data-demo-user]').forEach((button) => {
    button.addEventListener('click', () => {
      setMode('login');
      const demo = demos[button.dataset.demoUser];
      document.getElementById('login-email').value = demo.email;
      document.getElementById('login-password').value = demo.password;
      loginForm.requestSubmit();
    });
  });

  getCsrfToken().catch((error) => showError(loginError, error.message));
})();
