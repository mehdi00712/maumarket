import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const sellerList = document.getElementById("sellerList");

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const adminSnap = await getDoc(doc(db, "users", user.uid));

  if (!adminSnap.exists() || adminSnap.data().role !== "admin") {
    window.location.href = "dashboard.html";
    return;
  }

  loadPendingSellers();
});

async function loadPendingSellers() {
  sellerList.innerHTML = "Loading sellers...";

  const q = query(
    collection(db, "users"),
    where("role", "==", "seller"),
    where("approved", "==", false)
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    sellerList.innerHTML = `<p>No pending sellers.</p>`;
    return;
  }

  sellerList.innerHTML = "";

  snapshot.forEach((docSnap) => {
    const seller = docSnap.data();

    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <h3>${seller.name}</h3>
      <p>Email: ${seller.email}</p>
      <p>Phone: ${seller.phone}</p>
      <button data-id="${docSnap.id}">Approve Seller</button>
    `;

    div.querySelector("button").addEventListener("click", async () => {
      await updateDoc(doc(db, "users", docSnap.id), {
        approved: true
      });

      loadPendingSellers();
    });

    sellerList.appendChild(div);
  });
}
