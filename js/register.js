import { auth, db } from "./firebase-config.js";
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const registerBtn = document.getElementById("registerBtn");
const message = document.getElementById("message");

registerBtn.addEventListener("click", async () => {
  const name = document.getElementById("name").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const role = document.getElementById("role").value;

  if (!name || !phone || !email || !password) {
    message.textContent = "Please fill all fields.";
    return;
  }

  try {
    registerBtn.disabled = true;

    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      name,
      phone,
      email,
      role,
      approved: role === "customer",
      createdAt: serverTimestamp()
    });

    window.location.href = "dashboard.html";
  } catch (error) {
    message.textContent = error.message;
    registerBtn.disabled = false;
  }
});
