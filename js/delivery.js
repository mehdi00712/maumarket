import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  query,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const deliveryOrdersList =
  document.getElementById("deliveryOrdersList");

let currentUser = null;

onAuthStateChanged(auth, async (user) => {

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  const userSnap =
    await getDoc(doc(db, "users", user.uid));

  if (
    !userSnap.exists() ||
    userSnap.data().role !== "delivery"
  ) {
    window.location.href = "dashboard.html";
    return;
  }

  await loadOrders();
});

async function loadOrders() {

  deliveryOrdersList.innerHTML =
    "Loading deliveries...";

  const snapshot =
    await getDocs(collection(db, "orders"));

  let orders = [];

  snapshot.forEach((docSnap) => {

    const order = docSnap.data();

    if (
      order.paymentStatus === "verified" &&
      order.orderStatus !== "Delivered"
    ) {
      orders.push({
        id: docSnap.id,
        ...order
      });
    }
  });

  if (!orders.length) {

    deliveryOrdersList.innerHTML =
      "<p>No deliveries available.</p>";

    return;
  }

  deliveryOrdersList.innerHTML = "";

  orders.forEach((order) => {

    const card = document.createElement("div");

    card.className = "order-card";

    card.innerHTML = `
      <h3>Order #${order.id.slice(0,8)}</h3>

      <p>
        <strong>Customer:</strong>
        ${order.customerName || ""}
      </p>

      <p>
        <strong>Phone:</strong>
        ${order.customerPhone || ""}
      </p>

      <p>
        <strong>Address:</strong>
        ${order.deliveryAddress || ""}
      </p>

      <p>
        <strong>Status:</strong>
        ${order.orderStatus || ""}
      </p>

      <canvas
        id="sig-${order.id}"
        width="500"
        height="180"
        style="
          border:1px solid #ddd;
          background:#fff;
          width:100%;
          border-radius:12px;
        ">
      </canvas>

      <input
        class="customer-name"
        placeholder="Customer full name">

      <textarea
        class="delivery-note"
        placeholder="Delivery note">
      </textarea>

      <button class="submit-delivery-btn">
        Submit Delivery
      </button>
    `;

    deliveryOrdersList.appendChild(card);

    const canvas =
      card.querySelector(`#sig-${order.id}`);

    const signaturePad =
      new SignaturePad(canvas);

    card
      .querySelector(".submit-delivery-btn")
      .addEventListener("click", async () => {

        if (signaturePad.isEmpty()) {
          alert("Customer signature required.");
          return;
        }

        const signature =
          signaturePad.toDataURL();

        const customerName =
          card.querySelector(".customer-name")
          .value.trim();

        const deliveryNote =
          card.querySelector(".delivery-note")
          .value.trim();

        await updateDoc(
          doc(db, "orders", order.id),
          {
            deliverySignature: signature,
            deliverySignedBy: customerName,
            deliveryNote,
            deliveryGuyId: currentUser.uid,
            deliveryGuyName:
              currentUser.displayName || "",
            deliveryStatus:
              "awaiting_admin_validation",
            orderStatus:
              "Delivery Submitted",
            deliverySubmittedAt:
              serverTimestamp(),
            updatedAt:
              serverTimestamp()
          }
        );

        alert(
          "Delivery submitted for admin validation."
        );

        await loadOrders();
      });
  });
}
