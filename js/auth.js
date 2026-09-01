import { auth } from "./firebase-config.js";

import {
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const loginBtn = document.getElementById("loginBtn");
const message = document.getElementById("message");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const togglePasswordBtn = document.getElementById("togglePassword");

togglePasswordBtn?.addEventListener("click", () => {
  const isHidden = passwordInput.type === "password";

  passwordInput.type = isHidden ? "text" : "password";
  togglePasswordBtn.textContent = isHidden ? "🙈" : "👁";
  togglePasswordBtn.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
  togglePasswordBtn.setAttribute("title", isHidden ? "Hide password" : "Show password");
});

passwordInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    loginBtn?.click();
  }
});

emailInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    passwordInput?.focus();
  }
});

loginBtn?.addEventListener("click", async () => {
  clearMessage();

  const email = emailInput?.value.trim().toLowerCase() || "";
  const password = passwordInput?.value || "";

  if (!email && !password) {
    showMessage("Please enter your email address and password.");
    emailInput?.focus();
    return;
  }

  if (!email) {
    showMessage("Please enter your email address.");
    emailInput?.focus();
    return;
  }

  if (!isValidEmail(email)) {
    showMessage("Please enter a valid email address.");
    emailInput?.focus();
    return;
  }

  if (!password) {
    showMessage("Please enter your password.");
    passwordInput?.focus();
    return;
  }

  try {
    setLoading(true);

    await signInWithEmailAndPassword(auth, email, password);

    window.location.href = "dashboard.html";
  } catch (error) {
    console.error("Login error:", error);
    handleLoginError(error);
  } finally {
    setLoading(false);
  }
});

function handleLoginError(error) {
  const code = error?.code || "";

  switch (code) {
    case "auth/invalid-email":
      showMessage("Please enter a valid email address.");
      break;

    case "auth/missing-password":
      showMessage("Please enter your password.");
      break;

    case "auth/invalid-credential":
    case "auth/wrong-password":
      showMessage("Incorrect email or password. Please try again.");
      break;

    case "auth/user-not-found":
      showMessage("No account was found with this email address.");
      break;

    case "auth/user-disabled":
      showMessage("This account has been disabled. Please contact MauMarket support.");
      break;

    case "auth/too-many-requests":
      showMessage("Too many login attempts. Please wait a while and try again.");
      break;

    case "auth/network-request-failed":
      showMessage("Please check your internet connection and try again.");
      break;

    case "auth/operation-not-allowed":
      showMessage("Email login is currently unavailable. Please contact MauMarket support.");
      break;

    default:
      showMessage("We could not log you in. Please check your details and try again.");
  }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function setLoading(loading) {
  if (!loginBtn) return;

  loginBtn.disabled = loading;
  loginBtn.textContent = loading ? "Logging in..." : "Login";
}

function showMessage(text, type = "error") {
  if (!message) return;

  message.textContent = text;
  message.classList.remove("success-message", "error-message");
  message.classList.add(type === "success" ? "success-message" : "error-message");
}

function clearMessage() {
  if (!message) return;

  message.textContent = "";
  message.classList.remove("success-message", "error-message");
}
