import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const cartItems = document.getElementById("cartItems");
const cartTotal = document.getElementById("cartTotal");

let currentUser = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;
  await loadCart();
});

async function loadCart() {
  cartItems.innerHTML = "Loading cart...";

  const snapshot = await getDocs(collection(db, "carts", currentUser.uid, "items"));

  if (snapshot.empty) {
    cartItems.innerHTML = "<p>Your cart is empty.</p>";
    cartTotal.textContent = "0";
    return;
  }

  let total = 0;
  cartItems.innerHTML = "";

  snapshot.forEach((docSnap) => {
    const item = docSnap.data();
    const lineTotal = Number(item.price || 0) * Number(item.quantity || 1);
    total += lineTotal;

    const div = document.createElement("div");
    div.className = "cart-item";

    div.innerHTML = `
      ${item.imageUrl ? `<img src="${item.imageUrl}" alt="${item.title}">` : ""}
      <div class="cart-info">
        <h3>${item.title}</h3>
        <p>${item.shopName || ""}</p>
        <p>Rs ${item.price} x 
          <input class="qty-update" type="number" min="1" value="${item.quantity}">
        </p>
        <p><strong>Subtotal: Rs ${lineTotal}</strong></p>
      </div>
      <button class="danger-btn">Remove</button>
    `;

    div.querySelector(".qty-update").addEventListener("change", async (e) => {
      const newQty = Number(e.target.value || 1);

      if (newQty < 1) return;

      await updateDoc(doc(db, "carts", currentUser.uid, "items", docSnap.id), {
        quantity: newQty
      });

      await loadCart();
    });

    div.querySelector(".danger-btn").addEventListener("click", async () => {
      await deleteDoc(doc(db, "carts", currentUser.uid, "items", docSnap.id));
      await loadCart();
    });

    cartItems.appendChild(div);
  });

  cartTotal.textContent = total;
}
