import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  async function signup(email, password, profileData) {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    
    // Non-blocking save to Firestore
    setDoc(doc(db, "users", userCredential.user.uid), {
      email,
      ...profileData,
      createdAt: new Date().toISOString()
    }).catch(e => console.warn("Could not save to DB rules:", e));
    
    return userCredential;
  }

  function login(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  function loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    return signInWithPopup(auth, provider);
  }

  function logout() {
    return signOut(auth);
  }

  function resetPassword(email) {
    return sendPasswordResetEmail(auth, email);
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false); // Release the UI lock immediately
      
      if (user) {
        // Fetch extended user profile manually from database non-blocking
        getDoc(doc(db, "users", user.uid)).then(docSnap => {
          if (docSnap.exists()) {
            setUserData(docSnap.data());
          }
        }).catch(err => {
          console.error("Error fetching user data", err);
        });
      } else {
        setUserData(null);
      }
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    userData,
    signup,
    login,
    loginWithGoogle,
    logout,
    resetPassword
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
