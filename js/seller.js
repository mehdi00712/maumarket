import { auth, db, storage } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const shopName = document.getElementById("shopName");
const shopDescription = document.getElementById("shopDescription");
const shopPhone = document.getElementById("shopPhone");
const shopLocation = document.getElementById("shopLocation");
const shopLogo = document.getElementById("shopLogo");
const saveShopBtn = document.getElementById("saveShopBtn");
const shopMessage = document.getElementById("shopMessage");

const itemType = document.getElementById("itemType");
const itemTitle = document.getElementById("itemTitle");
const itemDescription = document.getElementById("itemDescription");
const itemPrice = document.getElementById("itemPrice");
const itemStock = document.getElementById("itemStock");
const itemCategory = document.getElementById("itemCategory");
const serviceArea = document.getElementById("serviceArea");
const itemImage = document.getElementById("itemImage");
const saveItemBtn = document.getElementById("saveItemBtn");
const itemMessage = document.getElementById("itemMessage");
const myItems = document.getElementById("myItems");

let currentUser = null;
let currentShop = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  const userSnap = await getDoc(doc(db, "users", user.uid));

  if (!userSnap.exists()) {
    window.location.href = "dashboard.html";
    return;
  }

  const userData = userSnap.data();

  if (userData.role !== "seller" || userData.approved !== true) {
    window.location.href = "dashboard.html";
    return;
  }

  await loadShop();
  await loadMyItems();
});

async function uploadImage(file, folder) {
  const fileName = `${Date.now()}-${file.name}`;
  const imageRef = ref(storage, `${folder}/${currentUser.uid}/${fileName}`);
  await uploadBytes(imageRef, file);
  return await getDownloadURL(imageRef);
}

async function loadShop() {
  const shopSnap = await getDoc(doc(db, "shops", currentUser.uid));

  if (shopSnap.exists()) {
    currentShop = shopSnap.data();

    shopName.value = currentShop.shopName || "";
    shopDescription.value = currentShop.description || "";
    shopPhone.value = currentShop.phone || "";
    shopLocation.value = currentShop.location || "";
  }
}

saveShopBtn.addEventListener("click", async () => {
  if (!currentUser) return;

  if (!shopName.value.trim()) {
    shopMessage.textContent = "Shop name is required.";
    return;
  }

  saveShopBtn.disabled = true;
  shopMessage.textContent = "Saving shop...";

  try {
    let logoUrl = currentShop?.logoUrl || "";

    if (shopLogo.files[0]) {
      logoUrl = await uploadImage(shopLogo.files[0], "shops");
    }

    await setDoc(doc(db, "shops", currentUser.uid), {
      ownerId: currentUser.uid,
      shopName: shopName.value.trim(),
      description: shopDescription.value.trim(),
      phone: shopPhone.value.trim(),
      location: shopLocation.value.trim(),
      logoUrl,
      active: true,
      updatedAt: serverTimestamp()
    }, { merge: true });

    shopMessage.textContent = "Shop saved successfully.";
    await loadShop();
  } catch (error) {
    shopMessage.textContent = error.message;
  }

  saveShopBtn.disabled = false;
});

saveItemBtn.addEventListener("click", async () => {
  if (!currentUser) return;

  if (!itemTitle.value.trim() || !itemPrice.value) {
    itemMessage.textContent = "Title and price are required.";
    return;
  }

  saveItemBtn.disabled = true;
  itemMessage.textContent = "Adding item...";

  try {
    let imageUrl = "";

    if (itemImage.files[0]) {
      imageUrl = await uploadImage(itemImage.files[0], "products");
    }

    await addDoc(collection(db, "products"), {
      sellerId: currentUser.uid,
      type: itemType.value,
      title: itemTitle.value.trim(),
      description: itemDescription.value.trim(),
      price: Number(itemPrice.value),
      stock: Number(itemStock.value || 0),
      category: itemCategory.value,
      serviceArea: serviceArea.value.trim(),
      imageUrl,
      active: true,
      createdAt: serverTimestamp()
    });

    itemMessage.textContent = "Item added successfully.";

    itemTitle.value = "";
    itemDescription.value = "";
    itemPrice.value = "";
    itemStock.value = "";
    serviceArea.value = "";
    itemImage.value = "";

    await loadMyItems();
  } catch (error) {
    itemMessage.textContent = error.message;
  }

  saveItemBtn.disabled = false;
});

async function loadMyItems() {
  myItems.innerHTML = "Loading...";

  const q = query(
    collection(db, "products"),
    where("sellerId", "==", currentUser.uid)
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    myItems.innerHTML = "<p>No items added yet.</p>";
    return;
  }

  myItems.innerHTML = "";

  snapshot.forEach((docSnap) => {
    const item = docSnap.data();

    const div = document.createElement("div");
    div.className = "card product-card";

    div.innerHTML = `
      ${item.imageUrl ? `<img src="${item.imageUrl}" alt="${item.title}">` : ""}
      <span class="badge">${item.type}</span>
      <h3>${item.title}</h3>
      <p>${item.category}</p>
      <p><strong>Rs ${item.price}</strong></p>
      <button class="danger-btn">Delete</button>
    `;

    div.querySelector(".danger-btn").addEventListener("click", async () => {
      if (!confirm("Delete this item?")) return;
      await deleteDoc(doc(db, "products", docSnap.id));
      await loadMyItems();
    });

    myItems.appendChild(div);
  });
}
