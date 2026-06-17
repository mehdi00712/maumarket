import { auth, db } from "./firebase-config.js";

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

const customerName = document.getElementById("customerName");
const customerPhone = document.getElementById("customerPhone");
const deliveryAddress = document.getElementById("deliveryAddress");
const orderNotes = document.getElementById("orderNotes");

const checkoutItems = document.getElementById("checkoutItems");
const itemsTotalEl = document.getElementById("itemsTotal");
const deliveryFeeEl = document.getElementById("deliveryFee");
const grandTotalEl = document.getElementById("grandTotal");
const placeOrderBtn = document.getElementById("placeOrderBtn");
const checkoutMessage = document.getElementById("checkoutMessage");

let currentUser = null;
let cartItems = [];

const DELIVERY_FEE = 150;

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

  if (cartItems.length === 0) {
    checkoutMessage.textContent = "Your cart is empty.";
    return;
  }

  placeOrderBtn.disabled = true;
  checkoutMessage.textContent = "Creating order...";

  try {
    const itemsTotal = cartItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
    const grandTotal = itemsTotal + DELIVERY_FEE;
    const sellerIds = [...new Set(cartItems.map(item => item.sellerId))];

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
      deliveryFee: DELIVERY_FEE,
      grandTotal,

      paymentStatus: "not_paid",
      orderStatus: "Pending Payment",

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    for (const item of cartItems) {
      await deleteDoc(doc(db, "carts", currentUser.uid, "items", item.cartItemId));
    }

    checkoutMessage.textContent = "Order placed successfully.";
    setTimeout(() => {
      window.location.href = "my-orders.html";
    }, 900);
  } catch (error) {
    checkoutMessage.textContent = error.message;
    placeOrderBtn.disabled = false;
  }
});
