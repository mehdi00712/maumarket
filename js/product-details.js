import { db } from "./firebase-config.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const detailsBox = document.getElementById("detailsBox");
const params = new URLSearchParams(window.location.search);
const itemId = params.get("id");

async function loadDetails() {
  if (!itemId) {
    detailsBox.innerHTML = "<p>Item not found.</p>";
    return;
  }

  const itemSnap = await getDoc(doc(db, "products", itemId));

  if (!itemSnap.exists()) {
    detailsBox.innerHTML = "<p>Item not found.</p>";
    return;
  }

  const item = itemSnap.data();

  let shop = { shopName: "Unknown Shop" };

  if (item.sellerId) {
    const shopSnap = await getDoc(doc(db, "shops", item.sellerId));
    if (shopSnap.exists()) shop = shopSnap.data();
  }

  detailsBox.innerHTML = `
    <div class="details-grid">
      <div>
        ${item.imageUrl ? `<img class="details-img" src="${item.imageUrl}" alt="${item.title}">` : ""}
      </div>

      <div>
        <span class="badge">${item.type}</span>
        <h1>${item.title}</h1>
        <p class="muted">${item.category}</p>
        <h2>Rs ${item.price}</h2>
        <p>${item.description || ""}</p>

        ${item.type === "product" ? `<p><strong>Stock:</strong> ${item.stock}</p>` : ""}
        ${item.type === "service" ? `<p><strong>Service Area:</strong> ${item.serviceArea || "Not specified"}</p>` : ""}

        <hr>

        <h3>${shop.shopName}</h3>
        <p>${shop.description || ""}</p>
        <p><strong>Location:</strong> ${shop.location || "Not specified"}</p>
        <p><strong>Phone:</strong> ${shop.phone || "Not specified"}</p>

        <a class="btn" href="shop.html?id=${item.sellerId}">View Seller Shop</a>
      </div>
    </div>
  `;
}

loadDetails();
