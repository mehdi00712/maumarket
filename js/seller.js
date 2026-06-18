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
  updateDoc,
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
const shopBanner = document.getElementById("shopBanner");
const saveShopBtn = document.getElementById("saveShopBtn");
const shopMessage = document.getElementById("shopMessage");

const slotInfo = document.getElementById("slotInfo");
const requestSlotsBtn = document.getElementById("requestSlotsBtn");
const slotMessage = document.getElementById("slotMessage");

const formTitle = document.getElementById("formTitle");
const itemType = document.getElementById("itemType");
const itemTitle = document.getElementById("itemTitle");
const itemDescription = document.getElementById("itemDescription");
const itemPrice = document.getElementById("itemPrice");
const itemStock = document.getElementById("itemStock");
const itemCategory = document.getElementById("itemCategory");
const serviceArea = document.getElementById("serviceArea");
const itemImage = document.getElementById("itemImage");
const saveItemBtn = document.getElementById("saveItemBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const itemMessage = document.getElementById("itemMessage");
const myItems = document.getElementById("myItems");

let currentUser = null;
let currentUserData = null;
let currentShop = null;
let currentProductCount = 0;
let editingItemId = null;
let existingImageUrl = "";

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

  currentUserData = userSnap.data();

  if (
    currentUserData.role !== "seller" ||
    currentUserData.approved !== true ||
    currentUserData.blocked === true
  ) {
    window.location.href = "dashboard.html";
    return;
  }

  await loadShop();
  await loadMyItems();
});

async function uploadImage(file, folder) {
  const safeName = file.name.replaceAll(" ", "-");
  const fileName = `${Date.now()}-${safeName}`;
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
    let bannerUrl = currentShop?.bannerUrl || "";

    if (shopLogo.files[0]) {
      logoUrl = await uploadImage(shopLogo.files[0], "shops");
    }

    if (shopBanner.files[0]) {
      bannerUrl = await uploadImage(shopBanner.files[0], "shops");
    }

    await setDoc(doc(db, "shops", currentUser.uid), {
      ownerId: currentUser.uid,
      shopName: shopName.value.trim(),
      description: shopDescription.value.trim(),
      phone: shopPhone.value.trim(),
      location: shopLocation.value.trim(),
      logoUrl,
      bannerUrl,
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

  const productLimit = Number(currentUserData.productLimit || 50);

  if (!editingItemId && currentProductCount >= productLimit) {
    itemMessage.textContent = "You reached your product slot limit. Request more slots.";
    return;
  }

  saveItemBtn.disabled = true;
  itemMessage.textContent = editingItemId ? "Updating item..." : "Adding item...";

  try {
    let imageUrl = existingImageUrl;

    if (itemImage.files[0]) {
      imageUrl = await uploadImage(itemImage.files[0], "products");
    }

    const itemData = {
      sellerId: currentUser.uid,
      type: itemType.value,
      title: itemTitle.value.trim(),
      description: itemDescription.value.trim(),
      price: Number(itemPrice.value),
      stock: Number(itemStock.value || 0),
      category: itemCategory.value,
      serviceArea: serviceArea.value.trim(),
      imageUrl,
      updatedAt: serverTimestamp()
    };

    if (editingItemId) {
      await updateDoc(doc(db, "products", editingItemId), itemData);
      itemMessage.textContent = "Item updated successfully.";
    } else {
      await addDoc(collection(db, "products"), {
        ...itemData,
        active: true,
        createdAt: serverTimestamp()
      });
      itemMessage.textContent = "Item added successfully.";
    }

    resetItemForm();
    await loadMyItems();
  } catch (error) {
    itemMessage.textContent = error.message;
  }

  saveItemBtn.disabled = false;
});

cancelEditBtn.addEventListener("click", resetItemForm);

function resetItemForm() {
  editingItemId = null;
  existingImageUrl = "";

  formTitle.textContent = "Add Product / Service";
  saveItemBtn.textContent = "Add Item";
  cancelEditBtn.style.display = "none";

  itemType.value = "product";
  itemTitle.value = "";
  itemDescription.value = "";
  itemPrice.value = "";
  itemStock.value = "";
  itemCategory.value = "Beauty";
  serviceArea.value = "";
  itemImage.value = "";
}

async function loadMyItems() {
  myItems.innerHTML = "Loading...";

  const q = query(
    collection(db, "products"),
    where("sellerId", "==", currentUser.uid)
  );

  const snapshot = await getDocs(q);

  currentProductCount = snapshot.size;
  const productLimit = Number(currentUserData.productLimit || 50);

  if (slotInfo) {
    slotInfo.textContent = `You are using ${currentProductCount} / ${productLimit} product slots.`;
  }

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
      <span class="status-badge ${item.active ? "active" : "hidden"}">
        ${item.active ? "Visible" : "Hidden"}
      </span>
      <h3>${item.title}</h3>
      <p>${item.category}</p>
      <p><strong>Rs ${item.price}</strong></p>

      <div class="seller-actions">
        <button class="edit-btn">Edit</button>
        <button class="toggle-btn">${item.active ? "Hide" : "Show"}</button>
        <button class="danger-btn">Delete</button>
      </div>
    `;

    div.querySelector(".edit-btn").addEventListener("click", () => {
      editingItemId = docSnap.id;
      existingImageUrl = item.imageUrl || "";

      formTitle.textContent = "Edit Product / Service";
      saveItemBtn.textContent = "Update Item";
      cancelEditBtn.style.display = "inline-block";

      itemType.value = item.type || "product";
      itemTitle.value = item.title || "";
      itemDescription.value = item.description || "";
      itemPrice.value = item.price || "";
      itemStock.value = item.stock || "";
      itemCategory.value = item.category || "Other";
      serviceArea.value = item.serviceArea || "";

      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    div.querySelector(".toggle-btn").addEventListener("click", async () => {
      await updateDoc(doc(db, "products", docSnap.id), {
        active: !item.active,
        updatedAt: serverTimestamp()
      });
      await loadMyItems();
    });

    div.querySelector(".danger-btn").addEventListener("click", async () => {
      if (!confirm("Delete this item permanently?")) return;
      await deleteDoc(doc(db, "products", docSnap.id));
      await loadMyItems();
    });

    myItems.appendChild(div);
  });
}

if (requestSlotsBtn) {
  requestSlotsBtn.addEventListener("click", async () => {
    if (!currentUser) return;

    const requestedAmount = prompt("How many extra slots do you want? Example: 50");

    if (!requestedAmount || Number(requestedAmount) <= 0) {
      slotMessage.textContent = "Invalid slot request.";
      return;
    }

    await addDoc(collection(db, "quotaRequests"), {
      sellerId: currentUser.uid,
      sellerName: currentUserData.name || "",
      sellerEmail: currentUserData.email || "",
      currentLimit: Number(currentUserData.productLimit || 50),
      requestedExtra: Number(requestedAmount),
      status: "pending",
      createdAt: serverTimestamp()
    });

    slotMessage.textContent = "Request sent to admin.";
  });
}
