import { auth, db, storage } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const orderBox = document.getElementById("orderBox");
const paymentProof = document.getElementById("paymentProof");
const submitPaymentBtn = document.getElementById("submitPaymentBtn");
const paymentMessage = document.getElementById("paymentMessage");

const params = new URLSearchParams(window.location.search);
const orderId = params.get("id");

let currentUser = null;
let currentOrder = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;
  await loadOrder();
});

async function loadOrder() {
  if (!orderId) {
    orderBox.innerHTML = "<p>Order not found.</p>";
    submitPaymentBtn.disabled = true;
    return;
  }

  const orderSnap = await getDoc(doc(db, "orders", orderId));

  if (!orderSnap.exists()) {
    orderBox.innerHTML = "<p>Order not found.</p>";
    submitPaymentBtn.disabled = true;
    return;
  }

  currentOrder = orderSnap.data();

  if (currentOrder.customerId !== currentUser.uid) {
    orderBox.innerHTML = "<p>You cannot access this order.</p>";
    submitPaymentBtn.disabled = true;
    return;
  }

  orderBox.innerHTML = `
    <div class="order-card">
      <h3>Order #${orderId.slice(0, 8)}</h3>
      <p><strong>Total to pay:</strong> Rs ${currentOrder.grandTotal}</p>
      <p><strong>Payment status:</strong> ${currentOrder.paymentStatus}</p>
      <p><strong>Order status:</strong> ${currentOrder.orderStatus}</p>
    </div>
  `;

  if (currentOrder.paymentStatus === "verified") {
    submitPaymentBtn.disabled = true;
    paymentMessage.textContent = "Payment already verified.";
  }
}

submitPaymentBtn.addEventListener("click", async () => {
  if (!currentUser || !currentOrder) return;

  if (!paymentProof.files[0]) {
    paymentMessage.textContent = "Please upload your Juice screenshot.";
    return;
  }

  submitPaymentBtn.disabled = true;
  paymentMessage.textContent = "Uploading payment proof...";

  try {
    const file = paymentProof.files[0];
    const safeName = file.name.replaceAll(" ", "-");
    const fileRef = ref(storage, `payments/${currentUser.uid}/${Date.now()}-${safeName}`);

    await uploadBytes(fileRef, file);
    const proofUrl = await getDownloadURL(fileRef);

    await updateDoc(doc(db, "orders", orderId), {
      paymentProofUrl: proofUrl,
      paymentStatus: "submitted",
      orderStatus: "Payment Submitted",
      paymentSubmittedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    paymentMessage.textContent = "Payment proof submitted. Waiting for admin verification.";

    setTimeout(() => {
      window.location.href = "my-orders.html";
    }, 1200);
  } catch (error) {
    paymentMessage.textContent = error.message;
    submitPaymentBtn.disabled = false;
  }
});
