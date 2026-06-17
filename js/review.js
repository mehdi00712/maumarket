import { auth, db } from "./firebase-config.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc,
  getDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const orderBox = document.getElementById("orderBox");
const sellerRating = document.getElementById("sellerRating");
const deliveryRating = document.getElementById("deliveryRating");
const reviewText = document.getElementById("reviewText");
const submitReviewBtn = document.getElementById("submitReviewBtn");
const reviewMessage = document.getElementById("reviewMessage");

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
  const orderSnap = await getDoc(doc(db, "orders", orderId));

  if (!orderSnap.exists()) {
    orderBox.innerHTML = "<p>Order not found.</p>";
    submitReviewBtn.disabled = true;
    return;
  }

  currentOrder = orderSnap.data();

  if (currentOrder.customerId !== currentUser.uid) {
    orderBox.innerHTML = "<p>You cannot review this order.</p>";
    submitReviewBtn.disabled = true;
    return;
  }

  if (currentOrder.orderStatus !== "Delivered") {
    orderBox.innerHTML = "<p>You can review only after delivery.</p>";
    submitReviewBtn.disabled = true;
    return;
  }

  const existingQ = query(
    collection(db, "reviews"),
    where("orderId", "==", orderId),
    where("customerId", "==", currentUser.uid)
  );

  const existingSnap = await getDocs(existingQ);

  if (!existingSnap.empty) {
    orderBox.innerHTML = "<p>You already reviewed this order.</p>";
    submitReviewBtn.disabled = true;
    return;
  }

  orderBox.innerHTML = `
    <div class="order-card">
      <h3>Order #${orderId.slice(0, 8)}</h3>
      <p><strong>Total:</strong> Rs ${currentOrder.grandTotal}</p>
      <p><strong>Status:</strong> ${currentOrder.orderStatus}</p>
    </div>
  `;
}

submitReviewBtn.addEventListener("click", async () => {
  if (!currentUser || !currentOrder) return;

  submitReviewBtn.disabled = true;
  reviewMessage.textContent = "Submitting review...";

  try {
    await addDoc(collection(db, "reviews"), {
      orderId,
      customerId: currentUser.uid,
      customerName: currentOrder.customerName || "",
      sellerIds: currentOrder.sellerIds || [],
      sellerRating: Number(sellerRating.value),
      deliveryRating: Number(deliveryRating.value),
      reviewText: reviewText.value.trim(),
      createdAt: serverTimestamp()
    });

    reviewMessage.textContent = "Review submitted successfully.";

    setTimeout(() => {
      window.location.href = "my-orders.html";
    }, 900);
  } catch (error) {
    reviewMessage.textContent = error.message;
    submitReviewBtn.disabled = false;
  }
});
