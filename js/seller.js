import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const shopName = document.getElementById("shopName");
const shopDescription = document.getElementById("shopDescription");
const shopPhone = document.getElementById("shopPhone");
const shopLocation = document.getElementById("shopLocation");
const saveShopBtn = document.getElementById("saveShopBtn");
const message = document.getElementById("message");

let currentUser = null;

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

  loadShop();
});

async function loadShop() {
  const shopSnap = await getDoc(doc(db, "shops", currentUser.uid));

  if (shopSnap.exists()) {
    const shop = shopSnap.data();

    shopName.value = shop.shopName || "";
    shopDescription.value = shop.description || "";
    shopPhone.value = shop.phone || "";
    shopLocation.value = shop.location || "";
  }
}

saveShopBtn.addEventListener("click", async () => {
  if (!currentUser) return;

  if (!shopName.value.trim()) {
    message.textContent = "Shop name is required.";
    return;
  }

  saveShopBtn.disabled = true;

  await setDoc(doc(db, "shops", currentUser.uid), {
    ownerId: currentUser.uid,
    shopName: shopName.value.trim(),
    description: shopDescription.value.trim(),
    phone: shopPhone.value.trim(),
    location: shopLocation.value.trim(),
    active: true,
    updatedAt: serverTimestamp()
  }, { merge: true });

  message.textContent = "Shop saved successfully.";
  saveShopBtn.disabled = false;
});
