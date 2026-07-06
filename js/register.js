import { auth, db } from "./firebase-config.js";

import {
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const registerBtn = document.getElementById("registerBtn");
const message = document.getElementById("message");

const roleSelect = document.getElementById("role");
const buyerAgreement = document.getElementById("buyerAgreement");
const sellerAgreement = document.getElementById("sellerAgreement");

const buyerTermsCheck = document.getElementById("buyerTermsCheck");
const sellerTermsCheck = document.getElementById("sellerTermsCheck");
const sellerAccuracyCheck = document.getElementById("sellerAccuracyCheck");

roleSelect?.addEventListener("change", updateAgreementView);
buyerTermsCheck?.addEventListener("change", updateRegisterButton);
sellerTermsCheck?.addEventListener("change", updateRegisterButton);
sellerAccuracyCheck?.addEventListener("change", updateRegisterButton);

updateAgreementView();

registerBtn.addEventListener("click", async () => {
  const name = document.getElementById("name").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const role = roleSelect.value;

  if (!name || !phone || !email || !password) {
    showMessage("Please fill all fields.");
    return;
  }

  if (!hasAcceptedRequiredTerms(role)) {
    showMessage("Please read and accept the required agreement before creating your account.");
    return;
  }

  try {
    registerBtn.disabled = true;
    registerBtn.textContent = "Creating account...";

    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      name,
      phone,
      email,
      role,

      approved: role === "customer",
      blocked: false,

      acceptedTerms: true,
      acceptedTermsType: role === "seller" ? "seller" : "buyer",
      acceptedTermsVersion: "1.0",
      acceptedTermsAt: serverTimestamp(),

      sellerAccuracyConfirmed: role === "seller"
        ? sellerAccuracyCheck.checked === true
        : false,

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    window.location.href = "dashboard.html";
  } catch (error) {
    showMessage(error.message);
    registerBtn.disabled = false;
    registerBtn.textContent = "Create Account";
    updateRegisterButton();
  }
});

function updateAgreementView() {
  const role = roleSelect?.value || "customer";

  if (role === "seller") {
    buyerAgreement?.classList.add("hidden");
    sellerAgreement?.classList.remove("hidden");

    if (buyerTermsCheck) buyerTermsCheck.checked = false;
  } else {
    sellerAgreement?.classList.add("hidden");
    buyerAgreement?.classList.remove("hidden");

    if (sellerTermsCheck) sellerTermsCheck.checked = false;
    if (sellerAccuracyCheck) sellerAccuracyCheck.checked = false;
  }

  updateRegisterButton();
}

function updateRegisterButton() {
  const role = roleSelect?.value || "customer";

  registerBtn.disabled = !hasAcceptedRequiredTerms(role);
}

function hasAcceptedRequiredTerms(role) {
  if (role === "seller") {
    return sellerTermsCheck?.checked === true &&
      sellerAccuracyCheck?.checked === true;
  }

  return buyerTermsCheck?.checked === true;
}

function showMessage(text) {
  if (message) {
    message.textContent = text;
  }
}
