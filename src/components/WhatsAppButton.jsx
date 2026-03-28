import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

const WhatsAppButton = () => {
  const [phone, setPhone] = useState("523113950371"); // Default from user request

  useEffect(() => {
    const fetchPhone = async () => {
      try {
        const docSnap = await getDoc(doc(db, "config", "storeInfo"));
        if (docSnap.exists() && docSnap.data().phone) {
          // Remove non-numeric characters for the link
          const cleanPhone = docSnap.data().phone.replace(/\D/g, '');
          if (cleanPhone) setPhone(cleanPhone);
        }
      } catch (err) {
        console.error("Error fetching WhatsApp phone:", err);
      }
    };
    fetchPhone();
  }, []);

  const handleClick = () => {
    const message = encodeURIComponent("Hola Jiménez American Style, estoy viendo tu página y me gustaría pedir informes sobre una prenda.");
    window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
  };

  return (
    <button 
      onClick={handleClick}
      style={{
        position: 'fixed',
        bottom: '2rem',
        right: '2rem',
        width: '64px',
        height: '64px',
        borderRadius: '50%',
        backgroundColor: '#25D366',
        color: 'white',
        border: 'none',
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.1) rotate(5deg)';
        e.currentTarget.style.boxShadow = '0 6px 25px rgba(37, 211, 102, 0.4)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1) rotate(0deg)';
        e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.4)';
      }}
      title="Atención por WhatsApp"
    >
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 1 1-7.6-11.7 8.38 8.38 0 0 1 3.8.9L21 3z"/>
      </svg>
    </button>
  );
};

export default WhatsAppButton;
