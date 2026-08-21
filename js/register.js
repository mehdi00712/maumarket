import { auth, db } from "./firebase-config.js";

import {
  createUserWithEmailAndPassword,
  deleteUser
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

/* =========================================================
   EVENT LISTENERS
========================================================= */

roleSelect?.addEventListener("change", updateAgreementView);

buyerTermsCheck?.addEventListener("change", updateRegisterButton);
sellerTermsCheck?.addEventListener("change", updateRegisterButton);
sellerAccuracyCheck?.addEventListener("change", updateRegisterButton);

updateAgreementView();

/* =========================================================
   REGISTER
========================================================= */

registerBtn?.addEventListener("click", async () => {
  clearMessage();

  const name = document.getElementById("name")?.value.trim();
  const phone = document.getElementById("phone")?.value.trim();
  const email = document.getElementById("email")?.value.trim().toLowerCase();
  const password = document.getElementById("password")?.value || "";
  const role = roleSelect?.value || "customer";

  /* -------------------------------------------------------
     VALIDATION
  ------------------------------------------------------- */

  if (!name || !phone || !email || !password) {
    showMessage("Please fill in all fields.", "error");
    return;
  }

  if (!isValidEmail(email)) {
    showMessage("Please enter a valid email address.", "error");
    return;
  }

  if (password.length < 6) {
    showMessage(
      "Your password must contain at least 6 characters.",
      "error"
    );
    return;
  }

  if (!["customer", "seller"].includes(role)) {
    showMessage("Please select a valid account type.", "error");
    return;
  }

  if (!hasAcceptedRequiredTerms(role)) {
    showMessage(
      "Please read and accept the required agreement before creating your account.",
      "error"
    );
    return;
  }

  let createdUser = null;

  try {
    setLoading(true);

    /* -------------------------------------------------------
       STEP 1: CREATE FIREBASE AUTH ACCOUNT
    ------------------------------------------------------- */

    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    createdUser = userCredential.user;

    /* -------------------------------------------------------
       STEP 2: CREATE FIRESTORE PROFILE

       IMPORTANT:
       Your Firestore rules only allow a user to CREATE their
       profile when approved is false or missing.

       Therefore:
       - Customer = approved false
       - Seller   = approved false

       Customer access does not depend on approved=true.
       Seller access requires admin approval.
    ------------------------------------------------------- */

    const userData = {
      uid: createdUser.uid,

      name,
      fullName: name,

      phone,
      email,

      role,

      approved: false,
      blocked: false,

      acceptedTerms: true,

      acceptedTermsType:
        role === "seller"
          ? "seller"
          : "buyer",

      acceptedTermsVersion: "1.0",

      acceptedTermsAt: serverTimestamp(),

      sellerAccuracyConfirmed:
        role === "seller"
          ? sellerAccuracyCheck?.checked === true
          : false,

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(
      doc(db, "users", createdUser.uid),
      userData
    );

    /* -------------------------------------------------------
       SUCCESS
    ------------------------------------------------------- */

    showMessage(
      role === "seller"
        ? "Seller account created successfully. Your account is awaiting approval."
        : "Account created successfully.",
      "success"
    );

    /*
      Seller dashboard can display pending approval.
      Customer goes directly to normal dashboard.
    */

    setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 500);

  } catch (error) {
    console.error("Registration error:", error);

    /*
      If Firebase Authentication was successfully created but
      Firestore profile creation failed, delete the newly
      created Auth account.

      This prevents orphan accounts that cause:
      auth/email-already-in-use
      on the next registration attempt.
    */

    if (
      createdUser &&
      error?.code !== "auth/email-already-in-use"
    ) {
      try {
        await deleteUser(createdUser);

        console.warn(
          "Registration rolled back because Firestore profile creation failed."
        );
      } catch (rollbackError) {
        console.error(
          "Could not roll back Firebase Auth user:",
          rollbackError
        );
      }
    }

    handleRegistrationError(error);

  } finally {
    setLoading(false);
    updateRegisterButton();
  }
});

/* =========================================================
   AGREEMENT DISPLAY
========================================================= */

function updateAgreementView() {
  const role = roleSelect?.value || "customer";

  clearMessage();

  if (role === "seller") {
    buyerAgreement?.classList.add("hidden");
    sellerAgreement?.classList.remove("hidden");

    if (buyerTermsCheck) {
      buyerTermsCheck.checked = false;
    }
  } else {
    sellerAgreement?.classList.add("hidden");
    buyerAgreement?.classList.remove("hidden");

    if (sellerTermsCheck) {
      sellerTermsCheck.checked = false;
    }

    if (sellerAccuracyCheck) {
      sellerAccuracyCheck.checked = false;
    }
  }

  updateRegisterButton();
}

/* =========================================================
   BUTTON STATE
========================================================= */

function updateRegisterButton() {
  if (!registerBtn) return;

  const role = roleSelect?.value || "customer";

  registerBtn.disabled = !hasAcceptedRequiredTerms(role);
}

/* =========================================================
   REQUIRED AGREEMENTS
========================================================= */

function hasAcceptedRequiredTerms(role) {
  if (role === "seller") {
    return (
      sellerTermsCheck?.checked === true &&
      sellerAccuracyCheck?.checked === true
    );
  }

  return buyerTermsCheck?.checked === true;
}

/* =========================================================
   ERROR HANDLING
========================================================= */

function handleRegistrationError(error) {
  const code = error?.code || "";

  switch (code) {

    case "auth/email-already-in-use":
      showMessage(
        "An account already exists with this email address. Please log in instead.",
        "error"
      );
      break;

    case "auth/invalid-email":
      showMessage(
        "Please enter a valid email address.",
        "error"
      );
      break;

    case "auth/weak-password":
      showMessage(
        "Your password is too weak. Please use at least 6 characters.",
        "error"
      );
      break;

    case "auth/network-request-failed":
      showMessage(
        "Network error. Please check your internet connection and try again.",
        "error"
      );
      break;

    case "auth/operation-not-allowed":
      showMessage(
        "Email registration is currently unavailable. Please contact MauMarket support.",
        "error"
      );
      break;

    case "permission-denied":
    case "firestore/permission-denied":
      showMessage(
        "Your account could not be created because the profile was rejected by the database. Please try again.",
        "error"
      );
      break;

    default:
      console.error(
        "Unhandled registration error:",
        error
      );

      showMessage(
        "We could not create your account. Please try again.",
        "error"
      );
  }
}

/* =========================================================
   EMAIL VALIDATION
========================================================= */

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* =========================================================
   LOADING STATE
========================================================= */

function setLoading(loading) {
  if (!registerBtn) return;

  if (loading) {
    registerBtn.disabled = true;
    registerBtn.textContent = "Creating account...";
  } else {
    registerBtn.textContent = "Create Account";
  }
}

/* =========================================================
   MESSAGE
========================================================= */

function showMessage(text, type = "error") {
  if (!message) return;

  message.textContent = text;

  message.classList.remove(
    "success-message",
    "error-message"
  );

  if (type === "success") {
    message.classList.add("success-message");
  } else {
    message.classList.add("error-message");
  }
}

function clearMessage() {
  if (!message) return;

  message.textContent = "";

  message.classList.remove(
    "success-message",
    "error-message"
  );
}
