import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDV-qfRNTq1cFi12qpXgg1FwZbqaaVMhVw",
  authDomain: "jimenezamericanstyle.firebaseapp.com",
  projectId: "jimenezamericanstyle",
  storageBucket: "jimenezamericanstyle.firebasestorage.app",
  messagingSenderId: "149766535028",
  appId: "1:149766535028:web:ab37c66b0899eb35571e21"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
