import { auth, db, storage } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const customerName = document.getElementById("customerName");
const customerPhone = document.getElementById("customerPhone");
const deliveryAddress = document.getElementById("deliveryAddress");
const orderNotes = document.getElementById("orderNotes");
const paymentProof = document.getElementById("paymentProof");

const checkoutItems = document.getElementById("checkoutItems");
const itemsTotalEl = document.getElementById("itemsTotal");
const deliveryFeeEl = document.getElementById("deliveryFee");
const grandTotalEl = document.getElementById("grandTotal");
const placeOrderBtn = document.getElementById("placeOrderBtn");
const checkoutMessage = document.getElementById("checkoutMessage");

let currentUser = null;
let cartItems = [];

const DELIVERY_FEE = 150;
const COMMISSION_RATE = 0.10;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;
  await loadCheckout();
});

async function loadCheckout() {
  checkoutItems.innerHTML = "Loading...";

  const snapshot = await getDocs(collection(db, "carts", currentUser.uid, "items"));

  cartItems = [];

  if (snapshot.empty) {
    checkoutItems.innerHTML = "<p>Your cart is empty.</p>";
    placeOrderBtn.disabled = true;
    return;
  }

  let itemsTotal = 0;
  checkoutItems.innerHTML = "";

  snapshot.forEach((docSnap) => {
    const item = {
      cartItemId: docSnap.id,
      ...docSnap.data()
    };

    item.subtotal = Number(item.price || 0) * Number(item.quantity || 1);
    itemsTotal += item.subtotal;
    cartItems.push(item);

    const div = document.createElement("div");
    div.className = "checkout-line";
    div.innerHTML = `
      <strong>${item.title}</strong>
      <span>Rs ${item.price} x ${item.quantity}</span>
      <span>Rs ${item.subtotal}</span>
    `;

    checkoutItems.appendChild(div);
  });

  itemsTotalEl.textContent = itemsTotal;
  deliveryFeeEl.textContent = DELIVERY_FEE;
  grandTotalEl.textContent = itemsTotal + DELIVERY_FEE;
}

placeOrderBtn.addEventListener("click", async () => {
  if (!currentUser) return;

  if (!customerName.value.trim() || !customerPhone.value.trim() || !deliveryAddress.value.trim()) {
    checkoutMessage.textContent = "Please fill name, phone, and delivery address.";
    return;
  }

  if (!paymentProof.files[0]) {
    checkoutMessage.textContent = "Please upload your Juice payment screenshot before placing the order.";
    return;
  }

  if (cartItems.length === 0) {
    checkoutMessage.textContent = "Your cart is empty.";
    return;
  }

  placeOrderBtn.disabled = true;
  checkoutMessage.textContent = "Uploading proof and creating order...";

  try {
    const itemsTotal = cartItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
    const deliveryFee = DELIVERY_FEE;
    const grandTotal = itemsTotal + deliveryFee;

    const commissionAmount = Math.round(itemsTotal * COMMISSION_RATE);
    const sellerAmount = itemsTotal - commissionAmount;
    const sellerIds = [...new Set(cartItems.map(item => item.sellerId))];

    const file = paymentProof.files[0];
    const safeName = file.name.replaceAll(" ", "-");
    const fileRef = ref(storage, `payments/${currentUser.uid}/${Date.now()}-${safeName}`);

    await uploadBytes(fileRef, file);
    const proofUrl = await getDownloadURL(fileRef);

    await addDoc(collection(db, "orders"), {
      customerId: currentUser.uid,
      customerEmail: currentUser.email,

      customerName: customerName.value.trim(),
      customerPhone: customerPhone.value.trim(),
      deliveryAddress: deliveryAddress.value.trim(),
      orderNotes: orderNotes.value.trim(),

      items: cartItems,
      sellerIds,

      itemsTotal,
      deliveryFee,
      grandTotal,

      commissionRate: COMMISSION_RATE,
      commissionAmount,
      sellerAmount,

      paymentMethod: "Juice",
      paymentStatus: "submitted",
      paymentProofUrl: proofUrl,
      paymentSubmittedAt: serverTimestamp(),

      orderStatus: "Payment Submitted",

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    for (const item of cartItems) {
      await deleteDoc(doc(db, "carts", currentUser.uid, "items", item.cartItemId));
    }

    checkoutMessage.textContent = "Order placed. Waiting for admin payment verification.";

    setTimeout(() => {
      window.location.href = "my-orders.html";
    }, 1200);
  } catch (error) {
    checkoutMessage.textContent = error.message;
    placeOrderBtn.disabled = false;
  }
});
