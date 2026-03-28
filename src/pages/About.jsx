import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

const About = () => {
  const [storeInfo, setStoreInfo] = useState({
    description: 'Cargando información...',
    address: '',
    phone: '',
    facebook: '',
    instagram: ''
  });

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const docSnap = await getDoc(doc(db, "config", "storeInfo"));
        if (docSnap.exists()) {
          setStoreInfo(docSnap.data());
        } else {
          setStoreInfo({
            description: 'Bienvenido a Jiménez American Style, tu tienda de confianza de ropa americana premium. ¡Comunícate con nosotros para más información!',
            address: 'Ubicación no disponible',
            phone: 'No disponible',
            facebook: '',
            instagram: ''
          });
        }
      } catch (error) {
        console.error("Error fetching store info:", error);
      }
    };
    fetchInfo();
  }, []);

  return (
    <>
      <Navbar />
      <div className="container" style={{ paddingTop: '100px', minHeight: '80vh', paddingBottom: '50px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }} className="glass">
          <div style={{ padding: '3rem 2rem', textAlign: 'center' }}>
            <h1 style={{ fontFamily: 'Outfit', color: 'var(--color-primary)', marginBottom: '1.5rem', fontSize: '2.5rem' }}>
              Nosotros
            </h1>
            <img 
              src="/images/logo.png" 
              alt="Jiménez American Style" 
              style={{ width: '150px', height: '150px', borderRadius: '50%', objectFit: 'contain', marginBottom: '2rem', boxShadow: '0 0 20px rgba(184, 134, 11, 0.2)' }} 
            />
            
            <div style={{ fontSize: '1.1rem', lineHeight: '1.8', color: 'var(--color-text)', marginBottom: '3rem', whiteSpace: 'pre-wrap', textAlign: 'left' }}>
              {storeInfo.description}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '2rem', textAlign: 'left' }}>
              <div style={{ padding: '1.5rem', backgroundColor: 'var(--color-bg)', borderRadius: '8px', borderLeft: '3px solid var(--color-primary)' }}>
                <h3 style={{ color: 'var(--color-primary)', marginBottom: '1rem' }}>Contacto</h3>
                <p style={{ margin: '0 0 0.5rem 0' }}><strong>Teléfono/WhatsApp:</strong> {storeInfo.phone}</p>
                <p style={{ margin: '0' }}><strong>Domicilio:</strong> {storeInfo.address}</p>
              </div>

              <div style={{ padding: '1.5rem', backgroundColor: 'var(--color-bg)', borderRadius: '8px', borderLeft: '3px solid var(--color-primary)' }}>
                <h3 style={{ color: 'var(--color-primary)', marginBottom: '1rem' }}>Síguenos</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                  {storeInfo.facebook ? (
                    <a href={storeInfo.facebook} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-text)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ color: '#1877F2', fontWeight: 'bold' }}>f</span> Facebook
                    </a>
                  ) : <p style={{margin: 0, color: 'var(--color-text-light)'}}>Facebook no disponible</p>}
                  
                  {storeInfo.instagram ? (
                    <a href={storeInfo.instagram} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-text)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ color: '#E4405F', fontWeight: 'bold' }}>@</span> Instagram
                    </a>
                  ) : <p style={{margin: 0, color: 'var(--color-text-light)'}}>Instagram no disponible</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default About;
